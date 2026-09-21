package com.appbuilder.generated;

import android.app.Activity;
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

public class MainActivity extends Activity {

    private static final long MIN_SPLASH_MS = 1400;
    private static final long FAILSAFE_MS = 8000;

    private final long startTime = System.currentTimeMillis();
    private WebView webView;
    private View splashOverlay;
    private boolean splashHidden = false;

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

        webView.loadUrl(getString(R.string.target_url));

        splashOverlay.postDelayed(this::scheduleHideSplash, FAILSAFE_MS);
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
