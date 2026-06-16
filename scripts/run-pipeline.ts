import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

import { formatStepError, runPipeline } from "../src/lib/pipeline";

const testMode = process.argv.includes("--test");

async function main() {
  console.log(
    testMode
      ? "[pipeline] Starting TEST run (mock jobs, no Apify)…"
      : "[pipeline] Starting run…",
  );
  const run = await runPipeline({ testMode });

  if (run.status === "failed") {
    console.error(
      "[pipeline] Failed:",
      formatStepError(run.stepError) || run.error,
    );
    if (run.scrapeLogs?.length) {
      for (const log of run.scrapeLogs) {
        console.error(
          `  [${log.source}/${log.label}] HTTP ${log.statusCode} — ${log.error ?? "ok"} (raw=${log.rawItemCount})`,
        );
      }
    }
    process.exit(1);
  }

  console.log(
    `[pipeline] Done — found=${run.found} filtered=${run.hardFiltered} shortlisted=${run.shortlisted} notion=${run.notionAdded}`,
  );
}

main().catch((error) => {
  console.error("[pipeline] Failed:", error);
  process.exit(1);
});
