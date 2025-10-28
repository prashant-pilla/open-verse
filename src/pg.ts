import { Pool } from 'pg';

let pool: Pool | null = null;

export function initPg(): void {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  if (pool) return;
  pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
}

function getPool(): Pool | null {
  if (!pool) initPg();
  return pool;
}

export async function ensureSchema(): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(`
    CREATE TABLE IF NOT EXISTS market_snapshots (
      ts BIGINT NOT NULL,
      symbol TEXT NOT NULL,
      price DOUBLE PRECISION NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_market_snapshots_symbol_ts ON market_snapshots(symbol, ts);

    CREATE TABLE IF NOT EXISTS orders (
      ts BIGINT NOT NULL,
      model TEXT NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      notional_usd DOUBLE PRECISION NOT NULL,
      status TEXT NOT NULL,
      order_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_orders_model_ts ON orders(model, ts);

    CREATE TABLE IF NOT EXISTS equity_snapshots (
      ts BIGINT NOT NULL,
      model TEXT NOT NULL,
      equity_usd DOUBLE PRECISION NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_equity_model_ts ON equity_snapshots(model, ts);

    CREATE TABLE IF NOT EXISTS order_client_map (
      client_id TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      symbol TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fills (
      ts BIGINT NOT NULL,
      model TEXT NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      qty DOUBLE PRECISION NOT NULL,
      price DOUBLE PRECISION NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fills_model_ts ON fills(model, ts);

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export async function pgInsertMarketSnapshot(ts: number, symbol: string, price: number): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(`INSERT INTO market_snapshots (ts, symbol, price) VALUES ($1, $2, $3)`, [ts, symbol, price]);
}

export async function pgInsertOrder(
  ts: number,
  model: string,
  symbol: string,
  side: 'buy' | 'sell',
  notionalUsd: number,
  status: string,
  orderId?: string,
): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(
    `INSERT INTO orders (ts, model, symbol, side, notional_usd, status, order_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [ts, model, symbol, side, notionalUsd, status, orderId ?? null],
  );
}

export async function pgUpsertClientOrderMap(clientId: string, model: string, symbol: string): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(
    `INSERT INTO order_client_map (client_id, model, symbol) VALUES ($1,$2,$3)
     ON CONFLICT (client_id) DO UPDATE SET model = EXCLUDED.model, symbol = EXCLUDED.symbol`,
    [clientId, model, symbol],
  );
}

export async function pgInsertFill(
  ts: number,
  model: string,
  symbol: string,
  side: 'buy' | 'sell',
  qty: number,
  price: number,
): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(
    `INSERT INTO fills (ts, model, symbol, side, qty, price) VALUES ($1,$2,$3,$4,$5,$6)`,
    [ts, model, symbol, side, qty, price],
  );
}

export async function pgInsertEquitySnapshot(ts: number, model: string, equityUsd: number): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(`INSERT INTO equity_snapshots (ts, model, equity_usd) VALUES ($1,$2,$3)`, [ts, model, equityUsd]);
}

export async function pgSetMeta(key: string, value: string): Promise<void> {
  const p = getPool();
  if (!p) return;
  await p.query(
    `INSERT INTO meta (key, value) VALUES ($1,$2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value],
  );
}


