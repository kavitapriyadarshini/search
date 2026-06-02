import Anthropic from "@anthropic-ai/sdk";

import {
  CANDIDATE_PROFILE,
  CLAUDE_MODEL,
  SCORE_THRESHOLD,
} from "./config";
import type { JobListing, ScoreCriteria, ScoredJob } from "./types";

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set in .env.local");
  }
  return new Anthropic({ apiKey });
}

interface ClaudeScoreResponse {
  totalScore: number;
  matchReason: string;
  criteria: ScoreCriteria;
}

function parseScoreResponse(text: string): ClaudeScoreResponse {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Claude did not return valid JSON for scoring");
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    totalScore?: number;
    matchReason?: string;
    criteria?: Partial<ScoreCriteria>;
  };

  const criteria: ScoreCriteria = {
    domainFit: clampScore(parsed.criteria?.domainFit ?? 0),
    experienceMatch: clampScore(parsed.criteria?.experienceMatch ?? 0),
    pmOwnership: clampScore(parsed.criteria?.pmOwnership ?? 0),
    locationMatch: clampScore(parsed.criteria?.locationMatch ?? 0),
  };

  const totalFromCriteria =
    criteria.domainFit +
    criteria.experienceMatch +
    criteria.pmOwnership +
    criteria.locationMatch;

  const totalScore = clampScore(parsed.totalScore ?? totalFromCriteria);

  return {
    totalScore,
    matchReason: (parsed.matchReason ?? "No reason provided").slice(0, 200),
    criteria,
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(25, Math.round(value)));
}

export async function scoreJob(job: JobListing): Promise<ScoredJob> {
  const client = getAnthropicClient();

  const prompt = `You are scoring a job listing for a candidate. Return ONLY valid JSON, no markdown.

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

  const message = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Empty response from Claude");
  }

  const { totalScore, matchReason, criteria } = parseScoreResponse(
    textBlock.text,
  );

  return {
    ...job,
    score: totalScore,
    matchReason,
    criteria,
  };
}

export async function scoreJobs(jobs: JobListing[]): Promise<ScoredJob[]> {
  const scored: ScoredJob[] = [];
  for (const job of jobs) {
    scored.push(await scoreJob(job));
  }
  return scored;
}

export function passesScoreThreshold(job: ScoredJob): boolean {
  return job.score >= SCORE_THRESHOLD;
}
