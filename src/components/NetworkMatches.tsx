"use client";

import Papa from "papaparse";
import { useMemo, useRef, useState } from "react";

import {
  countConnectionsByCompany,
  extractCompanyNamesFromRows,
  findNetworkMatches,
  stripLinkedInCsvPreamble,
  type CompanyConnectionCount,
  type NetworkMatch,
} from "@/lib/network-matches";
import type { JobListing } from "@/lib/types";

interface NetworkMatchesProps {
  jobListings: JobListing[];
}

export default function NetworkMatches({ jobListings }: NetworkMatchesProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [byCompany, setByCompany] = useState<
    Map<string, CompanyConnectionCount>
  >(new Map());
  const [parseError, setParseError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);

  const matches = useMemo(
    () => findNetworkMatches(byCompany, jobListings),
    [byCompany, jobListings],
  );

  function handleClear() {
    setByCompany(new Map());
    setParseError(null);
    setUploaded(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleCsvUpload(file: File) {
    setParseError(null);

    void file.text().then((raw) => {
      const csvBody = stripLinkedInCsvPreamble(raw);

      Papa.parse<Record<string, string>>(csvBody, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const critical = results.errors.filter(
            (e) => e.type !== "FieldMismatch",
          );
          if (critical.length > 0) {
            setParseError(critical[0]?.message ?? "Failed to parse CSV");
            return;
          }

          const companies = results.data
            .map((row) => row["Company"]?.trim())
            .filter(Boolean);

          const companyNames =
            companies.length > 0
              ? companies
              : extractCompanyNamesFromRows(results.data);

          if (companyNames.length === 0) {
            setParseError(
              'No companies found. Upload a LinkedIn connections CSV with a "Company" column.',
            );
            return;
          }

          setByCompany(countConnectionsByCompany(companyNames));
          setUploaded(true);
        },
        error: (error: Error) => {
          setParseError(error.message);
        },
      });
    }).catch(() => {
      setParseError("Failed to read CSV file");
    });
  }

  const companyCount = byCompany.size;

  return (
    <section className="mt-10 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
      <h2 className="text-lg font-medium">Network Matches</h2>
      <p className="mt-1 text-sm text-slate-400">
        Find PM openings at companies where you have LinkedIn connections
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700">
          Upload LinkedIn Connections (CSV)
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleCsvUpload(file);
              e.target.value = "";
            }}
          />
        </label>

        {companyCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <span>{companyCount} companies loaded from your network</span>
            <button
              type="button"
              onClick={handleClear}
              className="rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-400 hover:border-red-500/50 hover:text-red-300"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Your connections data is processed locally and never leaves your device.
      </p>

      {parseError && <p className="mt-2 text-sm text-red-300">{parseError}</p>}

      <div className="mt-6">
        {!uploaded ? (
          <p className="text-sm text-slate-400">
            Upload your LinkedIn connections export to match against today&apos;s
            job listings.
          </p>
        ) : matches.length === 0 ? (
          <p className="text-sm text-slate-400">
            No matches found. Run the pipeline to refresh job listings.
          </p>
        ) : (
          <ul className="space-y-3">
            {matches.map((match) => (
              <NetworkMatchCard
                key={`${match.company}-${match.job.id}`}
                match={match}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function NetworkMatchCard({ match }: { match: NetworkMatch }) {
  return (
    <li className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{match.company}</p>
          <p className="mt-1 text-sm text-slate-400">
            {match.connectionCount}{" "}
            {match.connectionCount === 1 ? "connection" : "connections"} there
          </p>
          <p className="mt-2 text-sm text-slate-200">{match.job.title}</p>
        </div>
        <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
          Referral opportunity
        </span>
      </div>
      <a
        href={match.job.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block text-sm text-emerald-400 hover:text-emerald-300"
      >
        View JD →
      </a>
    </li>
  );
}
