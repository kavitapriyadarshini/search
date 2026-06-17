import type { JobListing } from "./types";

const HARD_FILTER_PATTERNS: { reason: string; test: (jd: string, title: string) => boolean }[] =
  [
    {
      reason: "Sales/quota role",
      test: (jd) =>
        /\bquota\b/i.test(jd) ||
        /\bpipeline\b/i.test(jd) ||
        /\bsales target\b/i.test(jd),
    },
    {
      reason: "Unpaid or intern role",
      test: (jd) => /\bunpaid\b/i.test(jd) || /\bintern\b/i.test(jd),
    },
    {
      reason: "Shift requirement",
      test: (jd) =>
        /\bnight shift\b/i.test(jd) || /\brotational shift\b/i.test(jd),
    },
    {
      reason: "Associate PM with 5+ years requirement",
      test: (jd, title) =>
        /associate\s*pm/i.test(title) &&
        (/5\+?\s*years?/i.test(jd) || /five\+?\s*years?/i.test(jd)),
    },
  ];

export function applyHardFilters(job: JobListing): {
  pass: boolean;
  reason?: string;
} {
  const jd = `${job.title}\n${job.description}`;
  for (const { reason, test } of HARD_FILTER_PATTERNS) {
    if (test(jd, job.title)) {
      return { pass: false, reason };
    }
  }
  return { pass: true };
}

export function isWithinLast24Hours(postedAt?: string): boolean {
  if (!postedAt) return true;
  const posted = new Date(postedAt);
  if (Number.isNaN(posted.getTime())) return true;
  const hoursAgo = (Date.now() - posted.getTime()) / (1000 * 60 * 60);
  return hoursAgo <= 24;
}

const PM_TITLE_PATTERN = /product manager|\bPM\b/i;
const DOMAIN_PATTERN = /fintech|payments|\bAI\b|SaaS/i;

/** Keyword pre-filter before LLM scoring — max 5 jobs to reduce API load. */
export function selectJobsForScoring(
  jobs: JobListing[],
  limit = 5,
): JobListing[] {
  const matched = jobs.filter((job) => {
    const text = `${job.title}\n${job.description}`;
    return PM_TITLE_PATTERN.test(job.title) && DOMAIN_PATTERN.test(text);
  });
  return matched.slice(0, limit);
}
