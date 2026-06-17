import { NextResponse } from "next/server";

import { isAuthorizedManualRun, isAuthorizedVercelCron } from "@/lib/auth";
import { runPipeline } from "@/lib/pipeline";
import {
  clearStaleRuns,
  isRunInProgress,
  readPipelineState,
} from "@/lib/storage";
import type { JobListing } from "@/lib/types";

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

async function startPipelineInBackground(
  testMode: boolean,
): Promise<NextResponse> {
  await clearStaleRuns();

  const state = await readPipelineState();
  if (isRunInProgress(state)) {
    return jsonResponse(
      {
        ok: false,
        error: "Pipeline is already running. Wait for it to finish.",
      },
      409,
    );
  }

  runPipeline({
    testMode,
    mockJobs: testMode ? buildTestJobs() : undefined,
  }).catch((error) => {
    console.error(
      "[pipeline] Background run failed:",
      error instanceof Error ? error.message : error,
    );
  });

  return jsonResponse({ ok: true, status: "started" });
}

/** Vercel Cron Jobs invoke this route with GET at 8:00 AM IST (02:30 UTC). */
export async function GET(request: Request) {
  try {
    console.log("STEP 1: Route hit");

    const debug = debugResponse(request);
    if (debug) return debug;

    if (!isAuthorizedVercelCron(request)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    return await startPipelineInBackground(false);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pipeline failed";
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

/** Manual trigger from the dashboard (POST). */
export async function POST(request: Request) {
  try {
    console.log("STEP 1: Route hit");

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

    return await startPipelineInBackground(testMode);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pipeline failed";
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
