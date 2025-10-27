import axios from 'axios';
import type { AxiosInstance } from 'axios';

export interface AlpacaAccount {
  status?: string;
  id?: string;
  buying_power?: string;
}

export function createAlpacaClient(): AxiosInstance {
  const baseURL = process.env.ALPACA_PAPER_BASE_URL ?? 'https://paper-api.alpaca.markets';
  const key = process.env.ALPACA_API_KEY_ID;
  const secret = process.env.ALPACA_API_SECRET_KEY;
  return axios.create({
    baseURL,
    headers: {
      'APCA-API-KEY-ID': key ?? '',
      'APCA-API-SECRET-KEY': secret ?? '',
    },
    timeout: 8000,
  });
}

export async function getAccount(): Promise<AlpacaAccount> {
  const client = createAlpacaClient();
  const res = await client.get('/v2/account');
  return res.data as AlpacaAccount;
}

export async function getLatestPrice(symbol: string): Promise<number> {
  const baseURL = process.env.ALPACA_DATA_BASE_URL ?? 'https://data.alpaca.markets';
  const key = process.env.ALPACA_API_KEY_ID ?? '';
  const secret = process.env.ALPACA_API_SECRET_KEY ?? '';

  const res = await axios.get(`${baseURL}/v2/stocks/${encodeURIComponent(symbol)}/trades/latest`, {
    headers: {
      'APCA-API-KEY-ID': key,
      'APCA-API-SECRET-KEY': secret,
    },
    timeout: 8000,
  });
  const price = Number(res?.data?.trade?.p);
  if (!Number.isFinite(price)) throw new Error(`Invalid latest price for ${symbol}`);
  return price;
}

export interface AlpacaPosition {
  symbol: string;
  qty: string; // string number from API
  market_value?: string; // string dollar value
  avg_entry_price?: string;
  side?: 'long' | 'short';
}

export async function getPositions(): Promise<AlpacaPosition[]> {
  const client = createAlpacaClient();
  const res = await client.get('/v2/positions');
  return res.data as AlpacaPosition[];
}

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';

export interface PlaceOrderRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  time_in_force?: 'day' | 'gtc' | 'fok' | 'ioc';
  notional?: string; // dollar amount as string; supports fractional
  qty?: string; // shares as string
  limit_price?: string;
  client_order_id?: string;
}

export interface PlaceOrderResponse {
  id: string;
  status: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  filled_qty: string;
}

export async function placeMarketOrderNotional(
  symbol: string,
  side: OrderSide,
  notionalUsd: number,
  clientOrderId?: string,
): Promise<PlaceOrderResponse> {
  const client = createAlpacaClient();
  const body: PlaceOrderRequest = {
    symbol,
    side,
    type: 'market',
    time_in_force: 'day',
    notional: notionalUsd.toFixed(2),
    client_order_id: clientOrderId,
  };
  const res = await client.post('/v2/orders', body);
  return res.data as PlaceOrderResponse;
}

export async function placeLimitOrderGTC(
  symbol: string,
  side: OrderSide,
  limitPrice: number,
  qty: number,
  clientOrderId?: string,
): Promise<PlaceOrderResponse> {
  const client = createAlpacaClient();
  const body: PlaceOrderRequest = {
    symbol,
    side,
    type: 'limit',
    time_in_force: 'gtc',
    limit_price: limitPrice.toFixed(2),
    qty: qty.toFixed(3),
    client_order_id: clientOrderId,
  };
  const res = await client.post('/v2/orders', body);
  return res.data as PlaceOrderResponse;
}

export interface FillActivity {
  id: string;
  transaction_time: string; // ISO8601
  symbol: string;
  side: 'buy' | 'sell';
  qty: string;
  price: string;
  order_id?: string;
  client_order_id?: string;
}

export async function listFillsSince(isoAfter: string): Promise<FillActivity[]> {
  const client = createAlpacaClient();
  const res = await client.get('/v2/account/activities', {
    params: { activity_types: 'FILL', after: isoAfter },
  });
  // Alpaca returns array of activities; filter to FILL defensively
  const items: unknown = res.data;
  const arr: unknown[] = Array.isArray(items) ? items : [];
  return arr
    .filter((raw): raw is Record<string, unknown> => typeof raw === 'object' && raw !== null)
    .filter((a) => a.activity_type === 'FILL' || a.activity_type === 'fill')
    .map((a) => ({
      id: String((a.id as unknown) ?? (a.activity_id as unknown) ?? ''),
      transaction_time: (a.transaction_time as string) ?? (a.date as string) ?? new Date().toISOString(),
      symbol: String(a.symbol as string),
      side: (a.side as 'buy' | 'sell') ?? 'buy',
      qty: String((a.qty as unknown) ?? (a.quantity as unknown) ?? '0'),
      price: String((a.price as unknown) ?? '0'),
      order_id: (a.order_id as string) ?? undefined,
      client_order_id: (a.client_order_id as string) ?? undefined,
    }));
}

export interface AlpacaClock {
  is_open: boolean;
  next_open?: string;
  next_close?: string;
}

export async function getClock(): Promise<AlpacaClock> {
  const client = createAlpacaClient();
  const res = await client.get('/v2/clock');
  const data = res.data ?? {};
  return {
    is_open: Boolean(data.is_open),
    next_open: data.next_open,
    next_close: data.next_close,
  };
}


