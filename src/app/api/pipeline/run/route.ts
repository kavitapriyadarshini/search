import { NextResponse } from "next/server";

import { isAuthorizedManualRun, isAuthorizedVercelCron } from "@/lib/auth";
import { formatStepError, runPipeline } from "@/lib/pipeline";
import type { JobListing } from "@/lib/types";

export const maxDuration = 600;

const PIPELINE_TIMEOUT_MS = 30_000;

async function executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Pipeline timed out after ${timeoutMs / 1000} seconds`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
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

async function executePipeline(testMode: boolean) {
  const runPromise = runPipeline({
    testMode,
    mockJobs: testMode ? buildTestJobs() : undefined,
  });

  let run;
  try {
    run = await executeWithTimeout(runPromise, PIPELINE_TIMEOUT_MS);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pipeline run failed";
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }

  if (run.status === "failed") {
    return NextResponse.json(
      {
        ok: false,
        error: formatStepError(run.stepError) || run.error,
        run,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, run });
}

/** Vercel Cron Jobs invoke this route with GET at 8:00 AM IST (02:30 UTC). */
export async function GET(request: Request) {
  if (!isAuthorizedVercelCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return executePipeline(false);
}

/** Manual trigger from the dashboard (POST). */
export async function POST(request: Request) {
  if (!isAuthorizedManualRun(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let testMode = false;
  try {
    const body = (await request.json()) as { test?: boolean };
    testMode = body.test === true;
  } catch {
    // empty body is fine for normal runs
  }

  if (testMode) {
    console.log("[api/pipeline/run] Test mode handler started");
  }

  return executePipeline(testMode);
}
