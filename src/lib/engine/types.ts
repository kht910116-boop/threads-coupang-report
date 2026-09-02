import type { Plan, Preset } from "@/lib/types";

export type EngineId = "api" | "cli";

export interface PlanRequest {
  preset: Preset;
  topic: string;
  brief: string;
}

export interface PlannerEngine {
  id: EngineId;
  label: string;
  /** 지금 이 환경에서 쓸 수 있는지 (키가 있는지 / CLI가 깔려 있는지) */
  isAvailable(): Promise<boolean>;
  /** 못 쓸 때 사용자에게 보여줄 이유 */
  unavailableReason(): string;
  generatePlan(request: PlanRequest): Promise<Plan>;
}
