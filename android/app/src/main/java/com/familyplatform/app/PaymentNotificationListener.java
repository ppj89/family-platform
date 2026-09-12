package com.familyplatform.app;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Captures card/payment notifications so the ledger can offer them for
 * one-tap entry, instead of the user pasting the text in by hand.
 *
 * Deliberately dumb: it only keeps the raw text. All of the parsing
 * (amount, merchant, category, payment method, date) already exists in
 * the web layer — see parseSmsText in LedgerPage.tsx, which powers the
 * existing "카드 붙여넣기" dialog — so nothing is duplicated here and both
 * paths stay in sync.
 *
 * Nothing is uploaded from here. Matches are queued locally and handed to
 * the app the next time it is opened, which then shows them for review.
 * Anything the user never approves never leaves the phone.
 */
public class PaymentNotificationListener extends NotificationListenerService {

    static final String PREFS = "family_platform_notification_capture";
    static final String KEY_ITEMS = "items";
    private static final int MAX_ITEMS = 200;

    /** "12,345원" / "12345 원" — three digits minimum, so OTP codes don't match. */
    private static final Pattern AMOUNT = Pattern.compile("[0-9][0-9,]{2,}\\s*원");
    /** Without one of these a notification is not a transaction. */
    private static final Pattern KEYWORD = Pattern.compile("승인|결제|사용|출금|입금|이체|취소|환불");

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null) {
            return;
        }
        // Our own notifications (calendar reminders and the like) are never
        // transactions, and re-reading them would be a feedback loop.
        if (getPackageName().equals(sbn.getPackageName())) {
            return;
        }

        Bundle extras = sbn.getNotification().extras;
        if (extras == null) {
            return;
        }
        String title = charSequence(extras.getCharSequence(Notification.EXTRA_TITLE));
        String text = charSequence(extras.getCharSequence(Notification.EXTRA_TEXT));
        String bigText = charSequence(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        // Card apps often put the useful line only in the expanded text.
        String body = bigText.length() > text.length() ? bigText : text;
        String combined = (title + "\n" + body).trim();

        if (!looksLikeTransaction(combined)) {
            return;
        }
        store(sbn.getPackageName(), title, body, sbn.getPostTime());
    }

    private boolean looksLikeTransaction(String combined) {
        if (combined.isEmpty()) {
            return false;
        }
        Matcher amount = AMOUNT.matcher(combined);
        if (!amount.find()) {
            return false;
        }
        return KEYWORD.matcher(combined).find();
    }

    private void store(String packageName, String title, String body, long postedAt) {
        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray items = readItems(prefs);

        try {
            String signature = packageName + "|" + title + "|" + body;
            // Card apps routinely repost the same notification (progress
            // updates, group summaries). Keep the queue to one row per
            // message so the review list isn't full of duplicates.
            for (int i = 0; i < items.length(); i++) {
                JSONObject existing = items.optJSONObject(i);
                if (existing != null && signature.equals(existing.optString("signature"))) {
                    return;
                }
            }

            JSONObject item = new JSONObject();
            item.put("id", packageName + ":" + postedAt + ":" + Math.abs(signature.hashCode()));
            item.put("signature", signature);
            item.put("packageName", packageName);
            item.put("title", title);
            item.put("text", body);
            item.put("postedAt", postedAt);
            items.put(item);

            while (items.length() > MAX_ITEMS) {
                items.remove(0);
            }
            prefs.edit().putString(KEY_ITEMS, items.toString()).apply();
        } catch (Exception ignored) {
            // A malformed notification must never take the listener down —
            // the system stops rebinding a service that keeps crashing.
        }
    }

    static JSONArray readItems(SharedPreferences prefs) {
        try {
            return new JSONArray(prefs.getString(KEY_ITEMS, "[]"));
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }

    private static String charSequence(CharSequence value) {
        return value == null ? "" : value.toString().trim();
    }
}
