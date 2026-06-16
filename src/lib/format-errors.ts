import type { PipelineStep, PipelineStepError } from "./types";

const STEP_LABELS: Record<PipelineStep, string> = {
  scrape: "Apify scrape",
  hard_filter: "Hard filters",
  score: "Claude scoring",
  notion: "Notion sync",
};

export function stepLabel(step?: PipelineStep | string): string {
  if (!step) return "Unknown step";
  return STEP_LABELS[step as PipelineStep] ?? step;
}

export function formatStepError(stepError?: PipelineStepError): string {
  if (!stepError) return "";
  const label = stepLabel(stepError.step);
  return stepError.details
    ? `${label}: ${stepError.message} — ${stepError.details}`
    : `${label}: ${stepError.message}`;
}
