import type { ModelAdapter } from './types';
import type { LLMAdapter } from '../llm/types';
import { getModelState } from '../db';

export function createLLMBackedModel(id: string, llm: LLMAdapter): ModelAdapter {
  return {
    id,
    onDecision: async ({ markets, positions, maxOrderUsd, maxPositionUsd }) => {
      const prices: Record<string, number> = {};
      for (const m of markets) prices[m.symbol] = m.price;
      const pos: Record<string, number> = {};
      for (const p of positions) pos[p.symbol] = p.qty;
      const state = getModelState(id);
      const intents = await llm.decide({
        symbols: markets.map((m) => m.symbol),
        prices,
        positions: pos,
        maxOrderUsd,
        maxPositionUsd,
        memory: state,
      });
      return intents.map((i) => ({ symbol: i.symbol, side: i.side, notionalUsd: i.notionalUsd }));
    },
  };
}


