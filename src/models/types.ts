export interface MarketSnapshot {
  symbol: string;
  price: number;
}

export interface PositionSnapshot {
  symbol: string;
  qty: number; // positive long, negative short
  avgPrice?: number;
}

export interface OrderIntent {
  symbol: string;
  side: 'buy' | 'sell';
  notionalUsd: number; // dollar size of order
}

export interface ModelAdapter {
  id: string;
  onDecision: (args: {
    markets: MarketSnapshot[];
    positions: PositionSnapshot[];
    maxOrderUsd: number;
    maxPositionUsd: number;
  }) => Promise<OrderIntent[]>;
}


