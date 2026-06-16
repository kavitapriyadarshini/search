export type JobSource = "linkedin" | "naukri";

export type PipelineStep = "scrape" | "hard_filter" | "score" | "notion";

export interface JobListing {
  id: string;
  source: JobSource;
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  postedAt?: string;
}

export interface ScoreCriteria {
  domainFit: number;
  experienceMatch: number;
  pmOwnership: number;
  locationMatch: number;
}

export interface ScoredJob extends JobListing {
  score: number;
  matchReason: string;
  criteria: ScoreCriteria;
  hardFilterRejected?: boolean;
  hardFilterReason?: string;
}

export interface ApifyScrapeLog {
  source: JobSource;
  actorId: string;
  label: string;
  input: Record<string, unknown>;
  runId?: string;
  runStatus?: string;
  statusCode: number;
  success: boolean;
  rawItemCount: number;
  normalizedCount: number;
  error?: string;
  responseBodyPreview?: string;
  durationMs: number;
}

export interface PipelineStepError {
  step: PipelineStep;
  message: string;
  details?: string;
}

export interface PipelineRunLog {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "success" | "failed";
  testMode?: boolean;
  found: number;
  hardFiltered: number;
  scored: number;
  shortlisted: number;
  notionAdded: number;
  warnings?: string[];
  error?: string;
  failedStep?: PipelineStep;
  stepError?: PipelineStepError;
  scrapeLogs?: ApifyScrapeLog[];
  matches: ScoredJob[];
}

export interface PipelineState {
  lastRun: PipelineRunLog | null;
  runs: PipelineRunLog[];
}

export interface ScrapeAllResult {
  jobs: JobListing[];
  logs: ApifyScrapeLog[];
  errors: string[];
}
