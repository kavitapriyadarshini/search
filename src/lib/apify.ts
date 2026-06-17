import {
  APIFY_LINKEDIN_ACTOR,
  APIFY_NAUKRI_ACTOR,
  APIFY_RESPONSE_PREVIEW_MAX,
  LINKEDIN_SEARCH_URLS,
  SEARCH_KEYWORD,
} from "./config";
import {
  APIFY_WAIT_FOR_FINISH_SEC,
  APIFY_ZERO_JOBS_ERROR,
} from "./apify-constants";
import type {
  ApifyScrapeLog,
  JobListing,
  JobSource,
  ScrapeAllResult,
} from "./types";

function getApifyToken(): string {
  const token = process.env.APIFY_API_KEY;
  if (!token) {
    throw new Error("APIFY_API_KEY is not set in .env.local");
  }
  return token;
}

function previewBody(body: string): string {
  if (body.length <= APIFY_RESPONSE_PREVIEW_MAX) return body;
  return `${body.slice(0, APIFY_RESPONSE_PREVIEW_MAX)}… [truncated ${body.length - APIFY_RESPONSE_PREVIEW_MAX} chars]`;
}

function logApify(label: string, log: ApifyScrapeLog): void {
  const prefix = `[apify:${log.source}:${label}]`;
  if (log.success) {
    console.log(
      `${prefix} run=${log.runId ?? "?"} status=${log.runStatus ?? "?"} items=${log.rawItemCount} normalized=${log.normalizedCount} (${log.durationMs}ms)`,
    );
  } else {
    console.error(
      `${prefix} FAILED run=${log.runId ?? "?"} — ${log.error ?? "unknown error"}`,
    );
    if (log.responseBodyPreview) {
      console.error(`${prefix} response:`, log.responseBodyPreview);
    }
  }
}

interface ApifyRunResponse {
  data?: {
    id?: string;
    status?: string;
    defaultDatasetId?: string;
    statusMessage?: string;
  };
}

interface ActorRunOutcome {
  items: Record<string, unknown>[];
  log: ApifyScrapeLog;
}

function createBaseLog(
  source: JobSource,
  actorId: string,
  label: string,
  input: Record<string, unknown>,
): ApifyScrapeLog {
  return {
    source,
    actorId,
    label,
    input,
    statusCode: 0,
    success: false,
    rawItemCount: 0,
    normalizedCount: 0,
    durationMs: 0,
  };
}

/**
 * Start an actor run, wait synchronously (waitForFinish), then fetch dataset items.
 * POST /v2/acts/{actorId}/runs?waitForFinish=60
 * GET  /v2/actor-runs/{runId}/dataset/items
 */
