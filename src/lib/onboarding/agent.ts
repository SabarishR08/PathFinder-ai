/**
 * Onboarding interview agent.
 *
 * A multi-round, adaptive, refresh-safe interview. State lives in the
 * AgentState table (phase machine + history + running extraction), so the
 * learner can close the tab mid-interview and resume.
 *
 * Transport contract per turn (single streaming LLM call):
 *
 *   [conversational reply — streamed to the UI as-is]
 *   ---PATHFINDER-JSON---
 *   {"phaseComplete": true, "profile": {...}}
 *
 * The client stops rendering at the separator; the server accumulates the
 * full text, extracts the JSON tail, and advances the state machine.
 *
 * When no LLM provider is reachable, `scriptedAgentTurn` runs a
 * deterministic interview (fixed per-phase questions + regex/keyword
 * extraction) so onboarding never blocks.
 */
import { db } from "@/lib/db";
import { chatCompletionStream, repairJson, asString, asInt, asArray } from "@/lib/ai/llm";
import { loadSkillGraph } from "@/lib/engine/data";
import { fuseEvidence, logEvidence } from "@/lib/evidence/fuse";
import type { SkillClaim } from "@/lib/evidence/types";

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

const MAX_ROUNDS_PER_PHASE = 3;

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
- 2-4 sentences per reply. Conversational, specific, zero corporate filler.
- Ask exactly ONE question per reply (or wrap up if the phase goal is met).
- Reference what the learner already told you — never re-ask.
- If an answer is vague, probe once with a concrete example question, then move on.
- Never invent skills for the learner. If unsure, ask.

Output format — MANDATORY:
1. Your conversational reply (plain text, may use light markdown).
2. Then exactly this separator on its own line: ${AGENT_SEPARATOR}
3. Then a single JSON object:
{"phaseComplete": boolean, "profile": {"name": string, "goalStatement": string, "targetRole": string, "domain": string, "goalSkillId": string, "hoursPerWeek": number, "timelineWeeks": number, "learningStyle": string, "motivation": string, "constraints": [string], "skillsClaimed": [{"skillId": string, "skillName": string, "level": 0-5}]}}

Only include profile keys you actually learned this turn (or can infer from this turn's answer). Set phaseComplete=true when the phase goal is satisfied. Omit skillsClaimed unless the learner stated skills this turn.`;
}

export interface AgentTurnResult {
  /** Full raw model output (reply + separator + JSON). */
  raw: string;
  /** Conversational reply only (before the separator). */
  reply: string;
  extracted: ExtractedProfile;
  provider: string;
}

export async function runAgentTurn(
  learnerId: string,
  userMessage: string,
): Promise<AgentTurnResult> {
  const state = await db.agentState.findUnique({ where: { learnerId } });
  const learner = await db.learner.findUnique({ where: { id: learnerId } });
  if (!state || !learner) throw new Error("Learner or agent state not found");

  const history: AgentHistoryTurn[] = JSON.parse(state.historyJson || "[]");
  const extractedSoFar: ExtractedProfile = JSON.parse(state.extractedJson || "{}");

  const messages = [
    { role: "system" as const, content: agentSystemPrompt(state.phase as AgentPhase, learner.name) },
    { role: "system" as const, content: `Skill catalogue (id|name) — the ONLY valid skillIds:\n${await skillCatalogText(extractedSoFar.domain)}` },
    { role: "system" as const, content: `Available domains: ${await domainOptionsText()}` },
    { role: "system" as const, content: `Profile captured so far: ${JSON.stringify(extractedSoFar)}` },
    ...history.slice(-10).map((t) => ({ role: t.role, content: t.content })),
    { role: "user" as const, content: userMessage },
  ];

  let raw = "";
  let provider = "none";
  try {
    for await (const chunk of chatCompletionStream(messages, { maxTokens: 900, temperature: 0.7 })) {
      raw += chunk.delta;
      provider = chunk.provider;
    }
  } catch {
    raw = "";
  }

  let extracted: ExtractedProfile = {};
  if (raw.trim()) {
    const sepIdx = raw.indexOf(AGENT_SEPARATOR);
    const jsonPart = sepIdx >= 0 ? raw.slice(sepIdx + AGENT_SEPARATOR.length) : raw;
    const parsed = repairJson(jsonPart);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const profileRaw = (obj.profile ?? obj) as Record<string, unknown>;
      extracted = sanitizeExtracted(profileRaw);
    }
  }

  // No usable output — fall back to the deterministic interviewer.
  if (!raw.trim() || (!extracted.phaseComplete && !raw.includes(AGENT_SEPARATOR) && raw.trim().length < 20)) {
    const scripted = scriptedAgentTurn(state.phase as AgentPhase, extractedSoFar, userMessage, history);
    return { raw: scripted.reply, reply: scripted.reply, extracted: scripted.extracted, provider: "scripted" };
  }

  const reply = raw.includes(AGENT_SEPARATOR) ? raw.slice(0, raw.indexOf(AGENT_SEPARATOR)).trim() : raw.trim();
  return { raw, reply, extracted, provider };
}

