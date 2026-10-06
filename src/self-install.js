const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');

function isWindowsExe() {
  return process.platform === 'win32' && path.basename(process.execPath).toLowerCase() === 'hotelier-print-bridge.exe';
}

function appDir() {
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'HotelierPrintBridge');
}

function shouldSelfInstall() {
  if (process.env.HOTELIER_NO_SELF_INSTALL === '1') return false;
  if (!isWindowsExe()) return false;
  const dir = path.dirname(process.execPath).toLowerCase();
  return dir !== appDir().toLowerCase();
}

function psQuote(value) {
  return String(value).replace(/'/g, "''");
}

function selfInstallAndRelaunch() {
  if (!shouldSelfInstall()) return false;

  const targetDir = appDir();
  const targetExe = path.join(targetDir, 'hotelier-print-bridge.exe');
  const startup = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  const shortcut = path.join(startup, 'HOTELIER Print Bridge.lnk');

  fs.mkdirSync(targetDir, { recursive: true });
  fs.mkdirSync(startup, { recursive: true });
  fs.copyFileSync(process.execPath, targetExe);

  const cfg = path.join(targetDir, 'agent-config.json');
  if (!fs.existsSync(cfg)) {
    fs.writeFileSync(cfg, JSON.stringify({
      enabled: false,
      apiUrl: 'https://server.hoteliermanagement.app/api',
      tenantId: '',
      printerId: '',
      printerName: '',
      businessName: '',
      columns: 42,
      pollMs: 3000,
    }, null, 2));
  }

  const command = [
    `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${psQuote(shortcut)}')`,
    `$s.TargetPath='${psQuote(targetExe)}'`,
    `$s.WorkingDirectory='${psQuote(targetDir)}'`,
    '$s.WindowStyle=7',
    "$s.Description='HOTELIER print bridge'",
    '$s.Save()',
  ].join(';');
  spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true });

  spawn(targetExe, { cwd: targetDir, detached: true, stdio: 'ignore', windowsHide: false }).unref();
  console.log(`HOTELIER print bridge installed to ${targetDir}`);
  console.log('It will start automatically when this Windows user logs in.');
  return true;
}

module.exports = { selfInstallAndRelaunch, appDir };
