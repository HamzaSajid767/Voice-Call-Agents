/**
 * Central payment mode flags (see .env).
 * ENABLE_MOCK_PAYMENT=true disables real provider APIs and uses mock checkout + verify.
 * PAYMENT_TESTING=true is accepted as an alias for ENABLE_MOCK_PAYMENT during transition.
 */

function parseBool(v) {
  if (v === undefined || v === null || v === '') return false;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

export function isMockPaymentEnabled() {
  return (
    parseBool(process.env.ENABLE_MOCK_PAYMENT) || parseBool(process.env.PAYMENT_TESTING)
  );
}

/** When mock verify runs: 'success' | 'failure' */
export function getMockPaymentVerifyOutcome() {
  const raw = String(process.env.MOCK_PAYMENT_VERIFY_RESULT || 'success')
    .trim()
    .toLowerCase();
  return raw === 'failure' ? 'failure' : 'success';
}

export function mockPaymentVerifySucceeds() {
  return getMockPaymentVerifyOutcome() !== 'failure';
}

/** If true, admin revenue / paid-order KPIs exclude orders settled only via mock payments. */
export function excludeMockFromRevenueStats() {
  return parseBool(process.env.MOCK_EXCLUDE_FROM_REVENUE_STATS);
}
