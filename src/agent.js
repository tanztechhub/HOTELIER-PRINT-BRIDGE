const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { printRaw } = require('./printers');

const DEFAULT_POLL_MS = 3000;

function configPath() {
  if (process.env.HOTELIER_AGENT_CONFIG) return process.env.HOTELIER_AGENT_CONFIG;
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'HotelierPrintBridge', 'agent-config.json');
  }
  return path.join(path.dirname(process.execPath), 'agent-config.json');
}

function loadAgentConfig() {
  const file = configPath();
  let fromFile = {};
  if (fs.existsSync(file)) {
    fromFile = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  const cfg = {
    enabled: envBool('HOTELIER_AGENT_ENABLED', fromFile.enabled ?? false),
    apiUrl: process.env.HOTELIER_API_URL || fromFile.apiUrl || '',
    tenantId: process.env.HOTELIER_TENANT_ID || fromFile.tenantId || '',
    userId: process.env.HOTELIER_USER_ID || fromFile.userId || '',
    printerId: process.env.HOTELIER_PRINTER_ID || fromFile.printerId || '',
    printerName: process.env.HOTELIER_OS_PRINTER || fromFile.printerName || '',
    businessName: process.env.HOTELIER_BUSINESS_NAME || fromFile.businessName || '',
    columns: Number(process.env.HOTELIER_PRINTER_COLUMNS || fromFile.columns || 42),
    pollMs: Number(process.env.HOTELIER_AGENT_POLL_MS || fromFile.pollMs || DEFAULT_POLL_MS),
  };
  cfg.apiUrl = cfg.apiUrl.replace(/\/$/, '');
  return cfg;
}

function envBool(name, fallback) {
  if (process.env[name] === undefined) return Boolean(fallback);
  return ['1', 'true', 'yes', 'on'].includes(String(process.env[name]).toLowerCase());
}

async function api(cfg, pathName, init = {}) {
  if (!cfg.apiUrl || !cfg.tenantId) throw new Error('Agent is missing apiUrl or tenantId');
  const response = await fetch(`${cfg.apiUrl}${pathName}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': cfg.tenantId,
      ...(cfg.userId ? { 'x-user-id': cfg.userId } : {}),
      ...(init.headers || {}),
    },
  });
  if (response.status === 204) return null;
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function startPrintAgent() {
  const cfg = loadAgentConfig();
  if (!cfg.enabled) {
    console.log('[agent] disabled');
    return { enabled: false, status: () => ({ enabled: false, configPath: configPath() }) };
  }
  if (!cfg.apiUrl || !cfg.tenantId || !cfg.printerId || !cfg.printerName) {
    console.log('[agent] disabled - configure apiUrl, tenantId, printerId and printerName in agent-config.json');
    return { enabled: false, status: () => ({ enabled: false, configPath: configPath(), error: 'Missing agent config' }) };
  }

  const state = { running: false, lastOkAt: null, lastError: null, printed: 0, failed: 0 };
  const tick = async () => {
    if (state.running) return;
    state.running = true;
    try {
      const pending = await api(cfg, `/pos/print-jobs/pending?printerId=${encodeURIComponent(cfg.printerId)}`);
      const jobs = pending.jobs || [];
      for (const job of jobs) {
        await handleJob(cfg, state, job);
      }
      state.lastOkAt = new Date().toISOString();
      state.lastError = null;
    } catch (error) {
      state.lastError = error && error.message ? error.message : String(error);
      console.log('[agent] poll failed:', state.lastError);
    } finally {
      state.running = false;
    }
  };

  console.log(`[agent] enabled - ${os.hostname()} hosts printer ${cfg.printerId} -> "${cfg.printerName}"`);
  const timer = setInterval(() => { void tick(); }, Math.max(1000, cfg.pollMs || DEFAULT_POLL_MS));
  void tick();
  return {
    enabled: true,
    status: () => ({ enabled: true, configPath: configPath(), printerId: cfg.printerId, printerName: cfg.printerName, ...state }),
    stop: () => clearInterval(timer),
  };
}

async function handleJob(cfg, state, job) {
  const claimed = await api(cfg, `/pos/print-jobs/${job.id}/claim`, { method: 'POST', body: JSON.stringify({ columns: cfg.columns }) }).catch(() => null);
  if (!claimed || !claimed.job) return;
  try {
    if (claimed.job.kind !== 'DISPATCH') {
      throw new Error(`Print agent supports dispatch slips only; got ${claimed.job.kind}`);
    }
    if (!claimed.data) throw new Error('HOTELIER did not return print bytes; update the server');
    const bytes = Buffer.from(claimed.data, 'base64');
    const result = await printRaw(cfg.printerName, bytes);
    console.log(`[agent] printed job ${job.id} on "${cfg.printerName}": ${result}`);
    await api(cfg, `/pos/print-jobs/${job.id}/complete`, { method: 'POST', body: '{}' });
    state.printed += 1;
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    console.log(`[agent] job ${job.id} failed: ${message}`);
    await api(cfg, `/pos/print-jobs/${job.id}/fail`, { method: 'POST', body: JSON.stringify({ error: message.slice(0, 300) }) }).catch(() => {});
    state.failed += 1;
  }
}

module.exports = { startPrintAgent, loadAgentConfig };
