package com.yuna5963.myphrases;

import android.content.Intent;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * バックグラウンド再生用のローカルプラグイン。JS 側（backgroundSession.ts）から
 * start / update / stop を呼び、PlaybackService（FGS + wake lock）を制御する。
 * Android 13+ は通知の表示に POST_NOTIFICATIONS の実行時許可が必要だが、
 * 拒否されてもサービス自体は動く（通知が見えないだけ）ため、許可結果に
 * かかわらずサービスを開始する。
 */
@CapacitorPlugin(
        name = "BackgroundPlayback",
        permissions = {
                @Permission(alias = "notifications", strings = {"android.permission.POST_NOTIFICATIONS"})
        }
)
public class BackgroundPlaybackPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33
                && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
            return;
        }
        startService(call);
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        // 拒否でも開始する（通知が出ないだけで、再生継続には影響しない）。
        startService(call);
    }

    @PluginMethod
    public void update(PluginCall call) {
        // 同じ Intent 経路で onStartCommand が再度呼ばれ、通知が差し替わる。
        startService(call);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), PlaybackService.class));
        call.resolve();
    }

    private void startService(PluginCall call) {
        Intent intent = new Intent(getContext(), PlaybackService.class);
        intent.putExtra("title", call.getString("title", "再生中"));
        intent.putExtra("body", call.getString("body", ""));
        ContextCompat.startForegroundService(getContext(), intent);
        call.resolve();
    }
}
