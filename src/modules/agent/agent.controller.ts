import type { Request, Response } from 'express';
import type { AgentService } from './agent.service.js';

export class AgentController {
  public constructor(private readonly agents: AgentService) {}

  public list = async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: { code: 'AUTH_ERROR', message: 'Unauthorized' } });
      return;
    }
    const q = ((req as any).validated?.query ?? req.query) as unknown as { page: number; pageSize: number };
    const out = await this.agents.listAgents(tenantId, { page: q.page, pageSize: q.pageSize });
    res.status(200).json({ data: out });
  };

  public patch = async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: { code: 'AUTH_ERROR', message: 'Unauthorized' } });
      return;
    }
    const body = ((req as any).validated?.body ?? req.body) as unknown as {
      systemPrompt?: string;
      voiceConfig?: Record<string, unknown>;
      temperature?: number;
    };
    const out = await this.agents.patchAgent(tenantId, String(req.params['id']), body);
    res.status(200).json({ data: out });
  };
}

