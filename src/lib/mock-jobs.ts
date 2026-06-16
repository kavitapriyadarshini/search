import { SEARCH_KEYWORD } from "./config";
import type { JobListing } from "./types";

const MOCK_TEMPLATES: Omit<JobListing, "id" | "url">[] = [
  {
    source: "linkedin",
    title: "Senior Product Manager - Payments",
    company: "Juspay",
    location: "Bengaluru, Karnataka, India",
    description:
      "Own the payments checkout and payout product roadmap for B2B merchants. 4-6 years PM experience in fintech. Lead cross-functional squads, define PRDs, ship AI-assisted reconciliation features. Full product ownership — not sales.",
    postedAt: new Date().toISOString(),
  },
  {
    source: "naukri",
    title: "Product Manager - AI Platform",
    company: "Fractal Analytics",
    location: "Remote",
    description:
      "Build AI-native enterprise SaaS products. Partner with engineering on LLM-powered workflows. 3-5 years product management in B2B SaaS. Remote India. True PM role with roadmap ownership.",
    postedAt: new Date().toISOString(),
  },
  {
    source: "linkedin",
    title: "Product Manager - B2B SaaS",
    company: "Chargebee",
    location: "Bengaluru, Karnataka, India",
    description:
      "Own subscription billing and revenue recognition modules for mid-market SaaS. Fintech-adjacent B2B product. 4-7 years experience. Work with design and eng on end-to-end product delivery.",
    postedAt: new Date().toISOString(),
  },
  {
    source: "naukri",
    title: "Product Manager Intern",
    company: "StartupX",
    location: "Bengaluru, Karnataka, India",
    description:
      "Unpaid intern role assisting the product team. 0-1 years experience. Learning opportunity for aspiring PMs.",
    postedAt: new Date().toISOString(),
  },
  {
    source: "linkedin",
    title: "Growth Product Manager",
    company: "SalesCo",
    location: "Bengaluru, Karnataka, India",
    description:
      "Hit your sales target and manage pipeline for enterprise accounts. Quota-carrying role with revenue ownership. 5+ years in growth and sales-led product.",
    postedAt: new Date().toISOString(),
  },
];

/** Five mock listings — skips Apify; exercises hard filters, Claude, and Notion. */
export function getMockJobs(): JobListing[] {
  const ts = Date.now();
  return MOCK_TEMPLATES.map((job, index) => ({
    ...job,
    id: `mock-${ts}-${index}`,
    url: `https://example.com/test/${ts}/${SEARCH_KEYWORD.toLowerCase().replace(/\s+/g, "-")}-${index + 1}`,
  }));
}
