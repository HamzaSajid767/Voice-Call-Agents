import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { BaseService } from '../../services/base.service.js';
import { CostCalculatorService } from './cost-calculator.service.js';

type UsageMeterType = 'CALL_MINUTES' | 'LLM_TOKENS_INPUT' | 'LLM_TOKENS_OUTPUT' | 'VECTOR_SEARCHES' | 'VECTOR_UPSERTS';

const mapUsageType = (t: UsageMeterType): 'CALL_MINUTE' | 'LLM_TOKEN' => {
  // Current schema has a coarse enum. We store the fine-grained type in metadata.
  if (t === 'CALL_MINUTES') {
    return 'CALL_MINUTE';
  }
  return 'LLM_TOKEN';
};

export class UsageService extends BaseService {
  public constructor(private readonly costCalculator: CostCalculatorService) {
    super();
  }

  public recordUsage = (params: {
    tenantId: string;
    callSessionId?: string;
    agentId?: string;
    type: UsageMeterType;
    quantity: number;
    metadata?: Record<string, string | number | boolean>;
    occurredAt?: Date;
  }): Promise<void> => {
    return this.execute('usage.record', async () => {
      const pricing = await this.costCalculator.getPricingForTenant(params.tenantId);
      const cost = this.costCalculator.calculateCost({ pricing, type: params.type, quantity: params.quantity });

      await prisma.usageRecord.create({
        data: {
          tenantId: params.tenantId,
          callSessionId: params.callSessionId ?? null,
          usageType: mapUsageType(params.type),
          quantity: new Prisma.Decimal(params.quantity),
          unit: cost.unit,
          unitPrice: new Prisma.Decimal(cost.unitPrice),
          totalCost: new Prisma.Decimal(cost.totalCost),
          occurredAt: params.occurredAt ?? new Date(),
          metadata: {
            type: params.type,
            ...(params.agentId ? { agentId: params.agentId } : {}),
            ...(params.metadata ?? {})
          } as Prisma.InputJsonValue
        }
      });
    });
  };
}

