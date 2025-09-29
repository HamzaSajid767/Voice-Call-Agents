import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { BaseService } from '../../services/base.service.js';
import { NotFoundError } from '../../lib/errors.js';

export class AgentService extends BaseService {
  public listAgents = (tenantId: string, params: { page: number; pageSize: number }): Promise<{ data: any[]; total: number; page: number; pageSize: number }> => {
    return this.execute('agent.list', async () => {
      const skip = (params.page - 1) * params.pageSize;
      const where: Prisma.AgentWhereInput = { tenantId, deletedAt: null, status: 'ACTIVE' };
      const [rows, total] = await Promise.all([
        prisma.agent.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: params.pageSize,
          skip,
          select: { id: true, name: true, systemPrompt: true, temperature: true, voiceConfig: true, createdAt: true, updatedAt: true }
        }),
        prisma.agent.count({ where })
      ]);
      return { data: rows, total, page: params.page, pageSize: params.pageSize };
    });
  };

  public patchAgent = (
    tenantId: string,
    agentId: string,
    patch: { systemPrompt?: string; voiceConfig?: Record<string, unknown>; temperature?: number }
  ): Promise<any> => {
    return this.execute('agent.patch', async () => {
      const existing = await prisma.agent.findFirst({ where: { id: agentId, tenantId, deletedAt: null } });
      if (!existing) {
        throw new NotFoundError('Agent not found');
      }
      const updated = await prisma.agent.update({
        where: { id: agentId },
        data: {
          ...(patch.systemPrompt ? { systemPrompt: patch.systemPrompt } : {}),
          ...(patch.voiceConfig ? { voiceConfig: patch.voiceConfig as Prisma.InputJsonValue } : {}),
          ...(patch.temperature !== undefined ? { temperature: new Prisma.Decimal(patch.temperature) } : {})
        },
        select: { id: true, name: true, systemPrompt: true, temperature: true, voiceConfig: true, updatedAt: true }
      });
      return updated;
    });
  };
}

