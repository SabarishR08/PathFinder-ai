import { describe, it, expect } from "vitest";
import { requiredLevelForDepth, computeRadar } from "@/lib/engine/radar";
import type { SkillGraph } from "@/lib/engine/types";

function makeGraph(edges: Array<[string, string]>, extraNodes: string[] = []): SkillGraph {
  const skills: SkillGraph["skills"] = {};
  const domainMap: Record<string, SkillGraph["skills"][string][]> = {};

  const ensure = (id: string) => {
    if (!skills[id]) {
      skills[id] = { id, name: id, prereqs: [], domain: "General" };
      (domainMap["General"] ??= []).push(skills[id]);
    }
  };

  // Pre-create any standalone nodes
  for (const id of extraNodes) ensure(id);

  for (const [prereq, skill] of edges) {
    ensure(prereq);
    ensure(skill);
    if (!skills[skill].prereqs.includes(prereq)) {
      skills[skill].prereqs.push(prereq);
    }
  }

  return { domains: Object.keys(domainMap), skills, byDomain: domainMap };
}

// ─── requiredLevelForDepth ────────────────────────────────────────────────────

describe("requiredLevelForDepth", () => {
  it("returns 3 for depth 0", () => {
    expect(requiredLevelForDepth(0)).toBe(3);
  });

  it("grows with depth", () => {
    expect(requiredLevelForDepth(2)).toBeGreaterThanOrEqual(requiredLevelForDepth(0));
    expect(requiredLevelForDepth(4)).toBeGreaterThanOrEqual(requiredLevelForDepth(2));
  });

  it("caps at 5", () => {
    expect(requiredLevelForDepth(100)).toBe(5);
  });

  it("returns integer", () => {
    for (let d = 0; d <= 20; d++) {
      expect(Number.isInteger(requiredLevelForDepth(d))).toBe(true);
    }
  });
});

// ─── computeRadar ─────────────────────────────────────────────────────────────

describe("computeRadar", () => {
  it("computes radar for a single skill", () => {
    const graph = makeGraph([], ["a"]);
    const depths = { a: 0 };
    const assessments = [{ skillId: "a", claimedLevel: 3, evidencedLevel: 2 }];

    const radar = computeRadar(graph, assessments, "a", depths);
    expect(radar.points).toHaveLength(1);
    expect(radar.points[0].skillId).toBe("a");
    expect(radar.points[0].claimed).toBe(3);
    expect(radar.points[0].evidenced).toBe(2);
    expect(radar.points[0].required).toBe(3); // depth 0 → required = 3
    expect(radar.points[0].overclaim).toBe(1); // 3 - 2 = 1
    expect(radar.points[0].gap).toBe(1); // 3 - 2 = 1
  });

  it("handles missing assessment (defaults to 0)", () => {
    const graph = makeGraph([], ["a"]);
    const depths = { a: 0 };
    const radar = computeRadar(graph, [], "a", depths);

    expect(radar.points[0].claimed).toBe(0);
    expect(radar.points[0].evidenced).toBe(0);
    expect(radar.points[0].gap).toBe(3); // required(3) - evidenced(0)
  });

  it("walks prereqs transitively", () => {
    const graph = makeGraph([["a", "b"], ["b", "c"]]);
    const depths = { a: 0, b: 1, c: 2 };
    const radar = computeRadar(graph, [], "c", depths);

    const skillIds = radar.points.map((p) => p.skillId);
    expect(skillIds).toContain("c");
    expect(skillIds).toContain("b");
    expect(skillIds).toContain("a");
  });

  it("caps overclaim at 0 when evidenced >= claimed", () => {
    const graph = makeGraph([], ["a"]);
    const depths = { a: 0 };
    const radar = computeRadar(graph, [{ skillId: "a", claimedLevel: 2, evidencedLevel: 4 }], "a", depths);
    expect(radar.points[0].overclaim).toBe(0);
  });

  it("caps gap at 0 when evidenced >= required", () => {
    const graph = makeGraph([], ["a"]);
    const depths = { a: 0 };
    const radar = computeRadar(graph, [{ skillId: "a", claimedLevel: 5, evidencedLevel: 5 }], "a", depths);
    expect(radar.points[0].gap).toBe(0);
  });

  it("produces aggregate axes", () => {
    const graph = makeGraph([["a", "b"]]);
    const depths = { a: 0, b: 1 };
    const radar = computeRadar(graph, [], "b", depths);
    expect(radar.axes.length).toBeGreaterThan(0);
    for (const axis of radar.axes) {
      expect(axis.axis).toBeTruthy();
      expect(typeof axis.claimed).toBe("number");
      expect(typeof axis.evidenced).toBe("number");
      expect(typeof axis.required).toBe("number");
    }
  });

  it("returns empty points for unknown target not in graph", () => {
    const graph = makeGraph([], ["a"]); // graph has "a" but we query "z"
    const radar = computeRadar(graph, [], "z", {});
    expect(radar.points).toEqual([]);
    expect(radar.axes).toEqual([]);
  });
});
