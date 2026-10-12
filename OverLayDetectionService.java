package com.qeyasquiz.app;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class OverlayDetectionService extends AccessibilityService {

    public static final String ACTION_OVERLAY_DETECTED = "com.qeyasquiz.app.OVERLAY_DETECTED";
    public static final String EXTRA_PACKAGE = "package";

    private static final Set<String> ALLOWED_PACKAGES = new HashSet<>();

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        ALLOWED_PACKAGES.add(getPackageName());
        ALLOWED_PACKAGES.add("com.android.systemui");
        ALLOWED_PACKAGES.add("com.google.android.gms");
        ALLOWED_PACKAGES.add("com.android.settings");
        ALLOWED_PACKAGES.add("com.android.permissioncontroller");
        ALLOWED_PACKAGES.add("android");
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event.getEventType() != AccessibilityEvent.TYPE_WINDOWS_CHANGED &&
            event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            return;
        }

        List<AccessibilityWindowInfo> windows = getWindows();
        if (windows == null) return;

        for (AccessibilityWindowInfo window : windows) {
            if (window.getType() != AccessibilityWindowInfo.TYPE_SYSTEM &&
                window.getType() != AccessibilityWindowInfo.TYPE_APPLICATION) {
                continue;
            }

            AccessibilityNodeInfo node = window.getRoot();
            if (node == null) continue;

            CharSequence pkgName = node.getPackageName();
            if (pkgName == null) continue;

            String pkg = pkgName.toString();
            if (!pkg.isEmpty() && !ALLOWED_PACKAGES.contains(pkg)) {
                notifyOverlayDetected(pkg);
                break;
            }
        }
    }

    private void notifyOverlayDetected(String packageName) {
        Intent intent = new Intent(ACTION_OVERLAY_DETECTED);
        intent.putExtra(EXTRA_PACKAGE, packageName);
        LocalBroadcastManager.getInstance(this).sendBroadcast(intent);
    }

    @Override
    public void onInterrupt() { }
}
