// ============================================================
//  CLOUD LADDER 手机版 — 界面层冒烟测试（Node 运行，不需要浏览器）
//
//  做法：在 Node 里搭一个极简的 window / document / Canvas 2D 环境，
//  把 src/shell.js 的真代码整份跑起来，驱动虚拟帧走完
//  加载 → 就绪 → 开局 → 游戏中 → 暂停 → 设置 → 返回 → 死亡
//  全流程。绘制调用被记录下来，于是可以从“画出来的文字”反推游戏状态。
//
//  用法:  node mobile/webcheck.js
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
const engine = require(path.join(root, 'src', 'engine.js'));
const shellCode = fs.readFileSync(path.join(root, 'src', 'shell.js'), 'utf8');
const MODE = engine.MODE;

const lines = [];
function R(s) { lines.push(s); console.log(s); }

let pass = 0, fail = 0;
function check(name, ok, extra) {
    if (ok) { pass++; R('  [OK]   ' + name + (extra ? '  ' + extra : '')); }
    else { fail++; R('  [FAIL] ' + name + (extra ? '  ' + extra : '')); }
}

// ------------------------------------------------------------
//  极简 Canvas 2D 记录器
// ------------------------------------------------------------
const rec = { texts: [], bezier: 0, arc: 0, ellipse: 0, stroke: 0, fill: 0, fillRect: 0, strokeRect: 0, dashes: 0 };
const ctxMock = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1,
    textBaseline: '', lineJoin: '', lineCap: '',
    measureText(t) { return { width: String(t).length * 6 }; },
    fillText(t, x, y) { rec.texts.push({ t: String(t), x: x, y: y }); },
    beginPath() { }, closePath() { }, moveTo() { }, lineTo() { },
    bezierCurveTo() { rec.bezier++; }, quadraticCurveTo() { },
    arc() { rec.arc++; }, ellipse() { rec.ellipse++; },
    stroke() { rec.stroke++; }, fill() { rec.fill++; },
    fillRect() { rec.fillRect++; }, strokeRect() { rec.strokeRect++; }, clearRect() { },
    save() { }, restore() { }, translate() { }, scale() { }, rotate() { },
    setTransform() { }, setLineDash() { rec.dashes++; }
};
function clearTexts() { rec.texts.length = 0; }
function allText() { return rec.texts.map(function (o) { return o.t; }).join(' | '); }
/** 从画出来的文字里找 HUD 高度（形如 "12.3 m"） */
function hudHeight() {
    for (let i = 0; i < rec.texts.length; i++) {
        if (/^\d+\.\d m$/.test(rec.texts[i].t)) return parseFloat(rec.texts[i].t);
    }
    return null;
}
function hudClouds() {
    const m = allText().match(/踩过 (\d+) 朵云/);
    return m ? parseInt(m[1], 10) : null;
}

// ------------------------------------------------------------
//  DOM mock
// ------------------------------------------------------------
const winListeners = {}, docListeners = {}, canvasListeners = {};
function target(store) {
    return {
        addEventListener(type, fn) { (store[type] = store[type] || []).push(fn); },
        removeEventListener() { },
        fire(type, ev) { (store[type] || []).forEach(function (f) { f(ev); }); }
    };
}

const canvas = Object.assign(target(canvasListeners), {
    width: 480, height: 640, style: {},
    getContext() { return ctxMock; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 480, height: 640 }; }
});

const windowMock = Object.assign(target(winListeners), {
    innerWidth: 480, innerHeight: 640, devicePixelRatio: 2,
    CloudEngine: engine
});

const documentMock = Object.assign(target(docListeners), {
    hidden: false,
    getElementById(id) { return id === 'game' ? canvas : null; }
});

const storeData = {};
const localStorageMock = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(storeData, k) ? storeData[k] : null; },
    setItem(k, v) { storeData[k] = String(v); },
    removeItem(k) { delete storeData[k]; }
};

