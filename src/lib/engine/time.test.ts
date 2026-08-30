import { describe, it, expect } from "vitest";
import {
  skillHours,
  milestoneHours,
  scheduleMilestones,
  humanDuration,
  formatDate,
  DEFAULT_TIME_MODEL,
} from "@/lib/engine/time";

// ─── skillHours ───────────────────────────────────────────────────────────────

describe("skillHours", () => {
  it("converts months to hours using default model", () => {
    // 2 months * 14 hours/month = 28
    expect(skillHours(2)).toBe(28);
  });

  it("treats non-positive months as 2 (default fallback)", () => {
    // skillHours treats 0 and negative as fallback value 2: 2 * 14 = 28
    expect(skillHours(0)).toBe(28);
    expect(skillHours(-1)).toBe(28);
  });

  it("clamps to maxSkillHours for large values", () => {
    expect(skillHours(100)).toBe(DEFAULT_TIME_MODEL.maxSkillHours);
  });

  it("applies pacingFactor", () => {
    const model = { ...DEFAULT_TIME_MODEL, pacingFactor: 0.5 };
    expect(skillHours(2, model)).toBe(14); // 28 * 0.5 = 14
  });

  it("rounds to nearest integer", () => {
    const model = { ...DEFAULT_TIME_MODEL, pacingFactor: 0.7 };
    // 2 * 14 = 28, 28 * 0.7 = 19.6, rounded = 20
    expect(skillHours(2, model)).toBe(20);
  });
});

// ─── milestoneHours ───────────────────────────────────────────────────────────

describe("milestoneHours", () => {
  it("returns skill hours when no project and no quiz", () => {
    expect(milestoneHours({ skillHours: 20, hasProject: false, hasQuiz: false })).toBe(20);
  });

  it("adds project hours", () => {
    const result = milestoneHours({ skillHours: 20, hasProject: true, hasQuiz: false });
    expect(result).toBe(20 + DEFAULT_TIME_MODEL.projectHours);
  });

  it("adds quiz hours", () => {
    const result = milestoneHours({ skillHours: 20, hasProject: false, hasQuiz: true });
    expect(result).toBe(20 + DEFAULT_TIME_MODEL.quizHours);
  });

  it("adds both project and quiz hours", () => {
    const result = milestoneHours({ skillHours: 20, hasProject: true, hasQuiz: true });
    expect(result).toBe(20 + DEFAULT_TIME_MODEL.projectHours + DEFAULT_TIME_MODEL.quizHours);
  });

  it("uses custom model", () => {
    const model = { ...DEFAULT_TIME_MODEL, projectHours: 5, quizHours: 2 };
    const result = milestoneHours({ skillHours: 10, hasProject: true, hasQuiz: true, model });
    expect(result).toBe(17); // 10 + 5 + 2
  });
});

// ─── scheduleMilestones ──────────────────────────────────────────────────────

describe("scheduleMilestones", () => {
  it("schedules milestones sequentially with rest day gap", () => {
    const items = [
      { item: "A", hours: 10 },
      { item: "B", hours: 10 },
    ];
    const start = new Date("2026-01-01");
    const result = scheduleMilestones(items, 10, start); // 10h/week

    expect(result).toHaveLength(2);
    expect(result[0].item).toBe("A");
    expect(result[1].item).toBe("B");
    // Second milestone starts after first + 1 rest day
    expect(result[1].startAt.getTime()).toBeGreaterThan(result[0].endAt.getTime());
  });

  it("produces correct dates at 10h/week for 10h task", () => {
    const items = [{ item: "A", hours: 10 }];
    const start = new Date("2026-01-01");
    const result = scheduleMilestones(items, 10, start);

    // 10h / 10h per week = 1 week = 7 days
    const diffMs = result[0].endAt.getTime() - result[0].startAt.getTime();
    const diffDays = diffMs / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeCloseTo(7, 0);
  });

  it("handles zero items", () => {
    expect(scheduleMilestones([], 10, new Date())).toEqual([]);
  });

  it("handles 1 hour per week", () => {
    const items = [{ item: "A", hours: 10 }];
    const start = new Date("2026-01-01");
    const result = scheduleMilestones(items, 1, start);
    // 10h / 1h per week = 10 weeks = 70 days
    const diffDays = (result[0].endAt.getTime() - result[0].startAt.getTime()) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeCloseTo(70, 0);
  });
});

// ─── humanDuration ────────────────────────────────────────────────────────────

describe("humanDuration", () => {
  it("returns ~1 week for very short duration", () => {
    expect(humanDuration(5, 10)).toBe("~1 week");
  });

  it("returns weeks for 2-8 weeks", () => {
    expect(humanDuration(40, 5)).toBe("~8 weeks");
    expect(humanDuration(30, 5)).toBe("~6 weeks");
  });

  it("returns months for long durations", () => {
    expect(humanDuration(100, 5)).toContain("month");
  });
});

// ─── formatDate ───────────────────────────────────────────────────────────────

describe("formatDate", () => {
  it("formats date as YYYY-MM-DD using toISOString", () => {
    // formatDate uses toISOString() which is UTC — use explicit UTC date
    expect(formatDate(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01-01");
  });

  it("pads month and day", () => {
    expect(formatDate(new Date("2026-03-09T12:00:00Z"))).toBe("2026-03-09");
  });
});
