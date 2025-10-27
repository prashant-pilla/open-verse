import 'dotenv/config';
import pino from 'pino';
import { Orchestrator } from '../orchestrator';
import { loadConfig } from '../config';
import { loadModelsFromEnv } from '../modelLoader';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

function getArg(name: string, fallback?: string): string | undefined {
  const p = process.argv.find((v) => v.startsWith(name + '='));
  return p ? p.slice(name.length + 1) : fallback;
}

async function main(): Promise<void> {
  const count = Number(getArg('--count', '2'));
  const delayMs = Number(getArg('--delay', '10000'));
  const cfg = loadConfig();
  const models = loadModelsFromEnv(cfg.modelList);
  const orch = new Orchestrator(models);

  for (let i = 0; i < count; i++) {
    logger.info({ tick: i + 1, of: count }, 'running tick');
    await orch.tick();
    if (i < count - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  logger.info('runNTicks completed');
}

main().catch((err) => {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  logger.error({ err }, 'runNTicks failed');
  process.exit(1);
});


