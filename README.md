# GK6+ 104 RGB → SignalRGB

Reverse-engineered control of a GK6+ keyboard (VID `0x1EA7`, PID `0x0907`,
ModelID 656802056 / "104RGB") so SignalRGB — or any script — can drive its per-key RGB.

Full protocol write-up: [PROTOCOL.md](PROTOCOL.md).

## Files

| File | What it is |
|------|------------|
| `GK6Plus_104RGB.js` | SignalRGB device plugin (106 LEDs, per-key). |
| `test_gk6.mjs` | Standalone Node validator — proves the protocol without SignalRGB. |
| `PROTOCOL.md` | How GK6+ passes colours (transport, frame, opcodes, framebuffer). |

## Validate the protocol first (recommended)

```bash
cd gk6plus-signalrgb
npm install node-hid
# Close GK6+ first! It holds the device in online mode.
node test_gk6.mjs cycle      # keys go red -> green -> blue -> off
node test_gk6.mjs 00ff88     # or any RRGGBB
```

If the keys change colour, the protocol is confirmed and the plugin will work.

## Install the SignalRGB plugin

1. Quit GK6+ (and disable it at startup) — two apps can't own the lighting at once.
2. Put **`GK6Plus_104RGB.js`** into SignalRGB's plugin folder:
   `Documents\WhirlwindFX\Plugins\` (SignalRGB → **Devices → Add Custom Device /
   open plugin folder** points you there). The only file SignalRGB needs is that
   one `.js`.
3. In SignalRGB, enable **Developer / "Add custom device"** if needed, then reload
   plugins (or restart SignalRGB). The keyboard shows up as **"GK6+ 104 RGB"**.
4. Per-device options: **Lighting Mode** (Canvas = follow effects, Forced = one
   colour) and **Brightness**.

### Pull it from GitHub as an add-on

```powershell
# one-time: grab just the plugin into SignalRGB's Plugins folder
curl -L -o "$env:USERPROFILE\Documents\WhirlwindFX\Plugins\GK6Plus_104RGB.js" `
  https://raw.githubusercontent.com/lypekaique/gk6plus-signalrgb/master/GK6Plus_104RGB.js
```

…or clone the whole repo somewhere and copy `GK6Plus_104RGB.js` over on each update:

```powershell
git clone https://github.com/lypekaique/gk6plus-signalrgb
# then copy GK6Plus_104RGB.js into Documents\WhirlwindFX\Plugins\
```

To **update** later, re-run the `curl` line (or `git pull` + copy) and reload plugins
in SignalRGB.

## Notes / tuning

- **LED layout** was extracted from GK6+'s own `keymap.js`. Positions are a 23×7 grid;
  the split-spacebar sub-LEDs sit on the bottom row. If any key looks off in the
  SignalRGB canvas, tweak its entry in `vLedPositions` inside the plugin.
- The board needs a **ping ~every 2 s** to stay in software mode; the plugin sends one
  from `Render()`.
- Each frame is 10 `SetLEDefine` writes + 1 `SaveLEDefine`. If you see flicker on very
  fast effects, that's the chunked flush; it matches what GK6+ itself does.
- Other GK6+ models use the **same protocol** — only the LED count and the
  `LocationCode → position` map differ (read that model's `keymap.js`).