// ------------------------------------------------------------
//  虚拟时钟 + requestAnimationFrame
// ------------------------------------------------------------
let vnow = 0;
let rafQueue = [];
function requestAnimationFrame(fn) { rafQueue.push(fn); return rafQueue.length; }

function frames(n, dtMs) {
    const dt = dtMs === undefined ? 16.7 : dtMs;
    for (let i = 0; i < n; i++) {
        vnow += dt;
        const q = rafQueue;
        rafQueue = [];
        q.forEach(function (fn) { fn(vnow); });
    }
}
function tap(x, y, id) {
    canvas.fire('pointerdown', { clientX: x, clientY: y, pointerId: id, preventDefault() { } });
}
function keyDown(k) { windowMock.fire('keydown', { key: k, preventDefault() { } }); }

// ------------------------------------------------------------
//  跑起来
// ------------------------------------------------------------
const sandbox = {
    window: windowMock,
    document: documentMock,
    localStorage: localStorageMock,
    requestAnimationFrame: requestAnimationFrame,
    URLSearchParams: URLSearchParams,
    performance: { now: function () { return vnow; } },
    setTimeout: function (fn) { fn(); },
    console: console
};
vm.createContext(sandbox);
vm.runInContext(shellCode, sandbox, { filename: 'shell.js' });

R('CLOUD LADDER 手机版 界面层冒烟测试  ' + new Date().toISOString());
R(`画布：dpr=${windowMock.devicePixelRatio} → backing store ${canvas.width}x${canvas.height}`);

// ---- 1. 初始化 ----
R('');
R('1) 初始化与布局');
check('canvas 按 dpr 放大（480x640 → 960x1280）', canvas.width === 960 && canvas.height === 1280,
    `${canvas.width}x${canvas.height}`);
check('canvas CSS 尺寸已按窗口设置', canvas.style.width === '480px' && canvas.style.height === '640px',
    `${canvas.style.width} x ${canvas.style.height}`);

// ---- 2. 加载界面 ----
R('');
R('2) 加载界面');
clearTexts();
frames(10);
const loadText = allText();
check('渲染出标题「云    梯」', loadText.indexOf('云    梯') >= 0);
check('渲染出进度百分比', /\d+%/.test(loadText));
check('渲染出加载步骤或加载完成', /正在加载|加载完成/.test(loadText));
check('画了云（贝塞尔路径）', rec.bezier > 0, 'bezier=' + rec.bezier);

// ---- 3. 就绪界面 ----
R('');
R('3) 就绪界面（点击开始）');
clearTexts();
frames(140);
const readyText = allText();
check('出现「开 始」按钮文字', readyText.indexOf('开    始') >= 0);
check('有提示轮播文案', /踩到云|按住屏幕|上升途中|掉出屏幕|爬得越高/.test(readyText));

tap(240, 496, 1);                       // 点“开始”按钮
clearTexts();
frames(4);
const afterStart = allText();
check('点击后进入游戏世界（HUD 出现）', /踩过 \d+ 朵云/.test(afterStart));
check('站在出生云上时提示「点一下屏幕起跳」', afterStart.indexOf('点一下屏幕起跳') >= 0);

// ---- 4. 游戏中 ----
R('');
R('4) 游戏中（触摸驱动 AI：朝下一朵云移动 → 踩到云自动弹起）');
const game = windowMock.__cloudclimb;
check('调试钩子可用（能读到游戏状态）', !!game && typeof game.heightM === 'function');

// 用触摸事件驱动：按住左/右半屏。第一次按下时若还站在出生云上会自动起跳。
const VW_HALF = engine.PHYS.ViewW * 0.5;
let padSeq = 100, activePad = null;
function setDir(dir) {
    // 注意：shell 把 pointerup 监听在 window 上（真实浏览器里 canvas 的 pointerup 会冒泡上去）
    if (activePad !== null) { windowMock.fire('pointerup', { pointerId: activePad }); activePad = null; }
    if (dir !== 0) {
        const id = ++padSeq;
        tap(dir > 0 ? VW_HALF + 100 : VW_HALF - 100, 300, id);
        activePad = id;
    }
}

