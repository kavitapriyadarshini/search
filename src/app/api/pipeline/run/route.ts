import { NextResponse } from "next/server";

import { isAuthorizedManualRun, isAuthorizedVercelCron } from "@/lib/auth";
import {
  formatStepError,
  markRunIncomplete,
  runPipeline,
} from "@/lib/pipeline";
import {
  createProgress,
  recordStep,
  type PipelineProgress,
} from "@/lib/pipeline-progress";
import {
  clearStaleRuns,
  getTodayCompletedRun,
  isRunInProgress,
  readPipelineState,
} from "@/lib/storage";
import type { JobListing, PipelineRunLog } from "@/lib/types";

const PIPELINE_TIMEOUT_MS = 250_000;

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

function jsonResponse(body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: JSON_HEADERS });
}

function debugResponse(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("debug") === "true") {
    return jsonResponse({
      ok: true,
      status: "route reached",
      timestamp: new Date().toISOString(),
    });
  }
  return null;
}

function buildTestJobs(): JobListing[] {
  const ts = Date.now();
  return [
    {
      id: `mock-${ts}-1`,
      source: "linkedin",
      title: "Senior Product Manager - Payments",
      company: "Juspay",
      location: "Bengaluru, Karnataka, India",
      description:
        "Own checkout and payouts roadmap. 4-6 years PM experience in fintech. Strong cross-functional ownership.",
      url: `https://example.com/mock/${ts}/1`,
      postedAt: new Date().toISOString(),
    },
    {
      id: `mock-${ts}-2`,
      source: "naukri",
      title: "Product Manager - AI Platform",
      company: "Fractal Analytics",
      location: "Remote",
      description:
        "Build AI-native B2B SaaS products with clear PM ownership and roadmap accountability.",
      url: `https://example.com/mock/${ts}/2`,
      postedAt: new Date().toISOString(),
    },
    {
      id: `mock-${ts}-3`,
      source: "linkedin",
      title: "Product Manager - B2B SaaS",
      company: "Chargebee",
      location: "Bengaluru, Karnataka, India",
      description:
        "Own billing and revenue recognition product areas for mid-market SaaS customers.",
      url: `https://example.com/mock/${ts}/3`,
      postedAt: new Date().toISOString(),
    },
    {
      id: `mock-${ts}-4`,
      source: "naukri",
      title: "Product Manager Intern",
      company: "StartupX",
      location: "Bengaluru, Karnataka, India",
      description: "Unpaid internship role for PM support.",
      url: `https://example.com/mock/${ts}/4`,
      postedAt: new Date().toISOString(),
    },
    {
      id: `mock-${ts}-5`,
      source: "linkedin",
      title: "Growth Product Manager",
      company: "SalesCo",
      location: "Bengaluru, Karnataka, India",
      description: "Quota-carrying pipeline and sales target oriented role.",
      url: `https://example.com/mock/${ts}/5`,
      postedAt: new Date().toISOString(),
    },
  ];
}

interface PipelineApiResponse {
  ok: boolean;
  cached?: boolean;
  incomplete?: boolean;
  error?: string;
  progress: PipelineProgress;
  run?: PipelineRunLog;
}

async function runWithHardTimeout(
  testMode: boolean,
  progress: PipelineProgress,
): Promise<PipelineApiResponse> {
  let partialRun: PipelineRunLog | undefined;

  const pipelinePromise = runPipeline({
    testMode,
    mockJobs: testMode ? buildTestJobs() : undefined,
    progress,
  }).then((run) => {
    partialRun = run;
    return run;
  });

  const timeoutPromise = new Promise<"timeout">((resolve) => {
    setTimeout(() => resolve("timeout"), PIPELINE_TIMEOUT_MS);
  });

  const result = await Promise.race([pipelinePromise, timeoutPromise]);

  if (result === "timeout") {
    if (!partialRun) {
      const state = await readPipelineState();
      if (state.lastRun?.status === "running") {
        partialRun = state.lastRun;
      }
    }
    if (partialRun) {
      partialRun = await markRunIncomplete(
        partialRun,
        `Pipeline timed out after ${PIPELINE_TIMEOUT_MS / 1000} seconds at step: ${progress.lastStep ?? "unknown"}`,
      );
    }
    return {
      ok: Boolean(partialRun),
      incomplete: true,
      error: `Pipeline timed out after ${PIPELINE_TIMEOUT_MS / 1000} seconds`,
      progress,
      run: partialRun,
    };
  }

  const run = result;

  if (run.status === "failed") {
    return {
      ok: false,
      incomplete: false,
      error: formatStepError(run.stepError) || run.error,
      progress,
      run,
    };
  }

  if (run.status === "incomplete") {
    return {
      ok: run.matches.length > 0,
      incomplete: true,
      error: run.error,
      progress,
      run,
    };
  }

  return {
    ok: true,
    progress,
    run,
  };
}

async function handlePipelineRequest(testMode: boolean): Promise<NextResponse> {
  await clearStaleRuns();

  if (!testMode) {
    const state = await readPipelineState();
    const cached = getTodayCompletedRun(state);
    if (cached) {
      return jsonResponse({
        ok: true,
        cached: true,
        run: cached,
        progress: createProgress(),
      });
    }
  }

  const state = await readPipelineState();
  if (isRunInProgress(state)) {
    return jsonResponse(
      {
        ok: false,
        error: "Pipeline is already running. Wait for it to finish.",
        progress: createProgress(),
      },
      409,
    );
  }

  const progress = createProgress();
  recordStep(progress, "route_hit", "STEP 1: Route hit");

  if (testMode) {
    recordStep(progress, "test_mode", "STEP 2: Test mode active");
    recordStep(
      progress,
      "mock_jobs",
      "Mock jobs built in API route",
      "5 jobs",
    );
  }

  try {
    const payload = await runWithHardTimeout(testMode, progress);

    if (!payload.ok) {
      return jsonResponse(
        { ...payload } as Record<string, unknown>,
        payload.incomplete ? 504 : 500,
      );
    }

    return jsonResponse({ ...payload } as Record<string, unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pipeline failed";
    return jsonResponse(
      {
        ok: false,
        incomplete: false,
        error: message,
        progress,
        run: undefined,
      },
      500,
    );
  }
}

/** Vercel Cron Jobs invoke this route with GET at 8:00 AM IST (02:30 UTC). */
export async function GET(request: Request) {
  try {
    const debug = debugResponse(request);
    if (debug) return debug;

    if (!isAuthorizedVercelCron(request)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    return await handlePipelineRequest(false);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pipeline failed";
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

/** Manual trigger from the dashboard (POST). */
export async function POST(request: Request) {
  try {
    const debug = debugResponse(request);
    if (debug) return debug;

    if (!isAuthorizedManualRun(request)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    let testMode = false;
    try {
      const body = (await request.json()) as { test?: boolean };
      testMode = body.test === true;
    } catch {
      // empty body is fine for normal runs
    }

    return await handlePipelineRequest(testMode);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pipeline failed";
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
