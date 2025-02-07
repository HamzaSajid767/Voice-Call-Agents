/**
 * Rate limit settings from process.env (see backend/.env).
 * Invalid or missing values use defaults matching the previous hard-coded limits.
 */

function readWindowMs(envKey, defaultMinutes) {
  const defaultMs = defaultMinutes * 60 * 1000;
  const raw = process.env[envKey];
  if (raw === undefined || raw === '') return defaultMs;
  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) return defaultMs;
  return Math.floor(minutes * 60 * 1000);
}

function readMax(envKey, defaultValue) {
  const raw = process.env[envKey];
  if (raw === undefined || raw === '') return defaultValue;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return defaultValue;
  return n;
}

/** Applied to all /api routes (except paths skipped in app.js). */
export const globalApiRateLimit = {
  windowMs: readWindowMs('RATE_LIMIT_GLOBAL_WINDOW_MINUTES', 15),
  max: readMax('RATE_LIMIT_GLOBAL_MAX', 100),
};

/** Chrome extension POST /api/licenses/validate-license */
export const extensionValidateRateLimit = {
  windowMs: readWindowMs('RATE_LIMIT_EXTENSION_VALIDATE_WINDOW_MINUTES', 15),
  max: readMax('RATE_LIMIT_EXTENSION_VALIDATE_MAX', 40),
};

/** Chrome extension POST /api/licenses/scrape-consume */
export const extensionScrapeConsumeRateLimit = {
  windowMs: readWindowMs('RATE_LIMIT_EXTENSION_SCRAPE_CONSUME_WINDOW_MINUTES', 15),
  max: readMax('RATE_LIMIT_EXTENSION_SCRAPE_CONSUME_MAX', 4000),
};
