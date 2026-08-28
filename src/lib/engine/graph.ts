/**
 * Graph utilities over the skill prerequisite DAG.
 *
 * The skill graph is a directed acyclic graph with AND-semantics: every
 * prerequisite of a skill is mandatory. All traversals here treat prereq
 * edges as "prereq must come before skill".
 */
import type { SkillGraph } from "./types";

/** Compute the longest prerequisite chain length below each skill (Kahn-style). */
export function computeDepths(graph: SkillGraph): Record<string, number> {
  const indegree: Record<string, number> = {};
  const dependents: Record<string, string[]> = {};
  for (const skill of Object.values(graph.skills)) {
    indegree[skill.id] ||= 0;
    for (const p of skill.prereqs) {
      if (!graph.skills[p]) continue;
      indegree[skill.id] = (indegree[skill.id] || 0) + 1;
      (dependents[p] ||= []).push(skill.id);
    }
  }
  const depths: Record<string, number> = {};
  const queue: string[] = Object.keys(indegree).filter((id) => indegree[id] === 0);
  for (const id of queue) depths[id] = 0;
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of dependents[cur] || []) {
      depths[next] = Math.max(depths[next] ?? 0, (depths[cur] ?? 0) + 1);
      if (--indegree[next] === 0) queue.push(next);
    }
  }
  return depths;
}

/** All transitive prerequisites of a skill (inclusive of the skill itself). */
export function ancestorClosure(graph: SkillGraph, skillId: string): Set<string> {
  const visited = new Set<string>();
  const stack = [skillId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const node = graph.skills[cur];
    if (node) for (const p of node.prereqs) if (graph.skills[p]) stack.push(p);
  }
  return visited;
}

/** All skills that list `skillId` as a transitive prerequisite. */
export function descendants(graph: SkillGraph, skillId: string): Set<string> {
  const dependents: Record<string, string[]> = {};
  for (const skill of Object.values(graph.skills)) {
    for (const p of skill.prereqs) (dependents[p] ||= []).push(skill.id);
  }
  const visited = new Set<string>();
  const stack = [skillId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const next of dependents[cur] || []) {
      if (!visited.has(next)) {
        visited.add(next);
        stack.push(next);
      }
    }
  }
  return visited;
}

/** Edges of the sub-DAG induced by the given skill set (for visualisation). */
export function inducedEdges(graph: SkillGraph, skillIds: Set<string>): Array<[string, string]> {
  const edges: Array<[string, string]> = [];
  for (const id of skillIds) {
    const node = graph.skills[id];
    if (!node) continue;
    for (const p of node.prereqs) {
      if (skillIds.has(p)) edges.push([p, id]);
    }
  }
  return edges;
}

/**
 * Partition an ordered skill list into phases by graph depth.
 * Consecutive skills with the same depth share a phase; a depth increase
 * starts a new phase. Used by the milestone planner.
 */
export function phasePartitions(orderedSkills: string[], depths: Record<string, number>): string[][] {
  const phases: string[][] = [];
  let current: string[] = [];
  let currentDepth = -1;
  for (const id of orderedSkills) {
    const d = depths[id] ?? 0;
    if (currentDepth === -1 || d === currentDepth) {
      current.push(id);
      currentDepth = d === currentDepth ? currentDepth : d;
    } else {
      if (current.length) phases.push(current);
      current = [id];
      currentDepth = d;
    }
  }
  if (current.length) phases.push(current);
  return phases;
}