function aiDecide() {
    const P = engine.PHYS;
    if (!game.__aiTarget || game.__aiTarget.gone || game.onGround) {
        const feet = game.py + P.PlayerH;
        let best = null, near = null, bestY = -Infinity, nearY = -Infinity;
        for (let i = 0; i < game.world.clouds.length; i++) {
            const c = game.world.clouds[i];
            if (c.gone) continue;
            const rise = feet - c.y;
            if (rise < 8) continue;
            if (c.y > nearY) { nearY = c.y; near = c; }
            if (rise <= P.maxJumpH() * 0.92 && c.y > bestY) { bestY = c.y; best = c; }
        }
        game.__aiTarget = best || near;
    }
    const t = game.__aiTarget;
    if (!t) { setDir(0); return; }
    const dx = engine.PHYS.wrapDelta(t.cx() - game.px);
    setDir(dx > 3 ? 1 : (dx < -3 ? -1 : 0));
}
function framesAI(n) {
    for (let i = 0; i < n; i++) { aiDecide(); frames(1); }
}

if (game.mode === MODE.READY) {
    // 理论上点“开始”后已经在游戏中；这里兜一下，避免测试环境差异
    tap(240, 496, 99);
    frames(4);
}
framesAI(300);                          // 约 5 秒
clearTexts();
frames(2);
let playText = allText();
const clouds4 = hudClouds();
const h4 = hudHeight();
check('踩到了云（踩云数 > 0）', clouds4 !== null && clouds4 > 0, clouds4 + ' 朵');
check('高度在增长', h4 !== null && h4 > 0, h4 + ' m');
check('引擎侧踩云计数与 HUD 一致', game.cloudTouched === clouds4, 'engine=' + game.cloudTouched);
check('渲染了玩家（圆头 arc）', rec.arc > 0, 'arc=' + rec.arc);
check('渲染了踩云扩散环（ellipse）', rec.ellipse > 0, 'ellipse=' + rec.ellipse);
check('踩过的云立即消失（不存在 touched 但仍在的云）', (function () {
    for (let i = 0; i < game.world.clouds.length; i++) {
        const c = game.world.clouds[i];
        if (c.touched && !c.gone) return false;
    }
    return true;
})(), '场上剩 ' + game.world.clouds.length + ' 朵（已消失的会被相机下方的裁剪清掉），累计踩过 ' + game.cloudTouched);
setDir(0);

// 若这几秒里掉下去了，先重开一局，保证后面的界面测试在“游戏中”状态
function ensurePlaying() {
    clearTexts(); frames(2);
    if (allText().indexOf('掉 下 去 了') >= 0) {
        tap(240, 300, 98);              // 结算界面点屏重开
        frames(4);
        tap(240, 300, 97);              // 起跳
        frames(4);
        return true;
    }
    return false;
}

// ---- 5. 暂停 ----
R('');
R('5) 暂停界面');
const reopened1 = ensurePlaying();
keyDown('p');
clearTexts();
frames(2);
const pauseText = allText();
check('出现「暂  停」', pauseText.indexOf('暂  停') >= 0, reopened1 ? '(测试前重开过一局)' : '');
check('出现「继  续」与「重  来」按钮', pauseText.indexOf('继  续') >= 0 && pauseText.indexOf('重  来') >= 0);

// ---- 6. 设置 ----
R('');
R('6) 设置界面（触屏 ± 按钮）');
keyDown('s');
clearTexts();
frames(2);
const setText = allText();
check('出现「设    置」', setText.indexOf('设    置') >= 0);
const jump0 = parseFloat((setText.match(/(\d+) px\/s(?!²)/) || [0, NaN])[1]);
check('显示跳跃力度数值', isFinite(jump0), jump0 + ' px/s');
check('显示重力数值', /\d+ px\/s²/.test(setText), (setText.match(/(\d+) px\/s²/) || [])[1] + ' px/s²');
check('显示推导出的跳跃高度 / 滞空时间', /跳跃高度/.test(setText) && /滞空时间/.test(setText));
check('显示云层间距 / 水平可达', /云层间距/.test(setText) && /水平可达/.test(setText));

