import { NextResponse } from "next/server";

import { getTodayScrapedJobs, getTodayShortlisted, readPipelineState } from "@/lib/storage";

export async function GET() {
  const state = await readPipelineState();
  const jobs = getTodayShortlisted(state);
  const scraped = getTodayScrapedJobs(state);
  return NextResponse.json({ jobs, scraped });
}
