const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadAgentConfig, startPrintAgent } = require('./agent');

test('Windows config encodings load and invalid config does not crash the bridge', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hotelier-agent-test-'));
  const previous = process.env.HOTELIER_AGENT_CONFIG;
  const file = path.join(dir, 'agent-config.json');
  process.env.HOTELIER_AGENT_CONFIG = file;
  const config = JSON.stringify({ enabled: true, apiUrl: 'https://example.test/api', tenantId: 'tenant', printerId: 'printer', printerName: 'Store', columns: 42 });
  try {
    for (const contents of [Buffer.from(config), Buffer.from('\uFEFF' + config), Buffer.concat([Buffer.from([255, 254]), Buffer.from(config, 'utf16le')])]) {
      fs.writeFileSync(file, contents);
      assert.equal(loadAgentConfig().printerName, 'Store');
      assert.equal(loadAgentConfig().enabled, true);
    }
    fs.writeFileSync(file, '{broken');
    const agent = startPrintAgent();
    assert.equal(agent.enabled, false);
    assert.match(agent.status().lastError, /Cannot read agent config/);
  } finally {
    if (previous === undefined) delete process.env.HOTELIER_AGENT_CONFIG;
    else process.env.HOTELIER_AGENT_CONFIG = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
