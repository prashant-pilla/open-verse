import pino from 'pino';
import { loadConfig } from './config';
import { getLatestPrice, getPositions, placeMarketOrderNotional, listFillsSince, placeLimitOrderGTC, getClock } from './exchanges/alpaca';
import type { ModelAdapter, MarketSnapshot, PositionSnapshot } from './models/types';
import { initDb, recordEquitySnapshot, recordMarketSnapshot, recordOrder, upsertClientOrderMap, getLastFillTimestamp, setLastFillTimestamp, recordFill } from './db';

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
    const markets: MarketSnapshot[] = await Promise.all(
      this.cfg.symbolList.map(async (symbol) => ({ symbol, price: await getLatestPrice(symbol) })),
    );
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
        intents = await model.onDecision({
          markets,
          positions,
          maxOrderUsd: this.cfg.MAX_ORDER_USD,
          maxPositionUsd: this.cfg.MAX_POSITION_USD,
        });
        this.lastCallAtByModel.set(model.id, nowMs);
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
            const clientId = `${model.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

    // equity snapshots (simplified: positions MTM + assumed starting cash, ignoring fees)
    for (const model of this.models) {
      let equity = this.cfg.STARTING_CASH_PER_MODEL;
      for (const p of positions) {
        const price = markets.find((m) => m.symbol === p.symbol)?.price ?? 0;
        equity += p.qty * price;
      }
      recordEquitySnapshot(now, model.id, equity);
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
      // We don't have a direct client_id->model mapping in response always; best effort only.
      // For now record without model lookup; in production you’d join via order_client_map.
      recordFill(t, 'unknown', a.symbol, a.side, Number(a.qty), Number(a.price));
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
    setInterval(() => {
      void this.tick();
    }, interval);
  }
}


