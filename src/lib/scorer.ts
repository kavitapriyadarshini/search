import Groq from "groq-sdk";

import {
  CANDIDATE_PROFILE,
  GROQ_MODEL,
  SCORE_THRESHOLD,
} from "./config";
import type { JobListing, ScoreCriteria, ScoredJob } from "./types";

const SCORE_DELAY_MS = 3_000;
const RETRY_DELAY_MS = 20_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set in .env.local");
  }
  return new Groq({ apiKey });
}

function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests")
  );
}

interface ScoreResponse {
  totalScore: number;
  matchReason: string;
  criteria: ScoreCriteria;
}

function parseScoreResponse(text: string): ScoreResponse {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Groq did not return valid JSON for scoring");
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    totalScore?: number;
    matchReason?: string;
    criteria?: Partial<ScoreCriteria>;
  };

  const criteria: ScoreCriteria = {
    domainFit: clampCriteria(parsed.criteria?.domainFit ?? 0),
    experienceMatch: clampCriteria(parsed.criteria?.experienceMatch ?? 0),
    pmOwnership: clampCriteria(parsed.criteria?.pmOwnership ?? 0),
    locationMatch: clampCriteria(parsed.criteria?.locationMatch ?? 0),
  };

  const totalFromCriteria =
    criteria.domainFit +
    criteria.experienceMatch +
    criteria.pmOwnership +
    criteria.locationMatch;

  const totalScore = clampTotal(parsed.totalScore ?? totalFromCriteria);

  return {
    totalScore,
    matchReason: (parsed.matchReason ?? "No reason provided").slice(0, 200),
    criteria,
  };
}

function clampCriteria(value: number): number {
  return Math.max(0, Math.min(25, Math.round(value)));
}

function clampTotal(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildScoringPrompt(job: JobListing): string {
  return `You are scoring a job listing for a candidate. Return ONLY valid JSON, no markdown.

Candidate profile:
${CANDIDATE_PROFILE}

Job:
- Title: ${job.title}
- Company: ${job.company}
- Location: ${job.location}
- Source: ${job.source}
- Description (excerpt): ${job.description.slice(0, 4000)}

Score on 4 criteria (0-25 points each, integers only):
1. domainFit — Fintech/AI domain fit
2. experienceMatch — Experience level match (3-6 years preferred)
3. pmOwnership — Real PM ownership (penalize sales/growth/intern traps)
4. locationMatch — Bengaluru or Remote

Respond with this exact JSON shape:
{
  "totalScore": <0-100>,
  "matchReason": "<one line explaining the score>",
  "criteria": {
    "domainFit": <0-25>,
    "experienceMatch": <0-25>,
    "pmOwnership": <0-25>,
    "locationMatch": <0-25>
  }
}`;
}

export async function scoreJob(job: JobListing): Promise<ScoredJob> {
  const client = getGroqClient();

  const completion = await client.chat.completions.create({
    model: GROQ_MODEL,
    messages: [{ role: "user", content: buildScoringPrompt(job) }],
    max_tokens: 512,
    temperature: 0.2,
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) {
    throw new Error("Empty response from Groq");
  }

  const { totalScore, matchReason, criteria } = parseScoreResponse(text);

  return {
    ...job,
    score: totalScore,
    matchReason,
    criteria,
  };
}

async function scoreJobWithRetry(job: JobListing): Promise<ScoredJob> {
  try {
    return await scoreJob(job);
  } catch (error) {
    if (!isRateLimitError(error)) throw error;
    console.warn(
      `[scorer] 429 rate limit for "${job.title}", retrying in ${RETRY_DELAY_MS / 1000}s`,
    );
    await sleep(RETRY_DELAY_MS);
    return await scoreJob(job);
  }
}

export interface ScoreJobsHooks {
  onStart?: () => void;
  onProgress?: (current: number, total: number) => void | Promise<void>;
  onDone?: () => void;
}

export async function scoreJobs(
  jobs: JobListing[],
  hooks?: ScoreJobsHooks,
): Promise<ScoredJob[]> {
  hooks?.onStart?.();

  const scored: ScoredJob[] = [];
  const total = jobs.length;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    try {
      const result = await scoreJobWithRetry(job);
      scored.push(result);
    } catch (error) {
      console.error(
        `[scorer] Failed to score "${job.title}":`,
        error instanceof Error ? error.message : error,
      );
    }

    await hooks?.onProgress?.(i + 1, total);

    if (i < jobs.length - 1) {
      await sleep(SCORE_DELAY_MS);
    }
  }

  hooks?.onDone?.();
  return scored;
}

export function passesScoreThreshold(job: ScoredJob): boolean {
  return job.score >= SCORE_THRESHOLD;
}
