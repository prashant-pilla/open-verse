import 'dotenv/config';
import pino from 'pino';
import { Orchestrator } from '../orchestrator';
import { createMomentumBot } from '../models/botMomentum';
import { createMeanReversionBot } from '../models/botMeanReversion';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

async function main(): Promise<void> {
  const bots = [createMomentumBot('botA'), createMeanReversionBot('botB')];
  const orch = new Orchestrator(bots);
  await orch.tick();
  logger.info('one tick completed');
}

main().catch((err) => {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  logger.error({ err }, 'oneTick failed');
  process.exit(1);
});


