import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

import { runPipeline } from "../src/lib/pipeline";

async function main() {
  console.log("[pipeline] Starting run…");
  const run = await runPipeline();
  console.log(
    `[pipeline] Done — found=${run.found} filtered=${run.hardFiltered} shortlisted=${run.shortlisted} notion=${run.notionAdded}`,
  );
}

main().catch((error) => {
  console.error("[pipeline] Failed:", error);
  process.exit(1);
});
