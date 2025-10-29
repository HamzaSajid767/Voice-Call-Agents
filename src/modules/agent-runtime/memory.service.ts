import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { BaseService } from '../../services/base.service.js';
import type { VectorService } from '../../interfaces/vector-service.interface.js';

export class MemoryService extends BaseService {
  public constructor(private readonly vectorService: VectorService) {
    super();
  }

  public async storeCallMessage(params: {
    tenantId: string;
    agentId: string;
    callId: string;
    role: 'user' | 'assistant';
    content: string;
  }): Promise<void> {
    await this.execute('memory.store', async () => {
      await prisma.callEvent.create({
        data: {
          tenantId: params.tenantId,
          callSessionId: params.callId,
          eventType: 'TRANSCRIPT_SEGMENT',
          payload: {
            role: params.role,
            content: params.content,
            agentId: params.agentId
          } as Prisma.InputJsonValue
        }
      });

      await this.vectorService.storeCallMessage({
        tenantId: params.tenantId,
        agentId: params.agentId,
        callId: params.callId,
        role: params.role,
        content: params.content
      });
    });
  }

  public buildContext(params: { tenantId: string; agentId: string; callId: string; query: string }): Promise<string> {
    return this.execute('memory.context', async () => {
      const [vectorHits, recent] = await Promise.all([
        this.vectorService
          .searchRelevantContext({
            tenantId: params.tenantId,
            agentId: params.agentId,
            callId: params.callId,
            query: params.query,
            topK: 3
          })
          .catch(() => []),
        prisma.callEvent.findMany({
          where: {
            tenantId: params.tenantId,
            callSessionId: params.callId,
            eventType: 'TRANSCRIPT_SEGMENT'
          },
          orderBy: { eventTimestamp: 'desc' },
          take: 3
        })
      ]);

      const vector = vectorHits
        .map((h) => {
          const role = String(h.metadata?.role ?? 'unknown');
          const content = String(h.metadata?.content ?? '');
          return content ? `- (${role}) ${content}` : null;
        })
        .filter((x): x is string => Boolean(x))
        .join('\n');

      const shortTerm = recent
        .reverse()
        .map((e) => {
          const p = (e.payload ?? {}) as { role?: string; content?: string };
          return p.role && p.content ? `- (${p.role}) ${p.content}` : null;
        })
        .filter((x): x is string => Boolean(x))
        .join('\n');

      return [vector ? `Context:\n${vector}` : null, shortTerm ? `Recent:\n${shortTerm}` : null]
        .filter((x): x is string => Boolean(x))
        .join('\n\n');
    });
  }

  public getRecentMessages(params: { tenantId: string; callId: string; take: number }): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    return this.execute('memory.recent', async () => {
      const rows = await prisma.callEvent.findMany({
        where: {
          tenantId: params.tenantId,
          callSessionId: params.callId,
          eventType: 'TRANSCRIPT_SEGMENT'
        },
        orderBy: { eventTimestamp: 'desc' },
        take: params.take
      });

      return rows
        .reverse()
        .map((e) => {
          const p = (e.payload ?? {}) as { role?: 'user' | 'assistant'; content?: string };
          if (!p.role || !p.content) {
            return null;
          }
          return { role: p.role, content: p.content };
        })
        .filter((x): x is { role: 'user' | 'assistant'; content: string } => Boolean(x));
    });
  }
}

