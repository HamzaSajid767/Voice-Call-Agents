import { Worker } from 'bullmq';
import { queueConnection } from '../queue.js';
import { AgentRuntimeService } from '../../modules/agent-runtime/agent-runtime.service.js';
import { PromptBuilderService } from '../../modules/agent-runtime/prompt-builder.service.js';
import { OllamaLlmService } from '../../services/ollama-llm.service.js';
import { QdrantVectorService } from '../../services/vector/qdrant-vector.service.js';
import { logger } from '../../lib/logger.js';
import { VoiceAgentEventHandler } from '../../modules/voice/voice-agent-event.handler.js';
import { LiveKitAgentClient } from '../../services/voice/livekit-agent-client.service.js';
import { DeepgramSttService } from '../../services/voice/deepgram-stt.service.js';
import { DeepgramTtsService } from '../../services/voice/deepgram-tts.service.js';

const runtime = new AgentRuntimeService(new OllamaLlmService(), new QdrantVectorService(), new PromptBuilderService());
new VoiceAgentEventHandler(new LiveKitAgentClient(() => new DeepgramSttService(), () => new DeepgramTtsService())).register();

export const startAgentWorker = () => {
  const worker = new Worker(
    'agent',
    async (job) => {
      if (job.name === 'initialize') {
        await runtime.initializeForCall(job.data as any);
        return;
      }
      if (job.name === 'message') {
        await runtime.handleMessage(job.data as any);
        return;
      }
    },
    { ...queueConnection, concurrency: 20 }
  );

  worker.on('failed', (job, err) => logger.error({ err, jobId: job?.id, name: job?.name }, 'agent worker job failed'));
  return worker;
};

