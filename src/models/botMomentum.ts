import type { ModelAdapter, OrderIntent, PositionSnapshot } from './types';

function simpleMomentumSignal(prices: number[]): number {
  if (prices.length < 3) return 0;
  const [a, , c] = prices.slice(-3);
  return c - a; // positive if upward momentum
}

export function createMomentumBot(id: string): ModelAdapter {
  const priceHistory = new Map<string, number[]>();
  return {
    id,
    onDecision: async ({ markets, positions, maxOrderUsd }) => {
      const intents: OrderIntent[] = [];
      for (const m of markets) {
        const arr = priceHistory.get(m.symbol) ?? [];
        arr.push(m.price);
        if (arr.length > 20) arr.shift();
        priceHistory.set(m.symbol, arr);
        const momentum = simpleMomentumSignal(arr);
        if (momentum > 0) {
          intents.push({ symbol: m.symbol, side: 'buy', notionalUsd: maxOrderUsd });
        } else if (momentum < 0) {
          intents.push({ symbol: m.symbol, side: 'sell', notionalUsd: maxOrderUsd });
        }
      }
      // naive net exposure control: if position is zero, allow either side; otherwise reduce flips
      const positionBySymbol = new Map<string, PositionSnapshot>();
      for (const p of positions) positionBySymbol.set(p.symbol, p);
      return intents.filter((it) => {
        const p = positionBySymbol.get(it.symbol);
        if (!p) return true;
        if (it.side === 'buy' && p.qty < 0) return true; // reduce short
        if (it.side === 'sell' && p.qty > 0) return true; // reduce long
        return Math.random() < 0.2; // small chance to add in trend
      });
    },
  };
}


