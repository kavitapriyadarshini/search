import type { ScoredJob } from "./types";

const NOTION_VERSION = "2022-06-28";
const NOTION_PAGES_URL = "https://api.notion.com/v1/pages";

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

/**
 * Normalize NOTION_DATABASE_ID for API use:
 * - Accept raw 32-char hex, hyphenated UUID, or full Notion URL
 * - Return lowercase hex WITHOUT hyphens (required by Notion API)
 */
export function normalizeNotionDatabaseId(raw: string): string {
  let id = raw.trim();

  if (id.includes("notion.so")) {
    const fromUrl = id.match(/([0-9a-f]{32})/i);
    if (fromUrl) {
      id = fromUrl[1];
    }
  }

  id = id.replace(/-/g, "").toLowerCase();

  if (!/^[0-9a-f]{32}$/.test(id)) {
    throw new Error(
      `Invalid NOTION_DATABASE_ID "${raw}". Use the 32-character database ID only (no URL, no hyphens). Example: 3738ce4e0945807c8899ebb37b90aaf1`,
    );
  }

  return id;
}

function getDatabaseId(): string {
  const id = process.env.NOTION_DATABASE_ID;
  if (!id) {
    throw new Error("NOTION_DATABASE_ID is not set in .env.local");
  }
  return normalizeNotionDatabaseId(id);
}

function formatNotionError(
  action: string,
  status: number,
  body: string,
): string {
  const hint =
    status === 400 || body.includes("invalid_request_url")
      ? " Ensure NOTION_DATABASE_ID is the 32-char ID (not a URL) and that your Notion integration is connected to the database (⋯ → Connections)."
      : "";
  return `Notion ${action} failed (${status}): ${body}${hint}`;
}

async function queryExistingJobUrls(): Promise<Set<string>> {
  const databaseId = getDatabaseId();
  const queryUrl = `https://api.notion.com/v1/databases/${databaseId}/query`;
  const urls = new Set<string>();
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    console.log(`[notion] POST ${queryUrl}`);
    const response = await fetch(queryUrl, {
      method: "POST",
      headers: notionHeaders(),
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(formatNotionError("query", response.status, responseText));
    }

    const data = JSON.parse(responseText) as {
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

  console.log(
    `[notion] POST ${NOTION_PAGES_URL} (parent database_id=${databaseId})`,
  );

  const response = await fetch(NOTION_PAGES_URL, {
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
        "Match Reason": {
          rich_text: [{ text: { content: job.matchReason.slice(0, 2000) } }],
        },
        "JD Link": {
          url: job.url,
        },
        "Apply Link": {
          url: job.url,
        },
        "Date Found": {
          date: { start: today },
        },
        Status: {
          status: { name: "To Apply" },
        },
      },
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      formatNotionError("create page", response.status, responseText),
    );
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
