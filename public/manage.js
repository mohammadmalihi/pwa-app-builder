(function () {
  const appId = new URLSearchParams(window.location.search).get('id');

  const appTitle = document.getElementById('app-title');
  const currentIcon = document.getElementById('current-icon');
  const currentName = document.getElementById('current-name');
  const currentMeta = document.getElementById('current-meta');

  const quickUrlInput = document.getElementById('quick-url-input');
  const quickUrlBtn = document.getElementById('quick-url-btn');
  const quickUrlMsg = document.getElementById('quick-url-msg');

  const rebuildForm = document.getElementById('rebuild-form');
  const logoInput = document.getElementById('logo-input');
  const dropzone = document.getElementById('dropzone');
  const logoPreview = document.getElementById('logo-preview');
  const dropzonePlaceholder = document.getElementById('dropzone-placeholder');
  const nameInput = document.getElementById('name-input');
  const themeColorInput = document.getElementById('theme-color');
  const bgColorInput = document.getElementById('bg-color');
  const rebuildBtn = document.getElementById('rebuild-btn');
  const rebuildBtnLabel = document.getElementById('rebuild-btn-label');
  const rebuildProgressHint = document.getElementById('rebuild-progress-hint');
  const rebuildError = document.getElementById('rebuild-error');
  const rebuildResult = document.getElementById('rebuild-result');
  const rebuildDownloadLink = document.getElementById('rebuild-download-link');

  if (!appId) {
    appTitle.textContent = 'شناسه‌ی اپ پیدا نشد';
    currentMeta.textContent = 'برای مدیریت یک اپ، از لینکی که بعد از ساختش گرفتی استفاده کن.';
    document.querySelectorAll('.form-card, #current-info-card').forEach((el) => (el.style.display = 'none'));
    return;
  }

  async function loadCurrentInfo() {
    const res = await fetch(`/api/apps/${appId}/status`);
    const data = await res.json();
    if (!res.ok || !data.appName) {
      currentMeta.textContent = 'اپی با این شناسه پیدا نشد.';
      return;
    }

    appTitle.textContent = `مدیریت «${data.appName}»`;
    currentName.textContent = data.appName;
    currentMeta.textContent = `نسخه‌ی فعلی: ${data.versionCode ?? '—'} | آدرس فعلی: ${data.targetUrl ?? '—'}`;
    currentIcon.src = `/api/apps/${appId}/logo`;
    quickUrlInput.placeholder = data.targetUrl || 'example.com';
    nameInput.placeholder = data.appName || '';
  }

  loadCurrentInfo();

  quickUrlBtn.addEventListener('click', async function () {
    quickUrlMsg.classList.add('hidden');
    const targetUrl = quickUrlInput.value.trim();
    if (!targetUrl) {
      quickUrlMsg.textContent = 'یک آدرس وارد کن';
      quickUrlMsg.classList.remove('hidden');
      return;
    }

    quickUrlBtn.disabled = true;
    quickUrlBtn.textContent = 'در حال ذخیره…';
    try {
      const res = await fetch(`/api/apps/${appId}/url`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'ذخیره با خطا مواجه شد');
      quickUrlMsg.classList.remove('error-msg');
      quickUrlMsg.classList.add('platform-hint');
      quickUrlMsg.textContent = 'ذخیره شد! از دفعه‌ی بعد که کاربر اپ رو باز کنه اعمال می‌شه.';
      quickUrlMsg.classList.remove('hidden');
      loadCurrentInfo();
    } catch (err) {
      quickUrlMsg.classList.add('error-msg');
      quickUrlMsg.textContent = err.message;
      quickUrlMsg.classList.remove('hidden');
    } finally {
      quickUrlBtn.disabled = false;
      quickUrlBtn.textContent = '💾 ذخیره‌ی فوری آدرس';
    }
  });

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
    if (logoInput.files && logoInput.files[0]) showLogoPreview(logoInput.files[0]);
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

  async function pollStatus() {
    for (;;) {
      const res = await fetch(`/api/apps/${appId}/status`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'ساخت با خطا مواجه شد');
      if (data.status === 'done') return data;
      if (data.status === 'error') throw new Error(data.error || 'ساخت APK با خطا مواجه شد');
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }

  rebuildForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    rebuildError.classList.add('hidden');
    rebuildResult.classList.add('hidden');

    rebuildBtn.disabled = true;
    rebuildBtnLabel.textContent = 'در حال ساخت نسخه‌ی جدید…';
    rebuildProgressHint.classList.remove('hidden');

    try {
      const formData = new FormData(rebuildForm);
      // Strip empty optional fields so unspecified values keep the stored ones.
      for (const key of ['appName', 'themeColor', 'backgroundColor']) {
        if (!formData.get(key)) formData.delete(key);
      }
      if (!logoInput.files || !logoInput.files[0]) formData.delete('logo');

      const res = await fetch(`/api/apps/${appId}/rebuild`, { method: 'POST', body: formData });
      const started = await res.json();
      if (!res.ok) throw new Error(started.message || 'ساخت با خطا مواجه شد');

      const done = await pollStatus();
      rebuildDownloadLink.href = done.downloadUrl;
      rebuildResult.classList.remove('hidden');
      loadCurrentInfo();
    } catch (err) {
      rebuildError.textContent = err.message || 'خطای غیرمنتظره، دوباره تلاش کن';
      rebuildError.classList.remove('hidden');
    } finally {
      rebuildBtn.disabled = false;
      rebuildBtnLabel.textContent = '🚀 ساخت نسخه‌ی جدید';
      rebuildProgressHint.classList.add('hidden');
    }
  });
})();