async function runActorAndFetchDataset(
  source: JobSource,
  actorId: string,
  label: string,
  input: Record<string, unknown>,
): Promise<ActorRunOutcome> {
  const started = Date.now();
  const token = getApifyToken();
  const baseLog = createBaseLog(source, actorId, label, input);

  try {
    const runUrl = new URL(`https://api.apify.com/v2/acts/${actorId}/runs`);
    runUrl.searchParams.set("token", token);
    runUrl.searchParams.set("waitForFinish", String(APIFY_WAIT_FOR_FINISH_SEC));

    console.log(
      `[apify:${source}:${label}] Starting run (waitForFinish=${APIFY_WAIT_FOR_FINISH_SEC}s)…`,
    );

    const runResponse = await fetch(runUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    const runBodyText = await runResponse.text();
    baseLog.statusCode = runResponse.status;
    baseLog.responseBodyPreview = previewBody(runBodyText);

    if (!runResponse.ok) {
      baseLog.durationMs = Date.now() - started;
      baseLog.error = `Run request failed HTTP ${runResponse.status}: ${runBodyText.slice(0, 500)}`;
      logApify(label, baseLog);
      return { items: [], log: baseLog };
    }

    let runPayload: ApifyRunResponse;
    try {
      runPayload = JSON.parse(runBodyText) as ApifyRunResponse;
    } catch {
      baseLog.durationMs = Date.now() - started;
      baseLog.error = `Run response is not valid JSON: ${runBodyText.slice(0, 300)}`;
      logApify(label, baseLog);
      return { items: [], log: baseLog };
    }

    const runId = runPayload.data?.id;
    const runStatus = runPayload.data?.status;
    baseLog.runId = runId;
    baseLog.runStatus = runStatus;

    if (!runId) {
      baseLog.durationMs = Date.now() - started;
      baseLog.error = `No run ID in Apify response: ${runBodyText.slice(0, 300)}`;
      logApify(label, baseLog);
      return { items: [], log: baseLog };
    }

    if (runStatus === "TIMED-OUT") {
      baseLog.durationMs = Date.now() - started;
      baseLog.error = `Apify actor run timed out after ${APIFY_WAIT_FOR_FINISH_SEC} seconds (waitForFinish)`;
      logApify(label, baseLog);
      return { items: [], log: baseLog };
    }

    if (runStatus === "FAILED" || runStatus === "ABORTED") {
      baseLog.durationMs = Date.now() - started;
      const statusMsg = runPayload.data?.statusMessage;
      baseLog.error = statusMsg
        ? `Apify actor run ${runStatus}: ${statusMsg}`
        : `Apify actor run ${runStatus}`;
      logApify(label, baseLog);
      return { items: [], log: baseLog };
    }

    if (runStatus !== "SUCCEEDED" && runStatus !== "READY") {
      baseLog.durationMs = Date.now() - started;
      baseLog.error = `Apify actor run ended with unexpected status: ${runStatus}`;
      logApify(label, baseLog);
      return { items: [], log: baseLog };
    }

    console.log(
      `[apify:${source}:${label}] Run ${runId} finished (${runStatus}), fetching dataset…`,
    );

    const itemsUrl = new URL(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items`,
    );
    itemsUrl.searchParams.set("token", token);

    const itemsResponse = await fetch(itemsUrl.toString());
    const itemsBodyText = await itemsResponse.text();

    if (!itemsResponse.ok) {
      baseLog.durationMs = Date.now() - started;
      baseLog.error = `Dataset fetch failed HTTP ${itemsResponse.status}: ${itemsBodyText.slice(0, 500)}`;
      baseLog.responseBodyPreview = previewBody(itemsBodyText);
      logApify(label, baseLog);
      return { items: [], log: baseLog };
    }

    let items: Record<string, unknown>[];
    try {
      const parsed = JSON.parse(itemsBodyText) as unknown;
      if (!Array.isArray(parsed)) {
        baseLog.durationMs = Date.now() - started;
        baseLog.error = `Dataset response is not an array: ${itemsBodyText.slice(0, 300)}`;
        logApify(label, baseLog);
        return { items: [], log: baseLog };
      }
      items = parsed as Record<string, unknown>[];
    } catch {
      baseLog.durationMs = Date.now() - started;
      baseLog.error = `Dataset response is not valid JSON: ${itemsBodyText.slice(0, 300)}`;
      logApify(label, baseLog);
      return { items: [], log: baseLog };
    }

    baseLog.rawItemCount = items.length;
    baseLog.durationMs = Date.now() - started;

    if (items.length === 0) {
      baseLog.error = APIFY_ZERO_JOBS_ERROR;
      logApify(label, baseLog);
      return { items: [], log: baseLog };
    }

    baseLog.success = true;
    logApify(label, baseLog);
    return { items, log: baseLog };
  } catch (error) {
    baseLog.durationMs = Date.now() - started;
    baseLog.error = error instanceof Error ? error.message : String(error);
    logApify(label, baseLog);
    return { items: [], log: baseLog };
  }
}

function pickString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function pickCompanyName(record: Record<string, unknown>): string {
  const direct = pickString(record, [
    "companyName",
    "company",
    "company_name",
    "employer",
    "staticCompanyName",
  ]);
  if (direct) return direct;

  const detail = record.companyDetail;
  if (detail && typeof detail === "object" && "name" in detail) {
    const name = (detail as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return "";
}

function pickLocation(record: Record<string, unknown>): string {
  const direct = pickString(record, ["location", "jobLocation", "place"]);
  if (direct) return direct;

  const locations = record.locations;
  if (Array.isArray(locations) && locations.length > 0) {
    const labels = locations
      .map((loc) => {
        if (loc && typeof loc === "object" && "label" in loc) {
          const label = (loc as { label?: unknown }).label;
          return typeof label === "string" ? label : "";
        }
        return "";
      })
      .filter(Boolean);
    if (labels.length > 0) return labels.join(", ");
  }
  return "";
}

function normalizeLinkedInItem(
  item: Record<string, unknown>,
): JobListing | null {
  const title = pickString(item, ["title", "jobTitle", "position"]);
  const company = pickCompanyName(item);
  const url = pickString(item, [
    "link",
    "jobUrl",
    "url",
    "applyUrl",
    "job_link",
  ]);
  if (!title || !url) return null;

  const description =
    pickString(item, ["descriptionText", "description", "jobDescription"]) ||
    pickString(item, ["descriptionHtml"]) ||
    "";

  const location = pickLocation(item);
  const postedAt =
    pickString(item, ["postedAt", "postedDate", "datePosted"]) || undefined;

  const id = pickString(item, ["id", "jobId"]) || `${url}-${title}`;

  return {
    id: `linkedin-${id}`,
    source: "linkedin",
    title,
    company: company || "Unknown",
    location,
    description,
    url,
    postedAt,
  };
}

function normalizeNaukriItem(item: Record<string, unknown>): JobListing | null {
  const title = pickString(item, ["title", "jobTitle", "job_title"]);
  const company = pickCompanyName(item);
  const url = pickString(item, [
    "staticUrl",
    "jobUrl",
    "url",
    "applyUrl",
    "jdUrl",
    "link",
  ]);
  if (!title || !url) return null;

  const description =
    pickString(item, [
      "description",
      "shortDescription",
      "jobDescription",
      "job_description",
    ]) || "";

  const location = pickLocation(item);
  const postedAt =
    pickString(item, ["createdDate", "postedDate", "postedAt", "posted_date"]) ||
    undefined;

  const id = pickString(item, ["jobId", "id"]) || `${url}-${title}`;

  return {
    id: `naukri-${id}`,
    source: "naukri",
    title,
    company: company || "Unknown",
    location,
    description,
    url,
    postedAt,
  };
}

function normalizeItems(
  items: Record<string, unknown>[],
  source: JobSource,
): JobListing[] {
  const normalizer =
    source === "linkedin" ? normalizeLinkedInItem : normalizeNaukriItem;
  return items
    .map((item) => normalizer(item))
    .filter((job): job is JobListing => job !== null);
}

function attachNormalizedCount(
  log: ApifyScrapeLog,
  jobs: JobListing[],
): ApifyScrapeLog {
  return { ...log, normalizedCount: jobs.length };
}

function zeroJobsError(label: string): string {
  return `${label}: ${APIFY_ZERO_JOBS_ERROR}`;
}

export async function scrapeLinkedInJobs(): Promise<{
  jobs: JobListing[];
  logs: ApifyScrapeLog[];
  errors: string[];
}> {
  const input = {
    urls: LINKEDIN_SEARCH_URLS,
    scrapeCompany: false,
    count: 100,
  };

  const { items, log } = await runActorAndFetchDataset(
    "linkedin",
    APIFY_LINKEDIN_ACTOR,
    "Bengaluru + Remote (last 24h)",
    input,
  );

  const jobs = normalizeItems(items, "linkedin");
  const finalLog = attachNormalizedCount(log, jobs);
  logApify("Bengaluru + Remote (last 24h)", finalLog);

  const errors: string[] = [];
  if (!log.success) {
    errors.push(log.error ?? `LinkedIn scrape failed (HTTP ${log.statusCode})`);
  } else if (jobs.length === 0 && items.length > 0) {
    errors.push(
      `LinkedIn: ${items.length} Apify items but none normalized (check title/url fields)`,
    );
  }

  return { jobs, logs: [finalLog], errors };
}

export async function scrapeNaukriJobs(): Promise<{
  jobs: JobListing[];
  logs: ApifyScrapeLog[];
  errors: string[];
}> {
  const baseInput = {
    platform: "naukri",
    searchQuery: SEARCH_KEYWORD,
    maximumJobs: 100,
    timeFilter: "24h",
    includeDescription: true,
    cleanHtml: true,
    startUrls: [] as string[],
  };

  const runs = [
    {
      label: "Bangalore (last 24h)",
      input: { ...baseInput, location: "bangalore" },
    },
    {
      label: "Remote (last 24h)",
      input: { ...baseInput, location: "bangalore", workMode: "1" },
    },
  ];

  const logs: ApifyScrapeLog[] = [];
  const errors: string[] = [];
  const jobs: JobListing[] = [];

  for (const run of runs) {
    const { items, log } = await runActorAndFetchDataset(
      "naukri",
      APIFY_NAUKRI_ACTOR,
      run.label,
      run.input,
    );
    const normalized = normalizeItems(items, "naukri");
    const finalLog = attachNormalizedCount(log, normalized);
    logs.push(finalLog);

    if (!log.success) {
      errors.push(log.error ?? zeroJobsError(run.label));
    } else if (normalized.length === 0 && items.length > 0) {
      errors.push(
        `Naukri ${run.label}: ${items.length} Apify items but none normalized`,
      );
    }

    jobs.push(...normalized);
  }

  return { jobs, logs, errors };
}

export function dedupeJobs(jobs: JobListing[]): JobListing[] {
  const seen = new Set<string>();
  const result: JobListing[] = [];

  for (const job of jobs) {
    const key = job.url.toLowerCase().replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(job);
  }

  return result;
}

export async function scrapeAllSources(): Promise<ScrapeAllResult> {
  const linkedin = await scrapeLinkedInJobs();

  if (process.env.VERCEL) {
    console.log("[pipeline:scrape] Vercel: skipping Naukri scraper (LinkedIn only)");
    const { logs, errors, jobs } = linkedin;

    const itemSummary = logs
      .map((l) => `${l.source}/${l.label}: ${l.rawItemCount} items`)
      .join(", ");

    console.log(
      `[pipeline:scrape] Apify items — ${itemSummary} | total normalized=${jobs.length}`,
    );

    if (jobs.length === 0) {
      const allZeroItems = logs.every((l) => l.rawItemCount === 0);
      if (allZeroItems && errors.length === 0) {
        errors.push(APIFY_ZERO_JOBS_ERROR);
      }
    }

    return { jobs, logs, errors };
  }

  const naukri = await scrapeNaukriJobs();

  const logs = [...linkedin.logs, ...naukri.logs];
  const errors = [...linkedin.errors, ...naukri.errors];
  const jobs = dedupeJobs([...linkedin.jobs, ...naukri.jobs]);

  const itemSummary = logs
    .map((l) => `${l.source}/${l.label}: ${l.rawItemCount} items`)
    .join(", ");

  console.log(
    `[pipeline:scrape] Apify items — ${itemSummary} | total normalized=${jobs.length}`,
  );

  if (jobs.length === 0) {
    const allZeroItems = logs.every((l) => l.rawItemCount === 0);
    if (allZeroItems && errors.length === 0) {
      errors.push(APIFY_ZERO_JOBS_ERROR);
    }
  }

  return { jobs, logs, errors };
}
