import 'dotenv/config';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

async function main(): Promise<void> {
  logger.info({ msg: 'open-verse starting' });
  // Placeholder: orchestrator will be initialized here in next steps
}

main().catch((err) => {
  logger.error({ err }, 'fatal error');
  process.exit(1);
});


