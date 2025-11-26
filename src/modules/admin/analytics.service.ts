import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { BaseService } from '../../services/base.service.js';
import { ValidationError } from '../../lib/errors.js';

export class AnalyticsService extends BaseService {
  public overview = (): Promise<any> => {
    return this.execute('analytics.overview', async () => {
      const [tenants, users, calls, cost] = await Promise.all([
        prisma.tenant.count({ where: { deletedAt: null } }),
        prisma.user.count({ where: { deletedAt: null } }),
        prisma.callSession.count({ where: { deletedAt: null } }),
        prisma.usageRecord.aggregate({ _sum: { totalCost: true } })
      ]);

      const avgDuration = await prisma.callSession.aggregate({
        where: { deletedAt: null },
        _avg: { durationSeconds: true }
      });

      return {
        totals: {
          tenants,
          users,
          calls,
          totalCost: String(cost._sum.totalCost ?? 0)
        },
        avgCallDurationSeconds: Number(avgDuration._avg.durationSeconds ?? 0)
      };
    });
  };

  public tenantStats = (tenantId: string): Promise<any> => {
    return this.execute('analytics.tenant', async () => {
      const [calls, cost] = await Promise.all([
        prisma.callSession.count({ where: { tenantId, deletedAt: null } }),
        prisma.usageRecord.aggregate({ where: { tenantId }, _sum: { totalCost: true } })
      ]);
      return {
        tenantId,
        calls,
        totalCost: String(cost._sum.totalCost ?? 0)
      };
    });
  };

  public trends = (params: { tenantId?: string; from: Date; to: Date; interval: 'day' | 'hour' }): Promise<any> => {
    return this.execute('analytics.trends', async () => {
      const maxRangeMs = 90 * 24 * 60 * 60 * 1000;
      if (params.to.getTime() - params.from.getTime() > maxRangeMs) {
        throw new ValidationError('Range too large (max 90 days)');
      }
      if (params.from >= params.to) {
        throw new ValidationError('Invalid range');
      }

      const bucket = params.interval; // date_trunc takes text arg; safe.
      const tenantWhereCalls = params.tenantId ? Prisma.sql`AND c.tenant_id = ${params.tenantId}::uuid` : Prisma.empty;
      const tenantWhereUsage = params.tenantId ? Prisma.sql`AND u.tenant_id = ${params.tenantId}::uuid` : Prisma.empty;

      const callsRows = await prisma.$queryRaw<Array<{ time: Date; count: bigint }>>(Prisma.sql`
        SELECT
          date_trunc(${bucket}, c.created_at) AS time,
          COUNT(*)::bigint AS count
        FROM call_sessions c
        WHERE c.deleted_at IS NULL
          AND c.created_at >= ${params.from}
          AND c.created_at <= ${params.to}
          ${tenantWhereCalls}
        GROUP BY 1
        ORDER BY 1 ASC
      `);

      const costRows = await prisma.$queryRaw<Array<{ time: Date; amount: string }>>(Prisma.sql`
        SELECT
          date_trunc(${bucket}, u.occurred_at) AS time,
          COALESCE(SUM(u.total_cost), 0)::text AS amount
        FROM usage_records u
        WHERE u.occurred_at >= ${params.from}
          AND u.occurred_at <= ${params.to}
          ${tenantWhereUsage}
        GROUP BY 1
        ORDER BY 1 ASC
      `);

      const tokensRows = await prisma.$queryRaw<Array<{ time: Date; input: string; output: string }>>(Prisma.sql`
        SELECT
          date_trunc(${bucket}, u.occurred_at) AS time,
          COALESCE(SUM(u.quantity) FILTER (WHERE (u.metadata->>'type') = 'LLM_TOKENS_INPUT'), 0)::text AS input,
          COALESCE(SUM(u.quantity) FILTER (WHERE (u.metadata->>'type') = 'LLM_TOKENS_OUTPUT'), 0)::text AS output
        FROM usage_records u
        WHERE u.occurred_at >= ${params.from}
          AND u.occurred_at <= ${params.to}
          ${tenantWhereUsage}
        GROUP BY 1
        ORDER BY 1 ASC
      `);

      return {
        calls: callsRows.map((r) => ({ time: r.time.toISOString(), count: Number(r.count) })),
        cost: costRows.map((r) => ({ time: r.time.toISOString(), amount: Number(r.amount) })),
        tokens: tokensRows.map((r) => ({ time: r.time.toISOString(), input: Number(r.input), output: Number(r.output) }))
      };
    });
  };
}

