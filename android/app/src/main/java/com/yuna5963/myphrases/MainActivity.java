package com.yuna5963.myphrases;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundPlaybackPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
