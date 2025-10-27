import type { ModelAdapter, OrderIntent } from './types';

function sma(values: number[], n: number): number | null {
  if (values.length < n) return null;
  const s = values.slice(-n).reduce((a, b) => a + b, 0);
  return s / n;
}

export function createMeanReversionBot(id: string): ModelAdapter {
  const priceHistory = new Map<string, number[]>();
  return {
    id,
    onDecision: async ({ markets, maxOrderUsd }) => {
      const intents: OrderIntent[] = [];
      for (const m of markets) {
        const arr = priceHistory.get(m.symbol) ?? [];
        arr.push(m.price);
        if (arr.length > 50) arr.shift();
        priceHistory.set(m.symbol, arr);
        const avg = sma(arr, 10);
        if (avg == null) continue;
        const deviation = (m.price - avg) / avg;
        if (deviation < -0.003) {
          intents.push({ symbol: m.symbol, side: 'buy', notionalUsd: maxOrderUsd });
        } else if (deviation > 0.003) {
          intents.push({ symbol: m.symbol, side: 'sell', notionalUsd: maxOrderUsd });
        }
      }
      return intents;
    },
  };
}


