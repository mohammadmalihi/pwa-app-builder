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

1. با انتخاب گزینه‌ی «APK اندروید»، همان فرم یک درخواست به `POST /api/apps` می‌فرستد و بلافاصله یک `appId` با وضعیت `building` برمی‌گردد (چون کامپایل واقعی زمان می‌برد). این `appId` هویت دائمی اپ است — برای تغییرات بعدی (آیکون/آدرس/اسم) دوباره لازم می‌شود.
2. `src/builder/android-builder.service.ts`:
   - یک کپی از پروژه‌ی الگو (`src/builder/templates/android-template/`) می‌سازد — یک اپ اندرویدی مینیمال با یک `Activity` که `WebView` را تمام‌صفحه نمایش می‌دهد.
   - از روی لوگو، آیکون لانچر را در تمام دانسیتی‌ها (mdpi تا xxxhdpi، هم مربعی هم دایره‌ای) و یک کارت اسپلش (`splash_logo.png`) می‌سازد (`utils/android-icon.util.ts`).
   - `strings.xml` (نام اپ، آدرس هدف، آدرس config)، `colors.xml` (رنگ تم/پس‌زمینه) و `applicationId`/`versionCode`/`versionName` در `app/build.gradle` را جایگزین می‌کند — هر اپ یک `applicationId` **ثابت و یکتا** می‌گیرد (بر پایه‌ی `appId`) که در همه‌ی نسخه‌های بعدی همان اپ حفظ می‌شود؛ همین باعث می‌شود نصب نسخه‌ی جدید روی گوشی، اپ قبلی را جایگزین کند نه اینکه یک اپ جدید و جدا نصب شود.
   - دستور `gradle assembleDebug` را روی همان پوشه اجرا می‌کند (بیلدهای هم‌زمان با یک صف داخلی سریالایز می‌شوند تا Gradle daemon مشترک شلوغ نشود).
   - APK نهایی را به `generated-apks/<appId>.apk` منتقل می‌کند، لوگوی اصلی و اطلاعات اپ را در `app-registry/<appId>.json` (+ `app-registry/<appId>-logo.*`) ذخیره می‌کند، و پوشه‌ی کاری موقت را پاک می‌کند.
3. فرانت‌اند هر ۲.۵ ثانیه `GET /api/apps/:appId/status` را پول می‌کند تا `status` به `done` برسد، سپس لینک «مدیریت این اپ» و دکمه‌ی دانلود APK را نشان می‌دهد.
4. اپ ساخته‌شده در اجرا: یک `Activity` با `WebView`، یک اسپلش‌اسکرین (لوگو روی کارت سفید + spinner با رنگ تم) که حداقل ۱.۴ ثانیه نمایش داده می‌شود، سپس محو می‌شود و صفحه‌ی وب‌سایت هدف را نشان می‌دهد. کوکی‌های سشن (برای لاگین) با `CookieManager` ذخیره و بین بازکردن‌های مختلف اپ حفظ می‌شوند.

APK با کلید دیباگ امضا می‌شود (همان کلیدی که Android Studio/Gradle به‌صورت خودکار می‌سازد و بین همه‌ی بیلدها یکسان است) — یعنی مستقیماً روی گوشی (با فعال کردن «نصب از منابع ناشناس») یا با `adb install` قابل نصب است، و نسخه‌های بعدی هم چون با همان کلید امضا می‌شوند، به‌عنوان «آپدیت» نصب می‌شوند نه یک اپ جدا. برای انتشار در Google Play باید با یک کلید release واقعی امضا و از طریق Play Console آپلود شود که خارج از scope این پروژه است.

### آپدیت اپ بعد از نصب: تغییر آیکون/آدرس/اسم و پاپ‌آپ آپدیت

بعد از ساخت هر اپ اندرویدی، لینک «مدیریت این اپ» (`/manage.html?id=<appId>`) داده می‌شود. در آن صفحه دو راه برای تغییر اپ هست:

**۱. تغییر سریع آدرس (`PATCH /api/apps/:appId/url`)** — بدون rebuild و بدون نیاز به نصب مجدد. اپ نصب‌شده‌ی کاربر، هر بار که باز می‌شود یک درخواست به `GET /api/apps/:appId/config` می‌زند (این آدرس داخل خود APK، در `config_url`، در زمان build ثبت شده) و آدرس تازه را از همان‌جا می‌گیرد. یعنی صرفاً با عوض کردن URL، محتوای همه‌ی نصب‌های موجود فوراً عوض می‌شود.

