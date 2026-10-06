/**
 * HOTELIER print bridge — a tiny localhost HTTP service.
 *
 * The HOTELIER web app (https://<tenant>.hoteliermanagement.app) POSTs raw
 * ESC/POS bytes here and this spools them to a printer by name through the OS
 * print spooler — so it works with the old USB thermal printers that sit
 * behind a vendor driver and can't be reached by WebUSB.
 *
 *   GET  /            -> { ok, app, version, host }         (liveness ping)
 *   GET  /printers    -> { ok, default, printers: [{name,default,status}] }
 *   POST /print       -> { printer?: string, data: <base64 ESC/POS> }
 *                     -> { ok, result } | { ok:false, error }
 *
 * Binds to 127.0.0.1 only. CORS is open (the body is opaque bytes and the
 * service can do nothing but print) and it answers Chrome's Private Network
 * Access preflight so an https page may call loopback. Pure Node — no native
 * modules, so it packages to a single .exe cleanly.
 */

const http = require('node:http');
const os = require('node:os');
const { listPrinters, printRaw } = require('./printers');
const { startPrintAgent } = require('./agent');

const PORT = Number(process.env.HOTELIER_BRIDGE_PORT || 47011);
const VERSION = '1.1.0'; // keep in sync with package.json (inlined so SEA builds don't need the file)
const MAX_BODY = 8 * 1024 * 1024;
const agent = startPrintAgent();

function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.headers['access-control-request-private-network'] === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const path = (req.url || '/').split('?')[0];

  try {
    if (req.method === 'GET' && (path === '/' || path === '/status')) {
      send(res, 200, { ok: true, app: 'hotelier-print-bridge', version: VERSION, host: os.hostname(), agent: agent.status() });
      return;
    }

    if (req.method === 'GET' && path === '/printers') {
      const result = await listPrinters();
      send(res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === 'POST' && path === '/print') {
      const body = await readBody(req, res);
      if (body === null) return; // readBody already answered

      let payload;
      try {
        payload = JSON.parse(body || '{}');
      } catch {
        send(res, 400, { ok: false, error: 'Body must be JSON: { printer?, data (base64) }' });
        return;
      }
      if (!payload.data) {
        send(res, 400, { ok: false, error: 'Missing "data" (base64 ESC/POS bytes)' });
        return;
      }

      const bytes = Buffer.from(String(payload.data), 'base64');
      const result = await printRaw(payload.printer || null, bytes);
      console.log(`[print] ${bytes.length} bytes -> "${payload.printer || 'default'}" : ${result}`);
      send(res, 200, { ok: true, result });
      return;
    }

    send(res, 404, { ok: false, error: 'Not found' });
  } catch (err) {
    const message = (err && (err.stderr || err.message)) || String(err);
    console.error(`[${req.method} ${path}] failed:`, message);
    send(res, 500, { ok: false, error: message });
  }
});

function readBody(req, res) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) {
        send(res, 413, { ok: false, error: 'Payload too large' });
        req.destroy();
        resolve(null);
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', () => resolve(null));
  });
}

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use — the bridge is probably already running.`);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`HOTELIER print bridge v${VERSION}  ·  http://127.0.0.1:${PORT}  ·  ${os.hostname()}`);
  listPrinters()
    .then((l) => console.log(`Printers (${l.printers.length}), default: ${l.default || 'none'}`))
    .catch((e) => console.log('Could not list printers:', (e && e.message) || e));
  console.log('Leave this window open. Close it to stop printing.');
});
