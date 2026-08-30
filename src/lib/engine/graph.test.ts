import { describe, it, expect } from "vitest";
import {
  computeDepths,
  ancestorClosure,
  descendants,
  inducedEdges,
  phasePartitions,
} from "@/lib/engine/graph";
import type { SkillGraph } from "@/lib/engine/types";

/** Helper to build a minimal SkillGraph from an adjacency list. */
function makeGraph(
  edges: Array<[string, string]>, // [prereq, skill]
  domains: Record<string, string> = {}
): SkillGraph {
  const skillMap: SkillGraph["skills"] = {};
  const domainMap: Record<string, { id: string; name: string; prereqs: string[]; domain: string }[]> = {};

  const ensure = (id: string) => {
    if (!skillMap[id]) {
      const domain = domains[id] ?? "General";
      skillMap[id] = { id, name: id, prereqs: [], domain };
      (domainMap[domain] ??= []).push(skillMap[id]);
    }
  };

  for (const [prereq, skill] of edges) {
    ensure(prereq);
    ensure(skill);
    if (!skillMap[skill].prereqs.includes(prereq)) {
      skillMap[skill].prereqs.push(prereq);
    }
  }

  return {
    domains: Object.keys(domainMap),
    skills: skillMap,
    byDomain: domainMap,
  };
}

// ─── computeDepths ────────────────────────────────────────────────────────────

describe("computeDepths", () => {
  it("returns depth 0 for true roots and depth 1 for dependents", () => {
    // a→b means b depends on a: a is root (depth 0), b is depth 1
    const graph = makeGraph([["a", "b"], ["c", "d"]]);
    const depths = computeDepths(graph);
    expect(depths["a"]).toBe(0);
    expect(depths["b"]).toBe(1);
    expect(depths["c"]).toBe(0);
    expect(depths["d"]).toBe(1);
  });

  it("computes depth for a linear chain a→b→c→d", () => {
    const graph = makeGraph([["a", "b"], ["b", "c"], ["c", "d"]]);
    const depths = computeDepths(graph);
    expect(depths["a"]).toBe(0);
    expect(depths["b"]).toBe(1);
    expect(depths["c"]).toBe(2);
    expect(depths["d"]).toBe(3);
  });

  it("computes correct depths with diamond dependency", () => {
    // a → b, a → c, b → d, c → d
    const graph = makeGraph([
      ["a", "b"],
      ["a", "c"],
      ["b", "d"],
      ["c", "d"],
    ]);
    const depths = computeDepths(graph);
    expect(depths["a"]).toBe(0);
    expect(depths["b"]).toBe(1);
    expect(depths["c"]).toBe(1);
    expect(depths["d"]).toBe(2);
  });

  it("handles empty graph", () => {
    const graph = makeGraph([]);
    expect(computeDepths(graph)).toEqual({});
  });

  it("handles a skill with unknown prereqs gracefully", () => {
    const graph: SkillGraph = {
      domains: ["General"],
      skills: {
        b: { id: "b", name: "B", prereqs: ["nonexistent"], domain: "General" },
      },
      byDomain: { General: [{ id: "b", name: "B", prereqs: ["nonexistent"], domain: "General" }] },
    };
    const depths = computeDepths(graph);
    expect(depths["b"]).toBe(0); // prereq doesn't exist, so treated as root
  });
});

// ─── ancestorClosure ──────────────────────────────────────────────────────────

describe("ancestorClosure", () => {
  it("returns just the skill itself for a root node", () => {
    const graph = makeGraph([["a", "b"]]);
    expect(ancestorClosure(graph, "a")).toEqual(new Set(["a"]));
  });

  it("includes all transitive prereqs", () => {
    const graph = makeGraph([["a", "b"], ["b", "c"], ["c", "d"]]);
    const closure = ancestorClosure(graph, "d");
    expect(closure).toEqual(new Set(["a", "b", "c", "d"]));
  });

  it("returns just the skill itself for unknown skill (not in graph)", () => {
    const graph = makeGraph([["a", "b"]]);
    // ancestorClosure adds the skill itself before checking the graph node
    expect(ancestorClosure(graph, "z")).toEqual(new Set(["z"]));
  });

  it("handles diamond correctly (no duplicates)", () => {
    const graph = makeGraph([
      ["a", "b"],
      ["a", "c"],
      ["b", "d"],
      ["c", "d"],
    ]);
    const closure = ancestorClosure(graph, "d");
    expect(closure).toEqual(new Set(["a", "b", "c", "d"]));
  });
});

// ─── descendants ──────────────────────────────────────────────────────────────

describe("descendants", () => {
  it("returns empty set for a leaf node", () => {
    const graph = makeGraph([["a", "b"]]);
    expect(descendants(graph, "b")).toEqual(new Set());
  });

  it("includes all transitive dependents", () => {
    const graph = makeGraph([["a", "b"], ["b", "c"], ["c", "d"]]);
    expect(descendants(graph, "a")).toEqual(new Set(["b", "c", "d"]));
  });

  it("returns empty set for unknown skill", () => {
    const graph = makeGraph([["a", "b"]]);
    expect(descendants(graph, "z")).toEqual(new Set());
  });
});

// ─── inducedEdges ─────────────────────────────────────────────────────────────

describe("inducedEdges", () => {
  it("returns edges within the induced subgraph", () => {
    const graph = makeGraph([
      ["a", "b"],
      ["b", "c"],
      ["a", "c"],
    ]);
    const edges = inducedEdges(graph, new Set(["a", "b", "c"]));
    expect(edges).toContainEqual(["a", "b"]);
    expect(edges).toContainEqual(["b", "c"]);
    expect(edges).toContainEqual(["a", "c"]);
  });

  it("excludes edges from outside the set", () => {
    const graph = makeGraph([["a", "b"], ["b", "c"]]);
    const edges = inducedEdges(graph, new Set(["b", "c"]));
    expect(edges).toContainEqual(["b", "c"]);
    // a→b should NOT be included because a is not in the set
    expect(edges).not.toContainEqual(["a", "b"]);
  });

  it("returns empty for a single-node set with no internal edges", () => {
    const graph = makeGraph([["a", "b"]]);
    expect(inducedEdges(graph, new Set(["a"]))).toEqual([]);
  });

  it("handles empty set", () => {
    const graph = makeGraph([["a", "b"]]);
    expect(inducedEdges(graph, new Set())).toEqual([]);
  });
});

// ─── phasePartitions ──────────────────────────────────────────────────────────

describe("phasePartitions", () => {
  it("groups consecutive skills with the same depth into one phase", () => {
    const depths: Record<string, number> = { a: 0, b: 0, c: 0 };
    const phases = phasePartitions(["a", "b", "c"], depths);
    expect(phases).toEqual([["a", "b", "c"]]);
  });

  it("creates new phases on depth changes", () => {
    const depths: Record<string, number> = { a: 0, b: 1, c: 1, d: 2 };
    const phases = phasePartitions(["a", "b", "c", "d"], depths);
    expect(phases).toEqual([["a"], ["b", "c"], ["d"]]);
  });

  it("handles single skill", () => {
    const phases = phasePartitions(["a"], { a: 0 });
    expect(phases).toEqual([["a"]]);
  });

  it("handles empty input", () => {
    expect(phasePartitions([], {})).toEqual([]);
  });

  it("handles skills with missing depth (defaults to 0)", () => {
    const phases = phasePartitions(["a", "b"], {});
    expect(phases).toEqual([["a", "b"]]);
  });
});
