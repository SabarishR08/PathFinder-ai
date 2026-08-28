/**
 * Engine facade — assembles data + algorithms into the operations the API
 * layer needs. Server-side only (reads files); pure functions live in the
 * sibling modules and remain client-safe.
 */
import { computeDepths, inducedEdges } from "./graph";
import { recommendCourses, resourcesForSkills } from "./courses";
import { generatePathOptimal, generatePathStandard } from "./topo";
import { skillHours } from "./time";
import { loadCatalogue, loadEngineData, loadResources, loadSkillGraph } from "./data";
import type { Course, CourseCatalogue, FreeResource, GeneratedPath, ResourceIndex, SkillGraph } from "./types";

export * from "./types";
export { loadCatalogue, loadEngineData, loadResources, loadSkillGraph };
export { computeRadar, requiredLevelForDepth } from "./radar";
export type { RadarSeries, RadarSkillPoint, AssessmentLike } from "./radar";
export { calibrateZpd, tierLabel } from "./zpd";
export type { ZpdSpec } from "./zpd";
export { computeDepths, descendants, ancestorClosure, inducedEdges, phasePartitions } from "./graph";
export { generatePathOptimal, generatePathStandard } from "./topo";
export { skillHours, milestoneHours, scheduleMilestones, humanDuration, formatDate, DEFAULT_TIME_MODEL } from "./time";
export type { TimeModelConstants, ScheduleItem } from "./time";
export { recommendCourses, resourcesForSkills } from "./courses";

export interface BuildPathOptions {
  targetSkillId: string;
  knownSkillIds: string[];
  algorithm?: "dfs-topological" | "kahn-spt";
  coursesPerSkill?: number;
  /** skillId -> evidenced level map, for course level-affinity. */
  evidencedLevels?: Record<string, number>;
}

export async function buildGeneratedPath(options: BuildPathOptions): Promise<GeneratedPath & {
  catalogue: CourseCatalogue;
  graph: SkillGraph;
  resources: ResourceIndex;
}> {
  const { graph, catalogue, resources } = await loadEngineData();
  const { targetSkillId, knownSkillIds, algorithm = "dfs-topological", coursesPerSkill = 2, evidencedLevels = {} } = options;

  if (!graph.skills[targetSkillId]) {
    throw new Error(`Unknown skill: ${targetSkillId}`);
  }

  const weights: Record<string, number> = {};
  for (const [sid, months] of Object.entries(catalogue.skillMonths)) {
    weights[sid] = months || 2;
  }

  const result =
    algorithm === "kahn-spt"
      ? generatePathOptimal(graph, targetSkillId, knownSkillIds, weights)
      : generatePathStandard(graph, targetSkillId, knownSkillIds);

  const depths = computeDepths(graph);
  const resourceMap = resourcesForSkills(resources, result.orderedSkillIds, { perSkill: 3 });

  const planned = result.orderedSkillIds.map((sid) => {
    const node = graph.skills[sid];
    const months = catalogue.skillMonths[sid] ?? 2;
    return {
      skillId: sid,
      skillName: node?.name ?? sid,
      domain: node?.domain ?? "General",
      depth: depths[sid] ?? 0,
      estimatedHours: skillHours(months),
      courses: recommendCourses(catalogue, sid, { perSkill: coursesPerSkill, evidencedLevel: evidencedLevels[sid] ?? 0 }),
      resources: resourceMap[sid] ?? [],
    };
  });

  const closureSet = new Set(result.orderedSkillIds);
  return {
    algorithm: result.algorithm,
    targetSkillId,
    domain: graph.skills[targetSkillId]?.domain ?? "General",
    skills: planned,
    totalEstimatedHours: planned.reduce((s, p) => s + p.estimatedHours, 0),
    edges: inducedEdges(graph, closureSet),
    catalogue,
    graph,
    resources,
  };
}

export async function skillSearch(query: string, domain?: string | null): Promise<
  Array<{ id: string; name: string; domain: string; depth: number }>
> {
  const graph = await loadSkillGraph();
  const depths = computeDepths(graph);
  const q = query.trim().toLowerCase();
  const pool = domain && graph.byDomain[domain] ? graph.byDomain[domain] : Object.values(graph.skills);
  const scored = pool
    .filter((s) => (q ? s.name.toLowerCase().includes(q) : true))
    .map((s) => ({ id: s.id, name: s.name, domain: s.domain, depth: depths[s.id] ?? 0 }))
    .sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));
  return scored.slice(0, 25);
}

export type { Course, FreeResource };
