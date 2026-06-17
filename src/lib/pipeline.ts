import { scrapeAllSources } from "./apify";
import { APIFY_ZERO_JOBS_ERROR } from "./apify-constants";
import { formatStepError } from "./format-errors";
import { applyHardFilters, selectJobsForScoring } from "./filters";
import { getMockJobs } from "./mock-jobs";
import {
  createProgress,
  recordStep,
  type PipelineProgress,
} from "./pipeline-progress";
import { syncShortlistedToNotion } from "./notion";
import { passesScoreThreshold, scoreJobs } from "./scorer";
import {
  clearStaleRuns,
  finishRun,
  isRunInProgress,
  persistRun,
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
  mockJobs?: JobListing[];
  progress?: PipelineProgress;
  skipNotion?: boolean;
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
  await clearStaleRuns();

  const state = await readPipelineState();
  if (isRunInProgress(state)) {
    const message = "Pipeline is already running. Wait for it to finish.";
    throw new Error(message);
  }

  const progress = options.progress ?? createProgress();
  const run = await startRun(newRunId());
  run.testMode = options.testMode ?? false;

  let step: PipelineStep = "scrape";

  try {
    let allJobs: JobListing[];

    if (run.testMode) {
      console.log("STEP 2: Test mode active");
      recordStep(progress, "test_mode", "STEP 2: Test mode active");
      allJobs = options.mockJobs ?? getMockJobs();
      recordStep(
        progress,
        "mock_jobs",
        "Mock jobs loaded",
        `${allJobs.length} jobs`,
      );
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
    recordStep(
      progress,
      "hard_filter",
      "Hard filters applied",
      `${afterHardFilter.length} passed, ${hardFiltered} filtered`,
    );

    const jobsForScoring = selectJobsForScoring(afterHardFilter, 3);
    run.prefilterSelected = jobsForScoring.length;
    recordStep(
      progress,
      "hard_filter",
      "Keyword pre-filter for scoring",
      `${jobsForScoring.length} of ${afterHardFilter.length} selected (max 3)`,
    );

    step = "score";
    let scored;
    try {
      console.log("STEP 3: Starting Groq scoring");
      recordStep(
        progress,
        "claude_start",
        "STEP 3: Starting Groq scoring",
        `${jobsForScoring.length} jobs`,
      );
      scored = await scoreJobs(jobsForScoring, {
        onProgress: async (current, total) => {
          run.scoringProgress = `Scoring job ${current} of ${total}...`;
          await persistRun(run);
        },
        onDone: () => {
          console.log("STEP 4: Groq done");
          recordStep(progress, "claude_done", "STEP 4: Groq done");
          run.scoringProgress = undefined;
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Groq scoring failed";
      await finishRun(failRun(run, "score", message));
      return run;
    }

    run.scored = scored.length;

    const shortlisted = scored.filter(passesScoreThreshold);
    run.shortlisted = shortlisted.length;
    run.matches = shortlisted;

    if (!options.skipNotion) {
      step = "notion";
      try {
        console.log("STEP 5: Notion sync starting");
        recordStep(progress, "notion_start", "STEP 5: Notion sync starting");
        run.notionAdded = await syncShortlistedToNotion(shortlisted);
        recordStep(
          progress,
          "notion_done",
          "Notion sync done",
          `${run.notionAdded} added`,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Notion sync failed";
        if (run.testMode) {
          run.notionAdded = 0;
          run.warnings = [
            ...(run.warnings ?? []),
            `Notion skipped in test mode: ${message}`,
          ];
          recordStep(progress, "notion_done", "Notion skipped", message);
          console.warn(`[pipeline:notion] Test mode skip — ${message}`);
        } else {
          await finishRun(failRun(run, "notion", message));
          return run;
        }
      }
    } else {
      run.notionAdded = 0;
      run.warnings = [...(run.warnings ?? []), "Notion sync skipped"];
      recordStep(progress, "notion_done", "Notion sync skipped");
    }

    run.status = "success";
    recordStep(progress, "complete", "Pipeline complete");
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

export async function markRunIncomplete(
  run: PipelineRunLog,
  message: string,
): Promise<PipelineRunLog> {
  run.status = "incomplete";
  run.finishedAt = new Date().toISOString();
  run.error = message;
  await finishRun(run);
  return run;
}

export { formatStepError };
