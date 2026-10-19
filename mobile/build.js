// ============================================================
//  CLOUD LADDER 手机版 — 打包脚本
//  把 src/engine.js + src/shell.js 内联成一个自包含的单文件 HTML，
//  并生成内嵌的 App 图标（纯 Node 手写 PNG，不依赖任何三方库）。
//
//  用法:  node mobile/build.js
//  产物:  mobile/dist/CloudClimb.html
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = __dirname;
const srcDir = path.join(root, 'src');
const outDir = path.join(root, 'dist');

// ------------------------------------------------------------
//  最小 PNG 编码器（用于生成 App 图标）
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

/** pixel(x,y) -> [r,g,b] */
function makePng(size, pixel) {
    const stride = size * 4 + 1;
    const raw = Buffer.alloc(stride * size);
    for (let y = 0; y < size; y++) {
        raw[y * stride] = 0;                       // filter: none
        for (let x = 0; x < size; x++) {
            const c = pixel(x, y);
            const o = y * stride + 1 + x * 4;
            raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = 255;
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

/** 图标：深底 + 白云 + 站在云上的小人剪影 */
function appIcon(size) {
    const S = size;
    const BG = [16, 17, 20];
    const WHITE = [238, 241, 248];

    const blobs = [
        { x: S * 0.30, y: S * 0.625, r: S * 0.150 },
        { x: S * 0.50, y: S * 0.545, r: S * 0.195 },
        { x: S * 0.70, y: S * 0.625, r: S * 0.145 }
    ];
    const baseY0 = S * 0.625, baseY1 = S * 0.755, baseX0 = S * 0.185, baseX1 = S * 0.815;

    const manX = S * 0.50, headY = S * 0.265, headR = S * 0.052;
    const bodyTop = headY, bodyBot = S * 0.505, limbW = S * 0.028;
    const armY = S * 0.345, armSpan = S * 0.105;
    const legY = headY + S * 0.155, legSpan = S * 0.075;

    return function (x, y) {
        // 小人（用底色画，站在云上）
        let man = false;
        if ((x - manX) * (x - manX) + (y - headY) * (y - headY) <= headR * headR) man = true;
        if (!man && Math.abs(x - manX) <= limbW * 0.5 && y >= bodyTop && y <= bodyBot) man = true;
        if (!man && Math.abs((y - armY)) <= limbW * 0.5 &&
            Math.abs(x - manX) <= armSpan) man = true;
        if (!man && y >= legY && y <= bodyBot) {
            const t = (y - legY) / Math.max(1, bodyBot - legY);
            if (Math.abs(Math.abs(x - manX) - t * legSpan) <= limbW * 0.5) man = true;
        }
        if (man && y < baseY0 + S * 0.02) return BG;

        // 云
        if (x >= baseX0 && x <= baseX1 && y >= baseY0 && y <= baseY1) return WHITE;
        for (let i = 0; i < blobs.length; i++) {
            const b = blobs[i];
            if ((x - b.x) * (x - b.x) + (y - b.y) * (y - b.y) <= b.r * b.r) return WHITE;
        }
        return BG;
    };
}

// ------------------------------------------------------------
//  组装单文件 HTML
// ------------------------------------------------------------
const engine = fs.readFileSync(path.join(srcDir, 'engine.js'), 'utf8');
const shell = fs.readFileSync(path.join(srcDir, 'shell.js'), 'utf8');

if (engine.indexOf('</script') >= 0 || shell.indexOf('</script') >= 0) {
    throw new Error('源码里出现 </script，会破坏内联，请改写成 "<\\/script"');
}

const icon = makePng(180, appIcon(180));
const iconB64 = icon.toString('base64');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>云梯 CLOUD LADDER</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#101114">
<meta name="description" content="踩云向上跳的极简线条小游戏：每朵云只能踩一次，踩到就自动弹起。">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="云梯">
<link rel="apple-touch-icon" href="data:image/png;base64,${iconB64}">
<link rel="icon" href="data:image/png;base64,${iconB64}">
<style>
  html, body {
    margin: 0; padding: 0; height: 100%; overflow: hidden;
    background: #0b0c0e;
    touch-action: none; overscroll-behavior: none;
    -webkit-user-select: none; user-select: none;
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
  }
  body {
    position: fixed; inset: 0;
    display: flex; align-items: center; justify-content: center;
  }
  canvas { display: block; touch-action: none; }
</style>
</head>
<body>
<canvas id="game" width="480" height="640"></canvas>
<script>
${engine}
</script>
<script>
${shell}
</script>
</body>
</html>
`;

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'CloudClimb.html');
fs.writeFileSync(outFile, html, 'utf8');

// 额外落两份真实图标文件：
// iOS Safari 对 apple-touch-icon 的 data URI 支持不稳，用 serve.js 以
// /apple-touch-icon.png 提供同一个图，添加到主屏幕时才会用上它。
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), icon);
fs.writeFileSync(path.join(outDir, 'icon-512.png'), makePng(512, appIcon(512)));

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log(`[1/3] 图标已生成: ${icon.length} 字节 PNG (180x180，已内嵌)`);
console.log(`[2/3] 独立图标已导出: apple-touch-icon.png / icon-512.png`);
console.log(`[3/3] 打包完成: ${outFile}  (${kb} KB，单文件)`);