function sanitizeExtracted(obj: Record<string, unknown>): ExtractedProfile {
  const out: ExtractedProfile = {};
  const name = asString(obj.name);
  if (name) out.name = name;
  const goal = asString(obj.goalStatement);
  if (goal) out.goalStatement = goal;
  const role = asString(obj.targetRole);
  if (role) out.targetRole = role;
  const domain = asString(obj.domain);
  if (domain) out.domain = domain;
  const goalSkillId = asString(obj.goalSkillId);
  if (goalSkillId) out.goalSkillId = goalSkillId;
  if (obj.hoursPerWeek != null) out.hoursPerWeek = asInt(obj.hoursPerWeek, 10, 1, 80);
  if (obj.timelineWeeks != null) out.timelineWeeks = asInt(obj.timelineWeeks, 0, 0, 208);
  const style = asString(obj.learningStyle);
  if (style) out.learningStyle = style;
  const motivation = asString(obj.motivation);
  if (motivation) out.motivation = motivation;
  const constraints = asArray(obj.constraints).map((c) => asString(c)).filter(Boolean);
  if (constraints.length) out.constraints = constraints;
  const skills = asArray(obj.skillsClaimed)
    .map((s) => {
      const claim = s as Record<string, unknown>;
      const skillId = asString(claim.skillId);
      const skillName = asString(claim.skillName, skillId);
      const level = asInt(claim.level, 0, 0, 5);
      if (!skillId || level <= 0) return null;
      return { skillId, skillName, level };
    })
    .filter((s): s is { skillId: string; skillName: string; level: number } => s !== null);
  if (skills.length) out.skillsClaimed = skills;
  out.phaseComplete = obj.phaseComplete === true || obj.phaseComplete === "true";
  return out;
}

/**
 * Persist a completed turn: merge extraction into the running profile,
 * advance the phase machine, sync the Learner row, and record claimed
 * skills as interview evidence.
 */
