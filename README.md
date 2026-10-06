# HOTELIER print bridge

A tiny background service the client installs once per machine. The HOTELIER
web app sends raw ESC/POS to it over `http://127.0.0.1:47011`, and it spools
those bytes to a printer by name through the OS print spooler.

Use it when the printer cannot be reached directly from the browser, for
example an old USB or LAN thermal printer that works through its Windows
driver.

Pure Node, no native modules:

- Windows: PowerShell `Get-Printer` to list, an inline C# `winspool` P/Invoke
  to write RAW.
- macOS / Linux: CUPS `lpstat` / `lp -o raw`.

## API

| Method & path | Body | Returns |
|---|---|---|
| `GET /` or `/status` | - | `{ ok, app, version, host, agent }` |
| `GET /printers` | - | `{ ok, default, printers: [{ name, default, status }] }` |
| `POST /print` | `{ printer?: string, data: <base64 ESC/POS> }` | `{ ok, result }` or `{ ok:false, error }` |

Binds to `127.0.0.1` only. CORS is open and it answers Chrome's Private
Network Access preflight, so an HTTPS page is allowed to call loopback.

## Run from source

```bat
npm install
npm start
```

Or on a client with Node already installed, drop this folder somewhere and
double-click `start-bridge.bat`.

## Build the single-file executable

```bat
npm install
npm run build
```

Output is `dist/hotelier-print-bridge.exe`.

## Install on a client machine

1. Put `hotelier-print-bridge.exe` beside `install.bat`.
2. Optional for automatic dispatch printing: put a completed
   `agent-config.json` beside it too.
3. Double-click `install.bat`.

The installer copies files to `%LOCALAPPDATA%\HotelierPrintBridge`, adds a
Startup shortcut, and starts the bridge immediately.

`uninstall.bat` removes the Startup shortcut and stops the running bridge.

Port can be overridden with the `HOTELIER_BRIDGE_PORT` env var. Match it in the
app's bridge URL.

## Automatic dispatch print agent

For a LAN printer hosted by a reliable restaurant PC, the bridge can also poll
HOTELIER directly for queued dispatch slips and print them even when the
browser tab is closed.

1. Copy `agent-config.example.json` to `agent-config.json`.
2. Fill:
   - `apiUrl`: usually `https://server.hoteliermanagement.app/api`
   - `tenantId`: the workspace tenant id
   - `printerId`: the HOTELIER Printer row id configured as the store/default printer
   - `printerName`: the exact Windows printer name from `Get-Printer`
   - `businessName`: optional header on the dispatch slip
3. Restart `hotelier-print-bridge.exe`.
4. Open `http://127.0.0.1:47011/status`; `agent.enabled` should be `true`.

Only dispatch slips are printed by the headless agent in this version. Receipts
can still use the normal browser relay or local bridge flow.

## Notes

- First time the app calls the bridge, Chrome may show a one-off local network
  access prompt. Allow it.
- The bridge must be running on the host PC. Startup starts it at login;
  closing it stops browser bridge printing and the headless dispatch agent.
