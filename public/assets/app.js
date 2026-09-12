/* ==========================================================================
   SmartKids — منطق الواجهة (بدون اعتماديات)
   يشمل: التنقّل، الكشف عند التمرير، نموذج التواصل المرتبط بـ /api/contact،
          ولوحة الرسائل المرتبطة بـ /api/messages
   ========================================================================== */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    domains: ['مجال صحي', 'مجال تقني', 'منصة تعليمية', 'حلول أتمتة وبناء أنظمة', 'أخرى'],
    requestTypes: ['تشخيص سريع (Sensemaking)', 'حملة كاملة (Resonance Loop)', 'نظام متكامل (Integrated System)'],
    lastTicket: null,
  };

  /* ------------------------------- عام ------------------------------- */

  function setYear() {
    const el = $('#year');
    if (el) el.textContent = String(new Date().getFullYear());
  }

  function toast(message, kind = 'ok') {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.className = `toast toast--${kind} is-visible`;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('is-visible'), 3200);
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function arabicDate(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  function relativeTime(iso) {
    if (!iso) return 'لا يوجد';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    const units = [
      ['year', 31536000], ['month', 2592000], ['week', 604800],
      ['day', 86400], ['hour', 3600], ['minute', 60],
    ];
    try {
      const rtf = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
      for (const [unit, secs] of units) {
        if (diff >= secs) return rtf.format(-Math.round(diff / secs), unit);
      }
      return rtf.format(-Math.round(diff), 'second');
    } catch {
      return arabicDate(iso);
    }
  }

  function initNav() {
    $$('.nav__toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const links = document.getElementById(btn.getAttribute('aria-controls'));
        if (!links) return;
        const open = links.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', String(open));
      });
    });
    // إغلاق القائمة بعد النقر على رابط على الشاشات الصغيرة
    $$('.nav__links a').forEach((a) => a.addEventListener('click', () => {
      const links = a.closest('.nav__links');
      if (links) links.classList.remove('is-open');
    }));
  }

  function initReveal() {
    const items = $$('.reveal');
    if (!items.length) return;
    if (!('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i % 6, 5) * 60}ms`;
      io.observe(el);
    });
  }

  /* --------------------------- نموذج التواصل --------------------------- */

  const DRAFT_KEY = 'smartkids:draft';
  const LAST_TICKET_KEY = 'smartkids:lastTicket';
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function collectForm(form) {
    const fd = new FormData(form);
    const obj = {};
    fd.forEach((v, k) => { obj[k] = typeof v === 'string' ? v : v; });
    obj.consent = form.querySelector('#consent') ? form.querySelector('#consent').checked : false;
    return obj;
  }

  function validateClient(data) {
    const errors = {};
    if (!data.name || data.name.trim().length < 2) errors.name = 'الاسم مطلوب (حرفان على الأقل).';
    if (!EMAIL_RE.test((data.email || '').trim())) errors.email = 'صيغة البريد الإلكتروني غير صحيحة.';
    if ((data.silentPain || '').trim().length < 15) errors.silentPain = 'اشرح الفجوة/الألم الصامت في 15 حرفاً على الأقل.';
    if (!state.domains.includes(data.domain)) errors.domain = 'اختر المجال من القائمة.';
    if (data.phone && !/^[+\d\s()-]{6,}$/.test(data.phone.trim())) errors.phone = 'رقم الجوال غير صحيح.';
    if (!data.consent) errors.consent = 'يلزم الموافقة على التواصل.';
    return errors;
  }

  function showFieldErrors(form, errors) {
    $$('.field', form).forEach((field) => field.classList.remove('has-error'));
    Object.entries(errors).forEach(([key, msg]) => {
      const holder = form.querySelector(`[data-error-for="${key}"]`);
      if (holder) {
        holder.textContent = msg;
        holder.closest('.field').classList.add('has-error');
      }
    });
    const first = form.querySelector('.field.has-error');
    if (first) {
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const input = first.querySelector('input, select, textarea');
      if (input && input.type !== 'checkbox') input.focus({ preventScroll: true });
    }
  }

  function buildSummary(data) {
    const lines = [
      'طلب تواصل — SmartKids',
      '————————————',
      `المجال: ${data.domain || '—'}`,
      `نوع الطلب: ${data.requestType || '—'}`,
      `الاسم: ${data.name || '—'}`,
      `البريد: ${data.email || '—'}`,
      data.phone ? `الجوال: ${data.phone}` : null,
      data.budget ? `الميزانية: ${data.budget}` : null,
      '',
      `الضجيج الظاهر: ${data.surfaceNoise || '—'}`,
      `القلق غير المعلن (الفجوة): ${data.silentPain || '—'}`,
    ];
    return lines.filter((l) => l !== null).join('\n');
  }

  function updateSummary(form) {
    const data = collectForm(form);
    $$('[data-sum]').forEach((dd) => {
      const key = dd.getAttribute('data-sum');
      const value = (data[key] || '').toString().trim();
      dd.textContent = value ? (value.length > 90 ? `${value.slice(0, 90)}…` : value) : '—';
    });
  }

  function saveDraft(form) {
    try {
      const data = collectForm(form);
      delete data.website;
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    } catch { /* التخزين المحلي غير متاح */ }
  }

  function restoreDraft(form) {
    let draft = null;
    try {
      draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    } catch { draft = null; }
    if (!draft) return false;

    Object.entries(draft).forEach(([key, value]) => {
      const field = form.elements[key];
      if (!field) return;
      if (field.type === 'checkbox') field.checked = Boolean(value);
      else if (typeof value === 'string' && value) field.value = value;
    });
    return true;
  }

  function applyQueryPrefill(form, url) {
    const params = url.searchParams;
    const domain = params.get('domain');
    const type = params.get('type');
    const noise = params.get('noise');
    if (domain) {
      const opt = Array.from(form.domain.options).find((o) => o.value === domain);
      if (opt) form.domain.value = domain;
    }
    if (type && state.requestTypes.includes(type)) form.requestType.value = type;
    if (noise) form.surfaceNoise.value = noise;
  }

  function initContactForm() {
    const form = $('#contactForm');
    if (!form) return;

    const alertBox = $('#formAlert');
    const submitBtn = $('#submitBtn');
    const successCard = $('#successCard');

    const prefilled = applyQueryPrefill(form, new URL(window.location.href));
    if (!prefilled) restoreDraft(form);
    updateSummary(form);

    form.addEventListener('input', () => {
      updateSummary(form);
      saveDraft(form);
      const field = document.activeElement && document.activeElement.closest
        ? document.activeElement.closest('.field')
        : null;
      if (field) field.classList.remove('has-error');
    });
    form.addEventListener('change', () => { updateSummary(form); saveDraft(form); });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = collectForm(form);
      const errors = validateClient(data);

      if (Object.keys(errors).length) {
        showFieldErrors(form, errors);
        alertBox.hidden = false;
        alertBox.className = 'alert alert--err';
        alertBox.textContent = 'راجع الحقول المعلّمة بالأحمر ثم أعد الإرسال.';
        return;
      }

      alertBox.hidden = true;
      submitBtn.disabled = true;
      const original = submitBtn.textContent;
      submitBtn.textContent = 'جارٍ الإرسال…';

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const payload = await res.json().catch(() => ({}));

        if (!res.ok || !payload.ok) {
          if (payload.errors) showFieldErrors(form, payload.errors);
          alertBox.hidden = false;
          alertBox.className = 'alert alert--err';
          alertBox.textContent = payload.message || 'تعذّر إرسال الطلب. حاول مرة أخرى.';
          return;
        }

        state.lastTicket = payload.id;
        try {
          localStorage.setItem(LAST_TICKET_KEY, payload.id);
          localStorage.removeItem(DRAFT_KEY);
        } catch { /* تجاهل */ }

        $('#ticketId').textContent = payload.id;
        $('#successMeta').textContent = `سُجِّل بتاريخ ${arabicDate(payload.createdAt)} — رقم الطلب ${payload.total} في السجل.`;
        form.hidden = true;
        successCard.hidden = false;
        successCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast('تم تسجيل الطلب في الخادم ✓', 'ok');
      } catch (err) {
        alertBox.hidden = false;
        alertBox.className = 'alert alert--err';
        alertBox.textContent = 'تعذّر الوصول إلى خادم الموقع. تأكد من تشغيل الخادم ثم أعد المحاولة.';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = original;
      }
    });

    const waBtn = $('#whatsappBtn');
    if (waBtn) {
      waBtn.addEventListener('click', () => {
        const data = collectForm(form);
        const text = buildSummary(data);
        window.open(`https://wa.me/966500000000?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
        toast('فُتح واتساب بالملخّص — لا تنسَ الإرسال هنا أيضاً لتسجيل الطلب.', 'ok');
      });
    }

    const copyBtn = $('#copyBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const text = buildSummary(collectForm(form));
        try {
          await navigator.clipboard.writeText(text);
          toast('نُسخ الملخّص إلى الحافظة ✓', 'ok');
        } catch {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); toast('نُسخ الملخّص ✓', 'ok'); }
          catch { toast('تعذّر النسخ تلقائياً.', 'err'); }
          document.body.removeChild(ta);
        }
      });
    }

    const resetBtn = $('#resetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        $$('.field', form).forEach((f) => f.classList.remove('has-error'));
        alertBox.hidden = true;
        try { localStorage.removeItem(DRAFT_KEY); } catch { /* تجاهل */ }
        setTimeout(() => updateSummary(form), 0);
      });
    }

    const againBtn = $('#againBtn');
    if (againBtn) {
      againBtn.addEventListener('click', () => {
        form.reset();
        form.hidden = false;
        successCard.hidden = true;
        updateSummary(form);
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const name = form.querySelector('#name');
        if (name) name.focus({ preventScroll: true });
      });
    }
  }

  /* ---------------------------- لوحة الرسائل ---------------------------- */

  function messageCard(m) {
    const isLast = state.lastTicket && m.id === state.lastTicket;
    return `
      <article class="msg${isLast ? ' card--accent' : ''}">
        <div class="msg__head">
          <span class="msg__id">${escapeHtml(m.id)}</span>
          <span class="badge-status">${escapeHtml(m.status || 'جديدة')}</span>
          <strong>${escapeHtml(m.name)}</strong>
          <span class="msg__meta">${escapeHtml(m.domain || '—')} · ${escapeHtml(m.requestType || 'غير محدّد')}</span>
          <span class="msg__meta" style="margin-inline-start:auto">${escapeHtml(arabicDate(m.createdAt))} (${escapeHtml(relativeTime(m.createdAt))})</span>
        </div>
        <div class="msg__body">
          <div class="msg__block">
            <h4>الضجيج الظاهر</h4>
            <p>${escapeHtml(m.surfaceNoise || '—')}</p>
          </div>
          <div class="msg__block msg__block--deep">
            <h4>القلق غير المعلن (الفجوة)</h4>
            <p>${escapeHtml(m.silentPain || '—')}</p>
          </div>
          <div class="msg__block">
            <h4>بيانات الاتصال</h4>
            <p><a href="mailto:${escapeHtml(m.email)}">${escapeHtml(m.email)}</a>${m.phone ? ` · <span dir="ltr">${escapeHtml(m.phone)}</span>` : ''}${m.budget ? ` · ${escapeHtml(m.budget)}` : ''}</p>
          </div>
        </div>
      </article>`;
  }

  function renderMessages(payload) {
    const container = $('#messages');
    if (!container) return;

    $('#statTotal').textContent = String(payload.stats ? payload.stats.total : payload.count);
    $('#statShown').textContent = String(payload.count);

    const byDomain = (payload.stats && payload.stats.byDomain) || {};
    const top = Object.entries(byDomain).sort((a, b) => b[1] - a[1])[0];
    $('#statTopDomain').textContent = top ? top[0] : '—';
    $('#statLast').textContent = payload.stats && payload.stats.lastAt ? relativeTime(payload.stats.lastAt) : 'لا يوجد';
    $('#lastSync').textContent = `آخر مزامنة: ${new Date().toLocaleTimeString('ar')}`;

    if (!payload.count) {
      container.innerHTML = `
        <div class="empty">
          <h3>لا توجد طلبات مطابقة بعد</h3>
          <p class="muted">أرسل أول طلب من صفحة التواصل وسيظهر هنا لحظياً مع رقم تذكرة.</p>
          <a class="btn btn--primary" href="/contact.html">افتح صفحة التواصل ←</a>
        </div>`;
      return;
    }

    container.innerHTML = payload.messages.map(messageCard).join('');
  }

  async function loadMessages() {
    const container = $('#messages');
    if (!container) return;

    const q = ($('#search') || {}).value || '';
    const domain = ($('#domainFilter') || {}).value || '';
    container.setAttribute('aria-busy', 'true');

    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q.trim());
      if (domain) params.set('domain', domain);
      const res = await fetch(`/api/messages?${params.toString()}`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('فشل التحميل');
      const payload = await res.json();
      renderMessages(payload);
    } catch (err) {
      container.innerHTML = `
        <div class="empty">
          <h3>تعذّر الوصول إلى سجل الرسائل</h3>
          <p class="muted">تأكد من تشغيل خادم الموقع (<code>node server.js</code>).</p>
          <button class="btn" type="button" onclick="location.reload()">إعادة المحاولة</button>
        </div>`;
    } finally {
      container.removeAttribute('aria-busy');
    }
  }

  function initInbox() {
    if (!$('#messages')) return;
    try {
      state.lastTicket = localStorage.getItem(LAST_TICKET_KEY);
    } catch { state.lastTicket = null; }

    const search = $('#search');
    let debounce;
    if (search) {
      search.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(loadMessages, 260);
      });
    }
    const domainFilter = $('#domainFilter');
    if (domainFilter) domainFilter.addEventListener('change', loadMessages);

    const refreshBtn = $('#refreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => { loadMessages(); toast('تم التحديث ↻', 'ok'); });

    loadMessages();
    setInterval(loadMessages, 20000); // مزامنة تلقائية كل 20 ثانية
  }

  /* ------------------------------- التشغيل ------------------------------- */

  document.addEventListener('DOMContentLoaded', () => {
    setYear();
    initNav();
    initReveal();
    initContactForm();
    initInbox();
  });
})();
