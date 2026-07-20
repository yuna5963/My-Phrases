package com.yuna5963.myphrases;

import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundPlaybackPlugin.class);
        super.onCreate(savedInstanceState);
        keepRendererImportantWhileHidden();
    }

    /**
     * 画面オフ（WebView非表示）でもレンダラプロセスの優先度を落とさない。
     * 連続再生は WebView 内の JS 連鎖で進むため、優先度が waive されると
     * 発話完了コールバックや setTimeout が遅延・停止する。
     */
    private void keepRendererImportantWhileHidden() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;
        webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
    }
}
