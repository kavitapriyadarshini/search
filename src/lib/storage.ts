import type { PipelineRunLog, PipelineState, ScoredJob } from "./types";

const MAX_RUNS = 30;

declare global {
  var __jobsearchPipelineState: PipelineState | undefined;
}

function defaultState(): PipelineState {
  return {
    lastRun: null,
    runs: [],
  };
}

function getStore(): PipelineState {
  if (!globalThis.__jobsearchPipelineState) {
    globalThis.__jobsearchPipelineState = defaultState();
  }
  return globalThis.__jobsearchPipelineState;
}

export async function readPipelineState(): Promise<PipelineState> {
  return structuredClone(getStore());
}

export async function writePipelineState(state: PipelineState): Promise<void> {
  globalThis.__jobsearchPipelineState = structuredClone(state);
}

export async function startRun(id: string): Promise<PipelineRunLog> {
  const state = getStore();
  const run: PipelineRunLog = {
    id,
    startedAt: new Date().toISOString(),
    status: "running",
    found: 0,
    hardFiltered: 0,
    scored: 0,
    shortlisted: 0,
    notionAdded: 0,
    matches: [],
  };

  state.lastRun = run;
  state.runs = [run, ...state.runs].slice(0, MAX_RUNS);
  return run;
}

export async function persistRun(run: PipelineRunLog): Promise<void> {
  const state = getStore();
  state.lastRun = run;
  state.runs = state.runs.map((r) => (r.id === run.id ? run : r));
}

export async function finishRun(run: PipelineRunLog): Promise<void> {
  const state = getStore();
  run.finishedAt = new Date().toISOString();
  state.lastRun = run;
  state.runs = state.runs.map((r) => (r.id === run.id ? run : r));
}

export function getTodayShortlisted(state: PipelineState): ScoredJob[] {
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set<string>();
  const results: ScoredJob[] = [];

  for (const run of state.runs) {
    if (run.status !== "success" && run.status !== "incomplete") continue;
    const runDay = (run.finishedAt ?? run.startedAt).slice(0, 10);
    if (runDay !== today) continue;

    for (const job of run.matches) {
      const key = job.url.toLowerCase().replace(/\/$/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(job);
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

const STALE_RUN_MS = 60 * 60 * 1000;

export function isRunInProgress(state: PipelineState): boolean {
  const last = state.lastRun;
  if (!last || last.status !== "running") return false;

  const started = new Date(last.startedAt).getTime();
  if (Number.isNaN(started)) return true;

  return Date.now() - started < STALE_RUN_MS;
}

/** Mark abandoned runs as failed so new runs are not blocked forever. */
export async function clearStaleRuns(): Promise<void> {
  const state = getStore();
  const last = state.lastRun;
  if (!last || last.status !== "running") return;

  const started = new Date(last.startedAt).getTime();
  if (Number.isNaN(started) || Date.now() - started < STALE_RUN_MS) return;

  last.status = "failed";
  last.finishedAt = new Date().toISOString();
  last.error = "Previous run timed out or was interrupted — cleared automatically";
  state.lastRun = last;
  state.runs = state.runs.map((r) => (r.id === last.id ? last : r));
  console.warn(`[storage] Cleared stale run ${last.id}`);
}
