import { APIFY_LINKEDIN_ACTOR, APIFY_NAUKRI_ACTOR, SEARCH_KEYWORD } from "./config";
import type { JobListing, JobSource } from "./types";

const APIFY_TIMEOUT_SEC = 600;

function getApifyToken(): string {
  const token = process.env.APIFY_API_KEY;
  if (!token) {
    throw new Error("APIFY_API_KEY is not set in .env.local");
  }
  return token;
}

async function runActorDataset(
  actorId: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const token = getApifyToken();
  const url = new URL(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items`,
  );
  url.searchParams.set("token", token);
  url.searchParams.set("timeout", String(APIFY_TIMEOUT_SEC));

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Apify actor ${actorId} failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) {
    return [];
  }
  return data as Record<string, unknown>[];
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

function normalizeLinkedInItem(
  item: Record<string, unknown>,
): JobListing | null {
  const title = pickString(item, ["title", "jobTitle", "position"]);
  const company = pickString(item, [
    "companyName",
    "company",
    "company_name",
    "employer",
  ]);
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

  const location = pickString(item, ["location", "jobLocation", "place"]);
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
  const company = pickString(item, [
    "companyName",
    "company",
    "company_name",
  ]);
  const url = pickString(item, [
    "jobUrl",
    "url",
    "applyUrl",
    "jdUrl",
    "link",
  ]);
  if (!title || !url) return null;

  const description =
    pickString(item, ["description", "jobDescription", "job_description"]) ||
    "";

  const location = pickString(item, ["location", "jobLocation", "place"]);
  const postedAt =
    pickString(item, ["postedDate", "postedAt", "posted_date"]) || undefined;

  const id = pickString(item, ["id", "jobId"]) || `${url}-${title}`;

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

export async function scrapeLinkedInJobs(): Promise<JobListing[]> {
  const runs: JobListing[] = [];

  const bengaluruInput = {
    keywords: SEARCH_KEYWORD,
    location: "Bengaluru, Karnataka, India",
    datePosted: "past24Hours",
    maxResults: 100,
    scrapeJobDetails: true,
    workType: [] as string[],
  };

  const remoteInput = {
    keywords: SEARCH_KEYWORD,
    location: "India",
    datePosted: "past24Hours",
    maxResults: 100,
    scrapeJobDetails: true,
    workType: ["remote"],
  };

  const [bengaluruItems, remoteItems] = await Promise.all([
    runActorDataset(APIFY_LINKEDIN_ACTOR, bengaluruInput),
    runActorDataset(APIFY_LINKEDIN_ACTOR, remoteInput),
  ]);

  runs.push(...normalizeItems(bengaluruItems, "linkedin"));
  runs.push(...normalizeItems(remoteItems, "linkedin"));

  return runs;
}

/** LinkedIn Jobs Scraper (curious_coder) — pass pre-built search URLs with f_TPR=r86400. */
export async function scrapeLinkedInViaUrls(urls: string[]): Promise<JobListing[]> {
  const actorId =
    process.env.APIFY_LINKEDIN_URL_ACTOR_ID ?? "curious_coder~linkedin-jobs-scraper";
  const items = await runActorDataset(actorId, {
    urls,
    scrapeCompany: false,
    count: 100,
  });
  return normalizeItems(items, "linkedin");
}

export async function scrapeNaukriJobs(): Promise<JobListing[]> {
  const baseInput = {
    keyword: SEARCH_KEYWORD,
    maxJobs: 100,
    sortBy: "date",
    experienceMin: 0,
    workMode: "any",
  };

  const [bangaloreItems, remoteItems] = await Promise.all([
    runActorDataset(APIFY_NAUKRI_ACTOR, {
      ...baseInput,
      location: "bangalore",
    }),
    runActorDataset(APIFY_NAUKRI_ACTOR, {
      ...baseInput,
      location: "remote",
      workMode: "remote",
    }),
  ]);

  const jobs = [
    ...normalizeItems(bangaloreItems, "naukri"),
    ...normalizeItems(remoteItems, "naukri"),
  ];

  return jobs.filter((job) => {
    if (!job.postedAt) return true;
    const posted = new Date(job.postedAt);
    if (Number.isNaN(posted.getTime())) return true;
    return Date.now() - posted.getTime() <= 24 * 60 * 60 * 1000;
  });
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

export async function scrapeAllSources(): Promise<JobListing[]> {
  const [linkedin, naukri] = await Promise.all([
    scrapeLinkedInJobs(),
    scrapeNaukriJobs(),
  ]);
  return dedupeJobs([...linkedin, ...naukri]);
}
