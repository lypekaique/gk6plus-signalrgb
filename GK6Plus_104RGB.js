// GK6+ 104 RGB  —  SignalRGB plugin
// Reverse-engineered from GK6+ 8.0.7 (DONGGUAN JIZHIDIANZI).
// Device: VID 0x1EA7 / PID 0x0907 (ModelID 656802056, firmware 0x84223311).
// Protocol: 64-byte vendor-HID reports (usage_page 0xFF00, usage 0x0050),
//           CRC16/CCITT-FALSE, per-key framebuffer via SetLEDefine/SaveLEDefine.
// See PROTOCOL.md for the full write-up.

export function Name() { return "GK6+ 104 RGB"; }
export function VendorId() { return 0x1EA7; }
export function ProductId() { return 0x0907; }
export function Publisher() { return "community (reverse-engineered)"; }
export function Documentation() { return "troubleshooting/GK6"; }
export function Size() { return [23, 7]; }
export function DefaultPosition() { return [10, 100]; }
export function DefaultScale() { return 8.0; }

/* global
device: readonly
controller: readonly
discovery: readonly
*/

export function ControllableParameters() {
    return [
        { "property": "shutdownColor", "group": "lighting", "label": "Shutdown Color", "min": "0", "max": "360", "type": "color", "default": "#000000" },
        { "property": "LightingMode",  "group": "lighting", "label": "Lighting Mode",  "type": "combobox", "values": ["Canvas", "Forced"], "default": "Canvas" },
        { "property": "forcedColor",   "group": "lighting", "label": "Forced Color",   "min": "0", "max": "360", "type": "color", "default": "#009bde" },
        { "property": "brightness",    "group": "lighting", "label": "Brightness (%)", "step": "1", "type": "number", "min": "0", "max": "100", "default": "100" },
    ];
}

// ---- LED layout (extracted from GK6+ keymap for model 656802056) ----
const vLedNames = ["Escape","F1","F2","F3","F4","F5","F6","F7","F8","F9","F10","F11","F12","Print Screen","Scroll Lock","Pause","`","1","2","3","4","5","6","7","8","9","0","-","=","Backspace","Insert","Home","Page Up","Num Lock","Keypad /","Keypad *","Keypad -","Tab","Q","W","E","R","T","Y","U","I","O","P","[","]","|","Delete","End","Page Down","Keypad 7","Keypad 8","Keypad 9","Keypad +","Caps Lock","A","S","D","F","G","H","J","K","L",";","'","Return","Keypad 4","Keypad 5","Keypad 6","Left Shift","Z","X","C","V","B","N","M",",",".","/","Right Shift","Up Arrow","Keypad 1","Keypad 2","Keypad 3","Keypad Enter","Left Control","Left GUI","Left Alt","Space","Right Alt","Fn","App","Right Control","Left Arrow","Down Arrow","Right Arrow","Keypad 0","Keypad .","Left Space","Right Space"];
const vLedPositions = [[0,0],[2,0],[3,0],[4,0],[5,0],[7,0],[8,0],[9,0],[10,0],[11,0],[12,0],[13,0],[14,0],[15,0],[16,0],[17,0],[0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],[11,1],[12,1],[13,1],[15,1],[16,1],[17,1],[19,1],[20,1],[21,1],[22,1],[0,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],[12,2],[13,2],[14,2],[15,2],[16,2],[17,2],[19,2],[20,2],[21,2],[22,2],[0,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[8,3],[9,3],[10,3],[11,3],[12,3],[13,3],[19,3],[20,3],[21,3],[0,4],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4],[8,4],[9,4],[10,4],[11,4],[12,4],[16,4],[19,4],[20,4],[21,4],[22,4],[0,5],[1,5],[3,5],[4,5],[10,5],[11,5],[13,5],[14,5],[15,5],[16,5],[17,5],[19,5],[21,5],[4,6],[7,6]];
// Firmware LED index (LocationCode) for each LED above — the slot it occupies
// in the keyboard's 132-LED framebuffer.
const vLedIndexes = [0,2,3,4,5,7,8,9,10,11,12,13,14,15,16,17,22,23,24,25,26,27,28,29,30,31,32,33,34,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,79,84,85,86,88,90,91,92,93,94,95,96,97,98,99,102,104,106,107,108,109,110,111,112,116,120,121,122,124,125,126,127,128,130,114,118];

export function LedNames() { return vLedNames; }
export function LedPositions() { return vLedPositions; }

