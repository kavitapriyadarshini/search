export const SEARCH_KEYWORD = "Product Manager";

export const CANDIDATE_PROFILE = `5 years PM experience, ex-Razorpay (payments, payouts, accounting integrations), IIT Kharagpur, fintech and B2B SaaS background, recently built 6 live AI products (Unlock75, Listenify, BuySellFactory, PrepSense and StyleYou), Google AI Essentials certified, looking for PM or Senior PM roles in fintech, AI-native companies, or B2B SaaS`;

export const SCORE_THRESHOLD = 60;

export const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

/**
 * Apify actor IDs (use ~ in API paths; / in store URLs).
 *
 * Verified via Apify API:
 * - curious_coder/linkedin-jobs-scraper — exists (URL-based input)
 * - apimaestro/linkedin-jobs-scraper — NOT FOUND on Apify
 * - curious_coder/naukri-scraper — NOT FOUND on Apify
 *
 * Naukri fallback: memo23/naukri-scraper (India + Gulf, keyword/location filters)
 */
export const APIFY_LINKEDIN_ACTOR =
  process.env.APIFY_LINKEDIN_ACTOR_ID ?? "curious_coder~linkedin-jobs-scraper";

export const APIFY_NAUKRI_ACTOR =
  process.env.APIFY_NAUKRI_ACTOR_ID ?? "memo23~naukri-scraper";

export const APIFY_RESPONSE_PREVIEW_MAX = 4000;

/** LinkedIn public search URL with last-24h filter (f_TPR=r86400). */
export function buildLinkedInSearchUrl(options: {
  keywords: string;
  location?: string;
  remote?: boolean;
}): string {
  const url = new URL("https://www.linkedin.com/jobs/search/");
  url.searchParams.set("keywords", options.keywords);
  url.searchParams.set("f_TPR", "r86400");
  if (options.remote) {
    url.searchParams.set("f_WT", "2");
    url.searchParams.set("location", "India");
  } else if (options.location) {
    url.searchParams.set("location", options.location);
  }
  return url.toString();
}

export const LINKEDIN_SEARCH_URLS = [
  buildLinkedInSearchUrl({
    keywords: SEARCH_KEYWORD,
    location: "Bengaluru, Karnataka, India",
  }),
  buildLinkedInSearchUrl({
    keywords: SEARCH_KEYWORD,
    remote: true,
  }),
];
