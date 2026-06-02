import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import type { PipelineRunLog, PipelineState, ScoredJob } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "pipeline-state.json");

const defaultState: PipelineState = {
  lastRun: null,
  runs: [],
};

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function readPipelineState(): Promise<PipelineState> {
  try {
    const raw = await readFile(STATE_FILE, "utf-8");
    return JSON.parse(raw) as PipelineState;
  } catch {
    return { ...defaultState };
  }
}

export async function writePipelineState(state: PipelineState): Promise<void> {
  await ensureDataDir();
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

export async function startRun(id: string): Promise<PipelineRunLog> {
  const state = await readPipelineState();
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
  state.runs = [run, ...state.runs].slice(0, 30);
  await writePipelineState(state);
  return run;
}

export async function finishRun(run: PipelineRunLog): Promise<void> {
  const state = await readPipelineState();
  run.finishedAt = new Date().toISOString();
  state.lastRun = run;
  state.runs = state.runs.map((r) => (r.id === run.id ? run : r));
  await writePipelineState(state);
}

export function getTodayShortlisted(state: PipelineState): ScoredJob[] {
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set<string>();
  const results: ScoredJob[] = [];

  for (const run of state.runs) {
    if (run.status !== "success") continue;
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

export function isRunInProgress(state: PipelineState): boolean {
  return state.lastRun?.status === "running";
}
