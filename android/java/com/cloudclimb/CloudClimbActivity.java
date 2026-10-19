package com.cloudclimb;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.DisplayCutout;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

/**
 * CLOUD LADDER 云梯 —— 安卓外壳。
 *
 * 用一个全屏 WebView 承载内嵌在 assets/index.html 里的单文件游戏：
 * 不联网、不申请任何权限、所有美术与逻辑都在这一个文件里。
 * 竖屏锁定，沉浸式全屏，游戏期间屏幕常亮。
 */
public class CloudClimbActivity extends Activity {

    private static final int BG = 0xFF0B0C0E;

    private WebView web;
    private FrameLayout root;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setBackgroundDrawable(new ColorDrawable(BG));

        web = new WebView(this);
        web.setBackgroundColor(BG);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);        // localStorage：设置项与最佳成绩
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(false);
        s.setLoadWithOverviewMode(false);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(false);

        root = new FrameLayout(this);
        root.setBackgroundColor(BG);
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        applyCutoutPadding();

        web.loadUrl("file:///android_asset/index.html");
    }

    /**
     * 刘海屏：把 WebView 推进安全区，避免游戏顶部的高度数字被摄像头区域挡住。
     * 页面本身仍按可用的高度铺满，所以不会有黑边。
     */
    private void applyCutoutPadding() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P || root == null) return;
        WindowInsets wi = getWindow().getDecorView().getRootWindowInsets();
        if (wi == null) return;
        int top = 0, bottom = 0;
        DisplayCutout dc = wi.getDisplayCutout();
        if (dc != null) {
            top = dc.getSafeInsetTop();
            bottom = dc.getSafeInsetBottom();
        }
        if (root.getPaddingTop() != top || root.getPaddingBottom() != bottom) {
            root.setPadding(0, top, 0, bottom);
        }
    }

    /** 沉浸式全屏：隐藏状态栏与导航栏，用户上滑时短暂出现后自动收回。 */
    private void hideSystemUi() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUi();
            applyCutoutPadding();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
            web.resumeTimers();
        }
        hideSystemUi();
    }

    @Override
    protected void onPause() {
        if (web != null) {
            web.onPause();
            web.pauseTimers();               // 切后台时停下 rAF，等于自动暂停
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (web != null && web.canGoBack()) {
                web.goBack();
            } else {
                finish();
            }
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
