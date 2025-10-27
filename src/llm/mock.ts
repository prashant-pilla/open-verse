import type { LLMAdapter, LLMOrderIntent } from './types';

export function createMockAdapter(id: string): LLMAdapter {
  return {
    id,
    async decide({ symbols, prices, maxOrderUsd }) {
      // Simple deterministic rule: pick the first symbol and buy small notional if price even-ish, else no-op
      const sym = symbols[0];
      const p = prices[sym] ?? 0;
      if (!Number.isFinite(p)) return [];
      // alternate buy/sell based on floor(price) parity
      const side: 'buy' | 'sell' = Math.floor(p) % 2 === 0 ? 'buy' : 'sell';
      const intents: LLMOrderIntent[] = [{ symbol: sym, side, notionalUsd: Math.min(50, maxOrderUsd) }];
      return intents;
    },
  };
}


