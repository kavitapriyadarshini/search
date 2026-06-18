import { scrapeLinkedInJobs } from "../src/lib/apify";
import { APIFY_ZERO_JOBS_ERROR } from "../src/lib/apify-constants";
import { applyHardFilters, selectJobsForScoring } from "../src/lib/filters";
import { syncShortlistedToNotion } from "../src/lib/notion";
import { passesScoreThreshold, scoreJobs } from "../src/lib/scorer";

const SCORING_LIMIT = 5;

async function main(): Promise<number> {
  console.log("[pipeline] Starting LinkedIn scrape via Apify…");
  const scrapeResult = await scrapeLinkedInJobs();

  for (const log of scrapeResult.logs) {
    console.log(
      `[apify] ${log.label}: ${log.rawItemCount} items → ${log.normalizedCount} jobs (${log.success ? "ok" : log.error})`,
    );
  }

  if (scrapeResult.errors.length > 0) {
    console.warn("[pipeline] Scrape warnings:", scrapeResult.errors.join(" | "));
  }

  const allJobs = scrapeResult.jobs;
  console.log(`[pipeline] Found ${allJobs.length} LinkedIn jobs`);

  if (allJobs.length === 0) {
    console.error("[pipeline] FAILED:", APIFY_ZERO_JOBS_ERROR);
    return 1;
  }

  const afterHardFilter = [];
  let hardFiltered = 0;

  for (const job of allJobs) {
    const { pass } = applyHardFilters(job);
    if (pass) {
      afterHardFilter.push(job);
    } else {
      hardFiltered += 1;
    }
  }

  console.log(
    `[pipeline] Hard filters: ${afterHardFilter.length} passed, ${hardFiltered} filtered out`,
  );

  const jobsForScoring = selectJobsForScoring(afterHardFilter, SCORING_LIMIT);
  console.log(
    `[pipeline] Scoring top ${jobsForScoring.length} jobs with Groq (max ${SCORING_LIMIT})…`,
  );

  if (jobsForScoring.length === 0) {
    console.log("[pipeline] No jobs matched keyword pre-filter — nothing to score");
    return 0;
  }

  const scored = await scoreJobs(jobsForScoring, {
    onProgress: (current, total) => {
      console.log(`[pipeline] Scoring job ${current} of ${total}…`);
    },
  });

  console.log(`[pipeline] Scored ${scored.length} jobs`);
  for (const job of scored) {
    console.log(`  ${job.score}/100 — ${job.title} @ ${job.company}`);
    console.log(`    ${job.matchReason}`);
  }

  const shortlisted = scored.filter(passesScoreThreshold);
  console.log(`[pipeline] Shortlisted ${shortlisted.length} jobs (score ≥ 60)`);

  if (shortlisted.length === 0) {
    console.log("[pipeline] No shortlisted jobs — skipping Notion sync");
    return 0;
  }

  console.log("[pipeline] Syncing shortlisted jobs to Notion…");
  const notionAdded = await syncShortlistedToNotion(shortlisted);
  console.log(`[pipeline] Added ${notionAdded} new jobs to Notion`);

  console.log(
    `[pipeline] Done — found=${allJobs.length} filtered=${hardFiltered} scored=${scored.length} shortlisted=${shortlisted.length} notion=${notionAdded}`,
  );
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(
      "[pipeline] FAILED:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
