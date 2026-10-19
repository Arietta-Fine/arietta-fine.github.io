// ============================================================
//  CLOUD LADDER 手机版 — 核心逻辑自检（Node 运行）
//  验证的就是 mobile/src/engine.js 这份真代码，
//  跑：跳跃弧线采样、三组参数下的云层可达性、AI 试跑、踩云方向统计
//
//  用法:  node mobile/selfcheck.js
// ============================================================
'use strict';

const path = require('path');
const fs = require('fs');
const E = require(path.join(__dirname, 'src', 'engine.js'));

const PHYS = E.PHYS;
const MODE = E.MODE;
const CloudGame = E.CloudGame;

const lines = [];
function R(s) { lines.push(s); console.log(s); }

// ------------------------------------------------------------
//  AI：朝脚上方最近、且跳得上去的云移动；只有站在出生云上才需要按键起跳
//  （踩到云会自动弹起）——和桌面版的自检 AI 同一套策略
// ------------------------------------------------------------
function pickTarget(g) {
    const feet = g.py + PHYS.PlayerH;
    let best = null, near = null, bestY = -Infinity, nearY = -Infinity;
    for (let i = 0; i < g.world.clouds.length; i++) {
        const c = g.world.clouds[i];
        if (c.gone) continue;
        const rise = feet - c.y;
        if (rise < 8) continue;
        if (c.y > nearY) { nearY = c.y; near = c; }
        if (rise <= PHYS.maxJumpH() * 0.92 && c.y > bestY) { bestY = c.y; best = c; }
    }
    return best || near;
}

function runAI(seed, maxSeconds) {
    const g = new CloudGame();
    g.startRun(seed);
    let target = null;
    const steps = Math.round(maxSeconds / PHYS.Fixed);
    let n = 0;
    while (n < steps && g.mode === MODE.PLAY) {
        if (g.onGround || !target || target.gone) target = pickTarget(g);
        g.input.left = false;
        g.input.right = false;
        if (target) {
            const dx = PHYS.wrapDelta(target.cx() - g.px);
            if (dx > 3) g.input.right = true;
            else if (dx < -3) g.input.left = true;
        }
        if (g.onGround) g.input.jumpPressed = true;
        g.step(PHYS.Fixed);
        n++;
    }
    return {
        height: g.heightM(),
        clouds: g.cloudTouched,
        time: g.runTime,
        dead: g.mode === MODE.DEAD,
        frames: n
    };
}

// ------------------------------------------------------------
R('CLOUD LADDER 手机版 核心逻辑自检  ' + new Date().toISOString());
R(`view ${PHYS.ViewW}x${PHYS.ViewH}  fixed-step ${(1 / PHYS.Fixed).toFixed(0)}Hz  ` +
  `gravity ${PHYS.Gravity}  jumpV ${PHYS.JumpV}  maxRun ${PHYS.MaxRun}`);
R(`player ${PHYS.PlayerW}x${PHYS.PlayerH}  踩到云立即消失并自动弹起，上升途中碰云顶同样算踩到`);

// ---- 1. 跳跃弧线 ----
{
    let t = 0, y = 0, v = -PHYS.JumpV, peak = 0;
    while (t < 3) {
        v += PHYS.Gravity * PHYS.Fixed;
        y += v * PHYS.Fixed;
        t += PHYS.Fixed;
        if (y < peak) peak = y;
        if (y > 0 && t > 0.15) break;
    }
    R(`跳跃采样：峰高 ${(-peak).toFixed(1)}px  滞空 ${t.toFixed(2)}s  公式峰高 ${PHYS.maxJumpH().toFixed(1)}px`);
    const g0 = E.gapMin(0), g1 = E.gapMin(1);
    R(`水平可达：同高 ${PHYS.maxReach(0).toFixed(1)}px  ` +
      `上一阶(${g0.toFixed(0)}px) ${PHYS.maxReach(g0).toFixed(1)}px  ` +
      `上一阶(${g1.toFixed(0)}px) ${PHYS.maxReach(g1).toFixed(1)}px`);
    R(`云层间距（按跳跃能力自适应）：${g0.toFixed(0)} ~ ${g1.toFixed(0)}px`);
}

