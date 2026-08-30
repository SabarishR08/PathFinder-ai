import { describe, it, expect } from "vitest";
import { calibrateZpd, tierLabel } from "@/lib/engine/zpd";

// ─── calibrateZpd ────────────────────────────────────────────────────────────

describe("calibrateZpd", () => {
  it("returns valid ZPD spec for level 0", () => {
    const spec = calibrateZpd(0, 10);
    expect(spec.stretchMultiplier).toBeGreaterThanOrEqual(1.5);
    expect(spec.stretchMultiplier).toBeLessThanOrEqual(3);
    expect(spec.targetDifficulty).toBeGreaterThanOrEqual(1);
    expect(spec.targetDifficulty).toBeLessThanOrEqual(5);
    expect(spec.estimatedHours).toBeGreaterThanOrEqual(4);
    expect(spec.estimatedHours).toBeLessThanOrEqual(24);
    expect(spec.requirementCount).toBeGreaterThanOrEqual(3);
    expect(spec.requirementCount).toBeLessThanOrEqual(6);
    expect(spec.rationale).toContain("Evidenced level 0");
  });

  it("returns valid ZPD spec for level 5 (max)", () => {
    const spec = calibrateZpd(5, 10);
    expect(spec.targetDifficulty).toBeGreaterThanOrEqual(1);
    expect(spec.targetDifficulty).toBeLessThanOrEqual(5);
  });

  it("clamps negative level to 0", () => {
    const spec = calibrateZpd(-5, 10);
    expect(spec.rationale).toContain("Evidenced level 0");
  });

  it("clamps level above 5 to 5", () => {
    const spec = calibrateZpd(10, 10);
    expect(spec.rationale).toContain("Evidenced level 5");
  });

  it("gives higher stretch multiplier for more weekly hours", () => {
    const lowHours = calibrateZpd(3, 2);
    const highHours = calibrateZpd(3, 20);
    expect(highHours.stretchMultiplier).toBeGreaterThanOrEqual(lowHours.stretchMultiplier);
  });

  it("assigns gentle-stretch tier for low capacity", () => {
    const spec = calibrateZpd(3, 2); // ≤4 hours/week → capacityBand 0 → multiplier 1.5
    expect(spec.tier).toBe("gentle-stretch");
  });

  it("assigns solid-stretch tier for medium capacity", () => {
    const spec = calibrateZpd(3, 6); // 5-8 hours/week → capacityBand 1 → multiplier 1.75
    expect(spec.tier).toBe("solid-stretch");
  });

  it("assigns solid-stretch tier for high capacity", () => {
    // >15 hours/week → capacityBand 3 → multiplier = min(3, 1.5 + 3*0.25) = 2.25
    // 2.25 <= 2.25 → solid-stretch (strong-stretch requires >2.25, which is unreachable)
    const spec = calibrateZpd(3, 20);
    expect(spec.tier).toBe("solid-stretch");
    expect(spec.stretchMultiplier).toBe(2.25);
  });

  it("targetDifficulty grows with evidenced level", () => {
    const low = calibrateZpd(1, 10);
    const high = calibrateZpd(4, 10);
    expect(high.targetDifficulty).toBeGreaterThanOrEqual(low.targetDifficulty);
  });

  it("all tiers produce a valid rationale", () => {
    for (const hours of [2, 6, 12, 20]) {
      const spec = calibrateZpd(3, hours);
      expect(spec.rationale).toBeTruthy();
      expect(spec.rationale.length).toBeGreaterThan(20);
    }
  });
});

// ─── tierLabel ────────────────────────────────────────────────────────────────

describe("tierLabel", () => {
  it("returns guided starter build for low difficulty", () => {
    expect(tierLabel(1)).toBe("guided starter build");
    expect(tierLabel(2)).toBe("guided starter build");
  });

  it("returns independent practical build for medium difficulty", () => {
    expect(tierLabel(3)).toBe("independent practical build");
  });

  it("returns integration-focused build for higher difficulty", () => {
    expect(tierLabel(4)).toBe("integration-focused build");
  });

  it("returns portfolio-grade capstone for max difficulty", () => {
    expect(tierLabel(5)).toBe("portfolio-grade capstone");
  });
});
