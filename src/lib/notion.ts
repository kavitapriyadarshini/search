import type { ScoredJob } from "./types";

const NOTION_VERSION = "2022-06-28";

function notionHeaders(): HeadersInit {
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    throw new Error("NOTION_API_KEY is not set in .env.local");
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

function getDatabaseId(): string {
  const id = process.env.NOTION_DATABASE_ID;
  if (!id) {
    throw new Error("NOTION_DATABASE_ID is not set in .env.local");
  }
  return id;
}

async function queryExistingJobUrls(): Promise<Set<string>> {
  const databaseId = getDatabaseId();
  const urls = new Set<string>();
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const response = await fetch(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      {
        method: "POST",
        headers: notionHeaders(),
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Notion query failed (${response.status}): ${err}`);
    }

    const data = (await response.json()) as {
      results: Array<{
        properties?: {
          "JD Link"?: { url?: string | null };
        };
      }>;
      has_more: boolean;
      next_cursor: string | null;
    };

    for (const page of data.results) {
      const url = page.properties?.["JD Link"]?.url;
      if (url) urls.add(url.toLowerCase().replace(/\/$/, ""));
    }

    cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return urls;
}

export async function addJobToNotion(job: ScoredJob): Promise<void> {
  const databaseId = getDatabaseId();
  const today = new Date().toISOString().slice(0, 10);

  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: notionHeaders(),
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: {
        "Role Title": {
          title: [{ text: { content: job.title.slice(0, 2000) } }],
        },
        Company: {
          rich_text: [{ text: { content: job.company.slice(0, 2000) } }],
        },
        Score: {
          number: job.score,
        },
        "Match reason": {
          rich_text: [{ text: { content: job.matchReason.slice(0, 2000) } }],
        },
        "JD Link": {
          url: job.url,
        },
        "Date Found": {
          date: { start: today },
        },
        Status: {
          select: { name: "To Apply" },
        },
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Notion create page failed (${response.status}): ${err}`);
  }
}

export async function syncShortlistedToNotion(
  jobs: ScoredJob[],
): Promise<number> {
  const existing = await queryExistingJobUrls();
  let added = 0;

  for (const job of jobs) {
    const key = job.url.toLowerCase().replace(/\/$/, "");
    if (existing.has(key)) continue;

    await addJobToNotion(job);
    existing.add(key);
    added += 1;
  }

  return added;
}
