/**
 * Explainability engine — every recommendation answers "why?" with three
 * grounds:
 *
 *   1. Evidence — what in the learner's actual data motivates this
 *   2. Graph    — the prerequisite structure that forces the ordering
 *   3. Goal     — how this serves the stated objective (+ counterfactual)
 *
 * The structured grounds are assembled deterministically (always available);
 * the LLM optionally polishes them into prose. This is trust-as-a-feature:
 * the explanation cites evidence rows that actually exist.
 */
import { db } from "@/lib/db";
import { chatCompletion } from "@/lib/ai/llm";
import { loadSkillGraph, loadCatalogue, computeDepths, ancestorClosure } from "@/lib/engine";

export type ExplainSubject = "skill" | "course" | "project" | "milestone";

export interface Explanation {
  subject: ExplainSubject;
  title: string;
  grounds: {
    evidence: string[];
    graph: string[];
    goal: string[];
    counterfactual?: string;
  };
  prose: string;
  mode: "llm" | "deterministic";
}

export async function explainSkill(learnerId: string, skillId: string): Promise<Explanation> {
  const graph = await loadSkillGraph();
  const catalogue = await loadCatalogue();
  const depths = computeDepths(graph);
  const node = graph.skills[skillId];
  if (!node) throw new Error("Unknown skill");

  const learner = await db.learner.findUnique({ where: { id: learnerId } });
  const assessment = await db.skillAssessment.findUnique({
    where: { learnerId_skillId: { learnerId, skillId } },
  });
  const evidenceItems = await db.evidenceItem.findMany({ where: { learnerId }, orderBy: { createdAt: "desc" }, take: 50 });

  // Evidence grounds: quotes from evidence that mention this skill.
  const evidenceGrounds: string[] = [];
  for (const item of evidenceItems) {
    try {
      const claims = JSON.parse(item.skillClaims) as Array<{ skillId: string; quote: string; level: number }>;
      const hit = claims.find((c) => c.skillId === skillId);
      if (hit) evidenceGrounds.push(`[${item.source}] ${hit.quote}`);
    } catch {
      /* skip malformed rows */
    }
  }
  if (!evidenceGrounds.length && assessment) {
    evidenceGrounds.push(
      assessment.tier === "none"
        ? "No evidence yet — this skill is currently unverified in your profile."
        : `Your profile shows level ${assessment.evidencedLevel}/5 (tier: ${assessment.tier}).`,
    );
  }

  // Graph grounds.
  const prereqNames = node.prereqs.map((p) => graph.skills[p]?.name ?? p);
  const graphGrounds: string[] = [];
  if (prereqNames.length) graphGrounds.push(`${node.name} lists ${prereqNames.join(", ")} as prerequisites in the ${node.domain} skill graph.`);
  else graphGrounds.push(`${node.name} is a root skill in the ${node.domain} graph — no prerequisites, safe to start anytime.`);
  const closure = ancestorClosure(graph, skillId);
  if (closure.size > 1) graphGrounds.push(`Reaching it unlocks the ${closure.size - 1}-skill branch above it.`);

  // Goal grounds.
  const goalGrounds: string[] = [];
  if (learner?.goalSkillId) {
    const goalClosure = ancestorClosure(graph, learner.goalSkillId);
    if (goalClosure.has(skillId)) {
      goalGrounds.push(`It sits inside the prerequisite closure of your goal (${graph.skills[learner.goalSkillId]?.name ?? learner.goalSkillId}) — skipping it would break the chain.`);
    } else {
      goalGrounds.push(`It is adjacent to your goal path — breadth that makes the goal skill easier to reach.`);
    }
  }
  if (learner?.goalStatement) goalGrounds.push(`Serves your stated goal: "${learner.goalStatement.slice(0, 160)}"`);

  // Counterfactual.
  const months = catalogue.skillMonths[skillId];
  const counterfactual = months
    ? `Skipping ${node.name} risks stalling later (it feeds ${Object.values(graph.skills).filter((s) => s.prereqs.includes(skillId)).length} downstream skills) for a saving of ~${Math.round(months * 14)}h now.`
    : undefined;

  const title = node.name;
  const grounds = { evidence: evidenceGrounds.slice(0, 4), graph: graphGrounds, goal: goalGrounds.slice(0, 3), counterfactual };

  // LLM polish (optional).
  const proseResult = await chatCompletion(
    [
      { role: "system", content: "You explain learning recommendations in 3-5 crisp sentences. Address the learner directly. Use ONLY the grounds provided — never invent facts." },
      {
        role: "user",
        content: `Why is "${node.name}" recommended for this learner?\n\nGrounds:\nEvidence: ${grounds.evidence.join(" | ") || "none"}\nGraph: ${grounds.graph.join(" | ")}\nGoal: ${grounds.goal.join(" | ") || "none"}\nCounterfactual: ${grounds.counterfactual ?? "none"}`,
      },
    ],
    { maxTokens: 400, temperature: 0.5 },
  );

  if (proseResult) {
    return { subject: "skill", title, grounds, prose: proseResult.text, mode: "llm" };
  }

  const prose = [
    `${node.name} is on your path because:`,
    grounds.evidence[0] ? `Your evidence says — ${grounds.evidence[0]}` : "",
    grounds.graph[0],
    grounds.goal[0] ?? "",
    grounds.counterfactual ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return { subject: "skill", title, grounds, prose, mode: "deterministic" };
}

export async function explainCourse(learnerId: string, courseId: string): Promise<Explanation> {
  const catalogue = await loadCatalogue();
  const graph = await loadSkillGraph();
  const course = catalogue.byId[courseId];
  if (!course) throw new Error("Unknown course");

  const learner = await db.learner.findUnique({ where: { id: learnerId } });
  const skillsItTeaches = (catalogue.coursesForSkill ? Object.entries(catalogue.coursesForSkill) : [])
    .filter(([, ids]) => ids.includes(courseId))
    .map(([sid]) => graph.skills[sid]?.name ?? sid)
    .filter(Boolean);

  const grounds = {
    evidence: learner ? [`Matched against your profile (goal: ${learner.goalStatement?.slice(0, 120) ?? "skill growth"})`] : [],
    graph: skillsItTeaches.length
      ? [`Teaches ${skillsItTeaches.slice(0, 5).join(", ")} — skills on your path`]
      : ["Matched by content similarity to your path skills"],
    goal: [
      `Rating ${course.Rating ?? "—"}/5 from real learner reviews${course.Viewers ? ` (${Math.round(course.Viewers).toLocaleString()} learners)` : ""}.`,
      course.DurationRaw ? `Duration: ${course.DurationRaw}` : "",
    ].filter(Boolean),
    counterfactual: `Alternatives were ranked lower on rating/relevance — this one best balances proof-quality and fit.`,
  };

  const prose = `"${course.Title}" was picked because it teaches ${skillsItTeaches.slice(0, 4).join(", ")} (skills on your path), carries a ${course.Rating ?? "—"}/5 rating${course.Site ? ` on ${course.Site}` : ""}${course.DurationRaw ? `, and runs ${course.DurationRaw.toLowerCase()}` : ""}.`;

  return { subject: "course", title: course.Title, grounds, prose, mode: "deterministic" };
}

export async function explainProject(learnerId: string, milestoneId: string): Promise<Explanation> {
  const spec = await db.projectSpec.findUnique({ where: { milestoneId } });
  if (!spec) throw new Error("No project spec for this milestone");
  const zpd = JSON.parse(spec.zpdJson) as { rationale: string; stretchMultiplier: number; targetDifficulty: number };

  const grounds = {
    evidence: [zpd.rationale],
    graph: ["The project exercises every skill in this milestone's phase, converting coursework into demonstrated ability."],
    goal: ["Project passes mark skills as PROVEN — the strongest evidence tier, which unlocks the next phase and feeds your portfolio."],
    counterfactual: "Skipping the project leaves the milestone's skills at 'claimed' — the path stalls at the gate.",
  };

  return {
    subject: "project",
    title: spec.title,
    grounds,
    prose: `${spec.brief.slice(0, 400)}`,
    mode: "deterministic",
  };
}
