#!/usr/bin/env bash
# Installs a cron job to run the pipeline daily at 8:00 AM IST (02:30 UTC).
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRON_LINE="30 2 * * * cd ${PROJECT_DIR} && /usr/bin/env npm run pipeline >> ${PROJECT_DIR}/data/cron.log 2>&1"

mkdir -p "${PROJECT_DIR}/data"

if crontab -l 2>/dev/null | grep -Fq "npm run pipeline"; then
  echo "Cron entry already exists."
else
  (crontab -l 2>/dev/null; echo "${CRON_LINE}") | crontab -
  echo "Installed cron: daily 8:00 AM IST"
fi

echo ""
echo "Current crontab:"
crontab -l
