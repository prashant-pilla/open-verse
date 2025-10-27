import 'dotenv/config';
import pino from 'pino';
import { Orchestrator } from './orchestrator';
import { loadConfig } from './config';
import { loadModelsFromEnv } from './modelLoader';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

async function main(): Promise<void> {
  logger.info({ msg: 'open-verse starting' });
  const cfg = loadConfig();
  const models = loadModelsFromEnv(cfg.modelList);
  const orch = new Orchestrator(models);
  orch.start();
}

main().catch((err) => {
  logger.error({ err }, 'fatal error');
  process.exit(1);
});


