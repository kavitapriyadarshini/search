"use client";

import { useCallback, useEffect, useState } from "react";

import { formatStepError, stepLabel } from "@/lib/format-errors";
import type { ApifyScrapeLog, PipelineRunLog, ScoredJob } from "@/lib/types";

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
  const [testMode, setTestMode] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
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
      const res = await fetch("/api/pipeline/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: testMode }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        run?: PipelineRunLog;
      };

      if (!res.ok || !data.ok) {
        const run = data.run;
        const msg =
          data.error ??
          (run ? formatStepError(run.stepError) || run.error : undefined) ??
          "Pipeline run failed";
        setLastRun(run ?? null);
        if (run) {
          setRuns((prev) => {
            const exists = prev.some((r) => r.id === run.id);
            return exists
              ? prev.map((r) => (r.id === run.id ? run : r))
              : [run, ...prev];
          });
        }
        setError(msg);
        setRunning(false);
        return;
      }

      setRunMessage(
        testMode
          ? `Test run complete — ${data.run?.shortlisted ?? 0} shortlisted, ${data.run?.notionAdded ?? 0} added to Notion (mock data, no Apify)`
          : `Done — ${data.run?.shortlisted ?? 0} shortlisted, ${data.run?.notionAdded ?? 0} added to Notion`,
      );
      await refresh();
      setRunning(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
      setRunning(false);
    }
  }

  const lastRunError =
    lastRun?.status === "failed"
      ? formatStepError(lastRun.stepError) || lastRun.error
      : null;

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
          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={testMode}
                onChange={(e) => setTestMode(e.target.checked)}
                disabled={running}
                className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
              />
              Test mode (skip Apify, use 5 mock jobs)
            </label>
            <button
              type="button"
              onClick={() => void handleRunNow()}
              disabled={running}
              className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running
                ? testMode
                  ? "Running test…"
                  : "Running pipeline…"
                : testMode
                  ? "Run Test"
                  : "Run Now"}
            </button>
          </div>
        </header>

        {(error || lastRunError) && (
          <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error && <p className="font-medium">{error}</p>}
            {lastRun?.failedStep && (
              <p className="mt-1 text-red-300/90">
                Failed at: <strong>{stepLabel(lastRun.failedStep)}</strong>
              </p>
            )}
            {lastRunError && lastRunError !== error && (
              <p className="mt-1 font-mono text-xs text-red-300/80">
                {lastRunError}
              </p>
            )}
          </div>
        )}
        {runMessage && (
          <div className="mb-6 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {runMessage}
          </div>
        )}

        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Last run (IST)"
            value={formatTime(lastRun?.finishedAt ?? lastRun?.startedAt)}
          />
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
            <div className="mt-4 space-y-2">
              <p className="font-mono text-sm text-slate-300">
                {lastRun.testMode ? "[TEST] " : ""}
                {lastRun.found} found · {lastRun.hardFiltered} filtered ·{" "}
                {lastRun.scored} scored · {lastRun.shortlisted} shortlisted ·{" "}
                {lastRun.notionAdded} synced to Notion
              </p>
              {lastRun.status === "failed" && (
                <p className="rounded-md bg-red-950/40 px-3 py-2 font-mono text-xs text-red-200">
                  {stepLabel(lastRun.failedStep)} failed:{" "}
                  {formatStepError(lastRun.stepError) || lastRun.error}
                </p>
              )}
            </div>
          )}

          {lastRun?.scrapeLogs && lastRun.scrapeLogs.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-slate-300">
                Apify scrape details
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                {lastRun.scrapeLogs
                  .map((l) => `${l.label}: ${l.rawItemCount} items`)
                  .join(" · ")}
              </p>
              <ul className="mt-3 space-y-3">
                {lastRun.scrapeLogs.map((log) => (
                  <ScrapeLogCard key={`${log.actorId}-${log.label}-${log.runId ?? "pending"}`} log={log} />
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-4 font-medium">Time (IST)</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Found</th>
                  <th className="py-2 pr-4 font-medium">Filtered</th>
                  <th className="py-2 pr-4 font-medium">Shortlisted</th>
                  <th className="py-2 pr-4 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-slate-800/60">
                    <td className="py-2 pr-4">
                      {formatTime(run.finishedAt ?? run.startedAt)}
                      {run.testMode && (
                        <span className="ml-1 text-xs text-amber-400">test</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 capitalize">{run.status}</td>
                    <td className="py-2 pr-4">{run.found}</td>
                    <td className="py-2 pr-4">{run.hardFiltered}</td>
                    <td className="py-2 pr-4">{run.shortlisted}</td>
                    <td className="max-w-xs truncate py-2 pr-4 text-xs text-red-300">
                      {run.status === "failed"
                        ? formatStepError(run.stepError) || run.error || "—"
                        : "—"}
                    </td>
                  </tr>
                ))}
                {!loading && runs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-slate-500">
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
              No matches yet today. Run the pipeline to scrape LinkedIn and
              Naukri, or use Test mode to verify scoring and Notion.
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
                        <span className="uppercase text-slate-500">
                          {job.source}
                        </span>
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

function ScrapeLogCard({ log }: { log: ApifyScrapeLog }) {
  return (
    <li
      className={`rounded-lg border px-3 py-2 text-xs font-mono ${
        log.success
          ? "border-slate-700 bg-slate-800/50 text-slate-300"
          : "border-red-800/60 bg-red-950/30 text-red-200"
      }`}
    >
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <span className="uppercase text-slate-500">{log.source}</span>
        <span>{log.label}</span>
        <span className="font-semibold text-emerald-400">
          {log.rawItemCount} Apify items
        </span>
        <span>→ {log.normalizedCount} normalized</span>
        {log.runStatus && <span>status={log.runStatus}</span>}
        <span>{log.durationMs}ms</span>
      </div>
      <div className="mt-1 text-slate-500">
        {log.actorId}
        {log.runId && ` · run ${log.runId}`}
      </div>
      {log.error && <p className="mt-2 text-red-300">{log.error}</p>}
      {log.responseBodyPreview && !log.success && (
        <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all text-[10px] text-red-200/80">
          {log.responseBodyPreview}
        </pre>
      )}
    </li>
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
