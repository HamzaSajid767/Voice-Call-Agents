import { prisma } from '../../lib/prisma.js';
import { BaseService } from '../../services/base.service.js';

export type PricingConfig = {
  CALL_MINUTE_RATE: number;
  LLM_INPUT_TOKEN_RATE: number;
  LLM_OUTPUT_TOKEN_RATE: number;
  VECTOR_SEARCH_RATE: number;
  VECTOR_UPSERT_RATE: number;
};

const defaultPricing: PricingConfig = {
  CALL_MINUTE_RATE: 0.02,
  LLM_INPUT_TOKEN_RATE: 0.000001,
  LLM_OUTPUT_TOKEN_RATE: 0.000002,
  VECTOR_SEARCH_RATE: 0.0001,
  VECTOR_UPSERT_RATE: 0.0001
};

export class CostCalculatorService extends BaseService {
  public getPricingForTenant = (tenantId: string): Promise<PricingConfig> => {
    return this.execute('pricing.get', async () => {
      const tenant = await prisma.tenant.findFirst({
        where: { id: tenantId, deletedAt: null },
        select: { settings: true }
      });
      const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
      const pricing = (settings['pricing'] ?? {}) as Record<string, unknown>;

      const pick = (k: keyof PricingConfig) =>
        typeof pricing[k] === 'number' && Number.isFinite(pricing[k] as number) ? (pricing[k] as number) : defaultPricing[k];

      return {
        CALL_MINUTE_RATE: pick('CALL_MINUTE_RATE'),
        LLM_INPUT_TOKEN_RATE: pick('LLM_INPUT_TOKEN_RATE'),
        LLM_OUTPUT_TOKEN_RATE: pick('LLM_OUTPUT_TOKEN_RATE'),
        VECTOR_SEARCH_RATE: pick('VECTOR_SEARCH_RATE'),
        VECTOR_UPSERT_RATE: pick('VECTOR_UPSERT_RATE')
      };
    });
  };

  public calculateCost = (params: {
    pricing: PricingConfig;
    type: 'CALL_MINUTES' | 'LLM_TOKENS_INPUT' | 'LLM_TOKENS_OUTPUT' | 'VECTOR_SEARCHES' | 'VECTOR_UPSERTS';
    quantity: number;
  }): { unitPrice: number; totalCost: number; unit: string } => {
    const q = Math.max(0, params.quantity);
    switch (params.type) {
      case 'CALL_MINUTES':
        return { unitPrice: params.pricing.CALL_MINUTE_RATE, totalCost: q * params.pricing.CALL_MINUTE_RATE, unit: 'minute' };
      case 'LLM_TOKENS_INPUT':
        return { unitPrice: params.pricing.LLM_INPUT_TOKEN_RATE, totalCost: q * params.pricing.LLM_INPUT_TOKEN_RATE, unit: 'token' };
      case 'LLM_TOKENS_OUTPUT':
        return { unitPrice: params.pricing.LLM_OUTPUT_TOKEN_RATE, totalCost: q * params.pricing.LLM_OUTPUT_TOKEN_RATE, unit: 'token' };
      case 'VECTOR_SEARCHES':
        return { unitPrice: params.pricing.VECTOR_SEARCH_RATE, totalCost: q * params.pricing.VECTOR_SEARCH_RATE, unit: 'op' };
      case 'VECTOR_UPSERTS':
        return { unitPrice: params.pricing.VECTOR_UPSERT_RATE, totalCost: q * params.pricing.VECTOR_UPSERT_RATE, unit: 'op' };
      default:
        return { unitPrice: 0, totalCost: 0, unit: 'unit' };
    }
  };
}

