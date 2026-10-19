// ============================================================
//  CLOUD LADDER 云梯 — 核心逻辑（手机版）
//  物理 / 云生成 / 踩云判定 / 相机，全部与桌面版同一套参数。
//
//  这个文件同时给浏览器和 Node 用：
//    浏览器  → window.CloudEngine
//    Node    → require('./engine.js')
//  这样自检脚本验证的就是真正跑在手机上的那份代码，而不是复制品。
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CloudEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // ========================================================
    //  物理常量：跳跃高度与云间距都以这里为准
    //  Gravity / JumpV 可以在设置里改
    // ========================================================
    var PHYS = {
        ViewW: 480,
        ViewH: 640,

        Gravity: 1300,          // px/s^2
        JumpV: 680,             // 起跳初速 px/s
        GravityDefault: 1300, JumpVDefault: 680,
        GravityMin: 800, GravityMax: 2200, GravityStep: 50,
        JumpVMin: 600, JumpVMax: 900, JumpVStep: 20,

        MaxRun: 260,
        GroundAccel: 2000,
        AirAccel: 1450,
        Friction: 2600,
        AirDrag: 520,

        PlayerW: 20,
        PlayerH: 30,
        CloudH: 15,

        Coyote: 0.10,           // 离开云后仍可起跳的宽限
        JumpBuffer: 0.12,       // 落地前按跳的缓存

        PixelsPerMeter: 32,

        Fixed: 1 / 240,         // 物理固定步长
        MaxFall: 1500,
        RingMax: 0.30,          // 踩云扩散环时长
        MaxDt: 0.25
    };

    PHYS.maxJumpH = function () { return PHYS.JumpV * PHYS.JumpV / (2 * PHYS.Gravity); };
    PHYS.airTime = function () { return 2 * PHYS.JumpV / PHYS.Gravity; };

    /** 跳跃后“上升”到 dy 高度所需的最早时间；跳不到返回 -1 */
    PHYS.riseTime = function (dy) {
        var d = PHYS.JumpV * PHYS.JumpV - 2 * PHYS.Gravity * dy;
        return d < 0 ? -1 : (PHYS.JumpV - Math.sqrt(d)) / PHYS.Gravity;
    };
    /** 跳跃后“落回” dy 高度所需的最晚时间 */
    PHYS.fallTime = function (dy) {
        var d = PHYS.JumpV * PHYS.JumpV - 2 * PHYS.Gravity * dy;
        return d < 0 ? -1 : (PHYS.JumpV + Math.sqrt(d)) / PHYS.Gravity;
    };
    /** 从起跳点能落到 dy 高度处的最大水平距离 */
    PHYS.maxReach = function (dy) {
        var t = PHYS.fallTime(dy);
        return t < 0 ? -1 : t * PHYS.MaxRun * 0.90;
    };

    PHYS.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
    PHYS.lerp = function (a, b, t) { return a + (b - a) * t; };
    /** 屏幕水平环绕 */
    PHYS.wrap = function (x) { x = x % PHYS.ViewW; if (x < 0) x += PHYS.ViewW; return x; };
    /** 环绕坐标下的最短水平位移 */
    PHYS.wrapDelta = function (d) {
        d = d % PHYS.ViewW;
        if (d > PHYS.ViewW * 0.5) d -= PHYS.ViewW;
        else if (d < -PHYS.ViewW * 0.5) d += PHYS.ViewW;
        return d;
    };

    /** 确定性随机（自检要能复现同一批云） */
    function mulberry32(a) {
        a = a >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // ========================================================
    //  云间距：跟着当前跳跃能力走（峰高的 56% ~ 84%）
    //  默认参数下 = 100 ~ 149px；跳到设置里怎么改，云都还跳得上去
    // ========================================================
    function gapMin(t) {
        var gmax = PHYS.maxJumpH() * 0.84;
        var gmin = PHYS.maxJumpH() * 0.56;
        if (gmin < 56) gmin = Math.min(56, gmax);
        if (gmin > gmax) gmin = gmax;
        return PHYS.lerp(gmin, gmax, t);
    }

    // ========================================================
    //  云的线稿轮廓：与桌面版完全相同的贝塞尔控制点
    //  局部坐标 x∈[0,w]，y=0 是玩家脚踩的最高面，云体向下延伸 h
    //  返回绘图命令，渲染层直接照着画
    // ========================================================
    function cloudPath(w, h) {
        return [
            ['M', w * 0.03, h * 0.90],
            ['L', w * 0.97, h * 0.90],
            ['C', w * 1.00, h * 0.55, w * 0.98, h * 0.22, w * 0.82, h * 0.22],
            ['C', w * 0.74, h * 0.22, w * 0.68, 0, w * 0.54, 0],
            ['C', w * 0.40, 0, w * 0.36, h * 0.20, w * 0.26, h * 0.20],
            ['C', w * 0.10, h * 0.20, w * 0.00, h * 0.55, w * 0.03, h * 0.90]
        ];
    }

    // ========================================================
    //  云
    // ========================================================
    function Cloud(kind, x, y, w, h) {
        this.kind = kind;          // 'start' | 'normal' | 'thin'
        this.x = x; this.y = y; this.w = w; this.h = h;
        this.touched = false;
        this.gone = false;
    }
    Cloud.prototype.cx = function () { return this.x + this.w * 0.5; };

    // ========================================================
    //  云世界：程序化生成，越往上越稀、越窄、越远
    // ========================================================
    function CloudWorld(seed) { this.reset(seed); }

    CloudWorld.prototype.reset = function (seed) {
        this.rng = mulberry32(seed || 1);
        this.clouds = [];
        this.reachedOk = 0;
        var w = 230;
        var start = new Cloud('start', PHYS.ViewW * 0.5 - w * 0.5, 0, w, PHYS.CloudH + 4);
        this.clouds.push(start);
        this.last = start;
        this.topY = 0;
    };

    Object.defineProperty(CloudWorld.prototype, 'climb', {
        get: function () { return -this.topY; }
    });
    Object.defineProperty(CloudWorld.prototype, 'difficulty', {
        get: function () { return Math.min(1, this.climb / 5000); }
    });

    /** 保证相机上方一直有云可踩 */
    CloudWorld.prototype.ensure = function (camY) {
        var need = camY - PHYS.ViewH * 0.55, guard = 0;
        while (this.topY > need && guard++ < 600) this.spawnNext();
    };

    CloudWorld.prototype.spawnNext = function () {
        var t = this.difficulty;
        var gap = gapMin(t);
        var w = PHYS.lerp(100, 78, t);
        var kind = 'normal';
        if (this.climb > 900 && this.rng() < 0.10 + 0.28 * t) {
            kind = 'thin';
            w = 58;
        }

        // 水平偏移：既保证跳得到，也保证不会正好落在正上方
        // （minOff 要给可达上限让位，否则极端低跳参数下会生成跳不到的云）
        // 注意：这里按“云中心”而不是“云左边界”取偏移——玩家落点判定看的是中心距，
        // 云宽不同（普通 78~100 vs 小云 58）时左边界偏移会与中心距差出十几 px，
        // 卡在 0.85*reach 上就会顶穿可达上限。
        var lim = PHYS.maxReach(gap) * 0.85;
        var offMax = PHYS.lerp(130, 175, t);
        if (lim > offMax) lim = offMax;
        var minOff = 55;
        if (minOff > lim * 0.75) minOff = lim * 0.75;

        var mag = minOff + this.rng() * (lim - minOff);
        var sign = this.rng() < 0.5 ? -1 : 1;
        var cx = PHYS.wrap(this.last.cx() + sign * mag);
        var x = PHYS.wrap(cx - w * 0.5);

        this.reachedOk++;

        var c = new Cloud(kind, x, this.topY - gap, w, kind === 'thin' ? PHYS.CloudH - 3 : PHYS.CloudH);
        this.clouds.push(c);
        this.last = c;
        this.topY = c.y;
    };

    /** 丢掉已经远远落在相机下方的云（相机只上移，回不去） */
    CloudWorld.prototype.trim = function (camY) {
        var cut = camY + PHYS.ViewH + 400, n = 0;
        while (n < this.clouds.length && this.clouds[n].y > cut) n++;
        if (n > 0) this.clouds.splice(0, n);
    };

    /** 相邻云可达性审计（自检用） */
    CloudWorld.prototype.reachAudit = function () {
        var pairs = 0, fail = 0, worst = 99999;
        for (var i = 1; i < this.clouds.length; i++) {
            var a = this.clouds[i - 1], b = this.clouds[i];
            var dy = a.y - b.y;
            var dx = Math.abs(PHYS.wrapDelta(b.cx() - a.cx()));
            var reach = PHYS.maxReach(dy);
            pairs++;
            if (reach < 0 || dx > reach) fail++;
            else if (reach - dx < worst) worst = reach - dx;
        }
        return { pairs: pairs, fail: fail, worst: worst < 99999 ? worst : 0 };
    };

    // ========================================================
    //  游戏主逻辑
    // ========================================================
    var MODE = { LOADING: 'loading', READY: 'ready', PLAY: 'play', PAUSED: 'paused', DEAD: 'dead', SETTINGS: 'settings' };

    function CloudGame() {
        this.mode = MODE.LOADING;
        this.loadT = 0;
        this.loadTotal = 1.8;
        this.loadSteps = ['初始化线条渲染器', '生成云层世界', '校验跳跃弧线', '载入操作提示'];

        this.world = new CloudWorld(1);
        this.input = { left: false, right: false, jumpPressed: false, jumpReleased: false };

        this.bestM = 0;
        this.newRecord = false;
        this.deathCount = 0;
        this.time = 0;

        this.shards = [];
        this.ring = { x: 0, y: 0, t: PHYS.RingMax };

        this.placePlayer();
        this.cloudTouched = 0;
        this.runTime = 0;
        this.minY = this.py;
        this.started = false;

        // 自检统计
        this.bumpRising = 0;
        this.bumpFalling = 0;
    }

    CloudGame.prototype.placePlayer = function () {
        this.px = PHYS.ViewW * 0.5;
        this.py = -PHYS.PlayerH;
        this.vx = 0; this.vy = 0;
        this.onGround = true;
        this.standing = this.world.clouds[0];
        this.coyoteT = 0; this.bufferT = 0;
        this.squash = 1; this.runPhase = 0;
        this.camY = this.py - PHYS.ViewH * 0.62;
    };

    // ---- 加载界面 ----
    CloudGame.prototype.loadProgress = function () {
        return Math.min(1, this.loadT / this.loadTotal);
    };
    CloudGame.prototype.loadStepIndex = function () {
        var n = this.loadSteps.length;
        return Math.min(Math.floor(this.loadT / (this.loadTotal / n)), n);
    };
    CloudGame.prototype.advanceLoading = function (dt) {
        if (this.mode !== MODE.LOADING) return;
        this.loadT += dt;
        if (this.loadT >= this.loadTotal) { this.loadT = this.loadTotal; this.mode = MODE.READY; }
    };

    // ---- 开一局 ----
    CloudGame.prototype.startRun = function (seed) {
        if (seed === undefined || seed === null) seed = (Math.random() * 2147483647) | 0;
        this.world.reset(seed);
        this.px = PHYS.ViewW * 0.5;
        this.py = -PHYS.PlayerH;
        this.vx = 0; this.vy = 0;
        this.onGround = true;
        this.standing = this.world.clouds[0];
        this.coyoteT = 0; this.bufferT = 0;
        this.squash = 1; this.runPhase = 0;
        this.input.left = false; this.input.right = false;
        this.input.jumpPressed = false; this.input.jumpReleased = false;
        this.camY = this.py - PHYS.ViewH * 0.62;
        this.minY = this.py;
        this.cloudTouched = 0;
        this.runTime = 0;
        this.newRecord = false;
        this.started = false;
        this.shards.length = 0;
        this.ring.t = PHYS.RingMax;
        this.world.ensure(this.camY);
        this.world.trim(this.camY);
        this.mode = MODE.PLAY;
    };

    CloudGame.prototype.heightM = function () {
        var h = -(this.minY + PHYS.PlayerH) / PHYS.PixelsPerMeter;
        return h < 0 ? 0 : h;
    };

    CloudGame.prototype.pose = function () {
        if (!this.onGround) return this.vy < 0 ? 'rise' : 'fall';
        if (Math.abs(this.vx) > 18) return 'run';
        return 'idle';
    };

    // ---- 粒子 ----
    CloudGame.prototype.burst = function (x, y, n) {
        for (var i = 0; i < n; i++) {
            var a = (i / n) * 6.2831853 + this.time * 3.1;
            var sp = 40 + (i % 3) * 26;
            this.shards.push({
                x: x, y: y,
                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7 - 30,
                life: 0, max: 0.42 + (i % 3) * 0.09, len: 4 + (i % 2) * 3, ang: a
            });
        }
    };

    CloudGame.prototype.burstRing = function (x, y, n, speed) {
        for (var i = 0; i < n; i++) {
            var a = (i / n) * 6.2831853;
            this.shards.push({
                x: x, y: y,
                vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * 0.45,
                life: 0, max: 0.50, len: 5, ang: a
            });
        }
    };

    // ---- 踩到云 ----
    CloudGame.prototype.landOn = function (c) {
        if (c.kind === 'start') {
            // 出生云：不消失，站在上面等玩家起跳
            this.py = c.y - PHYS.PlayerH;
            this.vy = 0;
            this.onGround = true;
            this.standing = c;
            this.squash = 0.76;
            return;
        }

        // 每朵云只能踩一次：踩到即消失
        c.touched = true;
        c.gone = true;
        this.cloudTouched++;
        if (this.vy < 0) this.bumpRising++; else this.bumpFalling++;

        if (this.py + PHYS.PlayerH > c.y) this.py = c.y - PHYS.PlayerH;

        // 自动弹起（水平速度保留，飞行途中继续调落点）
        this.vy = -PHYS.JumpV;
        this.onGround = false;
        this.standing = null;
        this.coyoteT = 0;
        this.bufferT = 0;
        this.squash = 1.30;
        this.started = true;

        this.ring.x = c.cx();
        this.ring.y = c.y;
        this.ring.t = 0;
        this.burstRing(c.cx(), c.y + 2, 12, 165);
        this.burst(c.cx(), c.y + 2, 4);
    };

    CloudGame.prototype.die = function () {
        this.mode = MODE.DEAD;
        this.deathCount++;
        var h = this.heightM();
        if (h > this.bestM) { this.bestM = h; this.newRecord = true; }
    };

    // ---- 一个固定物理步 ----
    CloudGame.prototype.step = function (dt) {
        if (this.mode === MODE.PLAY) this.runTimeReal(dt);
        this.time += dt;

        if (this.mode !== MODE.PLAY) {
            this.input.jumpPressed = false;
            this.input.jumpReleased = false;
            this.updateEffects(dt);
            return;
        }

        var P = PHYS;

        // ---- 水平 ----
        var dir = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
        if (dir !== 0) {
            var a = (this.onGround ? P.GroundAccel : P.AirAccel) * dt;
            this.vx += dir * a;
            this.vx = P.clamp(this.vx, -P.MaxRun, P.MaxRun);
        } else {
            var fr = (this.onGround ? P.Friction : P.AirDrag) * dt;
            if (this.vx > fr) this.vx -= fr;
            else if (this.vx < -fr) this.vx += fr;
            else this.vx = 0;
        }

        // ---- 跳跃（不再区分长按 / 短按：一律跳满）----
        if (this.input.jumpPressed) this.bufferT = P.JumpBuffer;
        this.input.jumpPressed = false;
        this.input.jumpReleased = false;

        if (this.bufferT > 0) this.bufferT -= dt;
        if (this.coyoteT > 0) this.coyoteT -= dt;

        if (this.bufferT > 0 && (this.onGround || this.coyoteT > 0)) {
            this.vy = -P.JumpV;
            this.bufferT = 0; this.coyoteT = 0;
            this.onGround = false; this.standing = null;
            this.squash = 1.28;
            this.burst(this.px, this.py + P.PlayerH, 3);
        }

        // ---- 竖直 ----
        var prevBottom = this.py + P.PlayerH;
        if (this.onGround && this.standing) {
            this.py = this.standing.y - P.PlayerH;
            this.vy = 0;
        } else {
            this.vy += P.Gravity * dt;
            if (this.vy > P.MaxFall) this.vy = P.MaxFall;
            this.py += this.vy * dt;
        }

        // ---- 水平位移（屏幕左右环绕）----
        this.px = P.wrap(this.px + this.vx * dt);

        // ---- 站立维持 ----
        if (this.onGround) {
            if (!this.standing || this.standing.gone) {
                this.onGround = false; this.standing = null; this.coyoteT = P.Coyote;
            } else {
                var sdx = Math.abs(P.wrapDelta(this.px - this.standing.cx()));
                if (sdx > (P.PlayerW + this.standing.w) * 0.5) {
                    this.onGround = false; this.standing = null; this.coyoteT = P.Coyote;
                }
            }
        }

        // ---- 踩云：脚底跨过云顶就算踩到，上升 / 下落都算 ----
        if (!this.onGround) {
            var bottom = this.py + P.PlayerH;
            var lo = Math.min(prevBottom, bottom) - 3;
            var hi = Math.max(prevBottom, bottom) + 3;
            var hit = null, bestTop = Infinity;
            for (var i = 0; i < this.world.clouds.length; i++) {
                var c = this.world.clouds[i];
                if (c.gone) continue;
                // 出生云：上升时直接穿过（否则起跳那一帧会被判定成“踩到”而粘回原地）
                if (c.kind === 'start' && this.vy < 0) continue;
                if (c.y >= bestTop) continue;
                if (c.y < lo || c.y > hi) continue;
                var dx = Math.abs(P.wrapDelta(this.px - c.cx()));
                if (dx > (P.PlayerW + c.w) * 0.5) continue;
                bestTop = c.y;
                hit = c;
            }
            if (hit) this.landOn(hit);
        }

        // ---- 世界推进 ----
        if (this.py < this.minY) this.minY = this.py;
        var camTarget = this.py - P.ViewH * 0.58;
        if (camTarget < this.camY) this.camY += (camTarget - this.camY) * Math.min(1, dt * 14);
        this.world.ensure(this.camY);
        this.world.trim(this.camY);

        if (this.onGround && this.standing && Math.abs(this.vx) > 18) {
            this.runPhase += dt * (7 + Math.abs(this.vx) * 0.035);
        }

        if (this.squash !== 1) this.squash += (1 - this.squash) * Math.min(1, dt * 11);

        this.updateEffects(dt);

        // ---- 掉出屏幕底部 → 失败 ----
        if (this.py - this.camY > P.ViewH + 60) this.die();
    };

    CloudGame.prototype.runTimeReal = function (dt) { this.runTime += dt; };

    CloudGame.prototype.updateEffects = function (dt) {
        for (var i = this.shards.length - 1; i >= 0; i--) {
            var s = this.shards[i];
            s.life += dt;
            if (s.life >= s.max) { this.shards.splice(i, 1); continue; }
            s.vy += 900 * dt;
            s.x += s.vx * dt;
            s.y += s.vy * dt;
        }
        if (this.squash !== 1 && this.mode !== MODE.PLAY) {
            this.squash += (1 - this.squash) * Math.min(1, dt * 11);
        }
        if (this.ring.t < PHYS.RingMax) this.ring.t += dt;
    };

    // ---- 设置 ----
    CloudGame.prototype.adjustSetting = function (index, dir) {
        if (index === 0) PHYS.JumpV = PHYS.clamp(PHYS.JumpV + dir * PHYS.JumpVStep, PHYS.JumpVMin, PHYS.JumpVMax);
        else PHYS.Gravity = PHYS.clamp(PHYS.Gravity + dir * PHYS.GravityStep, PHYS.GravityMin, PHYS.GravityMax);
    };
    CloudGame.prototype.resetSettings = function () {
        PHYS.JumpV = PHYS.JumpVDefault;
        PHYS.Gravity = PHYS.GravityDefault;
    };

    return {
        PHYS: PHYS,
        MODE: MODE,
        Cloud: Cloud,
        CloudWorld: CloudWorld,
        CloudGame: CloudGame,
        gapMin: gapMin,
        cloudPath: cloudPath,
        mulberry32: mulberry32
    };
}));
