export type JobSource = "linkedin" | "naukri";

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

export interface PipelineRunLog {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "success" | "failed";
  found: number;
  hardFiltered: number;
  scored: number;
  shortlisted: number;
  notionAdded: number;
  error?: string;
  matches: ScoredJob[];
}

export interface PipelineState {
  lastRun: PipelineRunLog | null;
  runs: PipelineRunLog[];
}
