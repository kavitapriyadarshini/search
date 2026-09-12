import type { JobListing } from "./types";

export interface CompanyConnectionCount {
  displayName: string;
  count: number;
}

export interface NetworkMatch {
  company: string;
  connectionCount: number;
  job: JobListing;
}

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Case-insensitive partial match (e.g. "Razorpay" ↔ "Razorpay Financial Services"). */
export function companiesMatch(a: string, b: string): boolean {
  const na = normalizeCompanyName(a);
  const nb = normalizeCompanyName(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

/** Deduplicate company names and count connections per company. */
export function countConnectionsByCompany(
  companyNames: string[],
): Map<string, CompanyConnectionCount> {
  const counts = new Map<string, CompanyConnectionCount>();

  for (const raw of companyNames) {
    const company = raw.trim();
    if (!company) continue;

    const key = normalizeCompanyName(company);
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { displayName: company, count: 1 });
    }
  }

  return counts;
}

export function stripLinkedInCsvPreamble(csvText: string): string {
  const text = csvText.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex(
    (line) => /first\s*name/i.test(line) && /company/i.test(line),
  );
  if (headerIdx > 0) {
    return lines.slice(headerIdx).join("\n");
  }
  return text;
}

export function extractCompanyNamesFromRows(
  rows: Record<string, string>[],
): string[] {
  return rows
    .map((row) => {
      const direct = row["Company"];
      if (typeof direct === "string" && direct.trim()) {
        return direct.trim();
      }
      const key = Object.keys(row).find(
        (k) => k.trim().toLowerCase() === "company",
      );
      return key ? (row[key] ?? "").trim() : "";
    })
    .filter(Boolean);
}

export function findNetworkMatches(
  byCompany: Map<string, CompanyConnectionCount>,
  jobs: JobListing[],
): NetworkMatch[] {
  const matches: NetworkMatch[] = [];
  const seen = new Set<string>();

  for (const job of jobs) {
    const jobCompany = job.company?.trim();
    if (!jobCompany) continue;

    for (const [, { displayName, count }] of byCompany) {
      if (!companiesMatch(jobCompany, displayName)) continue;

      const key = `${normalizeCompanyName(jobCompany)}::${job.url}`;
      if (seen.has(key)) continue;
      seen.add(key);

      matches.push({
        company: jobCompany,
        connectionCount: count,
        job,
      });
      break;
    }
  }

  return matches.sort((a, b) => {
    if (b.connectionCount !== a.connectionCount) {
      return b.connectionCount - a.connectionCount;
    }
    return a.company.localeCompare(b.company);
  });
}