**۲. انتشار نسخه‌ی جدید (`POST /api/apps/:appId/rebuild`)** — برای تغییر آیکون، اسم، یا رنگ (چیزهایی که داخل خود فایل APK کامپایل شده‌اند و با یک درخواست ساده قابل تغییر نیستند). این مسیر:
   - `versionCode` را یک واحد بالا می‌برد (`versionName` هم متناسب تغییر می‌کند)
   - APK را با همان `applicationId` قبلی، ولی با لوگو/اسم/رنگ جدید، دوباره می‌سازد (اگر لوگوی جدید آپلود نشود، همان لوگوی قبلی از `app-registry` استفاده می‌شود)
   - رکورد اپ را فقط در صورت موفقیت بیلد به‌روزرسانی می‌کند — یعنی اگر rebuild با خطا مواجه شود، نسخه‌ی نصب‌شده‌ی فعلی کاربرها دست‌نخورده می‌ماند.

   اپ نصب‌شده روی گوشی کاربر (که مثلاً `versionCode=1` دارد)، در همان تماس با `GET /api/apps/:appId/config` می‌بیند `latestVersionCode` بزرگ‌تر شده و یک پاپ‌آپ «نسخه‌ی جدید موجود است» نشان می‌دهد؛ با زدن «به‌روزرسانی»، مرورگر گوشی لینک دانلود APK جدید (`downloadUrl`، همان endpoint دانلود) را باز می‌کند و نصب‌کننده‌ی اندروید آن را روی نسخه‌ی قبلی آپدیت می‌کند (چون applicationId و کلید امضا یکسان است).

> **نکته‌ی امنیتی:** در این نسخه، endpointهای مدیریتی (`rebuild`, `PATCH url`) هیچ احراز هویتی ندارند — هر کسی که `appId` را بداند می‌تواند اپ را تغییر دهد. برای استفاده‌ی واقعی/عمومی، باید یک توکن مالکیت (مثلاً هدر `Authorization` که موقع ساخت اپ تولید و فقط به سازنده نشان داده می‌شود) به این مسیرها اضافه شود.

## ساختار پروژه

```
src/
  main.ts                        # bootstrap + serve public/ و generated/
  app.module.ts
  builder/
    builder.controller.ts        # POST /api/build , GET /api/build/:id/download   (PWA)
    builder.service.ts           # پردازش لوگو، آیکون‌های PWA، رندر تمپلیت‌ها، zip
    android-builder.controller.ts# POST /api/apps , .../rebuild , .../url , .../status , .../config , .../download , .../logo
    android-builder.service.ts   # کپی تمپلیت اندروید، آیکون‌ها، اجرای gradle assembleDebug، rebuild با version bump
    app-registry.service.ts      # پرسیست اطلاعات هر اپ (JSON + لوگوی اصلی) زیر app-registry/
    dto/
      build-app.dto.ts           # ساخت اولیه (PWA و Android)
      update-android-app.dto.ts  # rebuild (همه‌ی فیلدها اختیاری)
      patch-url.dto.ts           # تغییر سریع آدرس
    utils/
      logo-upload.config.ts
      android-icon.util.ts       # آیکون لانچر + نسخه‌ی دایره‌ای + کارت اسپلش
    templates/
      index.html.template        # اسپلش PWA
      manifest.webmanifest.template
      sw.js.template
      android-template/          # پروژه‌ی Gradle الگو (WebView Activity + remote config + پاپ‌آپ آپدیت)
public/
  index.html, app.js              # صفحه‌ی ساخت اپ (هر دو مسیر)
  manage.html, manage.js          # صفحه‌ی مدیریت یک اپ اندرویدی (تغییر آدرس / rebuild)
generated/                       # خروجی PWAها (در گیت نادیده گرفته می‌شود)
generated-apks/                  # آخرین APK هر appId (در گیت نادیده گرفته می‌شود)
android-builds/                  # پوشه‌ی کاری موقت بیلد اندروید (پاک‌سازی خودکار پس از هر بیلد)
app-registry/                    # اطلاعات دائمی هر اپ اندرویدی + لوگوی اصلی (در گیت نادیده گرفته می‌شود)
```
