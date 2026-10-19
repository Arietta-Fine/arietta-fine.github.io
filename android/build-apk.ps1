# ============================================================
#  CLOUD LADDER 云梯 —— 安卓 APK 打包脚本
#
#  不依赖 gradle / Android Studio：直接用 SDK 里的工具手工走完
#  「资源编译 -> 链接 -> javac -> d8 -> 打包 -> 对齐 -> 签名」全流程。
#
#  依赖（本机已就位）:
#    C:\Android\sdk\build-tools\34.0.0   (aapt2 / d8 / zipalign / apksigner)
#    C:\Android\sdk\platforms\android-34 (android.jar)
#    C:\Program Files\Java\jdk1.8.0_221  (javac / keytool)
#
#  用法:  pwsh -File android/build-apk.ps1
#  产物:  android/dist/CloudClimb.apk
# ============================================================

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root       = $PSScriptRoot
$sdk        = 'C:\Android\sdk'
$bt         = Join-Path $sdk 'build-tools\34.0.0'
$aapt2      = Join-Path $bt 'aapt2.exe'
$zipalign   = Join-Path $bt 'zipalign.exe'
$d8         = Join-Path $bt 'd8.bat'
$apksigner  = Join-Path $bt 'apksigner.bat'
$androidJar = Join-Path $sdk 'platforms\android-34\android.jar'
$javaHome   = 'C:\Program Files\Java\jdk1.8.0_221'
$jdk17      = 'C:\Android\jdk17'                      # d8 / apksigner 需要 Java 11+
$javac      = Join-Path $javaHome 'bin\javac.exe'
$keytool    = Join-Path $javaHome 'bin\keytool.exe'

$buildDir = Join-Path $root 'build'
$distDir  = Join-Path $root 'dist'
$assets   = Join-Path $root 'assets'
$keystore = Join-Path $root 'cloudclimb.keystore'
$ksPass   = 'cloudclimb'
$ksAlias  = 'cloudclimb'

function Step([string]$title) {
    Write-Host ''
    Write-Host "-- $title" -ForegroundColor Cyan
}

function Check([string]$what) {
    if ($LASTEXITCODE -ne 0) { throw "$what 失败（exit $LASTEXITCODE）" }
}

# ------------------------------------------------------------
#  0. 前置检查
# ------------------------------------------------------------
Step '0/7 检查工具链'
$env:JAVA_HOME = $javaHome
foreach ($f in @($aapt2, $zipalign, $d8, $apksigner, $androidJar, $javac, $keytool)) {
    if (!(Test-Path $f)) { throw "缺少构建工具: $f" }
}
Write-Host "  工具链 OK（build-tools 34.0.0 / android-34 / JDK 8）"

