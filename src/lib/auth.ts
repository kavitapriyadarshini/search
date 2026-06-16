/** Vercel Cron sends GET with Authorization: Bearer <CRON_SECRET>. */
export function isAuthorizedVercelCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/** Optional protection for manual POST runs from the dashboard. */
export function isAuthorizedManualRun(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const headerSecret = request.headers.get("x-cron-secret");
  return headerSecret === secret;
}
