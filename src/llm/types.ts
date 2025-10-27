export type LLMProvider = 'openai' | 'openrouter' | 'mock';

export interface LLMOrderIntent {
  symbol: string;
  side: 'buy' | 'sell';
  notionalUsd: number;
}

export interface LLMAdapter {
  id: string;
  decide(input: {
    symbols: string[];
    prices: Record<string, number>;
    positions: Record<string, number>;
    maxOrderUsd: number;
    maxPositionUsd: number;
  }): Promise<LLMOrderIntent[]>;
}


