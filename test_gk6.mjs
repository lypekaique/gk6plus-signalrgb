// Standalone validator for the GK6+ 104 RGB protocol (no SignalRGB needed).
//
//   cd gk6plus-signalrgb
//   npm install node-hid
//   node test_gk6.mjs red          # fill solid red
//   node test_gk6.mjs 00ff88       # fill a hex colour
//   node test_gk6.mjs cycle        # R -> G -> B -> off (default)
//
// IMPORTANT: close GK6+ first, or it will fight this script for the device.

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const HID = require('node-hid');

const VID = 0x1ea7;
const PID = 0x0907;
const MATRIX_LEDS = 132;
const BUF_LEN = MATRIX_LEDS * 4;

// --- CRC16/CCITT-FALSE (matches GK6's table) ---
function crc16(data) {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= (data[i] << 8) & 0xffff;
    for (let b = 0; b < 8; b++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc & 0xffff;
}

function packet(cmd, sub, header, body = []) {
  const buf = Buffer.alloc(64);
  buf[0] = cmd;
  buf[1] = sub;
  buf.writeUInt32LE(header >>> 0, 2);
  for (let i = 0; i < body.length && i < 56; i++) buf[8 + i] = body[i] & 0xff;
  buf.writeUInt16LE(crc16(buf), 6);
  return Buffer.concat([Buffer.from([0x00]), buf]); // 0x00 = HID report id
}

function findDevice() {
  const all = HID.devices(VID, PID);
  // vendor control interface: usagePage 0xFF00, usage 0x50
  let d = all.find((x) => x.usagePage === 0xff00 && x.usage === 0x0050);
  if (!d) d = all.find((x) => x.usagePage === 0xff00);
  if (!d) {
    console.error('Interfaces found for 1EA7:0907:');
    all.forEach((x) =>
      console.error(
        `  path=${x.path} usagePage=0x${(x.usagePage || 0).toString(16)} usage=0x${(x.usage || 0).toString(16)} iface=${x.interface}`,
      ),
    );
    throw new Error('vendor interface (usagePage 0xFF00) not found');
  }
  return d;
}

const dev = new HID.HID(findDevice().path);
const write = (p) => dev.write([...p]);

function enterOnline() {
  write(packet(0x0c, 0x00, 0)); // Ping
  write(packet(0x0b, 0x05, 0)); // CHANGE_MODE(5)
  write(packet(0x0c, 0x00, 0)); // Ping
}

function fill(r, g, b, bright = 100) {
  const buf = Buffer.alloc(BUF_LEN);
  for (let led = 0; led < MATRIX_LEDS; led++) {
    buf[led * 4] = r;
    buf[led * 4 + 1] = g;
    buf[led * 4 + 2] = b;
    buf[led * 4 + 3] = bright;
  }
  for (let off = 0; off < BUF_LEN; off += 56) {
    const len = Math.min(56, BUF_LEN - off);
    const header = (off & 0xffff) + ((len << 24) & 0xff000000);
    write(packet(0x1a, 0x01, header, buf.slice(off, off + len))); // SetLEDefine
  }
  write(packet(0x1a, 0x02, 0)); // SaveLEDefine
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAMED = { red: [255, 0, 0], green: [0, 255, 0], blue: [0, 0, 255], white: [255, 255, 255], off: [0, 0, 0] };

const arg = (process.argv[2] || 'cycle').toLowerCase();
enterOnline();

// keep online mode alive during the test
const ping = setInterval(() => write(packet(0x0c, 0x00, 0)), 1500);

if (arg === 'cycle') {
  for (const [r, g, b] of [NAMED.red, NAMED.green, NAMED.blue, NAMED.off]) {
    fill(r, g, b);
    await sleep(1200);
  }
} else if (NAMED[arg]) {
  fill(...NAMED[arg]);
  await sleep(500);
} else if (/^[0-9a-f]{6}$/.test(arg)) {
  fill(parseInt(arg.slice(0, 2), 16), parseInt(arg.slice(2, 4), 16), parseInt(arg.slice(4, 6), 16));
  await sleep(500);
} else {
  console.error('usage: node test_gk6.mjs [red|green|blue|white|off|RRGGBB|cycle]');
}

clearInterval(ping);
dev.close();
console.log('done');
