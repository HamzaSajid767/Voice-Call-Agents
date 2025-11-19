import { prisma } from '../../lib/prisma.js';
import { BaseService } from '../../services/base.service.js';

export class UsageAggregatorJob extends BaseService {
  public runForTenant = (params: { tenantId: string; from: Date; to: Date }): Promise<{ byType: Record<string, number>; totalCost: number }> => {
    return this.execute('usage.aggregate', async () => {
      const rows = await prisma.usageRecord.findMany({
        where: { tenantId: params.tenantId, occurredAt: { gte: params.from, lte: params.to } },
        select: { quantity: true, totalCost: true, metadata: true }
      });

      const byType: Record<string, number> = {};
      let totalCost = 0;
      for (const r of rows) {
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        const t = String(meta['type'] ?? 'UNKNOWN');
        byType[t] = (byType[t] ?? 0) + Number(r.quantity);
        totalCost += Number(r.totalCost);
      }

      return { byType, totalCost };
    });
  };
}

