import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { initPg, ensureSchema, pgInsertMarketSnapshot, pgInsertOrder, pgInsertEquitySnapshot, pgInsertFill, pgUpsertClientOrderMap, pgSetMeta } from './pg';

const DB_PATH = path.join(process.cwd(), 'data', 'arena.sqlite');

let db: Database.Database | null = null;

export function initDb(): void {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new Database(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS market_snapshots (
      ts INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      price REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_market_snapshots_symbol_ts ON market_snapshots(symbol, ts);

    CREATE TABLE IF NOT EXISTS orders (
      ts INTEGER NOT NULL,
      model TEXT NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      notional_usd REAL NOT NULL,
      status TEXT NOT NULL,
      order_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_orders_model_ts ON orders(model, ts);

    CREATE TABLE IF NOT EXISTS equity_snapshots (
      ts INTEGER NOT NULL,
      model TEXT NOT NULL,
      equity_usd REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_equity_model_ts ON equity_snapshots(model, ts);

    CREATE TABLE IF NOT EXISTS order_client_map (
      client_id TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      symbol TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fills (
      ts INTEGER NOT NULL,
      model TEXT NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      qty REAL NOT NULL,
      price REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fills_model_ts ON fills(model, ts);

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS model_state (
      model TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_ts INTEGER NOT NULL
    );
  `);
  // Initialize optional Postgres mirror
  try {
    initPg();
    void ensureSchema();
  } catch {
    // ignore pg init errors; mirror is optional
  }
}

function getDb(): Database.Database {
  if (!db) initDb();
  if (!db) throw new Error('DB init failed');
  return db;
}

export function recordMarketSnapshot(ts: number, symbol: string, price: number): void {
  const d = getDb();
  d.prepare(
    `INSERT INTO market_snapshots (ts, symbol, price) VALUES (?, ?, ?)`,
  ).run(ts, symbol, price);
  void pgInsertMarketSnapshot(ts, symbol, price).catch(() => {});
}

export function recordOrder(
  ts: number,
  model: string,
  symbol: string,
  side: 'buy' | 'sell',
  notionalUsd: number,
  status: string,
  orderId?: string,
): void {
  const d = getDb();
  d.prepare(
    `INSERT INTO orders (ts, model, symbol, side, notional_usd, status, order_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(ts, model, symbol, side, notionalUsd, status, orderId ?? null);
  void pgInsertOrder(ts, model, symbol, side, notionalUsd, status, orderId).catch(() => {});
}

export function upsertClientOrderMap(clientId: string, model: string, symbol: string): void {
  const d = getDb();
  d.prepare(
    `INSERT INTO order_client_map (client_id, model, symbol)
     VALUES (?, ?, ?)
     ON CONFLICT(client_id) DO UPDATE SET model=excluded.model, symbol=excluded.symbol`,
  ).run(clientId, model, symbol);
  void pgUpsertClientOrderMap(clientId, model, symbol).catch(() => {});
}

export function getLastFillTimestamp(): number {
  const d = getDb();
  const row = d.prepare(`SELECT value FROM meta WHERE key='last_fill_iso'`).get() as
    | { value: string }
    | undefined;
  return row ? Date.parse(row.value) : 0;
}

export function setLastFillTimestamp(iso: string): void {
  const d = getDb();
  d.prepare(
    `INSERT INTO meta (key, value) VALUES ('last_fill_iso', ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
  ).run(iso);
  void pgSetMeta('last_fill_iso', iso).catch(() => {});
}

export function recordFill(
  ts: number,
  model: string,
  symbol: string,
  side: 'buy' | 'sell',
  qty: number,
  price: number,
): void {
  const d = getDb();
  d.prepare(
    `INSERT INTO fills (ts, model, symbol, side, qty, price)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(ts, model, symbol, side, qty, price);
  void pgInsertFill(ts, model, symbol, side, qty, price).catch(() => {});
}

export function findModelForClientOrder(clientId: string): { model: string; symbol: string } | null {
  const d = getDb();
  const row = d
    .prepare(`SELECT model, symbol FROM order_client_map WHERE client_id = ?`)
    .get(clientId) as { model: string; symbol: string } | undefined;
  return row ?? null;
}

export function getFillsOrdered(): Array<{
  ts: number;
  model: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
}> {
  const d = getDb();
  const rows = d
    .prepare(
      `SELECT ts, model, symbol, side, qty, price FROM fills ORDER BY ts ASC, rowid ASC`,
    )
    .all();
  return rows as Array<{
    ts: number;
    model: string;
    symbol: string;
    side: 'buy' | 'sell';
    qty: number;
    price: number;
  }>;
}

export function getModelState(model: string): { summary?: string; lastSeenTs?: number } {
  const d = getDb();
  const row = d
    .prepare(`SELECT state_json FROM model_state WHERE model = ?`)
    .get(model) as { state_json: string } | undefined;
  if (!row) return {};
  try {
    return JSON.parse(row.state_json) as { summary?: string; lastSeenTs?: number };
  } catch {
    return {};
  }
}

export function updateModelState(model: string, patch: { summary?: string; lastSeenTs?: number }): void {
  const d = getDb();
  const prev = getModelState(model);
  const next = { ...prev, ...patch };
  const json = JSON.stringify(next);
  const ts = Date.now();
  d.prepare(
    `INSERT INTO model_state (model, state_json, updated_ts)
     VALUES (?, ?, ?)
     ON CONFLICT(model) DO UPDATE SET state_json=excluded.state_json, updated_ts=excluded.updated_ts`,
  ).run(model, json, ts);
}

export function getRecentOrders(limit = 20): Array<{
  ts: number;
  model: string;
  symbol: string;
  side: string;
  notional_usd: number;
  status: string;
}> {
  const d = getDb();
  const rows = d
    .prepare(
      `SELECT ts, model, symbol, side, notional_usd, status
       FROM orders
       ORDER BY ts DESC
       LIMIT ?`,
    )
    .all(limit);
  return rows as Array<{
    ts: number;
    model: string;
    symbol: string;
    side: string;
    notional_usd: number;
    status: string;
  }>;
}

export function recordEquitySnapshot(ts: number, model: string, equityUsd: number): void {
  const d = getDb();
  d.prepare(
    `INSERT INTO equity_snapshots (ts, model, equity_usd) VALUES (?, ?, ?)`,
  ).run(ts, model, equityUsd);
  void pgInsertEquitySnapshot(ts, model, equityUsd).catch(() => {});
}

export function getLatestEquityByModel(): Array<{ model: string; equity_usd: number; ts: number }>
{
  const d = getDb();
  const rows = d.prepare(
    `SELECT e.model, e.equity_usd, e.ts
     FROM equity_snapshots e
     JOIN (
       SELECT model, MAX(ts) AS max_ts
       FROM equity_snapshots
       GROUP BY model
     ) m ON m.model = e.model AND m.max_ts = e.ts`,
  ).all();
  return rows as Array<{ model: string; equity_usd: number; ts: number }>;
}