const MATRIX_LEDS = 132;            // framebuffer holds 132 LEDs (DefaultMatrix)
const BUF_LEN = MATRIX_LEDS * 4;    // 4 bytes per LED: R, G, B, brightness
let lastPing = 0;

export function Initialize() {
    enterOnlineMode();
}

export function Render() {
    const now = Date.now();
    if (now - lastPing > 1000) {       // keep the board in online mode
        writeCmd(0x0c, 0x00, 0, []);   // Ping
        lastPing = now;
    }
    sendColors();
}

export function Shutdown(SystemSuspending) {
    const col = SystemSuspending ? "#000000" : (shutdownColor || "#000000");
    sendColors(col);
}

function enterOnlineMode() {
    writeCmd(0x0c, 0x00, 0, []);   // Ping
    device.pause(5);
    writeCmd(0x0b, 0x05, 0, []);   // CHANGE_MODE(5) -> software / "online" mode
    device.pause(5);
    writeCmd(0x0c, 0x00, 0, []);   // Ping
    lastPing = Date.now();
}

function sendColors(overrideColor) {
    // NOTE: the firmware ignores the per-LED 4th byte, so brightness can only be
    // applied by scaling R/G/B here (software dimming). It cannot exceed the
    // keyboard's hardware master brightness — raise that with Fn + brightness-up.
    const scale = Math.max(0, Math.min(100, Math.round(brightness))) / 100;
    const buf = new Array(BUF_LEN).fill(0);

    for (let i = 0; i < vLedPositions.length; i++) {
        let r, g, b;
        if (overrideColor !== undefined) {
            const c = hexToRgb(overrideColor);
            r = c[0]; g = c[1]; b = c[2];
        } else if (LightingMode === "Forced") {
            const c = hexToRgb(forcedColor);
            r = c[0]; g = c[1]; b = c[2];
        } else {
            const p = vLedPositions[i];
            const c = device.color(p[0], p[1]);
            r = c[0]; g = c[1]; b = c[2];
        }
        const slot = vLedIndexes[i] * 4;
        buf[slot]     = Math.round(r * scale);
        buf[slot + 1] = Math.round(g * scale);
        buf[slot + 2] = Math.round(b * scale);
        buf[slot + 3] = 100; // constant, matches GK6+ (firmware ignores this byte)
    }

    // Stream the framebuffer in 56-byte chunks, then latch it.
    for (let off = 0; off < BUF_LEN; off += 56) {
        const len = Math.min(56, BUF_LEN - off);
        const header = (off & 0xffff) + ((len << 24) & 0xff000000);
        writeCmd(0x1a, 0x01, header, buf.slice(off, off + len)); // SetLEDefine
    }
    writeCmd(0x1a, 0x02, 0, []); // SaveLEDefine (display the buffer)
}

// ---- transport ----

// Build a 64-byte report (+ leading 0x00 report id) and write it.
function writeCmd(cmd, sub, header, body) {
    const buf = new Array(64).fill(0);
    buf[0] = cmd & 0xff;
    buf[1] = sub & 0xff;
    buf[2] = header & 0xff;
    buf[3] = (header >>> 8) & 0xff;
    buf[4] = (header >>> 16) & 0xff;
    buf[5] = (header >>> 24) & 0xff;
    // bytes 6-7 (CRC) stay 0 while we fill the body, then we compute over all 64
    for (let i = 0; i < body.length && i < 56; i++) buf[8 + i] = body[i] & 0xff;
    const crc = crc16ccitt(buf);
    buf[6] = crc & 0xff;
    buf[7] = (crc >>> 8) & 0xff;

    const packet = [0x00];           // HID report id (Windows requires it)
    for (let i = 0; i < 64; i++) packet.push(buf[i]);
    device.write(packet, 65);
}

// CRC16/CCITT-FALSE: poly 0x1021, init 0xFFFF, no reflection, no xorout.
function crc16ccitt(data) {
    let crc = 0xffff;
    for (let i = 0; i < data.length; i++) {
        crc ^= (data[i] << 8) & 0xffff;
        for (let b = 0; b < 8; b++) {
            crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
        }
    }
    return crc & 0xffff;
}

function hexToRgb(hex) {
    hex = ("" + hex).replace("#", "");
    return [
        parseInt(hex.substring(0, 2), 16) || 0,
        parseInt(hex.substring(2, 4), 16) || 0,
        parseInt(hex.substring(4, 6), 16) || 0,
    ];
}

// Bind to the vendor control interface only.
export function Validate(endpoint) {
    return endpoint.usage_page === 0xff00 && endpoint.usage === 0x0050;
}

export function ImageUrl() {
    return "";
}
