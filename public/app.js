(function () {
  const form = document.getElementById('build-form');
  const logoInput = document.getElementById('logo-input');
  const dropzone = document.getElementById('dropzone');
  const logoPreview = document.getElementById('logo-preview');
  const dropzonePlaceholder = document.getElementById('dropzone-placeholder');
  const submitBtn = document.getElementById('submit-btn');
  const btnLabel = document.getElementById('btn-label');
  const errorMsg = document.getElementById('error-msg');
  const platformRadios = document.querySelectorAll('input[name="platform"]');
  const platformHint = document.getElementById('platform-hint');
  const buildProgressHint = document.getElementById('build-progress-hint');

  const resultPlaceholder = document.getElementById('result-placeholder');
  const resultBody = document.getElementById('result-body');
  const resultIcon = document.getElementById('result-icon');
  const resultName = document.getElementById('result-name');
  const resultHint = document.getElementById('result-hint');
  const previewLink = document.getElementById('preview-link');
  const downloadLink = document.getElementById('download-link');
  const linkBox = document.getElementById('link-box');
  const previewUrlText = document.getElementById('preview-url-text');
  const copyBtn = document.getElementById('copy-btn');

  const PLATFORM_HINTS = {
    pwa: 'برای آیفون؛ یک وب‌اپ نصب‌شدنی سبک، بدون نیاز به ساخت.',
    android: 'برای اندروید؛ یک فایل APK واقعی با Gradle ساخته و کامپایل می‌شه.',
  };

  function currentPlatform() {
    return document.querySelector('input[name="platform"]:checked').value;
  }

  platformRadios.forEach((radio) =>
    radio.addEventListener('change', () => {
      platformHint.textContent = PLATFORM_HINTS[currentPlatform()];
    }),
  );

  function showLogoPreview(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      logoPreview.src = e.target.result;
      logoPreview.classList.remove('hidden');
      dropzonePlaceholder.classList.add('hidden');
    };
    reader.readAsDataURL(file);
  }

  logoInput.addEventListener('change', function () {
    if (logoInput.files && logoInput.files[0]) {
      showLogoPreview(logoInput.files[0]);
    }
  });

  ['dragover', 'dragenter'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    }),
  );

  ['dragleave', 'drop'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
    }),
  );

  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) {
      logoInput.files = e.dataTransfer.files;
      showLogoPreview(file);
    }
  });

  function setLoading(isLoading, label) {
    submitBtn.disabled = isLoading;
    btnLabel.textContent = isLoading ? label || 'در حال ساخت اپ…' : '🚀 ساخت اپ';
    buildProgressHint.classList.toggle('hidden', !isLoading || currentPlatform() !== 'android');
  }

  function showError(message) {
    errorMsg.textContent = message;
    errorMsg.classList.remove('hidden');
  }

  function hideError() {
    errorMsg.classList.add('hidden');
  }

  function showResultPwa(data) {
    const fullPreviewUrl = window.location.origin + data.previewUrl;
    resultIcon.src = data.previewUrl.replace('index.html', 'icons/icon-512.png');
    resultName.textContent = data.appName;
    resultHint.textContent = 'اپ آماده‌ست! برای نصب روی گوشی، لینک زیر رو در گوشی باز کن و «Add to Home Screen» رو بزن.';
    previewLink.href = data.previewUrl;
    previewLink.textContent = 'باز کردن اپ';
    previewLink.classList.remove('hidden');
    downloadLink.href = data.downloadUrl;
    downloadLink.textContent = 'دانلود فایل‌های اپ (zip)';
    previewUrlText.value = fullPreviewUrl;
    linkBox.classList.remove('hidden');

    resultPlaceholder.classList.add('hidden');
    resultBody.classList.remove('hidden');
  }

  function showResultAndroid(data) {
    resultIcon.src = logoPreview.src || '';
    resultName.textContent = data.appName;
    resultHint.textContent = 'فایل APK ساخته شد! دانلودش کن، منتقلش کن به گوشی اندرویدی، و نصبش کن (ممکنه لازم باشه گزینه‌ی «نصب از منابع ناشناس» رو فعال کنی).';
    previewLink.href = `/manage.html?id=${data.appId}`;
    previewLink.textContent = 'مدیریت این اپ (تغییر بعدی آیکون/آدرس/اسم)';
    previewLink.classList.remove('hidden');
    downloadLink.href = data.downloadUrl;
    downloadLink.textContent = 'دانلود APK';
    previewUrlText.value = window.location.origin + `/manage.html?id=${data.appId}`;
    linkBox.classList.remove('hidden');

    resultPlaceholder.classList.add('hidden');
    resultBody.classList.remove('hidden');
  }

  async function pollAndroidStatus(appId) {
    for (;;) {
      const res = await fetch(`/api/apps/${appId}/status`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'ساخت اپ با خطا مواجه شد');

      if (data.status === 'done') return { ...data, appId };
      if (data.status === 'error') throw new Error(data.error || 'ساخت APK با خطا مواجه شد');

      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    hideError();

    if (!logoInput.files || !logoInput.files[0]) {
      showError('لطفاً یک لوگو انتخاب کن');
      return;
    }

    const platform = currentPlatform();
    const formData = new FormData(form);
    setLoading(true, platform === 'android' ? 'در حال ساخت APK…' : 'در حال ساخت اپ…');

    try {
      if (platform === 'pwa') {
        const res = await fetch('/api/build', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'ساخت اپ با خطا مواجه شد');
        showResultPwa(data);
      } else {
        const res = await fetch('/api/apps', { method: 'POST', body: formData });
        const started = await res.json();
        if (!res.ok) throw new Error(started.message || 'ساخت اپ با خطا مواجه شد');

        const done = await pollAndroidStatus(started.appId);
        showResultAndroid(done);
      }
    } catch (err) {
      showError(err.message || 'خطای غیرمنتظره، دوباره تلاش کن');
    } finally {
      setLoading(false);
    }
  });

  copyBtn.addEventListener('click', async function () {
    try {
      await navigator.clipboard.writeText(previewUrlText.value);
      copyBtn.textContent = 'کپی شد!';
      setTimeout(() => (copyBtn.textContent = 'کپی لینک'), 1500);
    } catch {
      previewUrlText.select();
      document.execCommand('copy');
    }
  });
})();
