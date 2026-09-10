# HOTELIER print bridge

A tiny background service the client installs **once per machine**. The
HOTELIER web app sends raw ESC/POS to it over `http://127.0.0.1:47011`, and it
spools those bytes to a printer **by name** through the OS print spooler.

Use it when the printer can't be reached directly from the browser — i.e. an
old USB thermal printer that only works through its vendor driver. If the
printer is Bluetooth or driverless, the web app's built-in WebUSB / Web
Bluetooth path is simpler and this isn't needed.

Pure Node, **no native modules**:

- Windows — PowerShell `Get-Printer` to list, an inline C# `winspool`
  P/Invoke to write RAW.
- macOS / Linux — CUPS `lpstat` / `lp -o raw`.

## API

| Method & path | Body | Returns |
|---|---|---|
| `GET /` (or `/status`) | — | `{ ok, app, version, host }` |
| `GET /printers` | — | `{ ok, default, printers: [{ name, default, status }] }` |
| `POST /print` | `{ printer?: string, data: <base64 ESC/POS> }` | `{ ok, result }` / `{ ok:false, error }` |

Binds to `127.0.0.1` only. CORS is open and it answers Chrome's Private
Network Access preflight, so an `https://` page is allowed to call it.

## Run from source (needs Node installed)

```
npm install          # only devDeps — the service itself has none
npm start            # http://127.0.0.1:47011
```

Or on a client with Node already installed: drop this folder somewhere and
double-click `start-bridge.bat`.

## Build the single-file executable

```
npm install
npm run build        # -> dist/hotelier-print-bridge.exe  (~90 MB, no Node needed on the target)
```

Uses Node's built-in SEA (Single Executable Applications) — it's node.exe with
the bundled script appended, so run it on the OS/arch you want to ship for
(build on Windows for the .exe). Sign it before distribution or Windows
SmartScreen will warn on first run.

## Install on a client machine (Windows)

1. Copy `hotelier-print-bridge.exe` to `%LOCALAPPDATA%\HotelierPrintBridge\`.
2. Run `install.bat` from that folder (double-click). It:
   - adds a Startup shortcut so the bridge launches at login,
   - starts it now.
3. In HOTELIER: **Settings → Receipt Printer → Connection type = Local print
   bridge**, pick the printer from the list, done.

`uninstall.bat` removes the Startup shortcut and stops the running bridge.

Port can be overridden with the `HOTELIER_BRIDGE_PORT` env var (match it in the
app's bridge URL).

## Notes

- First time the app calls the bridge, Chrome may show a one-off "… wants to
  access devices on your local network" prompt — that's Private Network
  Access. Allow it.
- The console window must stay open (Startup keeps it running in the
  background; minimise it). Closing it stops printing.
