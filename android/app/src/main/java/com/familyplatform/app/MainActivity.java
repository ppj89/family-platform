package com.familyplatform.app;

import android.os.Bundle;

import androidx.annotation.Nullable;
import androidx.appcompat.app.ActionBar;
import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        // Plugins that live in this app module (rather than in a node_modules
        // package) are not picked up by capacitor.plugins.json, so they have
        // to be registered by hand — and before super.onCreate(), which is
        // where the bridge is built.
        registerPlugin(NotificationCapturePlugin.class);

        // The launch theme owns a temporary splash window.  Installing it
        // before BridgeActivity is created applies postSplashScreenTheme
        // immediately and prevents the empty system action-bar strip from
        // remaining above the WebView on Android 12+.
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        // Android 15/16 force edge-to-edge and ignore any statusBarColor /
        // setDecorFitsSystemWindows override set here, so system-bar styling
        // is no longer done natively. The @capacitor/status-bar plugin
        // (driven from src/App.tsx) sets icon color per theme, and app.css
        // paints the status bar's own area via env(safe-area-inset-top).
        // Do not reintroduce a native system-bar override here: it fights
        // the plugin because it used to reapply on every focus change.

        ActionBar actionBar = getSupportActionBar();
        if (actionBar != null) {
            actionBar.hide();
        }
    }
}
