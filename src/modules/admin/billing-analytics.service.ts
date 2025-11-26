import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { BaseService } from '../../services/base.service.js';
import { ValidationError } from '../../lib/errors.js';

export type BillingBreakdown = {
  CALL_MINUTES: number;
  LLM_TOKENS_INPUT: number;
  LLM_TOKENS_OUTPUT: number;
  VECTOR_SEARCHES: number;
  VECTOR_UPSERTS: number;
};

const TYPES: Array<keyof BillingBreakdown> = [
  'CALL_MINUTES',
  'LLM_TOKENS_INPUT',
  'LLM_TOKENS_OUTPUT',
  'VECTOR_SEARCHES',
  'VECTOR_UPSERTS'
];

export class BillingAnalyticsService extends BaseService {
  public breakdown = (params: { tenantId?: string; from?: Date; to?: Date }): Promise<BillingBreakdown> => {
    return this.execute('billing.breakdown', async () => {
      if ((params.from && !params.to) || (!params.from && params.to)) {
        throw new ValidationError('from and to must be provided together');
      }
      if (params.from && params.to) {
        const maxRangeMs = 90 * 24 * 60 * 60 * 1000;
        if (params.to.getTime() - params.from.getTime() > maxRangeMs) {
          throw new ValidationError('Range too large (max 90 days)');
        }
        if (params.from >= params.to) {
          throw new ValidationError('Invalid range');
        }
      }

      const whereTenant = params.tenantId ? Prisma.sql`AND u.tenant_id = ${params.tenantId}::uuid` : Prisma.empty;
      const whereRange =
        params.from && params.to
          ? Prisma.sql`AND u.occurred_at >= ${params.from} AND u.occurred_at <= ${params.to}`
          : Prisma.empty;

      const rows = await prisma.$queryRaw<Array<{ type: string; quantity: string }>>(Prisma.sql`
        SELECT
          (u.metadata->>'type') AS type,
          COALESCE(SUM(u.quantity), 0)::text AS quantity
        FROM usage_records u
        WHERE (u.metadata->>'type') IN (${Prisma.join(TYPES)})
          ${whereTenant}
          ${whereRange}
        GROUP BY 1
      `);

      const out: BillingBreakdown = {
        CALL_MINUTES: 0,
        LLM_TOKENS_INPUT: 0,
        LLM_TOKENS_OUTPUT: 0,
        VECTOR_SEARCHES: 0,
        VECTOR_UPSERTS: 0
      };

      for (const r of rows) {
        const k = r.type as keyof BillingBreakdown;
        if (k in out) {
          out[k] = Number(r.quantity);
        }
      }
      return out;
    });
  };
}

