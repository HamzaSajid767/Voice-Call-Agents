import cors from 'cors';

/** Match browser `Origin` (scheme + host + port, no path). Fixes env entries like `https://site.com/`. */
function normalizeOrigin(value) {
  const s = value?.trim();
  if (!s) return '';
  try {
    return new URL(s).origin;
  } catch {
    return s.replace(/\/+$/, '');
  }
}

const rawCors = process.env.CORS_ORIGIN?.trim();
/** No env, empty, or literal * → reflect request origin (works with credentials). */
const allowAnyOrigin = !rawCors || rawCors === '*';
/**
 * Always allow these even when CORS_ORIGIN is a strict list:
 * - SeptSol marketing POST /api/form-submissions
 * - Admin app alternate hosts (see admin/vite.config.ts preview.allowedHosts) so www / legacy domains match the API
 */
const extraAllowedOrigins = [
  'https://septsol.com',
  'https://www.septsol.com',
  'https://www.admin.leadsgetter.com',
  'https://admin-leadsgetter.com',
  'https://www.admin-leadsgetter.com',
  'https://leadsgetter.com',
  'https://www.leadsgetter.com',
]
  .map((o) => normalizeOrigin(o))
  .filter(Boolean);
const allowedList = allowAnyOrigin
  ? null
  : [...new Set([...rawCors.split(',').map((o) => normalizeOrigin(o)).filter(Boolean), ...extraAllowedOrigins])];

function isLocalDevOrigin(origin) {
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const u = new URL(origin);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  } catch {
    return false;
  }
}

function originAllowed(origin) {
  if (!origin) return true;
  if (allowAnyOrigin) return true;
  if (allowedList && allowedList.includes(normalizeOrigin(origin))) return true;
  if (isLocalDevOrigin(origin)) return true;
  return false;
}

const corsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (originAllowed(origin)) {
      callback(null, true);
      return;
    }
    // Never pass Error here — that invokes next(err) and becomes HTTP 500.
    callback(null, false);
  },
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  /**
   * Omit allowedHeaders so `cors` mirrors Access-Control-Request-Headers from the
   * browser preflight. A fixed list breaks when the client sends extra headers
   * (Idempotency-Key, Sentry, custom headers, etc.).
   */
  optionsSuccessStatus: 204,
};

const corsMiddleware = cors(corsOptions);
export default corsMiddleware;
