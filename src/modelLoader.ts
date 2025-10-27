import pino from 'pino';
import { createMomentumBot } from './models/botMomentum';
import { createMeanReversionBot } from './models/botMeanReversion';
import { createOpenAIAdapter } from './llm/openai';
import { createMockAdapter } from './llm/mock';
import { createLLMBackedModel } from './models/llmModelAdapter';
import type { ModelAdapter } from './models/types';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

export function loadModelsFromEnv(modelIds: string[]): ModelAdapter[] {
  const models: ModelAdapter[] = [];
  for (const id of modelIds) {
    const provider = process.env[`MODEL_${id}_PROVIDER`];
    if (!provider) {
      // default to built-in bots for quick start
      models.push(id === 'botA' ? createMomentumBot(id) : createMeanReversionBot(id));
      continue;
    }
    if (provider === 'openai' || provider === 'openrouter') {
      const model = process.env[`MODEL_${id}_MODEL`];
      const keyEnv = process.env[`MODEL_${id}_API_KEY`];
      const key = keyEnv && !keyEnv.includes('${') ? keyEnv : process.env.OPENROUTER_API_KEY;
      const endpoint =
        provider === 'openrouter'
          ? process.env[`MODEL_${id}_ENDPOINT`] ?? 'https://openrouter.ai/api/v1/chat/completions'
          : process.env[`MODEL_${id}_ENDPOINT`] ?? 'https://api.openai.com/v1/chat/completions';
      if (!model || !key) {
        logger.warn({ id }, 'missing OpenAI model/key; falling back to momentum bot');
        models.push(createMomentumBot(id));
        continue;
      }
      const llm = createOpenAIAdapter(id, key, model, endpoint);
      models.push(createLLMBackedModel(id, llm));
    } else if (provider === 'mock') {
      const llm = createMockAdapter(id);
      models.push(createLLMBackedModel(id, llm));
    } else {
      logger.warn({ id, provider }, 'unknown provider; using momentum bot');
      models.push(createMomentumBot(id));
    }
  }
  return models;
}