if (Test-Path $buildDir) { Remove-Item $buildDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $buildDir, $distDir, $assets | Out-Null

# ------------------------------------------------------------
#  1. 图标 + 网页资源
# ------------------------------------------------------------
Step '1/7 生成图标并内嵌网页版'
& node (Join-Path $root 'make-icons.js')
Check '图标生成'

$html = Join-Path $root '..\mobile\dist\CloudClimb.html'
if (!(Test-Path $html)) { throw "找不到手机版成品 $html，请先跑 node mobile/build.js" }
Copy-Item $html (Join-Path $assets 'index.html') -Force
$kb = [math]::Round((Get-Item (Join-Path $assets 'index.html')).Length / 1KB, 1)
Write-Host "  已内嵌 assets/index.html ($kb KB)"

# ------------------------------------------------------------
#  2. 编译资源
# ------------------------------------------------------------
Step '2/7 aapt2 compile'
& $aapt2 compile --dir (Join-Path $root 'res') -o (Join-Path $buildDir 'res.zip')
Check 'aapt2 compile'
Write-Host "  资源已编译 (res.zip)"

# ------------------------------------------------------------
#  3. 链接资源 + 生成 R.java
# ------------------------------------------------------------
Step '3/7 aapt2 link'
& $aapt2 link `
    -o (Join-Path $buildDir 'base.apk') `
    -I $androidJar `
    --manifest (Join-Path $root 'AndroidManifest.xml') `
    (Join-Path $buildDir 'res.zip') `
    -A $assets `
    --java (Join-Path $buildDir 'gen') `
    --min-sdk-version 24 `
    --target-sdk-version 34 `
    --version-code 1 `
    --version-name 1.0
Check 'aapt2 link'
Write-Host "  base.apk 已生成（含资源与 assets）"

# ------------------------------------------------------------
#  4. 编译 Java
# ------------------------------------------------------------
Step '4/7 javac'
New-Item -ItemType Directory -Force -Path (Join-Path $buildDir 'classes') | Out-Null
$sources = @()
$sources += (Get-ChildItem -Recurse (Join-Path $buildDir 'gen') -Filter *.java | ForEach-Object { $_.FullName })
$sources += (Get-ChildItem -Recurse (Join-Path $root 'java') -Filter *.java | ForEach-Object { $_.FullName })
if ($sources.Count -eq 0) { throw '没有找到 Java 源码' }

& $javac -encoding UTF-8 -source 8 -target 8 -nowarn `
    -bootclasspath $androidJar -cp $androidJar `
    -d (Join-Path $buildDir 'classes') $sources
Check 'javac'
Write-Host ("  已编译 " + $sources.Count + " 个源文件")

# ------------------------------------------------------------
#  5. d8 -> classes.dex，并塞进 apk
# ------------------------------------------------------------
Step '5/7 d8 生成 dex 并打包'
if (!(Test-Path $jdk17)) { throw 'd8 needs JDK 11+, not found: ' + $jdk17 }
$env:JAVA_HOME = $jdk17
$classes = (Get-ChildItem -Recurse (Join-Path $buildDir 'classes') -Filter *.class | ForEach-Object { $_.FullName })
New-Item -ItemType Directory -Force -Path (Join-Path $buildDir 'dex') | Out-Null
& $d8 --lib $androidJar --min-api 24 --output (Join-Path $buildDir 'dex') $classes
Check 'd8'
$dex = Join-Path $buildDir 'dex\classes.dex'
Write-Host ("  classes.dex " + [math]::Round((Get-Item $dex).Length / 1KB, 1) + " KB")

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open((Join-Path $buildDir 'base.apk'), 'Update')
try {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip, $dex, 'classes.dex', [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
} finally {
    $zip.Dispose()
}
Write-Host "  classes.dex 已写入 base.apk"

# ------------------------------------------------------------
#  6. 对齐
# ------------------------------------------------------------
Step '6/7 zipalign'
& $zipalign -f 4 (Join-Path $buildDir 'base.apk') (Join-Path $buildDir 'aligned.apk')
Check 'zipalign'
Write-Host "  已 4 字节对齐"

# ------------------------------------------------------------
#  7. 签名
# ------------------------------------------------------------
Step '7/7 apksigner 签名'
if (!(Test-Path $keystore)) {
    Write-Host "  首次构建：生成自签名证书 cloudclimb.keystore（有效期 30 年）"
    & $keytool -genkeypair -v -keystore $keystore -alias $ksAlias `
        -keyalg RSA -keysize 2048 -validity 10950 `
        -storepass $ksPass -keypass $ksPass `
        -dname "CN=CloudClimb, O=CloudClimb, C=CN" | Out-Null
    Check 'keytool'
}

$outApk = Join-Path $distDir 'CloudClimb.apk'
if (Test-Path $outApk) { Remove-Item $outApk -Force }
& $apksigner sign `
    --ks $keystore --ks-key-alias $ksAlias `
    --ks-pass "pass:$ksPass" --key-pass "pass:$ksPass" `
    --v1-signing-enabled true --v2-signing-enabled true `
    --out $outApk (Join-Path $buildDir 'aligned.apk')
Check 'apksigner sign'

& $apksigner verify --verbose $outApk | ForEach-Object { Write-Host ("  " + $_) }
Check 'apksigner verify'

# ------------------------------------------------------------
#  完成
# ------------------------------------------------------------
$size = [math]::Round((Get-Item $outApk).Length / 1KB, 1)
Write-Host ''
Write-Host "构建完成: $outApk  ($size KB)" -ForegroundColor Green
& $aapt2 dump badging $outApk | Select-String -Pattern 'package:|application-label|sdkVersion|targetSdkVersion|launchable-activity' |
    ForEach-Object { Write-Host ("  " + $_.Line) }
