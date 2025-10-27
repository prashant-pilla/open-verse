// Deprecated for US users; kept for reference. No-op script.
import 'dotenv/config';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
logger.warn('Binance testnet ping script is deprecated in US contexts.');


