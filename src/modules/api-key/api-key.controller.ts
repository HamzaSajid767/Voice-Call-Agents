import type { Request, Response } from 'express';
import type { ApiKeyService } from './api-key.service.js';

export class ApiKeyController {
  public constructor(private readonly apiKeyService: ApiKeyService) {}

  public list = async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.auth?.tenantId;
    if (!tenantId || req.auth?.type !== 'jwt') {
      res.status(401).json({ error: { code: 'AUTH_ERROR', message: 'Unauthorized' } });
      return;
    }
    const items = await this.apiKeyService.list(tenantId);
    res.status(200).json({ data: { apiKeys: items } });
  };

  public create = async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.auth?.tenantId;
    if (!tenantId || req.auth?.type !== 'jwt') {
      res.status(401).json({ error: { code: 'AUTH_ERROR', message: 'Unauthorized' } });
      return;
    }
    const out = await this.apiKeyService.create(tenantId, req.body.name);
    res.status(201).json({
      data: {
        id: out.id,
        name: out.name,
        keyPrefix: out.keyPrefix,
        rawKey: out.rawKey,
        createdAt: out.createdAt,
        warning: 'Store this key securely; it will not be shown again'
      }
    });
  };
}