// ---- 2. 三组极端参数下的可达性（每组 30 个种子，累计数千对相邻云）----
{
    const cases = [
        { name: '最软(低跳)', jump: PHYS.JumpVMin, grav: PHYS.GravityMax },
        { name: '默认      ', jump: PHYS.JumpVDefault, grav: PHYS.GravityDefault },
        { name: '最猛(高跳)', jump: PHYS.JumpVMax, grav: PHYS.GravityMin }
    ];
    const SEEDS = 30;
    for (const c of cases) {
        PHYS.JumpV = c.jump;
        PHYS.Gravity = c.grav;
        let pairs = 0, fail = 0, worst = 99999;
        for (let s = 0; s < SEEDS; s++) {
            const w = new E.CloudWorld(1000 + s * 7);
            w.ensure(-6000);
            const a = w.reachAudit();
            pairs += a.pairs;
            fail += a.fail;
            if (a.worst < worst) worst = a.worst;
        }
        R(`${c.name}：跳跃 ${c.jump} 重力 ${c.grav} → 峰高 ${PHYS.maxJumpH().toFixed(0)}px ` +
          `滞空 ${PHYS.airTime().toFixed(2)}s  间距 ${E.gapMin(0).toFixed(0)}~${E.gapMin(1).toFixed(0)}px  ` +
          `${SEEDS} 个种子审计 ${pairs} 对 / 不可达 ${fail}  最小余量 ${worst.toFixed(1)}px`);
    }
    PHYS.JumpV = PHYS.JumpVDefault;
    PHYS.Gravity = PHYS.GravityDefault;
    R('参数已恢复默认');
}

// ---- 3. AI 试跑 ----
{
    const LIFES = 6, SECONDS = 30;
    let sumH = 0, maxH = 0, sumT = 0, sumC = 0, drops = 0;
    for (let L = 0; L < LIFES; L++) {
        const r = runAI(4200 + L * 77, SECONDS);
        sumH += r.height; sumT += r.time; sumC += r.clouds;
        if (r.height > maxH) maxH = r.height;
        if (r.dead) drops++;
        R(`AI 第${L + 1}条命：高度 ${r.height.toFixed(1).padStart(6)} m  ` +
          `踩云 ${String(r.clouds).padStart(3)} 朵  坚持 ${r.time.toFixed(1).padStart(5)}s  ` +
          `${r.dead ? '掉落' : '未掉落（跑满窗口）'}`);
    }
    R(`AI 汇总：平均 ${(sumH / LIFES).toFixed(1)} m  最高 ${maxH.toFixed(1)} m  ` +
      `平均坚持 ${(sumT / LIFES).toFixed(1)}s  平均踩云 ${(sumC / LIFES).toFixed(1)} 朵  掉落 ${drops}/${LIFES}`);
}

// ---- 4. 踩云方向统计 ----
{
    const g = new CloudGame();
    g.startRun(31415);
    let target = null;
    for (let n = 0; n < 240 * 30 && g.mode === MODE.PLAY; n++) {
        if (g.onGround || !target || target.gone) target = pickTarget(g);
        g.input.left = g.input.right = false;
        if (target) {
            const dx = PHYS.wrapDelta(target.cx() - g.px);
            if (dx > 3) g.input.right = true; else if (dx < -3) g.input.left = true;
        }
        if (g.onGround) g.input.jumpPressed = true;
        g.step(PHYS.Fixed);
    }
    R(`踩云方向统计：上升途中踩到 ${g.bumpRising} 次，下落中踩到 ${g.bumpFalling} 次`);

    // 顺带验证“每朵云只能踩一次”
    let gone = 0, touched = 0;
    for (const c of g.world.clouds) { if (c.gone) gone++; if (c.touched) touched++; }
    R(`云状态抽查：场上剩余 ${g.world.clouds.length} 朵，已消失 ${gone} 朵，标记踩过 ${touched} 朵 ` +
      `（gone 必须等于 touched）`);
    R(`单局数据：高度 ${g.heightM().toFixed(1)} m  踩云 ${g.cloudTouched} 朵  相机 ${g.camY.toFixed(0)}`);
}

R('完成');

// 落盘（和桌面版自检报告放一起，方便对比）
const outDir = path.join(__dirname, 'shots');
try {
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'selfcheck-node.txt'), lines.join('\r\n') + '\r\n', 'utf8');
} catch (e) {
    console.error('报告写入失败: ' + e.message);
}
