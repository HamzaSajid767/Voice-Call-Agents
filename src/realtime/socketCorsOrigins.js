/**
 * Resolve allowed Socket.IO CORS origins from env (aligned with Express CORS behavior).
 * @returns {string[]|true} `true` when any origin is allowed in dev-style setups
 */
function normalizeOrigin(value) {
  const s = value?.trim();
  if (!s) return '';
  try {
    return new URL(s).origin;
  } catch {
    return s.replace(/\/+$/, '');
  }
}

const EXTRA_SOCKET_ORIGINS = ['https://septsol.com'].map(normalizeOrigin).filter(Boolean);

export function resolveSocketCorsOrigin() {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw || raw === '*') {
    return true;
  }
  const list = [
    ...new Set(
      [
        ...raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => {
            try {
              return new URL(s).origin;
            } catch {
              return s.replace(/\/+$/, '');
            }
          }),
        ...EXTRA_SOCKET_ORIGINS,
      ],
    ),
  ];
  return list.length ? list : true;
}
