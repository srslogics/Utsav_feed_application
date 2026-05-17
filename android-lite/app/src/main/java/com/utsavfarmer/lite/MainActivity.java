package com.utsavfarmer.lite;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;
import androidx.core.splashscreen.SplashScreen;

import com.utsavfarmer.lite.databinding.ActivityMainBinding;

import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {
    private static final String FARMER_APP_URL = "https://utsav-feed-application.onrender.com/farmer-app/";

    private ActivityMainBinding binding;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri capturedPhotoUri;

    private final ActivityResultLauncher<Intent> fileChooserLauncher =
        registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
            Uri[] results = null;
            if (result.getResultCode() == Activity.RESULT_OK) {
                if (result.getData() != null) {
                    if (result.getData().getClipData() != null) {
                        int count = result.getData().getClipData().getItemCount();
                        results = new Uri[count];
                        for (int i = 0; i < count; i++) {
                            results[i] = result.getData().getClipData().getItemAt(i).getUri();
                        }
                    } else if (result.getData().getData() != null) {
                        results = new Uri[]{result.getData().getData()};
                    }
                } else if (capturedPhotoUri != null) {
                    results = new Uri[]{capturedPhotoUri};
                }
            }

            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            }
            capturedPhotoUri = null;
        });

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        SplashScreen.installSplashScreen(this);
        binding = ActivityMainBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        WebSettings settings = binding.webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(binding.webView, true);

        binding.webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                binding.progressBar.setVisibility(View.VISIBLE);
                binding.statusText.setText(R.string.status_loading);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                binding.progressBar.setVisibility(View.GONE);
                binding.swipeRefresh.setRefreshing(false);
                binding.statusText.setText(R.string.status_live);
            }

            @Override
            public void onReceivedError(
                WebView view,
                WebResourceRequest request,
                WebResourceError error
            ) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    binding.progressBar.setVisibility(View.GONE);
                    binding.swipeRefresh.setRefreshing(false);
                    binding.statusText.setText(R.string.status_connection_issue);
                }
            }
        });

        binding.webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                WebView webView,
                ValueCallback<Uri[]> filePathCallback,
                FileChooserParams fileChooserParams
            ) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }

                MainActivity.this.filePathCallback = filePathCallback;
                try {
                    Intent contentSelectionIntent = fileChooserParams.createIntent();
                    contentSelectionIntent.addCategory(Intent.CATEGORY_OPENABLE);
                    if (TextUtils.isEmpty(contentSelectionIntent.getType())) {
                        contentSelectionIntent.setType("*/*");
                    }
                    contentSelectionIntent.putExtra(
                        Intent.EXTRA_ALLOW_MULTIPLE,
                        fileChooserParams.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE
                    );

                    boolean allowCamera = shouldAllowCamera(fileChooserParams.getAcceptTypes());

                    Intent[] extraIntents = new Intent[allowCamera ? 1 : 0];
                    if (allowCamera) {
                        Intent captureIntent = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
                        File photoFile = createImageFile();
                        capturedPhotoUri = FileProvider.getUriForFile(
                            MainActivity.this,
                            BuildConfig.APPLICATION_ID + ".fileprovider",
                            photoFile
                        );
                        captureIntent.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, capturedPhotoUri);
                        captureIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        captureIntent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                        extraIntents[0] = captureIntent;
                    }

                    Intent chooserIntent = new Intent(Intent.ACTION_CHOOSER);
                    chooserIntent.putExtra(Intent.EXTRA_INTENT, contentSelectionIntent);
                    chooserIntent.putExtra(Intent.EXTRA_TITLE, getString(R.string.file_chooser_title));
                    chooserIntent.putExtra(Intent.EXTRA_INITIAL_INTENTS, extraIntents);
                    fileChooserLauncher.launch(chooserIntent);
                    return true;
                } catch (IOException exception) {
                    if (MainActivity.this.filePathCallback != null) {
                        MainActivity.this.filePathCallback.onReceiveValue(null);
                        MainActivity.this.filePathCallback = null;
                    }
                    capturedPhotoUri = null;
                    return false;
                }
            }
        });

        binding.swipeRefresh.setColorSchemeResources(R.color.brand_primary, R.color.brand_accent);
        binding.swipeRefresh.setOnRefreshListener(() -> {
            binding.statusText.setText(R.string.status_refreshing);
            binding.webView.reload();
        });
        binding.actionRefresh.setOnClickListener(view -> {
            binding.statusText.setText(R.string.status_refreshing);
            binding.progressBar.setVisibility(View.VISIBLE);
            binding.webView.reload();
        });

        if (savedInstanceState != null) {
            binding.webView.restoreState(savedInstanceState);
        } else {
            binding.webView.loadUrl(FARMER_APP_URL);
        }

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (binding.webView.canGoBack()) {
                    binding.webView.goBack();
                } else {
                    finish();
                }
            }
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        binding.webView.saveState(outState);
    }

    private File createImageFile() throws IOException {
        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        File storageDir = getCacheDir();
        return File.createTempFile("utsav_issue_" + timeStamp, ".jpg", storageDir);
    }

    private boolean shouldAllowCamera(String[] acceptTypes) {
        if (acceptTypes == null || acceptTypes.length == 0) {
            return true;
        }

        for (String acceptType : acceptTypes) {
            if (TextUtils.isEmpty(acceptType)) {
                return true;
            }

            String normalized = acceptType.toLowerCase(Locale.US);
            if (normalized.contains("image") || normalized.equals("*/*")) {
                return true;
            }
        }

        return false;
    }
}
