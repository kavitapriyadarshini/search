import { NextResponse } from "next/server";

import { readPipelineState } from "@/lib/storage";

export async function GET() {
  const state = await readPipelineState();
  return NextResponse.json({
    lastRun: state.lastRun,
    runs: state.runs.slice(0, 10),
  });
}
