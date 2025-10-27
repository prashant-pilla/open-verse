import OpenAI from 'openai';
import type { LLMAdapter, LLMOrderIntent } from './types';

export function createOpenAIAdapter(
  id: string,
  apiKey: string,
  model: string,
  endpoint = 'https://api.openai.com/v1/chat/completions',
): LLMAdapter {
  return {
    id,
    async decide({ symbols, prices, positions, maxOrderUsd, maxPositionUsd }) {
      const system =
        'You are a trading agent with strict token and rate limits. Only respond with a compact JSON array of order intents: [{"symbol":"SYM","side":"buy|sell","notionalUsd":N}]. Use minimal tokens, plan fewer trades, and set stop-loss/take-profit implicitly via smaller notional sizes and less frequent entries. If no action, return []. Never include explanations.';
      const user = JSON.stringify({ symbols, prices, positions, maxOrderUsd, maxPositionUsd });
      const isOpenRouter = endpoint.includes('openrouter.ai');
      const client = new OpenAI({
        apiKey,
        baseURL: isOpenRouter ? 'https://openrouter.ai/api/v1' : undefined,
        defaultHeaders: isOpenRouter
          ? {
              Authorization: `Bearer ${apiKey}`,
              Referer: process.env.OPENROUTER_REFERRER ?? 'https://github.com/prashant-pilla/open-verse',
              'X-Title': process.env.OPENROUTER_APP_TITLE ?? 'open-verse',
            }
          : undefined,
      });

      const res = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: 'Return only JSON array, e.g. [{"symbol":"AAPL","side":"buy","notionalUsd":100}] for decisions. Input:' + user },
        ],
        temperature: Number(process.env.LLM_TEMPERATURE ?? 0.2),
        max_tokens: Number(process.env.LLM_MAX_TOKENS ?? 400),
        response_format: { type: 'json_object' },
      });

      const content = (res.choices?.[0]?.message?.content as string) ?? '[]';
      type ResponseShape = LLMOrderIntent[] | { intents: LLMOrderIntent[] };
      let parsed: ResponseShape | null = null;
      try {
        parsed = JSON.parse(content) as ResponseShape;
      } catch {
        parsed = null;
      }
      const intents: LLMOrderIntent[] = Array.isArray(parsed)
        ? parsed
        : parsed && Array.isArray((parsed as { intents: LLMOrderIntent[] }).intents)
        ? (parsed as { intents: LLMOrderIntent[] }).intents
        : [];
      return intents.filter(validIntent);
    },
  };
}

function validIntent(x: unknown): x is LLMOrderIntent {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as { symbol?: unknown }).symbol === 'string' &&
    ((x as { side?: unknown }).side === 'buy' || (x as { side?: unknown }).side === 'sell') &&
    typeof (x as { notionalUsd?: unknown }).notionalUsd === 'number' &&
    (x as { notionalUsd: number }).notionalUsd > 0
  );
}


