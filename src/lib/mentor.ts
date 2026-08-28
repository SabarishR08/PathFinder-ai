/**
 * Mentor chat — a streaming tutor grounded in the learner's full context:
 * profile, assessments, active path, milestone progress and recent activity.
 *
 * Socratic mode toggles between answering directly and guiding with
 * questions — the same tutor, two pedagogies.
 */
import { db } from "@/lib/db";
import { chatCompletionStream } from "@/lib/ai/llm";
import { loadSkillGraph, computeDepths } from "@/lib/engine";

export interface MentorContextDigest {
  name: string;
  goal: string;
  targetRole?: string;
  hoursPerWeek: number;
  learningStyle?: string;
  motivation?: string;
  skills: Array<{ name: string; claimed: number; evidenced: number; tier: string }>;
  path: {
    scenario: string;
    version: number;
    totalHours: number;
    milestones: Array<{ phase: string; title: string; status: string; hours: number; endAt: string | null }>;
    nextAction: string;
  } | null;
  recentActivity: Array<{ kind: string; at: string }>;
}

export async function buildContextDigest(learnerId: string): Promise<MentorContextDigest> {
  const learner = await db.learner.findUnique({ where: { id: learnerId } });
  if (!learner) throw new Error("Learner not found");
  const [assessments, activePath, activities] = await Promise.all([
    db.skillAssessment.findMany({ where: { learnerId } }),
    db.learningPath.findFirst({ where: { learnerId, isActive: true }, include: { milestones: true } }),
    db.activityLog.findMany({ where: { learnerId }, orderBy: { createdAt: "desc" }, take: 12 }),
  ]);

  let path: MentorContextDigest["path"] = null;
  if (activePath) {
    const ordered = [...activePath.milestones].sort((a, b) => a.order - b.order);
    const current = ordered.find((m) => m.status === "in_progress" || m.status === "available");
    path = {
      scenario: activePath.scenario,
      version: activePath.version,
      totalHours: activePath.totalHours,
      milestones: ordered.map((m) => ({
        phase: m.phase,
        title: m.title,
        status: m.status,
        hours: m.estimatedHours,
        endAt: m.targetEndAt ? m.targetEndAt.toISOString().slice(0, 10) : null,
      })),
      nextAction: current
        ? `Continue milestone "${current.title}" (${current.phase})${current.targetEndAt ? `, target ${current.targetEndAt.toISOString().slice(0, 10)}` : ""}`
        : "No open milestone — generate a path or replan",
    };
  }

  const graph = await loadSkillGraph();
  void computeDepths;
  void graph;

  return {
    name: learner.name,
    goal: learner.goalStatement ?? "(not yet set)",
    targetRole: learner.targetRole ?? undefined,
    hoursPerWeek: learner.hoursPerWeek,
    learningStyle: learner.learningStyle ?? undefined,
    motivation: learner.motivation ?? undefined,
    skills: assessments
      .sort((a, b) => b.evidencedLevel - a.evidencedLevel)
      .slice(0, 15)
      .map((a) => ({ name: a.skillName, claimed: a.claimedLevel, evidenced: a.evidencedLevel, tier: a.tier })),
    path,
    recentActivity: activities.map((a) => ({ kind: a.kind, at: a.createdAt.toISOString().slice(0, 10) })),
  };
}

export function mentorSystemPrompt(digest: MentorContextDigest, socratic: boolean): string {
  return `You are Nexus, the learner's personal mentor inside PathFinder.

LEARNER CONTEXT (real data — use it, reference it):
${JSON.stringify(digest, null, 1)}

${socratic
      ? `MODE: Socratic tutor. You rarely give direct answers. You guide with questions, hints, and small experiments the learner can run. If they're stuck after 2-3 exchanges, give a concrete nudge — never leave them stranded.`
      : `MODE: Direct tutor. Answer clearly and concretely, with examples. Keep the learner's evidenced level in mind — do not assume skills above their evidenced tier.`}

Rules:
- 3-8 sentences unless the question genuinely needs more (code explanations may run longer).
- Ground advice in the context: their actual skill levels, their actual path, their actual goal.
- When explaining a path skill, mention WHY it's there (prerequisite chain, evidence gaps) if relevant.
- If asked something outside learning (general chat), be warm but redirect to their goals.
- Never invent milestone names, courses or progress that aren't in the context.`;
}

export async function* streamMentorReply(
  learnerId: string,
  userMessage: string,
  socratic: boolean,
): AsyncGenerator<{ delta: string; provider: string }> {
  const digest = await buildContextDigest(learnerId);

  const history = await db.mentorMessage.findMany({
    where: { learnerId },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  const messages = [
    { role: "system" as const, content: mentorSystemPrompt(digest, socratic) },
    ...history.map((m) => ({ role: m.role === "user" ? ("user" as const) : ("assistant" as const), content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  await db.mentorMessage.create({ data: { learnerId, role: "user", content: userMessage } });

  let full = "";
  let provider = "none";
  let yielded = false;
  try {
    for await (const chunk of chatCompletionStream(messages, { maxTokens: 1200, temperature: 0.7 })) {
      full += chunk.delta;
      provider = chunk.provider;
      yielded = true;
      yield { delta: chunk.delta, provider: chunk.provider };
    }
  } catch {
    // fall through to fallback
  }

  if (!yielded || !full.trim()) {
    // Deterministic fallback: grounded, honest, still useful.
    full = [
      `(Offline mentor mode — my full reasoning engine needs an LLM provider, but here's what your data says:)`,
      digest.path
        ? `Your next best action: ${digest.path.nextAction}. You're on the ${digest.path.scenario} path (v${digest.path.version}).`
        : `You don't have an active path yet — generate one from your dashboard.`,
      digest.skills.length
        ? `Strongest evidenced skills: ${digest.skills.slice(0, 3).map((s) => `${s.name} (${s.evidencedLevel}/5, ${s.tier})`).join(", ")}.`
        : `No skill evidence yet — connect GitHub or take a calibration quiz.`,
      `For "${userMessage.slice(0, 120)}" — check the resources attached to your current milestone; they cover this area.`,
    ].join("\n\n");
    yield { delta: full, provider: "scripted" };
  }

  await db.mentorMessage.create({ data: { learnerId, role: "assistant", content: full.slice(0, 6000) } });
}
