"use client";

import { useCallback, useEffect, useState } from "react";

import type { PipelineRunLog, ScoredJob } from "@/lib/types";

function formatTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function Dashboard() {
  const [jobs, setJobs] = useState<ScoredJob[]>([]);
  const [lastRun, setLastRun] = useState<PipelineRunLog | null>(null);
  const [runs, setRuns] = useState<PipelineRunLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobsRes, logsRes] = await Promise.all([
        fetch("/api/jobs/today"),
        fetch("/api/logs"),
      ]);

      if (!jobsRes.ok || !logsRes.ok) {
        throw new Error("Failed to load dashboard data");
      }

      const jobsData = (await jobsRes.json()) as { jobs: ScoredJob[] };
      const logsData = (await logsRes.json()) as {
        lastRun: PipelineRunLog | null;
        runs: PipelineRunLog[];
      };

      setJobs(jobsData.jobs);
      setLastRun(logsData.lastRun);
      setRuns(logsData.runs);
      setRunning(logsData.lastRun?.status === "running");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleRunNow() {
    setRunning(true);
    setRunMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/pipeline/run", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        run?: PipelineRunLog;
      };

      if (!res.ok) {
        throw new Error(data.error ?? "Pipeline run failed");
      }

      setRunMessage(
        `Done — ${data.run?.shortlisted ?? 0} shortlisted, ${data.run?.notionAdded ?? 0} added to Notion`,
      );
      await refresh();
      setRunning(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
      setRunning(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-emerald-400">
              Job Search Pipeline
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Today&apos;s PM Matches
            </h1>
            <p className="mt-2 max-w-xl text-slate-400">
              LinkedIn + Naukri → hard filters → Claude scoring → Notion tracker
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleRunNow()}
            disabled={running}
            className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? "Running pipeline…" : "Run Now"}
          </button>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
        {runMessage && (
          <div className="mb-6 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {runMessage}
          </div>
        )}

        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Last run (IST)" value={formatTime(lastRun?.finishedAt ?? lastRun?.startedAt)} />
          <StatCard label="Jobs found" value={String(lastRun?.found ?? "—")} />
          <StatCard
            label="Hard filtered"
            value={String(lastRun?.hardFiltered ?? "—")}
          />
          <StatCard
            label="Shortlisted (≥60)"
            value={String(lastRun?.shortlisted ?? "—")}
          />
        </section>

        <section className="mb-10 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-lg font-medium">Run log</h2>
          <p className="mt-1 text-sm text-slate-400">
            Found → hard filtered → scored → shortlisted → Notion
          </p>
          {lastRun && (
            <p className="mt-4 font-mono text-sm text-slate-300">
              {lastRun.found} found · {lastRun.hardFiltered} filtered ·{" "}
              {lastRun.scored} scored · {lastRun.shortlisted} shortlisted ·{" "}
              {lastRun.notionAdded} synced to Notion
              {lastRun.status === "failed" && lastRun.error
                ? ` · Error: ${lastRun.error}`
                : ""}
            </p>
          )}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-4 font-medium">Time (IST)</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Found</th>
                  <th className="py-2 pr-4 font-medium">Filtered</th>
                  <th className="py-2 pr-4 font-medium">Shortlisted</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-slate-800/60">
                    <td className="py-2 pr-4">{formatTime(run.finishedAt ?? run.startedAt)}</td>
                    <td className="py-2 pr-4 capitalize">{run.status}</td>
                    <td className="py-2 pr-4">{run.found}</td>
                    <td className="py-2 pr-4">{run.hardFiltered}</td>
                    <td className="py-2 pr-4">{run.shortlisted}</td>
                  </tr>
                ))}
                {!loading && runs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-slate-500">
                      No runs yet. Click Run Now to start.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-medium">
            Shortlisted today ({jobs.length})
          </h2>
          {loading ? (
            <p className="text-slate-400">Loading…</p>
          ) : jobs.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-700 px-6 py-10 text-center text-slate-400">
              No matches yet today. Run the pipeline to scrape LinkedIn and Naukri.
            </p>
          ) : (
            <ul className="space-y-4">
              {jobs.map((job) => (
                <li
                  key={job.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/60 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-medium">{job.title}</h3>
                      <p className="text-slate-400">
                        {job.company} · {job.location || "Location N/A"} ·{" "}
                        <span className="uppercase text-slate-500">{job.source}</span>
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-sm font-semibold text-emerald-300">
                      {job.score}/100
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-300">{job.matchReason}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span>Domain {job.criteria.domainFit}</span>
                    <span>Exp {job.criteria.experienceMatch}</span>
                    <span>PM {job.criteria.pmOwnership}</span>
                    <span>Loc {job.criteria.locationMatch}</span>
                  </div>
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-block text-sm font-medium text-emerald-400 hover:text-emerald-300"
                  >
                    View JD →
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
