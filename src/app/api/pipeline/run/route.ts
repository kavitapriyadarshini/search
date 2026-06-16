import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/auth";
import { formatStepError, runPipeline } from "@/lib/pipeline";

export const maxDuration = 600;

export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let testMode = false;
  try {
    const body = (await request.json()) as { test?: boolean };
    testMode = body.test === true;
  } catch {
    // empty body is fine for normal runs
  }

  const run = await runPipeline({ testMode });

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
