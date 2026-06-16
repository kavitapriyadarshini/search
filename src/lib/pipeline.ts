import { scrapeAllSources } from "./apify";
import { APIFY_ZERO_JOBS_ERROR } from "./apify-constants";
import { formatStepError } from "./format-errors";
import { applyHardFilters } from "./filters";
import { getMockJobs } from "./mock-jobs";
import { syncShortlistedToNotion } from "./notion";
import { passesScoreThreshold, scoreJobs } from "./scorer";
import {
  finishRun,
  isRunInProgress,
  readPipelineState,
  startRun,
} from "./storage";
import type {
  JobListing,
  PipelineRunLog,
  PipelineStep,
  PipelineStepError,
} from "./types";

export interface RunPipelineOptions {
  testMode?: boolean;
}

function newRunId(): string {
  return `run-${Date.now()}`;
}

function failRun(
  run: PipelineRunLog,
  step: PipelineStep,
  message: string,
  details?: string,
): PipelineRunLog {
  run.status = "failed";
  run.failedStep = step;
  run.error = message;
  run.stepError = { step, message, details };
  console.error(`[pipeline:${step}] FAILED — ${message}`, details ?? "");
  return run;
}

export async function runPipeline(
  options: RunPipelineOptions = {},
): Promise<PipelineRunLog> {
  const state = await readPipelineState();
  if (isRunInProgress(state)) {
    const message = "Pipeline is already running. Wait for it to finish.";
    throw new Error(message);
  }

  const run = await startRun(newRunId());
  run.testMode = options.testMode ?? false;

  let step: PipelineStep = "scrape";

  try {
    let allJobs: JobListing[];

    if (run.testMode) {
      console.log("[pipeline:scrape] Test mode — using 5 mock job listings");
      allJobs = getMockJobs();
      run.scrapeLogs = [];
    } else {
      const scrapeResult = await scrapeAllSources();
      run.scrapeLogs = scrapeResult.logs;
      allJobs = scrapeResult.jobs;

      if (allJobs.length === 0) {
        const scrapeSummary = scrapeResult.logs
          .map((l) => `${l.label}: ${l.rawItemCount} Apify items`)
          .join("; ");
        const detail = [scrapeResult.errors.join(" | "), scrapeSummary]
          .filter(Boolean)
          .join(" — ");

        await finishRun(
          failRun(
            run,
            "scrape",
            APIFY_ZERO_JOBS_ERROR,
            detail || undefined,
          ),
        );
        return run;
      }

      if (scrapeResult.errors.length > 0) {
        console.warn(
          "[pipeline:scrape] Partial scrape errors:",
          scrapeResult.errors.join(" | "),
        );
      }
    }

    run.found = allJobs.length;

    step = "hard_filter";
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

    step = "score";
    let scored;
    try {
      scored = await scoreJobs(afterHardFilter);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Claude scoring failed";
      await finishRun(failRun(run, "score", message));
      return run;
    }

    run.scored = scored.length;

    const shortlisted = scored.filter(passesScoreThreshold);
    run.shortlisted = shortlisted.length;
    run.matches = shortlisted;

    step = "notion";
    try {
      run.notionAdded = await syncShortlistedToNotion(shortlisted);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Notion sync failed";
      await finishRun(failRun(run, "notion", message));
      return run;
    }

    run.status = "success";
    await finishRun(run);
    console.log(
      `[pipeline] Success — found=${run.found} filtered=${run.hardFiltered} shortlisted=${run.shortlisted} notion=${run.notionAdded}`,
    );
    return run;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishRun(failRun(run, step, message));
    return run;
  }
}

export { formatStepError };
