import 'dotenv/config';
import { getLatestEquityByModel } from '../db';

function main(): void {
  const rows = getLatestEquityByModel();
  if (!rows.length) {
    console.log('No equity snapshots yet. Run a tick first.');
    return;
  }
  rows.sort((a, b) => b.equity_usd - a.equity_usd);
  console.table(
    rows.map((r) => ({ Model: r.model, EquityUSD: r.equity_usd.toFixed(2), TS: r.ts })),
  );
}

main();


