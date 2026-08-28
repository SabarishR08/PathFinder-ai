/**
 * Core engine types — shared by server and client code.
 *
 * These types describe the four real data assets under /data:
 *   skill_graph.json          — 211 skills across 11 domains with prerequisite edges
 *   courses.json              — 2,118 real Coursera courses (ETL output)
 *   course_skill_mapping.json — course_id -> skill_id[] links
 *   free_resources_mapping.json — curated free resources indexed by skill
 */

export interface SkillNode {
  id: string;
  name: string;
  prereqs: string[];
  domain: string;
}

export interface Course {
  course_id: string;
  Title: string;
  URL: string;
  ShortIntro: string;
  Category: string;
  SubCategory: string;
  CourseType: string;
  Skills: string;
  Instructors: string;
  Rating: number | null;
  Viewers: number | null;
  DurationMonths: number | null;
  DurationRaw: string;
  Site: string;
  Level: string;
  Reviews: number | null;
  skillsList: string[];
  domain: string;
}

export interface FreeResource {
  resource_id: string;
  skill_ids: string[];
  resource_type: string;
  title: string;
  url: string;
  provider: string;
  cost_tier: string;
  format: string;
  difficulty: string;
  description_raw: string;
}

export interface SkillGraph {
  domains: string[];
  /** Global skill lookup — prerequisite edges may cross domain boundaries. */
  skills: Record<string, SkillNode>;
  byDomain: Record<string, SkillNode[]>;
}

export interface CourseCatalogue {
  courses: Course[];
  byId: Record<string, Course>;
  /** skill_id -> course_ids ranked by rating desc, viewers desc. */
  coursesForSkill: Record<string, string[]>;
  /** skill_id -> median duration (months) across matched courses. */
  skillMonths: Record<string, number>;
}

export interface ResourceIndex {
  resources: FreeResource[];
  bySkill: Record<string, FreeResource[]>;
}

export type PathAlgorithm = "dfs-topological" | "kahn-spt";

export interface PlannedSkill {
  skillId: string;
  skillName: string;
  domain: string;
  /** Longest prerequisite chain length below this skill (0 = root). */
  depth: number;
  estimatedHours: number;
  /** Ordered course recommendations attached to this skill. */
  courses: Course[];
  resources: FreeResource[];
}

export interface GeneratedPath {
  algorithm: PathAlgorithm;
  targetSkillId: string;
  domain: string;
  skills: PlannedSkill[];
  totalEstimatedHours: number;
  /** Edge list for DAG rendering: [fromPrereq, toSkill]. */
  edges: Array<[string, string]>;
}

export const SKILL_LEVELS = [0, 1, 2, 3, 4, 5] as const;

export const LEVEL_LABELS: Record<number, string> = {
  0: "Not started",
  1: "Aware",
  2: "Guided practice",
  3: "Independent",
  4: "Advanced",
  5: "Can teach it",
};
