import 'dotenv/config';
import pino from 'pino';
import { getAccount, getLatestPrice } from '../exchanges/alpaca';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

async function main(): Promise<void> {
  const haveKeys = Boolean(process.env.ALPACA_API_KEY_ID && process.env.ALPACA_API_SECRET_KEY);
  if (!haveKeys) {
    logger.warn('No Alpaca keys in env; create a paper key in dashboard and set .env');
    return;
  }
  const account = await getAccount();
  const price = await getLatestPrice('AAPL');
  logger.info({ accountStatus: account.status, price }, 'alpaca paper reachable');
}

main().catch((err) => {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  logger.error({ err }, 'alpaca ping failed');
  process.exit(1);
});


