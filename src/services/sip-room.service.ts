import { ValidationError } from '../lib/errors.js';

// Room naming contract for SIP/LiveKit routing.
// Format: tenantId-callId (deterministic; same callId => same room)
export const buildSipRoomName = (params: { tenantId: string; callId: string }): string => {
  const tenantId = String(params.tenantId ?? '').trim();
  const callId = String(params.callId ?? '').trim();
  if (!tenantId || !callId) {
    throw new ValidationError('Invalid room mapping input');
  }
  return `${tenantId}-${callId}`;
};

export const isSipRoomName = (roomName: string): boolean => {
  const s = String(roomName ?? '').trim();
  // tenant ids and call ids are UUIDs in this system; keep it permissive but deterministic.
  return Boolean(s) && s.includes('-') && !s.startsWith('call_');
};

export const validateSipTrunkConfig = (params: { livekitSipDomain?: string }): { sipDomain: string } => {
  const sipDomain = String(params.livekitSipDomain ?? '').trim();
  if (!sipDomain) {
    throw new ValidationError('LIVEKIT_SIP_DOMAIN is required for SIP routing');
  }
  // Very light validation (avoid slow parsing and keep hot-path fast).
  if (sipDomain.includes(' ') || sipDomain.includes('/')) {
    throw new ValidationError('Invalid LIVEKIT_SIP_DOMAIN');
  }
  return { sipDomain };
};

