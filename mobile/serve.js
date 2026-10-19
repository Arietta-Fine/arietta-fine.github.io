// ============================================================
//  CLOUD LADDER 手机版 — 局域网分享小服务器
//
//  在电脑上跑起来，手机连同一个 WiFi 就能用浏览器打开玩。
//  这也是 iPhone / iPad 上唯一的「装成 App」路径：
//  Safari 打开 → 分享 → 添加到主屏幕 → 从图标全屏启动（无地址栏）。
//
//  用法:  node mobile/serve.js
//         node mobile/serve.js 8080     指定端口
// ============================================================
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const port = parseInt(process.argv[2], 10) || 8080;
const distDir = path.join(__dirname, 'dist');
const file = path.join(distDir, 'CloudClimb.html');

if (!fs.existsSync(file)) {
    console.error('找不到 dist/CloudClimb.html，请先运行:  node mobile/build.js');
    process.exit(1);
}

function localIPs() {
    const out = [];
    const ifaces = os.networkInterfaces();
    Object.keys(ifaces).forEach(function (name) {
        (ifaces[name] || []).forEach(function (info) {
            if (info.family === 'IPv4' && !info.internal) out.push(info.address);
        });
    });
    return out;
}

function sendFile(res, p, type) {
    if (!fs.existsSync(p)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('not found');
        return;
    }
    const buf = fs.readFileSync(p);
    res.writeHead(200, {
        'Content-Type': type,
        'Cache-Control': 'no-cache',
        'Content-Length': buf.length
    });
    res.end(buf);
}

const server = http.createServer(function (req, res) {
    const url = (req.url || '/').split('?')[0];

    // iOS「添加到主屏幕」会来要这几个固定路径的图标；
    // 内嵌的 data URI 不一定被 Safari 认，所以这里补一份真文件。
    if (url === '/apple-touch-icon.png' || url === '/apple-touch-icon-precomposed.png') {
        sendFile(res, path.join(distDir, 'apple-touch-icon.png'), 'image/png');
        return;
    }
    if (url === '/icon-512.png') {
        sendFile(res, path.join(distDir, 'icon-512.png'), 'image/png');
        return;
    }

    // 手机连同一个 WiFi 就能直接下载安装包，省得用数据线倒腾
    if (url === '/CloudClimb.apk' || url === '/download.apk') {
        const apk = path.join(__dirname, '..', 'android', 'dist', 'CloudClimb.apk');
        if (fs.existsSync(apk)) {
            const buf = fs.readFileSync(apk);
            res.writeHead(200, {
                'Content-Type': 'application/vnd.android.package-archive',
                'Content-Disposition': 'attachment; filename="CloudClimb.apk"',
                'Content-Length': buf.length
            });
            res.end(buf);
            console.log('  ' + new Date().toLocaleTimeString() + '  已发送安装包给 ' + (req.socket.remoteAddress || '?'));
            return;
        }
    }
    if (url === '/favicon.ico' || url === '/favicon.png') {
        sendFile(res, path.join(distDir, 'apple-touch-icon.png'), 'image/png');
        return;
    }

    if (url === '/' || url.indexOf('/CloudClimb.html') === 0) {
        const html = fs.readFileSync(file);
        res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache',
            'Content-Length': html.length
        });
        res.end(html);
        console.log('  ' + new Date().toLocaleTimeString() + '  已发送给 ' + (req.socket.remoteAddress || '?'));
        return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
});

server.listen(port, '0.0.0.0', function () {
    console.log('');
    console.log('  云梯 CLOUD LADDER 手机版已就绪');
    console.log('');
    console.log('  手机连上同一个 WiFi，然后用浏览器打开下面任一地址：');
    localIPs().forEach(function (ip) {
        console.log('      http://' + ip + ':' + port + '/');
    });
    console.log('      http://localhost:' + port + '/        （本机测试）');
    console.log('');
    console.log('  Android：用手机浏览器打开下面这个地址，直接下载安装包：');
    localIPs().forEach(function (ip) {
        console.log('      http://' + ip + ':' + port + '/CloudClimb.apk');
    });
    console.log('           装好后完全离线可玩；也可以不装，用 Chrome 的「添加到主屏幕」');
    console.log('  iPhone ：Safari 打开 → 分享按钮 →「添加到主屏幕」→ 从图标全屏启动');
    console.log('');
    console.log('  按 Ctrl+C 结束。');
    console.log('');
});
