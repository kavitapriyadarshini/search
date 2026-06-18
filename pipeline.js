#!/usr/bin/env node
"use strict";

const path = require("path");
const { spawnSync } = require("child_process");
const { config } = require("dotenv");

config({ path: path.resolve(__dirname, ".env.local") });

const required = [
  "APIFY_API_KEY",
  "GROQ_API_KEY",
  "NOTION_API_KEY",
  "NOTION_DATABASE_ID",
];

const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length > 0) {
  console.error(
    `[pipeline] FAILED: Missing environment variables: ${missing.join(", ")}`,
  );
  process.exit(1);
}

const result = spawnSync(
  "npx",
  ["tsx", path.join(__dirname, "scripts", "pipeline-standalone.ts")],
  {
    stdio: "inherit",
    env: process.env,
    shell: false,
  },
);

if (result.error) {
  console.error("[pipeline] FAILED:", result.error.message);
  process.exit(1);
}

process.exit(result.status === 0 ? 0 : 1);
