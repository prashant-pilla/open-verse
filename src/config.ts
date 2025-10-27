import { z } from 'zod';

const configSchema = z.object({
  EXCHANGE: z.literal('alpaca-paper'),
  SYMBOLS: z.string().min(1),
  DECISION_INTERVAL_MS: z.coerce.number().int().positive().default(60000),
  MAX_POSITION_USD: z.coerce.number().positive().default(1000),
  MAX_ORDER_USD: z.coerce.number().positive().default(250),
  MODELS: z.string().min(1),
  STARTING_CASH_PER_MODEL: z.coerce.number().positive().default(10000),
  ALPACA_API_KEY_ID: z.string().min(1),
  ALPACA_API_SECRET_KEY: z.string().min(1),
  ALPACA_PAPER_BASE_URL: z.string().url().default('https://paper-api.alpaca.markets'),
  ALPACA_DATA_BASE_URL: z.string().url().default('https://data.alpaca.markets'),
  LOG_LEVEL: z.string().default('info'),
  DRY_RUN: z.string().optional(),
  LLM_MIN_CALL_INTERVAL_MS: z.coerce.number().int().positive().default(300000),
  QUEUE_OFF_HOURS: z.string().optional(),
});

export type AppConfig = z.infer<typeof configSchema> & {
  symbolList: string[];
  modelList: string[];
  dryRun: boolean;
  queueOffHours: boolean;
};

export function loadConfig(): AppConfig {
  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${parsed.error.toString()}`);
  }
  const cfg = parsed.data;
  return {
    ...cfg,
    symbolList: cfg.SYMBOLS.split(',').map((s) => s.trim()).filter(Boolean),
    modelList: cfg.MODELS.split(',').map((s) => s.trim()).filter(Boolean),
    dryRun: (cfg.DRY_RUN ?? 'false').toLowerCase() === 'true',
    queueOffHours: (cfg.QUEUE_OFF_HOURS ?? 'false').toLowerCase() === 'true',
  };
}


