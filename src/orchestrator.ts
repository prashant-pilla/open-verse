import pino from 'pino';
import { loadConfig } from './config';
import { getLatestPrice, getPositions, placeMarketOrderNotional, listFillsSince, placeLimitOrderGTC, getClock } from './exchanges/alpaca';
import type { ModelAdapter, MarketSnapshot, PositionSnapshot } from './models/types';
import { initDb, recordEquitySnapshot, recordMarketSnapshot, recordOrder, upsertClientOrderMap, getLastFillTimestamp, setLastFillTimestamp, recordFill, findModelForClientOrder, getFillsOrdered, getModelState, updateModelState } from './db';

export class Orchestrator {
  private readonly logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  private readonly cfg = loadConfig();
  private readonly models: ModelAdapter[];
  private readonly lastCallAtByModel = new Map<string, number>();
  private readonly backoffUntilByModel = new Map<string, number>();

  constructor(models: ModelAdapter[]) {
    this.models = models;
    initDb();
  }

  async tick(): Promise<void> {
    const now = Date.now();
    // Simple concurrency cap + in-tick cache
    const priceCache = new Map<string, number>();
    const symbols = this.cfg.symbolList;
    const concurrency = Number(process.env.PRICE_CONCURRENCY ?? this.cfg.PRICE_CONCURRENCY ?? 8);
    const markets: MarketSnapshot[] = [];
    for (let i = 0; i < symbols.length; i += concurrency) {
      const batch = symbols.slice(i, i + concurrency);
      const prices = await Promise.all(
        batch.map(async (symbol) => {
          const s = symbol.toUpperCase();
          if (priceCache.has(s)) return { symbol: s, price: priceCache.get(s)! };
          const p = await getLatestPrice(s).catch(() => NaN);
          const price = Number.isFinite(p) ? (p as number) : 0;
          priceCache.set(s, price);
          return { symbol: s, price };
        }),
      );
      markets.push(...prices);
    }
    for (const m of markets) recordMarketSnapshot(now, m.symbol, m.price);

    const alpacaPositions = await getPositions().catch(() => []);
    const posMap = new Map<string, number>();
    for (const p of alpacaPositions) {
      const qty = Number(p.qty);
      if (!Number.isFinite(qty)) continue;
      posMap.set(p.symbol.toUpperCase(), qty * (p.side === 'short' ? -1 : 1));
    }
    const positions: PositionSnapshot[] = this.cfg.symbolList.map((symbol) => ({
      symbol,
      qty: posMap.get(symbol.toUpperCase()) ?? 0,
    }));

    // check market clock once per tick
    const clock = await getClock().catch(() => ({ is_open: true }));

    for (const model of this.models) {
      let intents: { symbol: string; side: 'buy' | 'sell'; notionalUsd: number }[] = [];
      const nowMs = Date.now();
      const last = this.lastCallAtByModel.get(model.id) ?? 0;
      const backoffUntil = this.backoffUntilByModel.get(model.id) ?? 0;
      if (nowMs < backoffUntil) {
        this.logger.warn({ model: model.id, until: backoffUntil }, 'skip: model in backoff');
        continue;
      }
      if (nowMs - last < this.cfg.LLM_MIN_CALL_INTERVAL_MS) {
        this.logger.info({ model: model.id }, 'skip: LLM call interval throttle');
        continue;
      }
      try {
        const prevState = getModelState(model.id);
        intents = await model.onDecision({
          markets,
          positions,
          maxOrderUsd: this.cfg.MAX_ORDER_USD,
          maxPositionUsd: this.cfg.MAX_POSITION_USD,
        });
        this.lastCallAtByModel.set(model.id, nowMs);
        if (this.cfg.enableModelMemory) {
          updateModelState(model.id, { lastSeenTs: nowMs, summary: prevState.summary });
        }
      } catch (err) {
        this.logger.error({ err, model: model.id }, 'model decision failed');
        this.applyBackoff(model.id, err);
        intents = [];
      }
      for (const it of intents) {
        // enforce position cap approximately by skipping if would exceed
        const currentQty = positions.find((p) => p.symbol === it.symbol)?.qty ?? 0;
        const price = markets.find((m) => m.symbol === it.symbol)?.price ?? 0;
        const deltaQty = it.notionalUsd / Math.max(price, 1e-6);
        const nextExposureUsd = Math.abs((currentQty + (it.side === 'buy' ? deltaQty : -deltaQty)) * price);
        if (nextExposureUsd > this.cfg.MAX_POSITION_USD) {
          this.logger.warn({ model: model.id, it }, 'skip intent: would exceed position cap');
          continue;
        }
        if (this.cfg.dryRun) {
          this.logger.info({ model: model.id, it }, 'DRY_RUN order');
          recordOrder(now, model.id, it.symbol, it.side, it.notionalUsd, 'DRY_RUN');
        } else {
          try {
            const clientId = `ov-${model.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            // If queuing off-hours is enabled, use BUY limit GTC qty=1 at current price
            if (this.cfg.queueOffHours || !clock.is_open) {
              const px = price;
              const qty = 1;
              const resp = await placeLimitOrderGTC(it.symbol, 'buy', px, qty, clientId);
              this.logger.info({ model: model.id, orderId: resp.id, it }, 'queued GTC limit');
              upsertClientOrderMap(clientId, model.id, it.symbol);
              recordOrder(now, model.id, it.symbol, 'buy', px * qty, resp.status, resp.id);
            } else {
              // Queue as limit GTC at current price; approximate qty = notional/price
              const px = price;
              const qty = Math.max(1, Math.floor(it.notionalUsd / Math.max(px, 1e-6)));
              const resp = await placeLimitOrderGTC(it.symbol, it.side, px, qty, clientId);
              this.logger.info({ model: model.id, orderId: resp.id, it }, 'placed order');
              upsertClientOrderMap(clientId, model.id, it.symbol);
              recordOrder(now, model.id, it.symbol, it.side, px * qty, resp.status, resp.id);
            }
          } catch (err) {
            this.logger.error({ err, model: model.id, it }, 'order failed');
            recordOrder(now, model.id, it.symbol, it.side, it.notionalUsd, 'ERROR');
          }
        }
      }
    }

    // equity snapshots per model from model-attributed fills (cash + MTM)
    const fills = getFillsOrdered();
    const priceBySymbol = new Map<string, number>();
    for (const m of markets) priceBySymbol.set(m.symbol.toUpperCase(), m.price);
    const cashByModel = new Map<string, number>();
    const qtyByModelSymbol = new Map<string, Map<string, number>>();
    for (const id of this.cfg.modelList) {
      cashByModel.set(id, this.cfg.STARTING_CASH_PER_MODEL);
      qtyByModelSymbol.set(id, new Map());
    }
    for (const f of fills) {
      if (!f.model || f.model === 'unknown') continue;
      if (!cashByModel.has(f.model)) {
        cashByModel.set(f.model, this.cfg.STARTING_CASH_PER_MODEL);
        qtyByModelSymbol.set(f.model, new Map());
      }
      const symbol = f.symbol.toUpperCase();
      const qtyMap = qtyByModelSymbol.get(f.model)!;
      const prevQty = qtyMap.get(symbol) ?? 0;
      const tradeQty = Number(f.qty);
      const tradeValue = tradeQty * Number(f.price);
      if (f.side === 'buy') {
        qtyMap.set(symbol, prevQty + tradeQty);
        cashByModel.set(f.model, (cashByModel.get(f.model) ?? 0) - tradeValue);
      } else {
        qtyMap.set(symbol, prevQty - tradeQty);
        cashByModel.set(f.model, (cashByModel.get(f.model) ?? 0) + tradeValue);
      }
    }
    for (const id of this.cfg.modelList) {
      const qtyMap = qtyByModelSymbol.get(id) ?? new Map();
      let equity = cashByModel.get(id) ?? this.cfg.STARTING_CASH_PER_MODEL;
      for (const [sym, q] of qtyMap.entries()) {
        const px = priceBySymbol.get(sym) ?? 0;
        equity += q * px;
      }
      recordEquitySnapshot(now, id, equity);
    }
    // sync fills to compute realized pnl later
    await this.syncFills();
  }

  private async syncFills(): Promise<void> {
    const lastTs = getLastFillTimestamp();
    const afterIso = lastTs ? new Date(lastTs).toISOString() : new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const activities = await listFillsSince(afterIso).catch(() => []);
    let maxIso = afterIso;
    for (const a of activities) {
      const t = Date.parse(a.transaction_time);
      if (isNaN(t)) continue;
      if (t > Date.parse(maxIso)) maxIso = a.transaction_time;
      const mapping = a.client_order_id ? findModelForClientOrder(a.client_order_id) : null;
      const modelId = mapping?.model ?? 'unknown';
      recordFill(t, modelId, a.symbol, a.side, Number(a.qty), Number(a.price));
    }
    setLastFillTimestamp(maxIso);
  }

  private applyBackoff(modelId: string, err: unknown): void {
    const now = Date.now();
    const e = err as { message?: string; status?: unknown; code?: unknown };
    const msg = String(e?.message ?? '');
    let ms = 0;
    const status = String(e?.status ?? e?.code ?? '');
    if (status === '429' || /Rate limit/i.test(msg)) {
      ms = 60 * 60 * 1000; // 60m
    } else if (status === '404' && /data policy|publication/i.test(msg)) {
      ms = 30 * 60 * 1000; // 30m
    } else if (status === '403' && /moderation/i.test(msg)) {
      ms = 10 * 60 * 1000; // 10m
    }
    if (ms > 0) {
      const until = now + ms;
      this.backoffUntilByModel.set(modelId, until);
      this.logger.warn({ model: modelId, backoffMs: ms }, 'applied backoff');
    }
  }

  start(): void {
    const interval = Math.max(this.cfg.DECISION_INTERVAL_MS, 5_000);
    this.logger.info({ intervalMs: interval, symbols: this.cfg.symbolList }, 'orchestrator start');
    // Seed equity so the dashboard never shows 0 models after cold starts
    const now = Date.now();
    for (const model of this.models) {
      try {
        recordEquitySnapshot(now, model.id, this.cfg.STARTING_CASH_PER_MODEL);
      } catch {
        // ignore seed write errors
      }
    }
    // Kick an immediate tick so snapshots/orders begin without waiting a full interval
    void this.tick();
    setInterval(() => {
      void this.tick();
    }, interval);
  }
}


