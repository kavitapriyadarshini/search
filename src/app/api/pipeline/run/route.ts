import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/auth";
import { runPipeline } from "@/lib/pipeline";

export const maxDuration = 600;

export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const run = await runPipeline();
    return NextResponse.json({ ok: true, run });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pipeline failed";
    const status = message.includes("already running") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
