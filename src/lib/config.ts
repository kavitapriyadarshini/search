export const SEARCH_KEYWORD = "Product Manager";

export const CANDIDATE_PROFILE = `5 years PM experience, ex-Razorpay (payments, payouts, accounting integrations), IIT Kharagpur, fintech and B2B SaaS background, recently built 6 live AI products (Unlock75, Listenify, BuySellFactory, PrepSense and StyleYou), Google AI Essentials certified, looking for PM or Senior PM roles in fintech, AI-native companies, or B2B SaaS`;

export const SCORE_THRESHOLD = 60;

export const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

/** Apify actor IDs (use ~ in API paths; / in store URLs). */
export const APIFY_LINKEDIN_ACTOR =
  process.env.APIFY_LINKEDIN_ACTOR_ID ??
  "mukeshrana90~linkedin-jobs-scraper-unlimited";

export const APIFY_NAUKRI_ACTOR =
  process.env.APIFY_NAUKRI_ACTOR_ID ?? "automation-lab~naukri-scraper";
