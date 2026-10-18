# CLOUD LADDER 云梯 — 云端攀登

一款极简线条的向上跳跃小游戏：踩着空中漂浮的云一路往上爬。

- **每朵云只能踩一次**：踩到的瞬间云就消失，并把你**自动弹起**
- **上升途中脚擦到云顶也算踩到**，所以连跳、蹭云都算数，你只需要管左右
- **完全掉出屏幕底部即失败**
- 美术是纯线条原型（深灰底 + 白线，未上色）

## 三种形态，按需取用

| 版本 | 文件 | 说明 |
| --- | --- | --- |
| **桌面版** | [`dist/CloudClimb.exe`](dist/CloudClimb.exe) | Windows 双击即玩，独立 exe（约 37 KB），不需要任何运行时 |
| **安卓版** | [`android/dist/CloudClimb.apk`](android/dist/CloudClimb.apk) | Android 7.0+，约 37 KB，装上后**完全离线**、零权限 |
| **手机网页版** | [`mobile/dist/CloudClimb.html`](mobile/dist/CloudClimb.html) | 单个 HTML 文件（54 KB），任何手机浏览器打开即玩 |

安卓版就是把手机网页版塞进一个极简 WebView 外壳打成的 APK —— 三者玩法、手感、参数完全一致。

### 关于 iPhone（重要）

**iOS 装不了 APK。** 这不是签名或打包方式的问题：`.apk` 是安卓的安装包格式，
苹果系统从底层就不识别它，没有哪个工具能变出一个"能装进 iPhone 的 apk"。

苹果设备上要"像 App 一样"玩，现实可行的路径是**添加到主屏幕**（免费、立刻可用）：

1. 电脑上跑 `node mobile/serve.js`，记下它打印的 `http://<电脑IP>:8080`
2. iPhone 连同一个 WiFi，用 **Safari** 打开这个地址
3. 点底部**分享**按钮 → **添加到主屏幕**
4. 桌面上就多一个「云梯」图标，点开是全屏无地址栏的，观感和 App 一致

（走 App Store 或自签 IPA 需要 Apple 开发者账号，每年 99 美元，且自签证书 7 天过期——
这条路的门槛不在打包，而在苹果的授权体系。）

## 直接开玩

- **桌面版**：双击 `dist\CloudClimb.exe`（480×640 竖版窗口）
- **安卓版**：把 APK 传到手机装上；或跑 `node mobile/serve.js`，
  手机浏览器打开 `http://<电脑IP>:8080/CloudClimb.apk` 直接下载安装
- **网页版**：浏览器打开 `mobile/dist/CloudClimb.html`

![加载界面](shots/shot-0.png)

## 操作

| 平台 | 操作 |
| --- | --- |
| 桌面 | `←` `→` / `A` `D` 左右移动　`空格` 从出生云起跳　`S` 设置　`P` 暂停　`R` 重开　`Esc` 退出 |
| 手机 | 按住屏幕**左半边 / 右半边**控制左右（可滑动换边）　点一下从出生云起跳　右上角 `II` 暂停、`设` 设置 |

开局站在最下方的出生云上起跳；之后每次踩到云都会**自动弹起**，
你唯一要管的就是左右移动，决定下一次落在哪朵云上。

手感：默认跳跃峰高 **178 px**、单次滞空 **1.05 秒**、水平速度上限 260 px/s。
踩到云时保留水平速度，飞行途中还能继续调落点。

## 设置项（可自由改手感）

按 `S`（手机上点右上角「设」）进入设置，`↑``↓` 选行、`←``→` 调节、`R` 恢复默认：

- **跳跃力度** 600 ~ 900 px/s
- **重力** 800 ~ 2200 px/s²

界面实时显示推导出的**跳跃高度 / 滞空时间 / 云层间距 / 水平可达距离**。
云层间距不是写死的，而是跟着跳跃能力自动算（见下），所以怎么调都不会出现跳不上去的云。
桌面版存 `%APPDATA%\CloudClimb\settings.txt`，手机版存 localStorage。

## 难度曲线

