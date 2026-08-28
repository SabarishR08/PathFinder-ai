import { db } from "@/lib/db";
import { loadSkillGraph } from "@/lib/engine/data";
import { fuseEvidence, logEvidence } from "@/lib/evidence/fuse";
import type { SkillClaim } from "@/lib/evidence/types";
import { streamText, tool, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { gateway } from "@ai-sdk/gateway";
import { z } from "zod";

export const AGENT_SEPARATOR = "---PATHFINDER-JSON---";

export type AgentPhase = "intro" | "goal" | "background" | "time" | "style" | "wrap_up" | "done";

export const PHASE_ORDER: AgentPhase[] = ["intro", "goal", "background", "time", "style", "wrap_up", "done"];

export interface AgentHistoryTurn {
  role: "assistant" | "user";
  content: string;
}

export interface ExtractedProfile {
  name?: string;
  goalStatement?: string;
  targetRole?: string;
  domain?: string;
  goalSkillId?: string;
  hoursPerWeek?: number;
  timelineWeeks?: number;
  learningStyle?: string;
  motivation?: string;
  constraints?: string[];
  skillsClaimed?: Array<{ skillId: string; skillName: string; level: number }>;
  phaseComplete?: boolean;
}

const PHASE_GOALS: Record<Exclude<AgentPhase, "done">, string> = {
  intro: "Learn the person's name and their headline learning goal in their own words. ONE question at a time.",
  goal: "Sharpen the fuzzy goal into a concrete target: which domain, which target role, and roughly what timeframe. If their goal maps to a catalogue skill, name it. ONE question at a time.",
  background: "Map what they already know: languages, tools, courses completed, projects built, work experience. Probe for specifics — 'I know some Python' deserves 'what have you built with it?'. ONE question at a time.",
  time: "Establish realistic weekly time budget, hard deadlines (interviews, semester, job start), and constraints (job hours, exams, budget). ONE question at a time.",
  style: "Learn how they like to learn: video vs reading vs building, solo vs community, and what actually motivates them (career switch, promotion, curiosity). ONE question at a time.",
  wrap_up: "Deliver a crisp summary of everything captured: goal, background, time budget, style. Confirm it sounds right. Then tell them the next step is connecting real evidence (GitHub, resume, LeetCode).",
};

async function skillCatalogText(domain?: string): Promise<string> {
  const graph = await loadSkillGraph();
  const skills = domain && graph.byDomain[domain] ? graph.byDomain[domain] : Object.values(graph.skills);
  return skills.map((s) => `${s.id}|${s.name}`).join("\n");
}

async function domainOptionsText(): Promise<string> {
  const graph = await loadSkillGraph();
  return graph.domains.join(", ");
}

function agentSystemPrompt(phase: AgentPhase, learnerName: string): string {
  return `You are Aria, PathFinder's onboarding interviewer — a warm, sharp learning coach.

Current interview phase: "${phase}"
Phase goal: ${PHASE_GOALS[phase] ?? "Wrap up."}

Style rules:
- 1-3 sentences per reply. Conversational, punchy, zero corporate filler.
- DO NOT repeat the user's name ("${learnerName}") in every message. Rarely use it.
- DO NOT summarize their answers back to them like a robot. Just ask the next logical question naturally.
- NEVER expose internal system IDs (like "cy_pentest") or JSON keys to the user. Speak like a normal human.
- Ask exactly ONE question per reply (or wrap up if the phase goal is met).
- Reference what the learner already told you without over-explaining — never re-ask.
- If an answer is vague, probe once with a concrete example question, then move on.
- Never invent skills for the learner. If unsure, ask.

CRITICAL INSTRUCTIONS ON TOOLS:
- You have access to the exaSearch tool. Use it if you need to look up current information or verify something they said.
- You have access to fetchGitHubProfile. Use it if they provide their GitHub username.
- You have access to getTechStackTrends. Use it if they ask whether a specific technology is worth learning.
- You have access to the markPhaseComplete tool. Use this tool ONLY when you have fully satisfied the Phase goal and are ready to move to the next phase. When you call this tool, you must provide the profile fields you have extracted. Calling this tool pauses the interview and asks the user for confirmation.`;
}

// Ensure we have a provider. In production on Vercel, use Vercel Gateway.
// We fallback to standard OpenAI config if needed.
const openaiProvider = createOpenAI({
  apiKey: process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
});

export async function runAgentStream(learnerId: string, userMessage: string) {
  const state = await db.agentState.findUnique({ where: { learnerId } });
  const learner = await db.learner.findUnique({ where: { id: learnerId } });
  if (!state || !learner) throw new Error("Learner or agent state not found");

  const history: AgentHistoryTurn[] = JSON.parse(state.historyJson || "[]");
  const extractedSoFar: ExtractedProfile = JSON.parse(state.extractedJson || "{}");

  const messages: any[] = [
    { role: "system", content: agentSystemPrompt(state.phase as AgentPhase, learner.name) },
    { role: "system", content: `Skill catalogue (id|name) — the ONLY valid skillIds:\n${await skillCatalogText(extractedSoFar.domain)}` },
    { role: "system", content: `Available domains: ${await domainOptionsText()}` },
    { role: "system", content: `Profile captured so far: ${JSON.stringify(extractedSoFar)}` },
    ...history.slice(-10).map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: userMessage },
  ];

  const result = streamText({
    model: openaiProvider(process.env.GROQ_MODEL || "openai/gpt-oss-120b"),
    messages,
    tools: {
      exaSearch: gateway.tools.exaSearch(),
      fetchGitHubProfile: tool({
        description: "Fetch public profile stats and top languages for a GitHub user. Use this when the learner mentions their GitHub username to verify their experience.",
        parameters: z.object({ username: z.string() }),
        execute: async ({ username }) => {
          try {
            const res = await fetch(`https://api.github.com/users/${username}`);
            if (!res.ok) return { error: "User not found" };
            const data = await res.json();
            return {
              login: data.login,
              publicRepos: data.public_repos,
              followers: data.followers,
              bio: data.bio,
              company: data.company
            };
          } catch {
            return { error: "Failed to fetch" };
          }
        }
      }),
      getTechStackTrends: tool({
        description: "Get a simulated trend analysis for a specific technology to advise the learner if it is worth learning.",
        parameters: z.object({ technology: z.string() }),
        execute: async ({ technology }) => {
          // Simulated data for the sake of the interview
          return {
            technology,
            trend: "growing",
            demand: "high",
            commonRoles: ["Frontend Engineer", "Fullstack Developer"],
            advice: `${technology} is heavily adopted in the industry right now. A solid choice.`
          };
        }
      }),
      markPhaseComplete: tool({
        description: "Call this tool when you have successfully gathered all the required information for the current phase and are ready to move to the next phase.",
        parameters: z.object({
          name: z.string().optional(),
          goalStatement: z.string().optional(),
          targetRole: z.string().optional(),
          domain: z.string().optional(),
          goalSkillId: z.string().optional(),
          hoursPerWeek: z.number().optional(),
          timelineWeeks: z.number().optional(),
          learningStyle: z.string().optional(),
          motivation: z.string().optional(),
          constraints: z.array(z.string()).optional(),
          skillsClaimed: z.array(z.object({
            skillId: z.string(),
            skillName: z.string(),
            level: z.number()
          })).optional()
        }),
        execute: async (args) => {
          return { success: true };
        }
      })
    },
    stopWhen: stepCountIs(3),
  });

  return { result, state, learnerId, userMessage };
}

