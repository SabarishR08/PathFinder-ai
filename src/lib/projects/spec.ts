/**
 * ZPD-calibrated project specs.
 *
 * Every project milestone carries a generated brief sized to the learner's
 * evidenced level (stretch multiplier 1.5-3x — see engine/zpd.ts). The brief
 * includes concrete requirements, a weighted rubric, and the expected stack
 * so evaluation has something objective to grade against.
 *
 * LLM generates the brief; the deterministic fallback assembles a real brief
 * from the milestone's actual skills, courses and resources (never a stub).
 */
import { db } from "@/lib/db";
import { chatJson, asArray, asString, asInt } from "@/lib/ai/llm";
import { loadSkillGraph, loadCatalogue, loadResources, calibrateZpd, tierLabel } from "@/lib/engine";
import { recommendCourses, resourcesForSkills } from "@/lib/engine/courses";

export interface ProjectBrief {
  title: string;
  brief: string;
  requirements: string[];
  rubric: Array<{ criterion: string; weight: number }>;
  expectedStack: string[];
  zpd: ReturnType<typeof calibrateZpd>;
}

async function generateBriefLlm(params: {
  skillNames: string[];
  goalStatement: string;
  hoursPerWeek: number;
  meanLevel: number;
  requirementCount: number;
}): Promise<ProjectBrief | null> {
  const zpd = calibrateZpd(params.meanLevel, params.hoursPerWeek);
  const result = await chatJson<Omit<ProjectBrief, "zpd">>(
    [
      { role: "system", content: "You are a senior engineer who designs learning projects. Projects are concrete, buildable, and portfolio-worthy." },
      {
        role: "user",
        content: `Design ONE hands-on project for a learner.

Learner context:
- Learning goal: ${params.goalStatement || "skill development"}
- Evidenced skill level: ${params.meanLevel.toFixed(1)}/5 across ${params.skillNames.join(", ")}
- Weekly learning time: ${params.hoursPerWeek}h
- ZPD calibration: target difficulty ${zpd.targetDifficulty}/5 (${tierLabel(zpd.targetDifficulty)}), estimated ${zpd.estimatedHours}h of work, ${params.requirementCount} core requirements

Return JSON:
{
  "title": "specific, impressive-sounding project name",
  "brief": "3-4 sentence description of what they'll build and why it proves the skills",
  "requirements": ["${Array.from({ length: params.requirementCount }, (_, i) => `requirement ${i + 1}`).join('", "')}" — concrete, checkable behaviours],
  "rubric": [{"criterion": "...", "weight": 0.0-1.0} — 4-5 criteria, weights sum to 1.0],
  "expectedStack": ["languages/frameworks we expect to see, e.g. Python, Flask, SQLite"]
}

Rules:
- The project MUST exercise every skill listed above.
- Requirements must be objectively checkable from the repository code.
- Difficulty must match the ZPD target — not a tutorial rehash, not a research project.`,
      },
    ],
    (value) => {
      const obj = value as Record<string, unknown>;
      const title = asString(obj.title);
      const brief = asString(obj.brief);
      const requirements = asArray(obj.requirements).map((r) => asString(r)).filter(Boolean);
      const rubric = asArray(obj.rubric)
        .map((r) => {
          const c = r as Record<string, unknown>;
          const criterion = asString(c.criterion);
          const weight = asInt(Math.round((typeof c.weight === "number" ? c.weight : 0.2) * 100), 20, 5, 100) / 100;
          return criterion ? { criterion, weight } : null;
        })
        .filter((r): r is { criterion: string; weight: number } => r !== null);
      const expectedStack = asArray(obj.expectedStack).map((s) => asString(s)).filter(Boolean);
      if (!title || !brief || requirements.length < 3) return null;
      // Normalise rubric weights to sum to 1.
      const totalW = rubric.reduce((s, r) => s + r.weight, 0) || 1;
      const normalised = rubric.map((r) => ({ criterion: r.criterion, weight: Math.round((r.weight / totalW) * 100) / 100 }));
      return { title, brief, requirements: requirements.slice(0, 8), rubric: normalised, expectedStack };
    },
    { maxTokens: 1200, temperature: 0.6 },
  );
  if (!result) return null;
  return { ...result.value, zpd };
}

