import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { errorHandlerMiddleware } from './middlewares/error-handler.middleware.js';
import { requestContextMiddleware } from './middlewares/request-context.middleware.js';
import { requestLoggerMiddleware } from './middlewares/request-logger.middleware.js';
import { tenantContextMiddleware } from './middlewares/tenant-context.middleware.js';
import { rateLimitMiddleware } from './middlewares/rate-limit.middleware.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { userRouter } from './modules/user/user.routes.js';
import { apiKeyRouter } from './modules/api-key/api-key.routes.js';
import { callRouter } from './modules/call/call.routes.js';
import { twilioWebhooksRouter } from './modules/call/webhooks.routes.js';
import { agentRouter } from './modules/agent/agent.routes.js';
import { AgentEventHandler } from './modules/agent-runtime/agent-event.handler.js';
import { AgentRuntimeService } from './modules/agent-runtime/agent-runtime.service.js';
import { PromptBuilderService } from './modules/agent-runtime/prompt-builder.service.js';
import { OllamaLlmService } from './services/ollama-llm.service.js';
import { QdrantVectorService } from './services/vector/qdrant-vector.service.js';
import { VoiceAgentEventHandler } from './modules/voice/voice-agent-event.handler.js';
import { LiveKitAgentClient } from './services/voice/livekit-agent-client.service.js';
import { DeepgramSttService } from './services/voice/deepgram-stt.service.js';
import { DeepgramTtsService } from './services/voice/deepgram-tts.service.js';
// Metered services are wired inside the agent runtime (per call) and do not need app-level imports.
import { BillingEventHandler } from './modules/billing/billing-event.handler.js';
import { UsageService } from './modules/billing/usage.service.js';
import { CostCalculatorService } from './modules/billing/cost-calculator.service.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { billingRouter } from './modules/billing/billing.routes.js';
import { metrics } from './lib/metrics.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { env } from './config/env.js';

const normalizeOrigin = (value: string) => {
  const s = value.trim();
  if (!s) return '';
  try {
    return new URL(s).origin;
  } catch {
    return s.replace(/\/+$/, '');
  }
};

const isLocalDevOrigin = (origin: string) => {
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const u = new URL(origin);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  } catch {
    return false;
  }
};

export const createApp = () => {
  const app = express();

  app.set('trust proxy', 1);
  const allowedOrigins = (env.CORS_ORIGIN ?? '')
    .split(',')
    .map((s) => normalizeOrigin(s))
    .filter(Boolean);
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedOrigins.length === 0) return cb(null, true);
        if (allowedOrigins.includes(normalizeOrigin(origin))) return cb(null, true);
        if (isLocalDevOrigin(origin)) return cb(null, true);
        return cb(null, false);
      }
      ,
      credentials: true,
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    })
  );
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }
    })
  );
  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        // Needed for signature verification for providers (e.g. LiveKit) that sign raw JSON bytes.
        (req as express.Request).rawBody = buf.toString('utf8');
      }
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(requestContextMiddleware);
  app.use(tenantContextMiddleware);
  app.use(requestLoggerMiddleware);
  app.use(rateLimitMiddleware);

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  app.get('/ready', async (_req, res) => {
    try {
      const withTimeout = async <T,>(p: Promise<T>, ms: number) => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), ms);
        try {
          // Best-effort: Prisma doesn't use AbortController; timeout still works via Promise.race.
          return await Promise.race([
            p,
            new Promise<never>((_, rej) => ctrl.signal.addEventListener('abort', () => rej(new Error('timeout'))))
          ]);
        } finally {
          clearTimeout(t);
        }
      };
      await withTimeout(prisma.$queryRaw`SELECT 1`, 1500);
      await withTimeout(redis.ping(), 1500);
      res.status(200).json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'not_ready' });
    }
  });
  app.get('/metrics', (_req, res) => {
    res.status(200).json({ data: metrics.snapshot() });
  });

  app.use('/auth', authRouter);
  app.use('/users', userRouter);
  app.use('/api-keys', apiKeyRouter);
  app.use('/calls', callRouter);
  app.use('/agents', agentRouter);
  app.use('/webhooks', twilioWebhooksRouter);
  app.use('/admin', adminRouter);
  app.use('/billing', billingRouter);

  // Agent runtime listeners (event-driven, does not touch call orchestration).
  // Default wiring uses Ollama + Qdrant.
  const billingHandler = new BillingEventHandler(new UsageService(new CostCalculatorService()));
  billingHandler.register();

  // Agent runtime: billing metering is applied per-call inside the runtime (tenant-aware).
  const qdrant = new QdrantVectorService();
  qdrant.prewarm();
  new AgentEventHandler(new AgentRuntimeService(new OllamaLlmService(), qdrant, new PromptBuilderService())).register();

  // Voice loop: joins LiveKit room, STT -> call.message, TTS -> published audio.
  new VoiceAgentEventHandler(new LiveKitAgentClient(() => new DeepgramSttService(), () => new DeepgramTtsService())).register();

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });
  app.use(errorHandlerMiddleware);

  return app;
};
