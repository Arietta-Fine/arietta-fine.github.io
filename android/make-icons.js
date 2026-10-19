// ============================================================
//  CLOUD LADDER 安卓版 — 图标生成
//  纯 Node 手写 PNG 编码器，不依赖任何三方库。
//  构图与 mobile/build.js 里的网页版图标同源：深底 + 白云 + 站在云上的小人。
//
//  产出：
//    res/mipmap-*/ic_launcher.png            传统图标（深底）
//    res/mipmap-*/ic_launcher_foreground.png 自适应图标前景（透明底，内容缩进安全区）
//    dist/icon-512.png                       应用商店用的高清图标
//
//  用法:  node android/make-icons.js
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = __dirname;
const resDir = path.join(root, 'res');
const distDir = path.join(root, 'dist');

// ------------------------------------------------------------
//  最小 PNG 编码器
// ------------------------------------------------------------
const CRC_TABLE = (function () {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
}

/** pixel(x,y) -> [r,g,b,a] */
function makePng(size, pixel) {
    const stride = size * 4 + 1;
    const raw = Buffer.alloc(stride * size);
    for (let y = 0; y < size; y++) {
        raw[y * stride] = 0;                        // filter: none
        for (let x = 0; x < size; x++) {
            const c = pixel(x, y);
            const o = y * stride + 1 + x * 4;
            raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
            raw[o + 3] = c[3] === undefined ? 255 : c[3];
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;    // bit depth
    ihdr[9] = 6;    // RGBA
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        pngChunk('IEND', Buffer.alloc(0))
    ]);
}

// ------------------------------------------------------------
//  图形：归一化坐标 0..1
// ------------------------------------------------------------
const BG = [16, 17, 20, 255];        // #101114
const WHITE = [238, 241, 248, 255];
const CLEAR = [0, 0, 0, 0];

const BLOBS = [
    { x: 0.30, y: 0.625, r: 0.150 },
    { x: 0.50, y: 0.545, r: 0.195 },
    { x: 0.70, y: 0.625, r: 0.145 }
];
const BASE_Y0 = 0.625, BASE_Y1 = 0.755, BASE_X0 = 0.185, BASE_X1 = 0.815;
const MAN_X = 0.50, HEAD_Y = 0.265, HEAD_R = 0.052;
const BODY_BOT = 0.505, LIMB_W = 0.028;
const ARM_Y = 0.345, ARM_SPAN = 0.105;
const LEG_Y = HEAD_Y + 0.155, LEG_SPAN = 0.075;

/** 返回 'cloud' | 'man' | null */
function glyph(x, y) {
    let man = false;
    if ((x - MAN_X) * (x - MAN_X) + (y - HEAD_Y) * (y - HEAD_Y) <= HEAD_R * HEAD_R) man = true;
    if (!man && Math.abs(x - MAN_X) <= LIMB_W * 0.5 && y >= HEAD_Y && y <= BODY_BOT) man = true;
    if (!man && Math.abs(y - ARM_Y) <= LIMB_W * 0.5 && Math.abs(x - MAN_X) <= ARM_SPAN) man = true;
    if (!man && y >= LEG_Y && y <= BODY_BOT) {
        const t = (y - LEG_Y) / (BODY_BOT - LEG_Y);
        if (Math.abs(Math.abs(x - MAN_X) - t * LEG_SPAN) <= LIMB_W * 0.5) man = true;
    }
    if (man && y < BASE_Y0 + 0.02) return 'man';

    if (x >= BASE_X0 && x <= BASE_X1 && y >= BASE_Y0 && y <= BASE_Y1) return 'cloud';
    for (let i = 0; i < BLOBS.length; i++) {
        const b = BLOBS[i];
        if ((x - b.x) * (x - b.x) + (y - b.y) * (y - b.y) <= b.r * b.r) return 'cloud';
    }
    return null;
}

/** 传统图标：深底不透明 */
function legacyPixel(size) {
    return function (px, py) {
        const g = glyph((px + 0.5) / size, (py + 0.5) / size);
        if (g === 'cloud') return WHITE;
        return BG;                       // 底和小人都是深色
    };
}

/** 自适应图标前景：透明底，内容缩进中心安全区（外层还要被系统裁成圆形） */
const SAFE = 0.167;                      // (1 - 0.667) / 2
function fgPixel(size) {
    const span = 1 - SAFE * 2;
    return function (px, py) {
        const x = ((px + 0.5) / size - SAFE) / span;
        const y = ((py + 0.5) / size - SAFE) / span;
        if (x < 0 || x > 1 || y < 0 || y > 1) return CLEAR;
        const g = glyph(x, y);
        if (g === 'cloud') return WHITE;
        return CLEAR;                    // 小人透明 -> 露出深色背景色
    };
}

// ------------------------------------------------------------
//  写盘
// ------------------------------------------------------------
const DENSITIES = [
    ['mdpi', 1],
    ['hdpi', 1.5],
    ['xhdpi', 2],
    ['xxhdpi', 3],
    ['xxxhdpi', 4]
];

function writePng(file, buf) {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, buf);
}

let total = 0;
for (let i = 0; i < DENSITIES.length; i++) {
    const name = DENSITIES[i][0];
    const k = DENSITIES[i][1];

    const legacySize = Math.round(48 * k);
    const legacy = makePng(legacySize, legacyPixel(legacySize));
    writePng(path.join(resDir, 'mipmap-' + name, 'ic_launcher.png'), legacy);
    total += legacy.length;

    const fgSize = Math.round(108 * k);
    const fg = makePng(fgSize, fgPixel(fgSize));
    writePng(path.join(resDir, 'mipmap-' + name, 'ic_launcher_foreground.png'), fg);
    total += fg.length;

    console.log(`  mipmap-${name.padEnd(8)} ic_launcher ${legacySize}px / foreground ${fgSize}px`);
}

const big = makePng(512, legacyPixel(512));
writePng(path.join(distDir, 'icon-512.png'), big);
total += big.length;

console.log(`图标生成完成：${DENSITIES.length * 2 + 1} 个 PNG，共 ${(total / 1024).toFixed(1)} KB`);
console.log(`应用商店图标: ${path.join(distDir, 'icon-512.png')}`);