export async function persistAgentTurn(learnerId: string, userMessage: string, turn: AgentTurnResult): Promise<{
  phase: AgentPhase;
  extracted: ExtractedProfile;
  roundsInPhase: number;
}> {
  const state = await db.agentState.findUnique({ where: { learnerId } });
  if (!state) throw new Error("Agent state not found");
  const history: AgentHistoryTurn[] = JSON.parse(state.historyJson || "[]");
  const running: ExtractedProfile = JSON.parse(state.extractedJson || "{}");

  history.push({ role: "user", content: userMessage });
  history.push({ role: "assistant", content: turn.reply.slice(0, 2000) });

  // Merge new extraction over the running profile.
  const merged: ExtractedProfile = { ...running };
  for (const key of ["name", "goalStatement", "targetRole", "domain", "goalSkillId", "learningStyle", "motivation"] as const) {
    const v = turn.extracted[key];
    if (typeof v === "string" && v) (merged as Record<string, unknown>)[key] = v;
  }
  if (turn.extracted.hoursPerWeek != null) merged.hoursPerWeek = turn.extracted.hoursPerWeek;
  if (turn.extracted.timelineWeeks != null && turn.extracted.timelineWeeks > 0) merged.timelineWeeks = turn.extracted.timelineWeeks;
  if (turn.extracted.constraints?.length) {
    merged.constraints = [...new Set([...(merged.constraints ?? []), ...turn.extracted.constraints])].slice(0, 10);
  }

  // Phase advancement: explicit completion, hard round cap, or the learner
  // wants to skip ahead.
  const roundsInPhase = history.filter((h, i) => h.role === "user" && i >= history.length - 6).length;
  let phase = state.phase as AgentPhase;
  const wantsSkip = /skip|next question|move on|let'?s move/i.test(userMessage);
  const phaseDone =
    turn.extracted.phaseComplete === true ||
    (state.roundsCompleted + 1 >= MAX_ROUNDS_PER_PHASE && phase !== "wrap_up") ||
    wantsSkip;

  if (phaseDone && phase !== "done") {
    const idx = PHASE_ORDER.indexOf(phase);
    phase = PHASE_ORDER[Math.min(idx + 1, PHASE_ORDER.length - 1)];
  }

  await db.agentState.update({
    where: { learnerId },
    data: {
      phase,
      historyJson: JSON.stringify(history.slice(-30)),
      extractedJson: JSON.stringify(merged),
      roundsCompleted: phaseDone ? 0 : state.roundsCompleted + 1,
    },
  });

  // Sync learner profile fields.
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
    intro: "interview",
    goal: "interview",
    background: "interview",
    time: "interview",
    style: "interview",
    wrap_up: "evidence",
    done: "evidence",
  };
  learnerUpdate.onboardingStage = phase === "done" ? "evidence" : (stageMap[phase] ?? "interview");
  if (Object.keys(learnerUpdate).length) {
    await db.learner.update({ where: { id: learnerId }, data: learnerUpdate as never });
  }

  // Claimed skills from this turn become interview evidence (tier: claimed).
  if (turn.extracted.skillsClaimed?.length) {
    const graph = await loadSkillGraph();
    const claims: SkillClaim[] = turn.extracted.skillsClaimed
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

// ─── Deterministic fallback interviewer ──────────────────────────────────────

const SCRIPTED_QUESTIONS: Record<Exclude<AgentPhase, "done">, string[]> = {
  intro: [
    "Hey! I'm Aria, your learning coach. What's your name, and what's the one thing you're trying to achieve by learning right now?",
  ],
  goal: [
    "Nice — let's sharpen that. Which of these domains is closest to your goal: {domains}?",
    "Got it. What specific role or outcome do you want at the end of this — a job title, a project you want to build, an exam?",
  ],
  background: [
    "Now let's map what you already know. What languages, tools or subjects are you already comfortable with?",
    "What have you actually built or completed with those — projects, courses, work tasks? Even small things count.",
  ],
  time: [
    "Realistically, how many hours per week can you put into learning?",
    "Any hard deadline or constraint I should plan around — job, exams, budget?",
  ],
  style: [
    "Last thing: how do you learn best — watching videos, reading, or building things and figuring them out as you go?",
    "And what's actually driving this goal — career switch, promotion, curiosity?",
  ],
  wrap_up: [
    "Here's what I've captured so far — I'll carry it into your profile. Next up: we'll connect real evidence like your GitHub, resume or LeetCode so your plan is based on proof, not just self-report. Ready when you are.",
  ],
};

function scriptedAgentTurn(
  phase: AgentPhase,
  extracted: ExtractedProfile,
  _userMessage: string,
  history: AgentHistoryTurn[],
): { reply: string; extracted: ExtractedProfile } {
  const assistantTurns = history.filter((h) => h.role === "assistant").length;
  const questions = SCRIPTED_QUESTIONS[phase === "done" ? "wrap_up" : phase];
  const question = questions[Math.min(assistantTurns, questions.length - 1)]
    .replace("{domains}", "Data Science, Machine Learning, Web Development, Cybersecurity, Cloud Computing, AI Engineering, and others");
  const out: ExtractedProfile = {};
  // Heuristic extraction from the user's latest message happens in the route
  // layer (it has the message); here we just move the conversation forward.
  void extracted;
  return { reply: `${question}\n\n(Offline mode: I'm asking a fixed set of questions — answer naturally and we'll still build your profile.)`, extracted: out };
}

/** Regex-based extraction used by the scripted fallback path. */
export function heuristicExtract(message: string, current: ExtractedProfile): ExtractedProfile {
  const out: ExtractedProfile = { ...current };
  const hoursMatch = message.match(/(\d{1,2})\s*(?:hrs?|hours?|hr)\s*(?:a|per|\/)\s*week/i) || message.match(/(\d{1,2})\s*(?:hrs?|hours?)\s*(?:a|per|\/)\s*week/i);
  if (hoursMatch) out.hoursPerWeek = Math.max(1, Math.min(80, parseInt(hoursMatch[1], 10)));
  const weekMatch = message.match(/(\d{1,3})\s*(?:weeks?|months?)\b/i);
  if (weekMatch) {
    const n = parseInt(weekMatch[1], 10);
    if (/month/i.test(weekMatch[0])) out.timelineWeeks = n * 4;
    else out.timelineWeeks = n;
  }
  const domainHits = ["Data Science", "Machine Learning", "Web Development", "Cybersecurity", "Cloud Computing", "AI Engineering", "Business"];
  const lower = message.toLowerCase();
  for (const d of domainHits) {
    if (lower.includes(d.toLowerCase())) { out.domain = d; break; }
  }
  const nameMatch = message.match(/\b(?:i'?m|i am|my name is|it'?s)\s+([A-Z][a-zA-Z]{1,20})\b/);
  if (nameMatch && !current.name) out.name = nameMatch[1];
  return out;
}
