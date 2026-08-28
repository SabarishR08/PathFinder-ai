/**
 * Path ordering algorithms — the deterministic core.
 *
 * Two orderings are provided, both O(V + E) or better and both producing a
 * valid topological order of the prerequisite closure of the target skill:
 *
 *  1. generatePathStandard — post-order DFS topological sort. Deterministic,
 *     stable, easy to explain: prerequisites always appear before dependents.
 *
 *  2. generatePathOptimal — Kahn's algorithm with a binary min-heap applying
 *     the Shortest-Processing-Time (SPT) scheduling rule from operations
 *     research. When several skills become simultaneously available (all
 *     prerequisites satisfied), the one with the smallest time weight is
 *     scheduled first. SPT provably minimises average completion time across
 *     concurrent task sets (Smith's rule), which in learning terms front-loads
 *     quick wins: the learner banks visible progress early instead of
 *     grinding through a long course before their first milestone.
 *
 * Both accept a set of `knownSkills` (already mastered). Known skills are
 * pruned from the output, and every remaining skill's prerequisite
 * constraints treat known skills as satisfied.
 */
import { MinHeap } from "./heap";
import type { SkillGraph } from "./types";

export interface PathOrderResult {
  orderedSkillIds: string[];
  algorithm: "dfs-topological" | "kahn-spt";
  /** The pruned (known-satisfied) closure that was sorted. */
  closureSkillIds: string[];
}

export function generatePathStandard(
  graph: SkillGraph,
  targetSkillId: string,
  knownSkills: string[] = [],
): PathOrderResult {
  const known = new Set(knownSkills.filter((id) => graph.skills[id]));
  const closure = new Set<string>();
  collectClosure(graph, targetSkillId, known, closure, new Set());

  // Post-order DFS: emit a node only after all of its (unknown) prereqs.
  const ordered: string[] = [];
  const state: Record<string, "visiting" | "done"> = {};
  const visit = (id: string) => {
    if (state[id] === "done" || state[id] === "visiting") return;
    state[id] = "visiting";
    const node = graph.skills[id];
    if (node) {
      for (const p of node.prereqs) {
        if (closure.has(p) && !state[p]) visit(p);
      }
    }
    state[id] = "done";
    ordered.push(id);
  };
  visit(targetSkillId);
  // Visit the rest of the closure (multi-root closures via cross-domain prereqs).
  for (const id of closure) if (!state[id]) visit(id);

  return { orderedSkillIds: ordered, algorithm: "dfs-topological", closureSkillIds: [...closure] };
}

export function generatePathOptimal(
  graph: SkillGraph,
  targetSkillId: string,
  knownSkills: string[] = [],
  weights: Record<string, number> = {},
): PathOrderResult {
  const known = new Set(knownSkills.filter((id) => graph.skills[id]));
  const closure = new Set<string>();
  collectClosure(graph, targetSkillId, known, closure, new Set());

  // Build indegrees over the pruned closure.
  const indegree: Record<string, number> = {};
  const dependents: Record<string, string[]> = {};
  for (const id of closure) {
    indegree[id] = 0;
    const node = graph.skills[id];
    if (!node) continue;
    for (const p of node.prereqs) {
      if (closure.has(p)) {
        indegree[id] += 1;
        (dependents[p] ||= []).push(id);
      }
    }
  }

  const heap = new MinHeap<string>();
  for (const [id, deg] of Object.entries(indegree)) {
    if (deg === 0) heap.push(id, weights[id] ?? 1);
  }

  const ordered: string[] = [];
  while (heap.size) {
    const cur = heap.pop()!;
    ordered.push(cur);
    for (const next of dependents[cur] || []) {
      if (--indegree[next] === 0) {
        heap.push(next, weights[next] ?? 1);
      }
    }
  }

  // Cycle safety: append anything unreachable (should not happen — data is a DAG).
  for (const id of closure) if (!ordered.includes(id)) ordered.push(id);

  return { orderedSkillIds: ordered, algorithm: "kahn-spt", closureSkillIds: [...closure] };
}

function collectClosure(
  graph: SkillGraph,
  targetSkillId: string,
  known: Set<string>,
  closure: Set<string>,
  visiting: Set<string>,
) {
  if (closure.has(targetSkillId) || visiting.has(targetSkillId)) return;
  if (known.has(targetSkillId)) return;
  const node = graph.skills[targetSkillId];
  if (!node) return;
  visiting.add(targetSkillId);
  for (const p of node.prereqs) {
    if (!known.has(p)) collectClosure(graph, p, known, closure, visiting);
  }
  visiting.delete(targetSkillId);
  closure.add(targetSkillId);
}
