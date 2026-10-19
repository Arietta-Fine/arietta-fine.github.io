# CLOUD LADDER 云梯 — 安卓版（.apk）

把手机版那个单文件 HTML 装进一个极简 WebView 外壳，打成可安装的 APK。
**完全离线、零权限、无第三方依赖**，所有美术与逻辑都在那一个 HTML 里。

- 成品：`dist/CloudClimb.apk`（约 37 KB）
- 包名：`com.cloudclimb`　版本：`1.0`
- 支持：**Android 7.0 及以上**（minSdk 24 / targetSdk 34）

## 装到手机上

三种办法，任选：

1. **同一个 WiFi 直接下载**（最省事）
   电脑上跑 `node mobile/serve.js`，手机浏览器打开提示里那个
   `http://<电脑IP>:8080/CloudClimb.apk`，下载完点开安装。
2. **传文件**：把 `dist/CloudClimb.apk` 用微信 / QQ / 数据线丢到手机，
   在文件管理器里点开安装。
3. **adb**（如果装了）：`adb install -r dist/CloudClimb.apk`

首次安装系统会拦一下：需要给安装来源开「允许安装未知应用」。
这是所有非应用商店 APK 的必经步骤，不是包本身的问题。

> ⚠️ **关于 iPhone**：iOS 从系统层面就不认识 `.apk`，任何 APK 都装不进苹果设备，
> 这不是签名或打包方式能绕过的。苹果设备请走
> `mobile/` 里的「Safari → 添加到主屏幕」，见根目录 README。

## 目录结构

```
android/
├─ AndroidManifest.xml               清单：竖屏、无权限、launcher 入口
├─ java/com/cloudclimb/
│   └─ CloudClimbActivity.java       全屏 WebView 外壳
├─ res/
│  ├─ values/{strings,colors,styles}.xml
│  └─ mipmap-*/                      各密度启动图标（含自适应图标前景）
├─ make-icons.js                     纯 Node 生成图标（不依赖三方库）
├─ build-apk.ps1                     一条命令走完全流程
├─ assets/index.html                 构建时从 mobile/dist 复制进来
└─ dist/
   ├─ CloudClimb.apk                 成品
   └─ icon-512.png                   应用商店 / 分享用的高清图标
```

## 重新构建

```powershell
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1
```

脚本会自己跑完：生成图标 → 内嵌手机版 HTML → `aapt2 compile` → `aapt2 link`
→ `javac` → `d8` → 塞 `classes.dex` → `zipalign` → `apksigner 签名` → 校验。

**没有用 gradle / Android Studio**，因为本机没有也不必要——只要下面这几样：

| 依赖 | 本机位置 | 用途 |
| --- | --- | --- |
| Android build-tools 34.0.0 | `C:\Android\sdk\build-tools\34.0.0` | aapt2 / d8 / zipalign / apksigner |
| Android platform 34 | `C:\Android\sdk\platforms\android-34` | android.jar |
| JDK 8 | `C:\Program Files\Java\jdk1.8.0_221` | javac / keytool |
| JDK 17 | `C:\Android\jdk17` | **d8 和 apksigner 要 Java 11+**，JDK 8 跑不了 |

SDK 是用 `repository2-1.xml` 里的直链下载后解压的，
**绕开了 `sdkmanager`**（它同样要求 Java 11+）。

签名用的是仓库里自带的 `cloudclimb.keystore`（自签，密码都是 `cloudclimb`，
有效期 30 年）。要发布到应用商店请换成自己的正式密钥，并妥善保管。

## 踩过的坑（留给以后）

- `aapt2 link` 的 `-R` 是 **overlay 语义**，直接传编译产物会报
  `resource ... does not override an existing resource`；
  应当把 `res.zip` 作为**位置参数**传进去。
- `javac -d` 和 `d8 --output` 的目录都**必须预先存在**，不会自动创建。
- `WebView.pauseTimers()` / `resumeTimers()` 是**实例方法**，不是静态方法。
- 手机竖屏是 9:19.5 这类比例，原先固定 480×640 等比缩放会在上下留出巨大黑边；
  现在改成**宽度固定 480、高度随屏幕比例延伸**，满屏显示（桌面/横屏仍退回 640）。
- 刘海屏用 `DisplayCutout.getSafeInsetTop()` 给 WebView 加内边距，
  免得顶部的高度数字被摄像头挖孔挡住。
- 这个环境里的 `pwsh` 实际是 Windows PowerShell 5.1：
  执行脚本要 `-ExecutionPolicy Bypass`，且 `.ps1` 必须存成 **UTF-8 with BOM**，
  否则中文注释会被按 GBK 解析成乱码。
