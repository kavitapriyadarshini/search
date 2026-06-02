import { NextResponse } from "next/server";

import { getTodayShortlisted, readPipelineState } from "@/lib/storage";

export async function GET() {
  const state = await readPipelineState();
  const jobs = getTodayShortlisted(state);
  return NextResponse.json({ jobs });
}
