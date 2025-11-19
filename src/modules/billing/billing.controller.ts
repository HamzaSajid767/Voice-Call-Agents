import type { Request, Response } from 'express';
import type { BillingService } from './billing.service.js';

export class BillingController {
  public constructor(private readonly billing: BillingService) {}

  public getSummary = async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: { code: 'AUTH_ERROR', message: 'Unauthorized' } });
      return;
    }

    const summary = await this.billing.getTenantCostSummary(tenantId);
    res.status(200).json({ data: { summary } });
  };
}