async function generateBriefDeterministic(params: {
  milestonePhase: string;
  skillIds: string[];
  skillNames: string[];
  goalStatement: string;
  hoursPerWeek: number;
  meanLevel: number;
}): Promise<ProjectBrief> {
  const zpd = calibrateZpd(params.meanLevel, params.hoursPerWeek);
  const graph = await loadSkillGraph();
  const catalogue = await loadCatalogue();
  const resources = await loadResources();

  const coursePicks = params.skillIds
    .flatMap((sid) => recommendCourses(catalogue, sid, { perSkill: 1, evidencedLevel: params.meanLevel }))
    .slice(0, 3);
  const freePicks = Object.values(resourcesForSkills(resources, params.skillIds, { perSkill: 1 }))
    .flat()
    .slice(0, 3);

  const title = `${params.skillNames[0] ?? "Skill"} integration project: ${params.milestonePhase.replace(/^\d+\.\s*/, "")}`;
  const brief =
    `Build a small but complete artefact that puts ${params.skillNames.join(", ")} to work together — ` +
    `aimed at your goal (${params.goalStatement || "skill growth"}). Treat it as a portfolio piece: a README, ` +
    `clean commits, and a runnable entry point. ZPD calibration: ${zpd.rationale}`;

  const requirements = [
    `Demonstrate ${params.skillNames.slice(0, 3).join(", ")} in working code (not just imports)`,
    "Include a README describing what it does, how to run it, and what you learned",
    "Handle at least one real edge case or error path explicitly",
    "Keep the main flow under ~300 lines so the core logic stays reviewable",
  ];
  if (params.skillNames.length > 3) {
    requirements.push(`Show how ${params.skillNames.slice(3).join(" and ")} support the main flow`);
  }

  const rubric = [
    { criterion: "Core skill application", weight: 0.35 },
    { criterion: "Completeness of requirements", weight: 0.25 },
    { criterion: "Code clarity & structure", weight: 0.2 },
    { criterion: "Documentation quality", weight: 0.1 },
    { criterion: "Edge-case handling", weight: 0.1 },
  ];

  const expectedStack = [
    ...new Set(params.skillIds.map((sid) => graph.skills[sid]?.domain === "Web Development" ? "JavaScript/TypeScript" : "Python").filter(Boolean)),
  ];

  void coursePicks;
  void freePicks;

  return { title, brief, requirements, rubric, expectedStack, zpd };
}

export async function ensureProjectSpec(milestoneId: string): Promise<{
  specId: string;
  brief: ProjectBrief;
  mode: "llm" | "deterministic" | "cached";
}> {
  const existing = await db.projectSpec.findUnique({ where: { milestoneId } });
  if (existing) {
    return {
      specId: existing.id,
      brief: {
        title: existing.title,
        brief: existing.brief,
        requirements: JSON.parse(existing.requirementsJson),
        rubric: JSON.parse(existing.rubricJson),
        expectedStack: JSON.parse(existing.expectedStackJson ?? "[]"),
        zpd: JSON.parse(existing.zpdJson),
      },
      mode: "cached",
    };
  }

  const milestone = await db.milestone.findUnique({ where: { id: milestoneId } });
  if (!milestone) throw new Error("Milestone not found");
  const path = await db.learningPath.findUnique({ where: { id: milestone.pathId } });
  const learner = path ? await db.learner.findUnique({ where: { id: path.learnerId } }) : null;

  const skillIds = JSON.parse(milestone.skillIdsJson) as string[];
  const skillNames = JSON.parse(milestone.skillNamesJson) as string[];
  const meanLevel =
    skillIds.reduce((s, id) => s + ((path && JSON.parse(path.snapshotJson ?? "{}")?.evidencedLevels?.[id]) ?? 0), 0) /
    Math.max(1, skillIds.length);

  const params = {
    milestonePhase: milestone.phase,
    skillIds,
    skillNames,
    goalStatement: learner?.goalStatement ?? "",
    hoursPerWeek: learner?.hoursPerWeek ?? 10,
    meanLevel,
  };

  const requirementCount = calibrateZpd(meanLevel, params.hoursPerWeek).requirementCount;
  const llmBrief = await generateBriefLlm({ ...params, requirementCount });
  const brief: ProjectBrief = llmBrief ?? (await generateBriefDeterministic(params));
  const mode: "llm" | "deterministic" = llmBrief ? "llm" : "deterministic";

  const spec = await db.projectSpec.create({
    data: {
      milestoneId,
      title: brief.title,
      brief: brief.brief,
      requirementsJson: JSON.stringify(brief.requirements),
      rubricJson: JSON.stringify(brief.rubric),
      zpdJson: JSON.stringify(brief.zpd),
      expectedStackJson: JSON.stringify(brief.expectedStack),
      estimatedHours: brief.zpd.estimatedHours,
    },
  });

  return { specId: spec.id, brief, mode: mode === "llm" ? "llm" : "deterministic" };
}
