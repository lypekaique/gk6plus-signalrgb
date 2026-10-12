# GK6+ RGB protocol — reverse-engineering notes

How **GK6+ 8.0.7** (DONGGUAN JIZHIDIANZI) drives the keyboard lighting, and how to
reproduce it. Derived by unpacking `app.asar` (the app is Electron) and reading the
main-process source in `src/libs/`.

- **Your device:** VID `0x1EA7`, PID `0x0907` — reported ModelID **656802056**,
  firmware `0x84223311` ("104RGB", a 104-key full-size board).
- **Driver source:** `src/libs/driver.js`, `src/libs/cmd.js`, `src/libs/utils.js`,
  `src/drivers/cor-m3-mk.js`.
- **Layout:** `resources/device/656802056/data/keymap.js` → 106 physical LEDs.

---

## 1. Transport

The app talks to the keyboard with **`node-hid`** over the **vendor-defined HID
interface** (Windows device `...&MI_01`):

| Property     | Value    |
|--------------|----------|
| usage_page   | `0xFF00` |
| usage        | `0x0050` |
| interface    | `1` (MI_01) |

It explicitly ignores the normal keyboard interface (it skips any HID path ending in
`\kbd`). Every command is a **fixed 64-byte output report**. On Windows node-hid
requires a leading report-id byte, so the app prepends `0x00` and writes **65 bytes**:

```
[0x00] [ 64-byte command .............................. ]
```

## 2. Command frame (`cmd.js` → `CMD.toBuffer`)

Each 64-byte command is laid out as:

| Offset | Size | Field     | Notes                                             |
|-------:|-----:|-----------|---------------------------------------------------|
| 0      | 1    | `cmd`     | opcode                                            |
| 1      | 1    | `sub_cmd` | sub-opcode                                         |
| 2      | 4    | `header`  | uint32 **little-endian** (meaning depends on cmd) |
| 6      | 2    | `crc`     | uint16 **LE**, CRC16/CCITT-FALSE                  |
| 8      | 56   | `body`    | payload, zero-padded                              |

**CRC** = CRC16/CCITT-FALSE (poly `0x1021`, init `0xFFFF`, no reflection, no xorout),
computed over the **whole 64-byte frame with the CRC field still zeroed**, then written
back into bytes 6–7. (Responses echo `cmd` in byte 0; `sub`/ack in byte 1.)

## 3. Opcodes used

| Name          | cmd / sub   | header                    | body                                    |
|---------------|-------------|---------------------------|-----------------------------------------|
| VER           | `01 / 01`   | —                         | resp: FWID(u32@8), FWVersion(u16@12)    |
| DEVICE_ID     | `01 / 02`   | —                         | resp: 6-byte id @8                      |
| MODEL_ID      | `01 / 08`   | —                         | resp: u32 @8                            |
| MATRIX        | `01 / 09`   | —                         | resp: cols@8, rows@9                    |
| CHANGE_MODE   | `0B / mode` | —                         | `mode 5` = software ("online") control  |
| Ping          | `0C / 00`   | —                         | keep-alive                              |
| setLEConfig   | `17 / 01`   | 0                         | **built-in effect** (see §5)            |
| **SetLEDefine** | `1A / 01` | `addr \| (len<<24)`       | **per-key colour chunk** (see §4)       |
| **SaveLEDefine**| `1A / 02` | —                         | latch / display the framebuffer         |
| SetKeyTable   | `16 / type` | `addr \| (len<<24)`       | key remap tables                        |

## 4. Per-key colour — the part you asked about

This is the "online"/software path (`driver.js → Display()`), used for custom per-key
colour and for software-rendered effects.

1. **Enter online mode** once: `Ping` → `CHANGE_MODE(5)` → `Ping`, and keep sending
   `Ping` every ~2 s or the board falls back to its hardware effect.
2. **Build a framebuffer** of `132 LEDs × 4 bytes = 528 bytes`. Each LED is:

   ```
   [ R, G, B, brightness ]      // app hard-codes brightness = 100
   ```

   > **Measured on 1EA7:0907:** the 4th byte is **ignored** by the firmware
   > (100 vs 255 look identical). There is **no software master-brightness
   > command** anywhere in the protocol — the full opcode table is in §3.
   > Overall brightness is the keyboard's **hardware** level, changed only with
   > the on-board **Fn + brightness** keys (it persists across power cycles).
   > To dim in software, scale R/G/B yourself; you can't exceed the hardware level.

   The LED's slot is `LocationCode * 4` (see the layout file — e.g. Esc = 0, A = 67).
   Colours are plain 8-bit R/G/B; LEDs you don't set stay `00 00 00 00` (off).
3. **Stream it** in 56-byte chunks with `SetLEDefine`: offsets `0,56,112,…,504`
   (last chunk 24 bytes). `header = offset | (chunkLen << 24)`.
4. **`SaveLEDefine`** to display the buffer. The app re-sends the whole thing
   (10× SetLEDefine + 1× SaveLEDefine) every frame when animating.

So one full frame = **11 reports**. That is exactly what the SignalRGB plugin does in
`Render()`.

## 5. Built-in hardware effects (for reference, not used by the plugin)

`setLEConfig` (`17/01`) selects a firmware effect instead of per-key colour. Body (9 B):

```
[ LEModel, LESubModel, brightness, speed, direction, R, G, B, enable ]
```

e.g. `LEModel 240` + params. These run on the keyboard with no PC involved; the
per-key path in §4 overrides them while online mode is active.

## 6. Gotchas

- **Close GK6+ before driving the board yourself** — it pings the device in online
  mode and will fight you for it.
- `header` is little-endian; the top byte doubling as chunk length is intentional.
- The framebuffer is always 132 LEDs even though only 106 are physical; the gaps are
  empty matrix cells and can be left zero.
- CRC is over the zeroed-CRC frame — don't forget to clear bytes 6–7 first.
- Brightness is a *separate* 4th byte per LED, not pre-multiplied into R/G/B.
