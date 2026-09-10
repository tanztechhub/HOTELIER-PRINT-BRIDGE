/**
 * Printer enumeration + RAW spooling with no native modules — everything goes
 * through the OS tools:
 *   Windows : PowerShell (Get-Printer) + an inline C# winspool P/Invoke for RAW
 *   macOS / Linux : CUPS `lpstat` / `lp -o raw`
 */

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const IS_WIN = process.platform === 'win32';

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 4 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = String(stderr || '');
        reject(err);
      } else {
        resolve(String(stdout || ''));
      }
    });
  });
}

// ---------------------------------------------------------------- list

async function listPrinters() {
  if (IS_WIN) {
    const out = await run('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      'Get-Printer | Select-Object Name, @{n="Default";e={$_.Name -eq (Get-CimInstance Win32_Printer -Filter "Default=TRUE" -ErrorAction SilentlyContinue).Name}}, PrinterStatus | ConvertTo-Json -Compress',
    ]);
    let parsed = JSON.parse(out.trim() || 'null');
    if (parsed && !Array.isArray(parsed)) parsed = [parsed];
    return {
      default: (parsed || []).find((p) => p.Default)?.Name || null,
      printers: (parsed || []).map((p) => ({ name: p.Name, default: !!p.Default, status: String(p.PrinterStatus ?? '') })),
    };
  }

  // CUPS
  const [pOut, dOut] = await Promise.all([
    run('lpstat', ['-p']).catch(() => ''),
    run('lpstat', ['-d']).catch(() => ''),
  ]);
  const def = (dOut.match(/:\s*(.+)\s*$/m) || [])[1]?.trim() || null;
  const names = [...pOut.matchAll(/^printer\s+(\S+)/gm)].map((m) => m[1]);
  return { default: def, printers: names.map((n) => ({ name: n, default: n === def, status: '' })) };
}

// ---------------------------------------------------------------- print RAW

const WIN_RAW_PS = `
$ErrorActionPreference = "Stop"
Add-Type -Namespace HotelierBridge -Name Raw -MemberDefinition @'
[DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
public static extern bool OpenPrinter(string src, out IntPtr h, IntPtr d);
[DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)]
public static extern bool ClosePrinter(IntPtr h);
[DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
public static extern bool StartDocPrinter(IntPtr h, int level, [In] ref DOCINFO di);
[DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)]
public static extern bool EndDocPrinter(IntPtr h);
[DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)]
public static extern bool StartPagePrinter(IntPtr h);
[DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)]
public static extern bool EndPagePrinter(IntPtr h);
[DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)]
public static extern bool WritePrinter(IntPtr h, byte[] buf, int count, out int written);
[StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
public struct DOCINFO { [MarshalAs(UnmanagedType.LPWStr)] public string name; [MarshalAs(UnmanagedType.LPWStr)] public string output; [MarshalAs(UnmanagedType.LPWStr)] public string datatype; }
public static string Send(string printer, string file) {
  byte[] bytes = System.IO.File.ReadAllBytes(file);
  IntPtr h;
  if (!OpenPrinter(printer, out h, IntPtr.Zero)) return "OpenPrinter failed: " + Marshal.GetLastWin32Error();
  try {
    DOCINFO di = new DOCINFO(); di.name = "HOTELIER receipt"; di.datatype = "RAW";
    if (!StartDocPrinter(h, 1, ref di)) return "StartDocPrinter failed: " + Marshal.GetLastWin32Error();
    if (!StartPagePrinter(h)) return "StartPagePrinter failed: " + Marshal.GetLastWin32Error();
    int written;
    if (!WritePrinter(h, bytes, bytes.Length, out written)) return "WritePrinter failed: " + Marshal.GetLastWin32Error();
    EndPagePrinter(h); EndDocPrinter(h);
    return "OK " + written;
  } finally { ClosePrinter(h); }
}
'@
$r = [HotelierBridge.Raw]::Send($env:HB_PRINTER, $env:HB_FILE)
if ($r -notlike "OK*") { Write-Error $r } else { Write-Output $r }
`.trim();

async function printRaw(printerName, buffer) {
  const tmp = path.join(os.tmpdir(), `hotelier-receipt-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
  fs.writeFileSync(tmp, buffer);
  try {
    if (IS_WIN) {
      if (!printerName) throw new Error('No printer name provided.');
      const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WIN_RAW_PS], {
        env: { ...process.env, HB_PRINTER: printerName, HB_FILE: tmp },
      });
      return out.trim();
    }
    // CUPS: `lp` with raw so it isn't filtered
    const args = ['-o', 'raw', '-o', 'job-sheets=none'];
    if (printerName) args.unshift('-d', printerName);
    args.push(tmp);
    const out = await run('lp', args);
    return out.trim();
  } finally {
    fs.unlink(tmp, () => {});
  }
}

module.exports = { listPrinters, printRaw };
