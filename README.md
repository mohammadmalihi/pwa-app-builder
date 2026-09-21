# App Builder (NestJS)

یک صفحه‌ی ساده که لوگو + آدرس سایت می‌گیرد و یک اپ نصب‌شدنی می‌سازد — دو خروجی:

- **iOS → PWA**: وب‌اپ سبک با آیکون و اسپلش‌اسکرین اختصاصی
- **Android → APK واقعی**: با Gradle + Android SDK کامپایل می‌شود، همان لوگو/آدرس/اسم را می‌گیرد

## اجرا

```bash
npm install
npm run start:dev
```

سپس مرورگر را روی `http://localhost:3000` باز کنید.

### پیش‌نیاز مسیر Android

برای ساخت APK، این‌ها باید روی سیستمی که سرور را اجرا می‌کند نصب و در PATH باشند:

- JDK 17
- Android SDK (با `platforms;android-34` و `build-tools;34.0.0` یا بالاتر، و پذیرفتن لایسنس)
- Gradle (نسخه‌ی سیستمی، در PATH به‌صورت `gradle`)
- متغیر محیطی `ANDROID_HOME` یا `ANDROID_SDK_ROOT` تنظیم‌شده

اگر این‌ها نصب نباشند، مسیر PWA (iOS) همچنان بدون هیچ پیش‌نیازی کار می‌کند.

## چطور کار می‌کند

### مسیر PWA (iOS)

1. صفحه‌ی اصلی (`public/index.html`) فرم آپلود لوگو + آدرس سایت + نام اپ (اختیاری) + رنگ‌ها را می‌گیرد.
2. دکمه‌ی «ساخت اپ» با گزینه‌ی PWA یک درخواست `multipart/form-data` به `POST /api/build` می‌فرستد.
3. `src/builder/builder.service.ts` با `sharp` آیکون‌های لازم PWA (192/512، نسخه‌ی maskable، apple-touch-icon، favicon) را می‌سازد و `manifest.webmanifest` + `index.html` (اسپلش با انیمیشن لودینگ) + `sw.js` تولید می‌کند.
4. خروجی زیر `generated/<id>/` ذخیره و از `/apps/<id>/index.html` سرو می‌شود — همین لینک روی گوشی با «Add to Home Screen» نصب می‌شود.
5. با باز شدن اپ، اسپلش نمایش داده می‌شود و بعد از ~۱.۴ ثانیه به‌صورت خودکار به URL هدف ریدایرکت می‌کند.
6. دکمه‌ی دانلود، همان پوشه را به‌صورت zip از `GET /api/build/:id/download` می‌دهد.

### مسیر APK (Android)

1. با انتخاب گزینه‌ی «APK اندروید»، همان فرم یک درخواست به `POST /api/build/android` می‌فرستد و بلافاصله یک `id` با وضعیت `building` برمی‌گردد (چون کامپایل واقعی زمان می‌برد).
2. `src/builder/android-builder.service.ts`:
   - یک کپی از پروژه‌ی الگو (`src/builder/templates/android-template/`) می‌سازد — یک اپ اندرویدی مینیمال با یک `Activity` که `WebView` را تمام‌صفحه نمایش می‌دهد.
   - از روی لوگو، آیکون لانچر را در تمام دانسیتی‌ها (mdpi تا xxxhdpi، هم مربعی هم دایره‌ای) و یک کارت اسپلش (`splash_logo.png`) می‌سازد (`utils/android-icon.util.ts`).
   - `strings.xml` (نام اپ، آدرس هدف)، `colors.xml` (رنگ تم/پس‌زمینه) و `applicationId` در `app/build.gradle` را جایگزین می‌کند — هر اپ یک `applicationId` یکتا می‌گیرد تا چند اپ ساخته‌شده روی یک گوشی با هم تداخل نکنند.
   - دستور `gradle assembleDebug` را روی همان پوشه اجرا می‌کند (بیلدهای هم‌زمان با یک صف داخلی سریالایز می‌شوند تا Gradle daemon مشترک شلوغ نشود).
   - APK نهایی را به `generated-apks/<id>.apk` منتقل می‌کند و پوشه‌ی کاری موقت را پاک می‌کند.
3. فرانت‌اند هر ۲.۵ ثانیه `GET /api/build/android/:id/status` را پول می‌کند تا `status` به `done` برسد، سپس دکمه‌ی دانلود APK را نشان می‌دهد (`GET /api/build/android/:id/download`).
4. اپ ساخته‌شده در اجرا: یک `Activity` با `WebView`، یک اسپلش‌اسکرین (لوگو روی کارت سفید + spinner با رنگ تم) که حداقل ۱.۴ ثانیه نمایش داده می‌شود و بعد محو می‌شود و صفحه‌ی وب‌سایت هدف را نشان می‌دهد.

APK با کلید دیباگ امضا می‌شود (همان کلیدی که Android Studio/Gradle به‌صورت خودکار می‌سازد) — یعنی مستقیماً روی گوشی (با فعال کردن «نصب از منابع ناشناس») یا با `adb install` قابل نصب است. برای انتشار در Google Play باید با یک کلید release واقعی امضا و از طریق Play Console آپلود شود که خارج از scope این پروژه است.

## ساختار پروژه

```
src/
  main.ts                        # bootstrap + serve public/ و generated/
  app.module.ts
  builder/
    builder.controller.ts        # POST /api/build , GET /api/build/:id/download   (PWA)
    builder.service.ts           # پردازش لوگو، آیکون‌های PWA، رندر تمپلیت‌ها، zip
    android-builder.controller.ts# POST /api/build/android , GET .../status , GET .../download
    android-builder.service.ts   # کپی تمپلیت اندروید، آیکون‌ها، اجرای gradle assembleDebug
    dto/build-app.dto.ts         # مشترک بین هر دو مسیر
    utils/
      logo-upload.config.ts
      android-icon.util.ts       # آیکون لانچر + نسخه‌ی دایره‌ای + کارت اسپلش
    templates/
      index.html.template        # اسپلش PWA
      manifest.webmanifest.template
      sw.js.template
      android-template/          # پروژه‌ی Gradle الگو (WebView Activity کامل)
public/                          # صفحه‌ی ساخت اپ (فرانت‌اند، هر دو مسیر)
generated/                       # خروجی PWAها (در گیت نادیده گرفته می‌شود)
generated-apks/                  # خروجی APKها (در گیت نادیده گرفته می‌شود)
android-builds/                  # پوشه‌ی کاری موقت بیلد اندروید (پاک‌سازی خودکار پس از هر بیلد)
```
