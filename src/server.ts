import 'dotenv/config';
import http from 'http';
import url from 'url';
import { getLatestEquityByModel, getFillsOrdered, getRecentOrders } from './db';

const server = http.createServer(async (req, res) => {
  // Enable CORS for all requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  const parsed = url.parse(req.url ?? '/', true);
  if (parsed.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (parsed.pathname === '/leaderboard') {
    const rows = getLatestEquityByModel();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ rows }));
    return;
  }
  if (parsed.pathname === '/pnl') {
    // realized PnL per model via FIFO within symbol (simplified)
    const fills = getFillsOrdered();
    const pos: Record<string, { qty: number; cost: number }> = {};
    const realized: Record<string, number> = {};
    for (const f of fills) {
      const key = `${f.model}:${f.symbol}`;
      pos[key] ??= { qty: 0, cost: 0 };
      realized[f.model] ??= 0;
      const p = pos[key];
      if (f.side === 'buy') {
        // increase position and cost
        p.cost = p.cost + f.qty * f.price;
        p.qty = p.qty + f.qty;
      } else {
        // sell: realize pnl for the portion closed
        const qtyToClose = Math.min(p.qty, f.qty);
        if (qtyToClose > 0) {
          const avgCost = p.qty > 0 ? p.cost / p.qty : 0;
          realized[f.model] += qtyToClose * (f.price - avgCost);
          p.qty -= qtyToClose;
          p.cost = p.qty * avgCost;
        }
        // if shorting were supported, we’d handle negative qty; ignored for simplicity
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ realized }));
    return;
  }
  if (parsed.pathname === '/orders') {
    const rows = getRecentOrders(50);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ rows }));
    return;
  }
  if (parsed.pathname === '/' || parsed.pathname === '/dashboard') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      '<!doctype html>' +
        '<html><head>' +
        '<meta charset="utf-8" />' +
        '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
        '<title>Open‑Verse Arena</title>' +
        '<style>' +
        'body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:24px;color:#111}' +
        'h1{margin:0 0 12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}' +
        'table{width:100%;border-collapse:collapse}th,td{padding:8px 10px;border-bottom:1px solid #eee;text-align:left;font-size:14px}' +
        '.muted{color:#666}.card{border:1px solid #eee;border-radius:8px;padding:12px}' +
        '</style>' +
        '<script>' +
        'async function fetchJSON(p){const r=await fetch(p);return await r.json();}' +
        'async function refresh(){' +
        'const res=await Promise.all([fetchJSON("/leaderboard"),fetchJSON("/pnl"),fetchJSON("/orders")]);' +
        'const lb=res[0].rows||[];const pnl=res[1].realized||{};const orders=res[2].rows||[];' +
        'var lbRows=lb.map(function(r){return "<tr><td>"+r.model+"</td><td>$"+Number(r.equity_usd).toFixed(2)+"</td><td class=\"muted\">"+r.ts+"</td></tr>";}).join("");' +
        'document.getElementById("leaderboard").innerHTML=' +
        '"<table><thead><tr><th>Model</th><th>Equity</th><th class=\"muted\">TS</th></tr></thead><tbody>"+lbRows+"</tbody></table>";' +
        'var pnlRowsHtml=Object.entries(pnl).map(function(e){return "<tr><td>"+e[0]+"</td><td>$"+Number(e[1]).toFixed(2)+"</td></tr>";}).join("");' +
        'document.getElementById("pnl").innerHTML=' +
        '"<table><thead><tr><th>Model</th><th>Realized PnL</th></tr></thead><tbody>"+pnlRowsHtml+"</tbody></table>";' +
        'var ordRowsHtml=orders.map(function(r){return "<tr><td class=\"muted\">"+r.ts+"</td><td>"+r.model+"</td><td>"+r.symbol+"</td><td>"+r.side+"</td><td>$"+Number(r.notional_usd).toFixed(2)+"</td><td>"+r.status+"</td></tr>";}).join("");' +
        'document.getElementById("orders").innerHTML=' +
        '"<table><thead><tr><th>TS</th><th>Model</th><th>Symbol</th><th>Side</th><th>Notional</th><th>Status</th></tr></thead><tbody>"+ordRowsHtml+"</tbody></table>";' +
        '}' +
        'setInterval(refresh,5000);window.onload=refresh;' +
        '</script>' +
        '</head><body>' +
        '<h1>Open‑Verse Arena</h1>' +
        '<div class="grid">' +
        '<div class="card"><h3>Leaderboard</h3><div id="leaderboard">Loading…</div></div>' +
        '<div class="card"><h3>Realized PnL</h3><div id="pnl">Loading…</div></div>' +
        '<div class="card" style="grid-column:1 / span 2"><h3>Recent Orders</h3><div id="orders">Loading…</div></div>' +
        '</div></body></html>'
    );
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

const port = Number(process.env.PORT ?? 5000);
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`server listening on :${port}`);
});


// Keepalive pinger (optional): set KEEPALIVE_URL to your public /health URL
const keepAliveUrl = process.env.KEEPALIVE_URL;
const keepAliveIntervalMs = Number(process.env.KEEPALIVE_INTERVAL_MS ?? 240000); // 4 min default
if (keepAliveUrl) {
  // eslint-disable-next-line no-console
  console.log(`keepalive enabled → ${keepAliveUrl} every ${keepAliveIntervalMs}ms`);
  setInterval(() => {
    // Use global fetch (Node >=18)
    fetch(keepAliveUrl, { method: 'GET', cache: 'no-store' })
      .then(() => {
        /* no-op */
      })
      .catch(() => {
        /* ignore keepalive errors */
      });
  }, keepAliveIntervalMs);
}


