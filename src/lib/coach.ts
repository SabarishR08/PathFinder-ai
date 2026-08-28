/**
 * Weekly coach — an honest progress review generated from real activity
 * data. The metrics section is fully deterministic; the prose is LLM-first
 * with a deterministic fallback. "The Coach" persona is deliberately direct:
 * it celebrates real wins and names real slippage.
 */
import { db } from "@/lib/db";
import { chatCompletion } from "@/lib/ai/llm";

export interface WeeklyMetrics {
  weekOf: string;
  milestonesCompleted: number;
  quizzesPassed: number;
  quizzesFailed: number;
  projectsPassed: number;
  projectsNeedsWork: number;
  evidenceAdded: number;
  hoursLogged: number;
  streakDays: number;
  daysSinceActivity: number;
  pathProgressPercent: number;
}

function mondayOf(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

export async function computeWeeklyMetrics(learnerId: string): Promise<WeeklyMetrics> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [activities, activePath] = await Promise.all([
    db.activityLog.findMany({ where: { learnerId, createdAt: { gte: twoWeeksAgo } }, orderBy: { createdAt: "desc" } }),
    db.learningPath.findFirst({ where: { learnerId, isActive: true }, include: { milestones: true } }),
  ]);

  const thisWeek = activities.filter((a) => a.createdAt >= weekAgo);
  const count = (kind: string) => thisWeek.filter((a) => a.kind === kind).length;

  // Streak: consecutive days (ending today or yesterday) with activity.
  const activityDays = new Set(activities.map((a) => a.createdAt.toISOString().slice(0, 10)));
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (activityDays.has(day)) streak++;
    else if (i > 0) break;
    else continue;
  }

  const lastActivity = activities[0]?.createdAt ?? null;
  const daysSinceActivity = lastActivity ? Math.floor((now.getTime() - lastActivity.getTime()) / (24 * 60 * 60 * 1000)) : 99;

  const milestones = activePath?.milestones ?? [];
  const completed = milestones.filter((m) => m.status === "complete").length;
  const pathProgressPercent = milestones.length ? Math.round((completed / milestones.length) * 100) : 0;

  // Rough hours proxy: completed milestone hours this week + quiz/evidence time.
  const completedThisWeek = await db.milestone.findMany({
    where: { path: { learnerId, isActive: true }, status: "complete", completedAt: { gte: weekAgo } },
  });
  const hoursLogged = completedThisWeek.reduce((s, m) => s + m.estimatedHours, 0);

  return {
    weekOf: mondayOf(now),
    milestonesCompleted: count("milestone_completed"),
    quizzesPassed: count("quiz_passed") + count("calibrated"),
    quizzesFailed: count("quiz_failed"),
    projectsPassed: count("project_passed"),
    projectsNeedsWork: count("project_needs_work"),
    evidenceAdded: count("evidence_added"),
    hoursLogged,
    streakDays: streak,
    daysSinceActivity,
    pathProgressPercent,
  };
}

export async function generateWeeklyReport(learnerId: string): Promise<{ metrics: WeeklyMetrics; content: string; mode: "llm" | "deterministic" }> {
  const metrics = await computeWeeklyMetrics(learnerId);
  const learner = await db.learner.findUnique({ where: { id: learnerId } });
  const activePath = await db.learningPath.findFirst({
    where: { learnerId, isActive: true },
    include: { milestones: true },
  });
  const ordered = activePath ? [...activePath.milestones].sort((a, b) => a.order - b.order) : [];
  const current = ordered.find((m) => m.status === "in_progress" || m.status === "available");

  const prose = await chatCompletion(
    [
      { role: "system", content: "You are The Coach — direct, warm, allergic to filler. You write weekly learning reviews in markdown. You celebrate real wins concretely and name slippage plainly. 150-250 words max. Use a few short sections with bold labels. Never invent data — use only the metrics given." },
      {
        role: "user",
        content: `Write this week's review.

Learner: ${learner?.name ?? "the learner"}
Goal: ${learner?.goalStatement ?? "(not set)"}${learner?.targetRole ? ` (target role: ${learner.targetRole})` : ""}
Path: ${activePath ? `${activePath.scenario} scenario, v${activePath.version}, ${metrics.pathProgressPercent}% complete` : "no active path"}
Current milestone: ${current ? `${current.phase} — ${current.title}` : "none open"}

This week's real metrics:
${JSON.stringify(metrics, null, 1)}

Tone guidance:
- Zero milestones completed + daysSinceActivity >= 5 → name the stall kindly, one concrete re-entry step.
- Quizzes failed → reframe as calibration data, point at the remediation.
- Good streak/progress → genuine celebration, then raise the bar one notch.`,
      },
    ],
    { maxTokens: 900, temperature: 0.7 },
  );

  let content: string;
  let mode: "llm" | "deterministic" = "llm";
  if (prose) {
    content = prose.text;
  } else {
    mode = "deterministic";
    const verdict =
      metrics.milestonesCompleted === 0 && metrics.daysSinceActivity >= 5
        ? `**This week went quiet.** ${metrics.daysSinceActivity} days since your last action. The plan doesn't need a hero — it needs 45 minutes.`
        : metrics.quizzesFailed > 0
          ? `**Calibration data, not failure.** ${metrics.quizzesFailed} quiz resets this week — the plan already adjusted.`
          : metrics.milestonesCompleted > 0
            ? `**Real progress.** ${metrics.milestonesCompleted} milestone(s) closed, ${metrics.hoursLogged}h logged, ${metrics.streakDays}-day streak.`
            : `**Steady.** Path is ${metrics.pathProgressPercent}% complete.`;
    const next = current
      ? `Next up: **${current.title}** (${current.phase}). ${current.targetEndAt ? `Target: ${current.targetEndAt.toISOString().slice(0, 10)}.` : ""}`
      : "No open milestone — generate or replan your path.";
    content = `## Week of ${metrics.weekOf}\n\n${verdict}\n\n**Numbers:** ${metrics.quizzesPassed} quizzes passed · ${metrics.quizzesFailed} failed · ${metrics.evidenceAdded} evidence added · ${metrics.streakDays}-day streak.\n\n${next}`;
  }

  await db.weeklyReport.upsert({
    where: { learnerId_weekOf: { learnerId, weekOf: metrics.weekOf } },
    update: { content, metricsJson: JSON.stringify(metrics) },
    create: { learnerId, weekOf: metrics.weekOf, content, metricsJson: JSON.stringify(metrics) },
  });

  return { metrics, content, mode };
}
