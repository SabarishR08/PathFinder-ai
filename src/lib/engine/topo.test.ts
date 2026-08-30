import { describe, it, expect } from "vitest";
import { generatePathStandard, generatePathOptimal } from "@/lib/engine/topo";
import type { SkillGraph } from "@/lib/engine/types";

/** Build a SkillGraph from prereq edges. */
function makeGraph(
  edges: Array<[string, string]>, // [prereq, skill]
): SkillGraph {
  const skills: SkillGraph["skills"] = {};
  const domainMap: Record<string, SkillGraph["skills"][string][]> = {};

  const ensure = (id: string) => {
    if (!skills[id]) {
      skills[id] = { id, name: id, prereqs: [], domain: "General" };
      (domainMap["General"] ??= []).push(skills[id]);
    }
  };

  for (const [prereq, skill] of edges) {
    ensure(prereq);
    ensure(skill);
    if (!skills[skill].prereqs.includes(prereq)) {
      skills[skill].prereqs.push(prereq);
    }
  }

  return { domains: Object.keys(domainMap), skills, byDomain: domainMap };
}

function validTopoOrder(
  graph: SkillGraph,
  order: string[],
  known: Set<string> = new Set()
): boolean {
  const pos = new Map(order.map((id, i) => [id, i]));
  for (const id of order) {
    const node = graph.skills[id];
    if (!node) continue;
    for (const prereq of node.prereqs) {
      if (known.has(prereq)) continue;
      const prereqPos = pos.get(prereq);
      if (prereqPos === undefined) return false;
      if (prereqPos > pos.get(id)!) return false;
    }
  }
  return true;
}

// ─── generatePathStandard (DFS topological) ──────────────────────────────────

describe("generatePathStandard", () => {
  it("returns a valid topological order for a linear chain", () => {
    const graph = makeGraph([["a", "b"], ["b", "c"], ["c", "d"]]);
    const result = generatePathStandard(graph, "d");

    expect(result.algorithm).toBe("dfs-topological");
    expect(result.orderedSkillIds).toContain("a");
    expect(result.orderedSkillIds).toContain("b");
    expect(result.orderedSkillIds).toContain("c");
    expect(result.orderedSkillIds).toContain("d");
    expect(validTopoOrder(graph, result.orderedSkillIds)).toBe(true);
  });

  it("prunes known skills from output", () => {
    const graph = makeGraph([["a", "b"], ["b", "c"], ["c", "d"]]);
    const result = generatePathStandard(graph, "d", ["a", "b"]);

    expect(result.orderedSkillIds).not.toContain("a");
    expect(result.orderedSkillIds).not.toContain("b");
    expect(result.orderedSkillIds).toContain("c");
    expect(result.orderedSkillIds).toContain("d");
  });

  it("handles target skill with no prereqs", () => {
    const graph = makeGraph([["a", "b"], ["a", "c"]]);
    const result = generatePathStandard(graph, "a");
    expect(result.orderedSkillIds).toEqual(["a"]);
  });

  it("includes the target skill", () => {
    const graph = makeGraph([["a", "b"], ["b", "c"]]);
    const result = generatePathStandard(graph, "c");
    expect(result.orderedSkillIds).toContain("c");
  });

  it("includes unknown skill in ordered output but not in closure", () => {
    const graph = makeGraph([["a", "b"]]);
    const result = generatePathStandard(graph, "z");
    // Unknown skill "z" is still visited via the direct visit(targetSkillId) call
    expect(result.orderedSkillIds).toContain("z");
    // But it doesn't appear in the closure set (node not found in graph)
    expect(result.closureSkillIds).not.toContain("z");
  });
});

// ─── generatePathOptimal (Kahn + SPT) ───────────────────────────────────────

describe("generatePathOptimal", () => {
  it("returns a valid topological order", () => {
    const graph = makeGraph([["a", "b"], ["b", "c"], ["c", "d"]]);
    const result = generatePathOptimal(graph, "d");

    expect(result.algorithm).toBe("kahn-spt");
    expect(result.orderedSkillIds).toContain("a");
    expect(result.orderedSkillIds).toContain("b");
    expect(result.orderedSkillIds).toContain("c");
    expect(result.orderedSkillIds).toContain("d");
    expect(validTopoOrder(graph, result.orderedSkillIds)).toBe(true);
  });

  it("prunes known skills from output", () => {
    const graph = makeGraph([["a", "b"], ["b", "c"], ["c", "d"]]);
    const result = generatePathOptimal(graph, "d", ["a"]);

    expect(result.orderedSkillIds).not.toContain("a");
    expect(result.orderedSkillIds).toContain("b");
    expect(result.orderedSkillIds).toContain("c");
    expect(result.orderedSkillIds).toContain("d");
  });

  it("front-loads shorter skills when using SPT weights", () => {
    // a and b are both roots; c depends on both
    const graph = makeGraph([["a", "c"], ["b", "c"]]);
    const weights = { a: 10, b: 1, c: 5 };
    const result = generatePathOptimal(graph, "c", [], weights);

    // b (weight 1) should come before a (weight 10) — SPT ordering
    expect(result.orderedSkillIds.indexOf("b")).toBeLessThan(
      result.orderedSkillIds.indexOf("a")
    );
  });

  it("handles diamond dependency", () => {
    const graph = makeGraph([
      ["a", "b"],
      ["a", "c"],
      ["b", "d"],
      ["c", "d"],
    ]);
    const result = generatePathOptimal(graph, "d");
    expect(result.orderedSkillIds).toContain("d");
    expect(validTopoOrder(graph, result.orderedSkillIds)).toBe(true);
  });

  it("returns empty for unknown skill", () => {
    const graph = makeGraph([["a", "b"]]);
    const result = generatePathOptimal(graph, "z");
    expect(result.orderedSkillIds).toEqual([]);
  });
});

// ─── Consistency between algorithms ───────────────────────────────────────────

describe("algorithm consistency", () => {
  it("both algorithms produce the same set of skills", () => {
    const graph = makeGraph([
      ["a", "b"],
      ["a", "c"],
      ["b", "d"],
      ["c", "d"],
      ["d", "e"],
    ]);
    const std = generatePathStandard(graph, "e");
    const opt = generatePathOptimal(graph, "e");

    expect(new Set(std.orderedSkillIds)).toEqual(new Set(opt.orderedSkillIds));
  });

  it("both produce valid topological orders", () => {
    const graph = makeGraph([
      ["a", "b"],
      ["b", "c"],
      ["a", "d"],
      ["c", "e"],
      ["d", "e"],
    ]);
    const std = generatePathStandard(graph, "e");
    const opt = generatePathOptimal(graph, "e");

    expect(validTopoOrder(graph, std.orderedSkillIds)).toBe(true);
    expect(validTopoOrder(graph, opt.orderedSkillIds)).toBe(true);
  });
});
