package com.qeyasquiz.app;

import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

public class DisclosureActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        new AlertDialog.Builder(this)
            .setTitle("صلاحية إضافية مطلوبة")
            .setMessage(
                "لضمان نزاهة الامتحانات، التطبيق محتاج صلاحية " +
                "\"الوصول للتطبيقات\" (Accessibility Service).\n\n" +
                "الصلاحية دي بتساعدنا نكتشف لو فيه تطبيق تاني فتح فوق " +
                "الامتحان (زي برامج التصوير أو التسجيل) عشان نوقف " +
                "الامتحان فورا.\n\n" +
                "إحنا لا نقرأ رسائلك ولا نشوف صورك ولا أي بيانات شخصية."
            )
            .setCancelable(false)
            .setPositiveButton("موافق، افتح الإعدادات", (dialog, which) -> {
                Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
                startActivity(intent);
            })
            .setNegativeButton("مش موافق", (dialog, which) -> showRefusalAndExit())
            .show();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (isAccessibilityServiceEnabled()) {
            startActivity(new Intent(this, MainActivity.class));
            finish();
        }
    }

    private boolean isAccessibilityServiceEnabled() {
        String service = getPackageName() + "/" + OverlayDetectionService.class.getCanonicalName();
        try {
            String enabled = Settings.Secure.getString(
                getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            );
            return enabled != null && enabled.contains(service);
        } catch (Exception e) {
            return false;
        }
    }

    private void showRefusalAndExit() {
        new AlertDialog.Builder(this)
            .setTitle("نعتذر")
            .setMessage(
                "مش هتقدر تسجل أو تكمل في QeyasQuiz من غير الموافقة على " +
                "هذه الصلاحية. ده إجراء أساسي لضمان نزاهة الامتحانات."
            )
            .setCancelable(false)
            .setPositiveButton("خروج", (d, w) -> {
                finishAffinity();
                System.exit(0);
            })
            .show();
    }

    @Override
    public void onBackPressed() {
        // Block back press on disclosure
    }
}
