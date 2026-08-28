import type { Scenario } from "./generate";

export interface MilestoneDraft {
  order: number;
  phase: string;
  title: string;
  description: string;
  skillIds: string[];
  skillNames: string[];
  estimatedHours: number;
  hasProject: boolean;
  hasGateQuiz: boolean;
  meanEvidencedLevel: number;
}

export type { Scenario };
