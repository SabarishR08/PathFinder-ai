/**
 * Shared evidence types.
 */
export type SkillEvidenceSource = "github" | "resume" | "leetcode" | "codeforces" | "interview" | "project" | "quiz";

export interface SkillClaim {
  skillId: string;
  skillName: string;
  level: number;
  quote: string;
  strength: number;
}

export interface PersistedEvidence {
  evidenceId: string;
  source: SkillEvidenceSource;
  sourceRef: string | null;
  summary: string;
  claims: SkillClaim[];
}
