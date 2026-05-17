# Utsav Farmer Lite APK

This folder contains a lightweight Android wrapper for the live farmer app:

- Live URL: `https://utsav-feed-application.onrender.com/farmer-app/`
- Package: `com.utsavfarmer.lite`

## What it does

- opens the live farmer app inside an Android app shell
- supports normal browsing inside the app
- supports file chooser uploads for bills, documents, and issue photos
- gives farmers a home-screen app instead of asking them to open Render directly

## Files included

- `keystore.properties`: local signing config for APK builds
- `keystore/utsavfarmerlite-release.jks`: local test keystore for release APK generation

## How to build the APK

1. Install Android Studio on your Mac.
2. Open the `android-lite` folder in Android Studio.
3. Let Android Studio sync the project and download the Android SDK/Gradle components.
4. Choose:
   - `Build` -> `Build Bundle(s) / APK(s)` -> `Build APK(s)` for debug
   - `Build` -> `Generate Signed Bundle / APK` for release, or run `assembleRelease`
5. After build finishes, Android Studio will show the APK location.

Typical output paths:

- `android-lite/app/build/outputs/apk/debug/app-debug.apk`
- `android-lite/app/build/outputs/apk/release/app-release.apk`

## How to test on phone

1. Copy the generated APK to your Android phone.
2. Open it from WhatsApp, Drive, email, or Files.
3. Allow `Install unknown apps` if Android asks.
4. Install and open `Utsav Farmer Lite`.

## Notes

- This is a lite WebView app, so most feature changes can still be made on the web/backend side.
- Farmers usually will not need a new APK for normal UI/form updates.
- If you change the live farmer app domain later, update `FARMER_APP_URL` in:
  - `app/src/main/java/com/utsavfarmer/lite/MainActivity.java`
- The included keystore is only for direct field testing. For long-term production, generate a fresh owner-controlled keystore and store it safely.
