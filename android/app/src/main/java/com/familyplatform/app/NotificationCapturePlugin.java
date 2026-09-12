package com.familyplatform.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Bridges the payment-notification queue (see PaymentNotificationListener)
 * to the web layer, which parses and shows the captured messages for review.
 */
@CapacitorPlugin(name = "NotificationCapture")
public class NotificationCapturePlugin extends Plugin {

    /**
     * Notification access is granted in a system settings screen, not via a
     * runtime permission dialog, so it can only be read back — never
     * requested directly.
     */
    @PluginMethod
    public void isEnabled(PluginCall call) {
        JSObject result = new JSObject();
        result.put("enabled", hasNotificationAccess());
        call.resolve(result);
    }

    /** Opens the system screen where notification access is granted. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("notification settings could not be opened", error);
        }
    }

    /**
     * Returns everything captured since the last call and clears the queue,
     * so a message is only ever offered for review once.
     */
    @PluginMethod
    public void takePending(PluginCall call) {
        SharedPreferences prefs = getContext()
            .getSharedPreferences(PaymentNotificationListener.PREFS, Context.MODE_PRIVATE);
        JSONArray stored = PaymentNotificationListener.readItems(prefs);
        prefs.edit().remove(PaymentNotificationListener.KEY_ITEMS).apply();

        JSArray items = new JSArray();
        for (int i = 0; i < stored.length(); i++) {
            JSONObject item = stored.optJSONObject(i);
            if (item == null) {
                continue;
            }
            JSObject entry = new JSObject();
            entry.put("id", item.optString("id"));
            entry.put("packageName", item.optString("packageName"));
            entry.put("title", item.optString("title"));
            entry.put("text", item.optString("text"));
            entry.put("postedAt", item.optLong("postedAt"));
            items.put(entry);
        }

        JSObject result = new JSObject();
        result.put("items", items);
        call.resolve(result);
    }

    private boolean hasNotificationAccess() {
        try {
            String enabled = Settings.Secure.getString(
                getContext().getContentResolver(),
                "enabled_notification_listeners"
            );
            return enabled != null && enabled.contains(getContext().getPackageName());
        } catch (Exception ignored) {
            return false;
        }
    }
}
