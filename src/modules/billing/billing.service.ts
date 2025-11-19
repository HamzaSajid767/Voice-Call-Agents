import { prisma } from '../../lib/prisma.js';
import { BaseService } from '../../services/base.service.js';

export class BillingService extends BaseService {
  public getTenantUsage = (params: { tenantId: string; from: Date; to: Date }): Promise<any> => {
    return this.execute('billing.usage', async () => {
      const rows = await prisma.usageRecord.findMany({
        where: { tenantId: params.tenantId, occurredAt: { gte: params.from, lte: params.to } },
        orderBy: { occurredAt: 'asc' }
      });
      return rows;
    });
  };

  public getTenantCostSummary = (
    tenantId: string
  ): Promise<{ totalCost: string; lifetimeTotalCost: string; monthTotalCost: string; month: { year: number; month: number } }> => {
    return this.execute('billing.summary', async () => {
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth() + 1;
      const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
      const to = new Date(Date.UTC(year, month, 0, 23, 59, 59));

      const [lifetime, thisMonth] = await Promise.all([
        prisma.usageRecord.aggregate({
          where: { tenantId },
          _sum: { totalCost: true }
        }),
        prisma.usageRecord.aggregate({
          where: { tenantId, occurredAt: { gte: from, lte: to } },
          _sum: { totalCost: true }
        })
      ]);

      const lifetimeTotalCost = String(lifetime._sum.totalCost ?? 0);
      const monthTotalCost = String(thisMonth._sum.totalCost ?? 0);
      return { totalCost: lifetimeTotalCost, lifetimeTotalCost, monthTotalCost, month: { year, month } };
    });
  };

  public getCallCost = (tenantId: string, callSessionId: string): Promise<{ totalCost: string }> => {
    return this.execute('billing.callCost', async () => {
      const agg = await prisma.usageRecord.aggregate({
        where: { tenantId, callSessionId },
        _sum: { totalCost: true }
      });
      return { totalCost: String(agg._sum.totalCost ?? 0) };
    });
  };

  public getMonthlyBill = (tenantId: string, year: number, month: number): Promise<{ totalCost: string }> => {
    return this.execute('billing.month', async () => {
      const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
      const to = new Date(Date.UTC(year, month, 0, 23, 59, 59));
      const agg = await prisma.usageRecord.aggregate({
        where: { tenantId, occurredAt: { gte: from, lte: to } },
        _sum: { totalCost: true }
      });
      return { totalCost: String(agg._sum.totalCost ?? 0) };
    });
  };
}