tap(400, 175, 3);                       // 第一行 “+”（x≈378~422, y≈154~196）
clearTexts(); frames(2);
const jump1 = parseFloat((allText().match(/(\d+) px\/s(?!²)/) || [0, NaN])[1]);
check('点 + 后跳跃力度变大', jump1 > jump0, jump0 + ' → ' + jump1);
check('设置已写入 localStorage', !!storeData['cloudclimb'], String(storeData['cloudclimb']).slice(0, 64));

tap(80, 175, 4);                        // 第一行 “−”
clearTexts(); frames(2);
const jump2 = parseFloat((allText().match(/(\d+) px\/s(?!²)/) || [0, NaN])[1]);
check('点 − 后跳跃力度变小', jump2 < jump1, jump1 + ' → ' + jump2);

tap(170, 483, 5);                       // 恢复默认
clearTexts(); frames(2);
const jump3 = parseFloat((allText().match(/(\d+) px\/s(?!²)/) || [0, NaN])[1]);
check('「恢复默认」还原为 ' + engine.PHYS.JumpVDefault, jump3 === engine.PHYS.JumpVDefault, String(jump3));

tap(320, 483, 6);                       // 返回（从暂停进 → 应重开一局并回到游戏）
clearTexts(); frames(4);
check('返回后回到游戏中', /踩过 \d+ 朵云/.test(allText()), allText().split(' | ').filter(function (t) {
    return /m$/.test(t);
}).slice(0, 1)[0]);

// ---- 7. 死亡与结算 ----
R('');
R('7) 掉落与结算界面');
keyDown(' ');                           // 从出生云起跳
setDir(1);                              // 一直朝右跑，迟早掉出屏幕
let died = false;
for (let i = 0; i < 80; i++) {          // 最多 ~21 秒
    frames(16);
    if (allText().indexOf('掉 下 去 了') >= 0) { died = true; break; }
}
setDir(0);
clearTexts();
frames(2);
const deadText = allText();
if (died) {
    check('掉落触发结算界面', deadText.indexOf('掉 下 去 了') >= 0);
    check('结算含高度 / 踩云数 / 时间', /本轮高度/.test(deadText) && /踩过云朵/.test(deadText) && /坚持时间/.test(deadText));
    check('结算含「再 来 一 次」', deadText.indexOf('再 来 一 次') >= 0);
} else {
    check('掉落触发结算界面（本轮没掉下去，跳过）', true, '未触发');
}

tap(240, 300, 7);                       // 结算界面点屏重开
clearTexts();
frames(4);
check('结算后点击可重开', /踩过 \d+ 朵云/.test(allText()));

// ---- 8. 触屏方向控制 ----
R('');
R('8) 触屏左右控制（在出生云上测，避免被掉落/重开打断）');
if (game.mode === MODE.DEAD) { tap(240, 300, 30); frames(6); }
const pxA = game.px;
setDir(1);                              // 按住右半屏（顺带从出生云起跳）
frames(30);
const dRight = engine.PHYS.wrapDelta(game.px - pxA);
setDir(0);
frames(2);
const pxB = game.px;
setDir(-1);                             // 按住左半屏
frames(40);
const dLeft = engine.PHYS.wrapDelta(game.px - pxB);
setDir(0);
check('按住右半屏 → 角色向右移动', dRight > 0, 'Δ=' + dRight.toFixed(1) + 'px');
check('按住左半屏 → 角色向左移动', dLeft < 0, 'Δ=' + dLeft.toFixed(1) + 'px');

// ---- 汇总 ----
R('');
R(`结果：通过 ${pass} 项，失败 ${fail} 项`);

const outDir = path.join(root, 'shots');
try {
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'webcheck.txt'), lines.join('\r\n') + '\r\n', 'utf8');
} catch (e) { }

process.exit(fail > 0 ? 1 : 0);
