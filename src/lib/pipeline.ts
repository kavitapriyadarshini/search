import { scrapeAllSources } from "./apify";
import { applyHardFilters } from "./filters";
import { syncShortlistedToNotion } from "./notion";
import { passesScoreThreshold, scoreJobs } from "./scorer";
import { finishRun, isRunInProgress, readPipelineState, startRun } from "./storage";
import type { JobListing, PipelineRunLog, ScoredJob } from "./types";

function newRunId(): string {
  return `run-${Date.now()}`;
}

export async function runPipeline(): Promise<PipelineRunLog> {
  const state = await readPipelineState();
  if (isRunInProgress(state)) {
    throw new Error("Pipeline is already running. Wait for it to finish.");
  }

  const run = await startRun(newRunId());

  try {
    const allJobs = await scrapeAllSources();
    run.found = allJobs.length;

    const afterHardFilter: JobListing[] = [];
    let hardFiltered = 0;

    for (const job of allJobs) {
      const { pass } = applyHardFilters(job);
      if (pass) {
        afterHardFilter.push(job);
      } else {
        hardFiltered += 1;
      }
    }

    run.hardFiltered = hardFiltered;

    const scored = await scoreJobs(afterHardFilter);
    run.scored = scored.length;

    const shortlisted = scored.filter(passesScoreThreshold);
    run.shortlisted = shortlisted.length;
    run.matches = shortlisted;

    run.notionAdded = await syncShortlistedToNotion(shortlisted);
    run.status = "success";
    await finishRun(run);
    return run;
  } catch (error) {
    run.status = "failed";
    run.error = error instanceof Error ? error.message : String(error);
    await finishRun(run);
    throw error;
  }
}
