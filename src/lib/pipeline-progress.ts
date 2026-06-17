export type PipelineDebugStep =
  | "route_hit"
  | "test_mode"
  | "mock_jobs"
  | "hard_filter"
  | "claude_start"
  | "claude_done"
  | "notion_start"
  | "notion_done"
  | "complete";

export interface StepRecord {
  step: PipelineDebugStep;
  label: string;
  at: string;
  detail?: string;
}

export interface PipelineProgress {
  lastStep: PipelineDebugStep | null;
  steps: StepRecord[];
}

export function createProgress(): PipelineProgress {
  return { lastStep: null, steps: [] };
}

export function recordStep(
  progress: PipelineProgress,
  step: PipelineDebugStep,
  label: string,
  detail?: string,
): void {
  progress.lastStep = step;
  progress.steps.push({
    step,
    label,
    at: new Date().toISOString(),
    detail,
  });
  console.log(`[pipeline-progress] ${label}${detail ? ` — ${detail}` : ""}`);
}
