package com.appbuilder.generated;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.PorterDuff;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.animation.AlphaAnimation;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {

    private static final long MIN_SPLASH_MS = 1400;
    private static final long FAILSAFE_MS = 8000;

    private final long startTime = System.currentTimeMillis();
    private WebView webView;
    private View splashOverlay;
    private boolean splashHidden = false;
    private String currentUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        splashOverlay = findViewById(R.id.splash_overlay);
        ProgressBar progressBar = findViewById(R.id.splash_progress);
        progressBar.getIndeterminateDrawable().setColorFilter(
                getColor(R.color.theme_color), PorterDuff.Mode.SRC_IN);

        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setDatabaseEnabled(true);
        webView.getSettings().setLoadWithOverviewMode(true);
        webView.getSettings().setUseWideViewPort(true);
        webView.getSettings().setSupportZoom(false);

        // Persist the login session (cookies) across app restarts, and allow
        // third-party cookies for OAuth/SSO redirect-based logins.
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) {
                    // no app can handle this scheme, ignore
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                scheduleHideSplash();
                CookieManager.getInstance().flush();
            }
        });
        webView.setWebChromeClient(new WebChromeClient());

        currentUrl = getString(R.string.target_url);
        webView.loadUrl(currentUrl);

        splashOverlay.postDelayed(this::scheduleHideSplash, FAILSAFE_MS);

        fetchRemoteConfig();
    }

    private void scheduleHideSplash() {
        if (splashHidden) return;
        long elapsed = System.currentTimeMillis() - startTime;
        long wait = Math.max(MIN_SPLASH_MS - elapsed, 0);
        splashOverlay.postDelayed(() -> {
            if (splashHidden) return;
            splashHidden = true;
            AlphaAnimation fade = new AlphaAnimation(1f, 0f);
            fade.setDuration(300);
            fade.setFillAfter(true);
            splashOverlay.startAnimation(fade);
            splashOverlay.postDelayed(() -> splashOverlay.setVisibility(View.GONE), 300);
        }, wait);
    }

    /**
     * Asks the app-builder backend for this app's current settings. This lets
     * the owner change the target URL for everyone instantly (no reinstall),
     * and lets us detect when a newer build (new icon/name) is available so
     * we can prompt the user to update.
     */
    private void fetchRemoteConfig() {
        new Thread(() -> {
            try {
                URL url = new URL(getString(R.string.config_url));
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(4000);
                conn.setRequestMethod("GET");

                if (conn.getResponseCode() == 200) {
                    BufferedReader reader = new BufferedReader(
                            new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
                    StringBuilder body = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) body.append(line);
                    reader.close();

                    JSONObject json = new JSONObject(body.toString());
                    runOnUiThread(() -> applyRemoteConfig(json));
                }
            } catch (Exception ignored) {
                // offline or server unreachable: keep using the values baked into this build
            }
        }).start();
    }

    private void applyRemoteConfig(JSONObject json) {
        if (isFinishing()) return;

        String remoteUrl = json.optString("targetUrl", null);
        if (remoteUrl != null && !remoteUrl.isEmpty() && !remoteUrl.equals(currentUrl)) {
            currentUrl = remoteUrl;
            webView.loadUrl(remoteUrl);
        }

        int latestVersionCode = json.optInt("latestVersionCode", BuildConfig.VERSION_CODE);
        String downloadUrl = json.optString("downloadUrl", null);
        if (latestVersionCode > BuildConfig.VERSION_CODE && downloadUrl != null && !downloadUrl.isEmpty()) {
            showUpdateDialog(downloadUrl);
        }
    }

    private void showUpdateDialog(String downloadUrl) {
        if (isFinishing()) return;
        new AlertDialog.Builder(this)
                .setTitle("نسخه‌ی جدید موجود است")
                .setMessage("برای استفاده از آخرین تغییرات این اپ، لطفاً نسخه‌ی جدید رو نصب کنید.")
                .setCancelable(true)
                .setPositiveButton("به‌روزرسانی", (dialog, which) ->
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(downloadUrl))))
                .setNegativeButton("بعداً", (dialog, which) -> dialog.dismiss())
                .show();
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }
}
