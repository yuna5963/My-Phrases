package com.yuna5963.myphrases;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * 連続再生中の「メディア再生」フォアグラウンドサービス。
 * 画面オフでもプロセスと CPU（PARTIAL_WAKE_LOCK）を生かし、WebView 内の
 * 読み上げ連鎖（TTS完了コールバック → setTimeout の間）が止まらないようにする。
 * 通知には再生中のチャンク（英文/和訳）を表示する。
 */
public class PlaybackService extends Service {
    static final String CHANNEL_ID = "playback";
    static final int NOTIFICATION_ID = 1;
    // 聞き流しの長時間セッションを想定しつつ、解放漏れの保険として上限を置く。
    private static final long WAKELOCK_TIMEOUT_MS = 10L * 60 * 60 * 1000; // 10時間

    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "myphrases:playback");
        wakeLock.setReferenceCounted(false);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = intent != null ? intent.getStringExtra("title") : null;
        String body = intent != null ? intent.getStringExtra("body") : null;
        Notification notification = buildNotification(
                title != null ? title : "再生中",
                body != null ? body : "");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        if (!wakeLock.isHeld()) wakeLock.acquire(WAKELOCK_TIMEOUT_MS);
        return START_NOT_STICKY;
    }

    /**
     * タスク一覧からアプリをスワイプで閉じられたとき。
     * manifest の stopWithTask=true でシステムが停止してくれるが、
     * 端末・OSバージョンによる差の保険として明示的にも止める
     * （ここを取りこぼすと wake lock を握ったままプロセスが残る）。
     */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopForegroundAndSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        releaseWakeLock();
        super.onDestroy();
    }

    private void stopForegroundAndSelf() {
        releaseWakeLock();
        // STOP_FOREGROUND_REMOVE は API 24 から。minSdk が 24 なので分岐は不要。
        stopForeground(Service.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "再生", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("連続再生中に表示されます");
        channel.setShowBadge(false);
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(channel);
    }

    private Notification buildNotification(String title, String body) {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(
                this, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setContentIntent(pi)
                .setOngoing(true)
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .build();
    }
}
