import axios from 'axios';

export const BINANCE_TESTNET_BASE = 'https://testnet.binance.vision';

function getBaseUrl(): string {
  return process.env.BINANCE_BASE_URL ?? BINANCE_TESTNET_BASE;
}

export async function ping(): Promise<void> {
  const base = getBaseUrl();
  await axios.get(`${base}/api/v3/ping`, { timeout: 5000 });
}

export async function getPrice(symbol: string): Promise<number> {
  const base = getBaseUrl();
  const res = await axios.get(`${base}/api/v3/ticker/price`, {
    params: { symbol },
    timeout: 5000,
  });
  const price = Number(res.data.price);
  if (!Number.isFinite(price)) throw new Error(`Invalid price for ${symbol}`);
  return price;
}