export async function persistAgentTurn(
  learnerId: string, 
  userMessage: string, 
  replyText: string, 
  extractedNew: ExtractedProfile,
  wantsSkip: boolean
): Promise<{ phase: AgentPhase; extracted: ExtractedProfile; roundsInPhase: number }> {
  const state = await db.agentState.findUnique({ where: { learnerId } });
  if (!state) throw new Error("Agent state not found");
  const history: AgentHistoryTurn[] = JSON.parse(state.historyJson || "[]");
  const running: ExtractedProfile = JSON.parse(state.extractedJson || "{}");

  history.push({ role: "user", content: userMessage });
  history.push({ role: "assistant", content: replyText.slice(0, 2000) });

  const merged: ExtractedProfile = { ...running };
  for (const key of ["name", "goalStatement", "targetRole", "domain", "goalSkillId", "learningStyle", "motivation"] as const) {
    const v = (extractedNew as any)[key];
    if (typeof v === "string" && v) (merged as any)[key] = v;
  }
  if (extractedNew.hoursPerWeek != null) merged.hoursPerWeek = extractedNew.hoursPerWeek;
  if (extractedNew.timelineWeeks != null && extractedNew.timelineWeeks > 0) merged.timelineWeeks = extractedNew.timelineWeeks;
  if (extractedNew.constraints?.length) {
    merged.constraints = [...new Set([...(merged.constraints ?? []), ...extractedNew.constraints])].slice(0, 10);
  }

  const roundsInPhase = history.filter((h, i) => h.role === "user" && i >= history.length - 6).length;
  let phase = state.phase as AgentPhase;

  await db.agentState.update({
    where: { learnerId },
    data: {
      phase,
      historyJson: JSON.stringify(history.slice(-30)),
      extractedJson: JSON.stringify(merged),
      roundsCompleted: wantsSkip ? 0 : state.roundsCompleted + 1,
    },
  });

  const learnerUpdate: Record<string, unknown> = {};
  if (merged.name) learnerUpdate.name = merged.name;
  if (merged.goalStatement) learnerUpdate.goalStatement = merged.goalStatement;
  if (merged.targetRole) learnerUpdate.targetRole = merged.targetRole;
  if (merged.domain) learnerUpdate.domain = merged.domain;
  if (merged.goalSkillId) learnerUpdate.goalSkillId = merged.goalSkillId;
  if (merged.hoursPerWeek != null) learnerUpdate.hoursPerWeek = merged.hoursPerWeek;
  if (merged.timelineWeeks != null) learnerUpdate.timelineWeeks = merged.timelineWeeks;
  if (merged.learningStyle) learnerUpdate.learningStyle = merged.learningStyle;
  if (merged.motivation) learnerUpdate.motivation = merged.motivation;
  if (merged.constraints?.length) learnerUpdate.constraintsJson = JSON.stringify(merged.constraints);
  
  const stageMap: Record<string, string> = {
    intro: "interview", goal: "interview", background: "interview", time: "interview",
    style: "interview", wrap_up: "evidence", done: "evidence",
  };
  learnerUpdate.onboardingStage = phase === "done" ? "evidence" : (stageMap[phase] ?? "interview");
  
  if (Object.keys(learnerUpdate).length) {
    await db.learner.update({ where: { id: learnerId }, data: learnerUpdate as never });
  }

  if (extractedNew.skillsClaimed?.length) {
    const graph = await loadSkillGraph();
    const claims: SkillClaim[] = extractedNew.skillsClaimed
      .filter((s) => graph.skills[s.skillId])
      .map((s) => ({
        skillId: s.skillId,
        skillName: graph.skills[s.skillId].name,
        level: s.level,
        quote: `Self-reported during interview: knows ${graph.skills[s.skillId].name} at level ${s.level}/5`,
        strength: 1,
      }));
    if (claims.length) {
      await logEvidence(learnerId, "interview", "onboarding conversation", `Self-reported ${claims.length} skill(s) during the interview`, claims);
      await fuseEvidence(learnerId, "interview", claims);
    }
  }

  return { phase, extracted: merged, roundsInPhase };
}