云层间距按**当前跳跃能力**自适应：`间距 = 峰高 × (0.56 ~ 0.84)`，随高度从前者过渡到后者。
默认参数下即 100 → 149 px，同时云变窄（100 → 78 px）、水平偏移变大。

- 水平偏移有约 55 px 下限：云不会正好落在你头顶，必须左右移动才接得上
- 爬过约 28 m 后混入**小云**（58 px 宽、虚线画法），比例从 10% 升到 38%
- 生成器保证**每一朵云都跳得上去**，自检里有 30 个种子 × 3 组极端参数的审计

## 项目结构

```
CloudClimb/
├─ dist/CloudClimb.exe          桌面版成品
├─ src/                         桌面版 C# 源码（ClimbGame / CloudWorld / Program）
├─ build.ps1                    桌面版编译脚本（csc.exe）
├─ mobile/                      手机网页版
│  ├─ src/{engine.js,shell.js}  引擎 + 界面层（与桌面版同一套参数）
│  ├─ build.js                  打包成单文件 HTML + 生成图标
│  ├─ serve.js                  局域网分享 + 手机直接下载 APK
│  ├─ selfcheck.js              核心逻辑自检
│  ├─ webcheck.js               界面层冒烟测试（35 项）
│  └─ dist/CloudClimb.html      成品单文件
└─ android/                     安卓 APK
   ├─ AndroidManifest.xml       竖屏 / 无权限 / launcher
   ├─ java/.../CloudClimbActivity.java   全屏 WebView 外壳
   ├─ res/ mipmap-*/            各密度启动图标
   ├─ make-icons.js             纯 Node 生成图标
   ├─ build-apk.ps1             一条命令走完 aapt2 → javac → d8 → 对齐 → 签名
   └─ dist/CloudClimb.apk       成品安装包
```

各目录的细节（构建依赖、踩过的坑）见 [mobile/README.md](mobile/README.md)
和 [android/README.md](android/README.md)。

## 重新构建

```powershell
powershell -ExecutionPolicy Bypass -File build.ps1              # 桌面 exe
node mobile/build.js                                            # 手机单文件 HTML
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1  # 安卓 APK
```

APK 那条链没有用 gradle / Android Studio，只依赖 `C:\Android\sdk` 里的
build-tools 与 platform，外加 JDK 8（javac）和 JDK 17（d8 要求 Java 11+）。

## 自检

三个版本都带无窗口自检，可在没有图形界面的环境里核对画面与可玩性：

```powershell
# 桌面版：渲染 PNG 快照 + AI 试跑 + 可达性审计
$env:CLOUDCLIMB_SELFCHECK=1; $env:CLOUDCLIMB_SNAPDIR="$PWD\shots"; .\dist\CloudClimb.exe

node mobile/selfcheck.js    # 手机版核心逻辑（AI 试跑 + 30 种子可达性审计）
node mobile/webcheck.js     # 手机版界面层（35 项：布局/文案/触屏/设置/结算）
```

最近一轮结果：

```
桌面版  ：AI 平均 453.9 m / 103 朵云，6 条命中 2 次掉落；相邻云不可达 0 对
手机版  ：AI 平均 198.2 m / 49 朵云；30 种子 × 3 组参数（最软/默认/最猛）不可达 0 对
界面层  ：通过 35 项，失败 0 项
安卓 APK：aapt2 解析正常（com.cloudclimb 1.0 / minSdk 24 / targetSdk 34 / 云梯）
          v2+v3 签名校验通过，assets/index.html 与手机版逐字节一致
```

## 关于上色

按要求现在是纯线条风格。桌面版渲染集中在 `src/ClimbGame.cs` 的
`DrawHeightGuides` / `DrawFarClouds` / `DrawCloud` / `DrawBumpRing` / `DrawShards` /
`DrawPlayer` / `DrawHud` 等几个方法，颜色都来自 `InitResources()` 里的画笔；
手机版在 `mobile/src/shell.js` 顶部的 `COL` 常量。
要上色只改这些颜色即可，碰撞与物理无需改动。
