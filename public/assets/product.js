/* ==========================================================================
   لمسة — منطق صفحة المنتج: عرض البيانات من الكتالوج، معرض، خيارات التوصيل،
   تقسيط، سلة محفوظة محلياً، تقييمات، منتجات مقترحة، وإتمام الطلب عبر /api/orders
   ========================================================================== */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const CART_KEY = 'lamsa:cart';
  const FAV_KEY = 'lamsa:favorites';
  const REVIEWS_KEY = 'lamsa:reviews';
  const WA_NUMBER = '966500000000';

  /* --------------------------- بيانات بديلة (بلا خادم) --------------------------- */
  // تُستخدم فقط إن تعذّر الوصول إلى /api/catalog (مثلاً بفتح الملف مباشرة).
  const FALLBACK = {
    currency: 'ر.س',
    vatIncluded: true,
    deliveryOptions: [
      { id: 'express', label: 'توصيل سريع (24 – 48 ساعة)', note: 'مجاني للطلبات فوق 200 ر.س', fee: 25, freeAbove: 200 },
      { id: 'pickup', label: 'استلام من العيادة (مجاناً)', note: 'خلال 24 ساعة', fee: 0 },
      { id: 'sameday', label: 'توصيل في نفس اليوم', note: 'نطاق محدّد داخل المدينة', fee: 35 },
    ],
    products: [{
      id: 'pelvic-floor-fitness', sku: 'LSM-BK-0001', type: 'book', featured: true,
      title: 'Fitness for the Pelvic Floor', subtitle: 'الطبعة الثانية — وصفات تدريب وتأهيل لقاع الحوض',
      edition: '2nd Edition', author: 'Beate Carrière', publisher: 'Thieme', year: 2024, pages: 130,
      binding: 'غلاف ورقي', language: 'الإنجليزية', isbn: '9783132423985', category: 'كتب طبية · تأهيل',
      price: 269, compareAt: 320, unit: 'Each', stock: 'متوفر — يُشحن خلال 24 ساعة',
      rating: 4.8, reviewsCount: 23, badge: 'الأكثر طلباً في التأهيل',
      color: ['#2ee6c5', '#4fb8ff'], initials: 'PF',
      highlights: ['تمارين موجّهة لحالات ضعف قاع الحوض', 'بروتوكولات تدريب بأساس تشريحي', 'فصول للتنفّس والوضعية'],
      description: ['مرجع عملي موجّه للمعالجين الطبيعيين والمهتمّين بصحة الحوض، يشرح كيف تُبنى القوة والتحكّم بتمارين متدرّجة.'],
      specs: [['الناشر', 'Thieme'], ['المؤلف', 'Beate Carrière'], ['تاريخ النشر', '2024']],
    }],
  };

  const state = {
    catalog: null,
    product: null,
    qty: 1,
    delivery: null,
    cart: [],
    favorites: [],
    reviews: [],
    zoomed: false,
  };

  /* --------------------------------- أدوات --------------------------------- */

  const escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const money = (value, currency) => {
    const n = Math.round((Number(value) || 0) * 100) / 100;
    const text = Number.isInteger(n) ? String(n) : n.toFixed(2);
    return `${text} ${currency || (state.catalog ? state.catalog.currency : 'ر.س')}`;
  };

  const readStore = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  };
  const writeStore = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* التخزين غير متاح */ }
  };

  function toast(message, kind = 'ok') {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.className = `toast toast--${kind} is-visible`;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('is-visible'), 3200);
  }

  function stars(rating) {
    const full = Math.round(Number(rating) || 0);
    return '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full);
  }

  function installments(price) {
    const months = 12;
    const monthly = Math.ceil(((Number(price) || 0) / months) * 100) / 100;
    return `${monthly} ${(state.catalog || FALLBACK).currency}/شهر × ${months} شهر (تقسيط بدون فوائد)`;
  }

  /* ------------------------------ عرض المنتج ------------------------------ */

  function coverStyle(product, big) {
    const [a, b] = product.color || ['#2ee6c5', '#7c6cff'];
    return `background:linear-gradient(140deg, ${a}, ${b});` + (big ? '' : 'font-size:13px;');
  }

  function renderGallery(product) {
    const main = $('#coverMain');
    main.style.cssText = coverStyle(product, true);
    main.textContent = product.initials || product.title.slice(0, 2);
    main.dataset.sku = product.sku;

    const badge = $('#productBadge');
    if (product.badge) { badge.hidden = false; badge.textContent = product.badge; } else { badge.hidden = true; }

    const thumbs = $('#galleryThumbs');
    if (!thumbs) return;
    const views = [
      { label: product.initials || 'غلاف', angle: 140, text: product.initials || product.title.slice(0, 2) },
      { label: 'خلف', angle: 40, text: '⬑' },
      { label: 'داخل', angle: 250, text: '≡' },
    ];
    thumbs.innerHTML = views.map((v, i) => `
      <button class="thumb ${i === 0 ? 'is-active' : ''}" type="button" role="tab" aria-selected="${i === 0}"
        data-angle="${v.angle}" data-text="${escapeHtml(v.text)}" title="${escapeHtml(v.label)}"
        style="background:linear-gradient(${v.angle}deg, ${(product.color || ['#2ee6c5', '#7c6cff'])[0]}, ${(product.color || ['#2ee6c5', '#7c6cff'])[1]});">
        <span>${escapeHtml(v.text)}</span>
      </button>`).join('');

    thumbs.addEventListener('click', (event) => {
      const btn = event.target.closest('.thumb');
      if (!btn) return;
      $$('.thumb', thumbs).forEach((t) => { t.classList.remove('is-active'); t.setAttribute('aria-selected', 'false'); });
      btn.classList.add('is-active');
      btn.setAttribute('aria-selected', 'true');
      const [a, b] = product.color || ['#2ee6c5', '#7c6cff'];
      main.style.cssText = `background:linear-gradient(${btn.dataset.angle}deg, ${a}, ${b});`;
      main.textContent = btn.dataset.text;
    });
  }

  function renderInfo(product) {
    const cur = (state.catalog || FALLBACK).currency;
    $('#crumbCategory').textContent = product.category || 'منتجات';
    $('#crumbTitle').textContent = product.title;
    $('#productPublisher').textContent = product.publisher || 'لمسة';
    $('#productSku').textContent = product.sku;
    $('#productIsbn').textContent = product.isbn || '—';
    $('#productTitle').textContent = product.title;
    $('#productSubtitle').textContent = [product.subtitle, product.edition, product.author ? `المؤلف: ${product.author}` : null]
      .filter(Boolean).join(' · ');
    $('#ratingStars').textContent = stars(product.rating);
    $('#ratingValue').textContent = (Number(product.rating) || 0).toFixed(1);
    $('#ratingCount').textContent = `${product.reviewsCount || 0} تقييماً — اقرأ واكتب`;
    $('#productStock').textContent = product.stock || 'متوفر';
    $('#productPrice').textContent = money(product.price, cur);
    $('#productUnit').textContent = product.unit || 'قطعة';

    const compare = $('#productCompare');
    if (product.compareAt && product.compareAt > product.price) {
      const off = Math.round((1 - product.price / product.compareAt) * 100);
      compare.hidden = false;
      compare.innerHTML = `<s>${money(product.compareAt, cur)}</s> <span class="pill">وفّر ${off}%</span>`;
    } else { compare.hidden = true; }

    $('#productInstallment').textContent = installments(product.price);

    $('#productHighlights').innerHTML = (product.highlights || [])
      .map((h) => `<li>${escapeHtml(h)}</li>`).join('');

    $('#productDescription').innerHTML = (product.description || [])
      .map((p) => `<p class="muted">${escapeHtml(p)}</p>`).join('');

    const audience = [
      `معالجون طبيعيون ومختصو تأهيل يعملون على ${product.category || 'الحالات الوظيفية'}.`,
      'مرضى داخل برنامج منزلي يحتاجون مرجعاً واضحاً بين الزيارات.',
      'أسرة تتابع حالة أحد أفرادها وتريد فهم الخطوات بلغة مفهومة.',
    ];
    $('#productAudience').innerHTML = audience.map((a) => `<li>${escapeHtml(a)}</li>`).join('');

    $('#specsBody').innerHTML = (product.specs || []).map(([k, v]) => `
      <tr><th scope="row" style="text-align:start; padding:14px 16px; color:var(--muted); font-weight:600; width:34%">${escapeHtml(k)}</th>
      <td data-label="${escapeHtml(k)}">${escapeHtml(v)}</td></tr>`).join('');

    const formats = [
      { id: 'paper', label: 'كتاب مطبوع', active: product.type === 'book' },
      { id: 'digital', label: 'نسخة رقمية', active: product.type === 'digital' },
      { id: 'bundle', label: 'الكتاب + دليل التمارين', active: false },
    ];
    $('#formatOptions').innerHTML = formats.map((f) => `
      <label class="chip">
        <input type="radio" name="format" value="${f.id}" ${f.active ? 'checked' : ''}>
        <span>${escapeHtml(f.label)}</span>
      </label>`).join('');
    $$('#formatOptions input').forEach((input) => input.addEventListener('change', () => {
      toast(input.value === 'digital' ? 'النسخة الرقمية تُسلَّم فوراً بعد تأكيد الطلب.' : 'اخترت التنسيق: ' + input.parentNode.textContent.trim(), 'ok');
    }));
  }

  function renderDelivery() {
    const options = (state.catalog || FALLBACK).deliveryOptions;
    const cur = (state.catalog || FALLBACK).currency;
    const subtotal = (Number(state.product.price) || 0) * state.qty;

    $('#deliveryList').innerHTML = options.map((opt, i) => {
      const free = typeof opt.freeAbove === 'number' && subtotal >= opt.freeAbove;
      const fee = free ? 0 : opt.fee;
      const checked = state.delivery ? state.delivery === opt.id : i === 0;
      if (checked) state.delivery = opt.id;
      return `
        <label class="delivery ${checked ? 'is-selected' : ''}">
          <input type="radio" name="delivery" value="${opt.id}" ${checked ? 'checked' : ''}>
          <span class="delivery__text">
            <strong>${escapeHtml(opt.label)}</strong>
            <em class="tiny muted">${escapeHtml(opt.note || '')}</em>
          </span>
          <span class="delivery__fee">${fee === 0 ? 'مجاناً' : money(fee, cur)}</span>
        </label>`;
    }).join('');

    $$('#deliveryList input').forEach((input) => input.addEventListener('change', () => {
      state.delivery = input.value;
      $$('.delivery', $('#deliveryList')).forEach((el) => el.classList.toggle('is-selected', $('input', el).checked));
      renderCart();
    }));

    $('#shippingOptions').innerHTML = options.map((o) => `<li>${escapeHtml(o.label)} — ${escapeHtml(o.note || '')}</li>`).join('');
  }

  function renderRails() {
    const products = (state.catalog || FALLBACK).products;
    const cur = (state.catalog || FALLBACK).currency;
    const card = (p) => `
      <article class="pcard">
        <div class="pcard__cover" style="${coverStyle(p)}">${escapeHtml(p.initials || '')}</div>
        <div class="pcard__body">
          <h4>${escapeHtml(p.title)}</h4>
          <p class="tiny muted">${escapeHtml(p.subtitle || p.category || '')}</p>
          <div class="pcard__foot">
            <span class="pcard__price">${money(p.price, cur)}</span>
            <span class="tiny muted">${stars(p.rating)} ${(Number(p.rating) || 0).toFixed(1)}</span>
          </div>
          <button class="btn btn--sm btn--primary" type="button" data-add="${escapeHtml(p.sku)}">أضف</button>
        </div>
      </article>`;

    $('#relatedRail').innerHTML = products.filter((p) => p.sku !== state.product.sku).map(card).join('');
    $('#categoryRail').innerHTML = products.slice().reverse().map(card).join('');
    $$('.rail [data-add]').forEach((btn) => btn.addEventListener('click', () => {
      addToCart(btn.dataset.add, 1);
    }));
  }

  function renderAvailability() {
    const btn = $('#availabilityBtn');
    const city = $('#availabilityCity');
    btn.addEventListener('click', () => {
      const value = (city.value || '').trim();
      const out = $('#availabilityResult');
      if (value.length < 2) {
        out.textContent = 'اكتب اسم المدينة أو رقم الحي للتحقق.';
        out.className = 'tiny';
        return;
      }
      const match = /الدمام|الخبر|الظهران|الرياض|جدة|مكة|المدينة|dammam|riyadh|jeddah/i.test(value);
      out.textContent = match
        ? `متوفر في «${value}» — توصيل سريع خلال 24 – 48 ساعة، مع إمكانية الاستلام من العيادة.`
        : `«${value}»: نغطّيها حالياً بالتوصيل (2 – 5 أيام عمل) أو بالاستلام من العيادة.`;
      out.className = 'tiny badge-soft badge-soft--mint';
    });
  }

  /* --------------------------------- السلة --------------------------------- */

  function shippingFor(subtotal) {
    const options = (state.catalog || FALLBACK).deliveryOptions;
    const opt = options.find((o) => o.id === state.delivery) || options[0] || { fee: 0 };
    if (typeof opt.freeAbove === 'number' && subtotal >= opt.freeAbove) return { fee: 0, label: opt.label, free: true };
    return { fee: Number(opt.fee) || 0, label: opt.label, free: false };
  }

  function cartTotals() {
    const subtotal = state.cart.reduce((sum, line) => sum + line.price * line.qty, 0);
    const ship = shippingFor(subtotal);
    return { subtotal, shipping: ship.fee, total: subtotal + ship.fee, shippingLabel: ship.label };
  }

  function addToCart(sku, qty) {
    const products = (state.catalog || FALLBACK).products;
    const product = products.find((p) => p.sku === sku);
    if (!product) { toast('المنتج غير موجود في الكتالوج.', 'err'); return; }

    const existing = state.cart.find((l) => l.sku === sku);
    if (existing) existing.qty = Math.min(50, existing.qty + qty);
    else state.cart.push({ sku, title: product.title, price: Number(product.price) || 0, qty });

    writeStore(CART_KEY, state.cart);
    renderCart();
    toast(`أُضيف إلى السلة: ${product.title}`, 'ok');
  }

  function setQty(sku, qty) {
    const line = state.cart.find((l) => l.sku === sku);
    if (!line) return;
    line.qty = Math.max(0, Math.min(50, qty));
    if (line.qty === 0) state.cart = state.cart.filter((l) => l.sku !== sku);
    writeStore(CART_KEY, state.cart);
    renderCart();
  }

  function renderCart() {
    const open = $('#cartOpenBtn');
    const count = state.cart.reduce((sum, l) => sum + l.qty, 0);
    const badge = $('#navCartCount');
    if (badge) { badge.hidden = count === 0; badge.textContent = String(count); }
    if (open) open.setAttribute('aria-label', `عرض السلة (${count})`);
    const itemsCount = $('#cartItemsCount');
    if (itemsCount) itemsCount.textContent = String(count);

    const body = $('#cartBody');
    const foot = $('#cartFoot');
    if (!body) return;

    if (!state.cart.length) {
      body.innerHTML = `
        <div class="empty" style="padding:34px 12px">
          <h4>السلة فارغة</h4>
          <p class="tiny muted">أضف منتجاً لعرض التوصيل والإجمالي هنا.</p>
        </div>`;
      if (foot) foot.hidden = true;
      renderDelivery();
      renderCheckoutSummary();
      return;
    }

    body.innerHTML = state.cart.map((line) => {
      const product = (state.catalog || FALLBACK).products.find((p) => p.sku === line.sku) || {};
      return `
        <div class="cart-line">
          <div class="cart-line__cover" style="${coverStyle(product)}">${escapeHtml(product.initials || '')}</div>
          <div class="cart-line__info">
            <strong>${escapeHtml(line.title)}</strong>
            <span class="tiny muted">${money(line.price)} × ${line.qty} = ${money(line.price * line.qty)}</span>
            <div class="qty qty--sm" role="group" aria-label="كمية ${escapeHtml(line.title)}">
              <button type="button" class="qty__btn" data-dec="${escapeHtml(line.sku)}" aria-label="تقليل">−</button>
              <input type="number" value="${line.qty}" min="1" max="50" data-qty="${escapeHtml(line.sku)}" aria-label="الكمية">
              <button type="button" class="qty__btn" data-inc="${escapeHtml(line.sku)}" aria-label="زيادة">+</button>
            </div>
          </div>
          <button class="btn btn--sm btn--ghost" type="button" data-remove="${escapeHtml(line.sku)}" aria-label="إزالة">✕</button>
        </div>`;
    }).join('');

    const totals = cartTotals();
    $('#cartTotals').innerHTML = `
      <div class="totals__row"><span>المجموع الفرعي</span><strong>${money(totals.subtotal)}</strong></div>
      <div class="totals__row"><span>التوصيل — ${escapeHtml(totals.shippingLabel || '')}</span><strong>${totals.shipping === 0 ? 'مجاناً' : money(totals.shipping)}</strong></div>
      <div class="totals__row totals__row--total"><span>الإجمالي (شامل الضريبة)</span><strong>${money(totals.total)}</strong></div>`;
    if (foot) foot.hidden = false;

    $$('[data-inc]', body).forEach((b) => b.addEventListener('click', () => setQty(b.dataset.inc, (state.cart.find((l) => l.sku === b.dataset.inc).qty) + 1)));
    $$('[data-dec]', body).forEach((b) => b.addEventListener('click', () => setQty(b.dataset.dec, (state.cart.find((l) => l.sku === b.dataset.dec).qty) - 1)));
    $$('[data-remove]', body).forEach((b) => b.addEventListener('click', () => { setQty(b.dataset.remove, 0); toast('أُزيل من السلة.', 'ok'); }));
    $$('[data-qty]', body).forEach((input) => input.addEventListener('change', () => setQty(input.dataset.qty, Number(input.value))));

    renderDelivery();
    renderCheckoutSummary();
  }

  function renderCheckoutSummary() {
    const box = $('#checkoutSummary');
    if (!box) return;
    if (!state.cart.length) { box.innerHTML = '<p class="tiny muted" style="margin:0">السلة فارغة — أضف منتجاً أولاً.</p>'; return; }
    const totals = cartTotals();
    box.innerHTML = `
      <dl>
        <dt>عدد الأصناف</dt><dd>${state.cart.length} (${state.cart.reduce((s, l) => s + l.qty, 0)} وحدة)</dd>
        <dt>التوصيل</dt><dd>${escapeHtml(totals.shippingLabel || '—')}</dd>
        <dt>الإجمالي</dt><dd><strong>${money(totals.total)}</strong></dd>
      </dl>
      <ul class="checklist tiny" style="margin:10px 0 0">${state.cart.map((l) => `<li>${escapeHtml(l.title)} × ${l.qty}</li>`).join('')}</ul>`;
  }

  /* ------------------------------ فتح/إغلاق ------------------------------ */

  function openCart(open) {
    const drawer = $('#cartDrawer');
    const overlay = $('#cartOverlay');
    if (!drawer || !overlay) return;
    drawer.classList.toggle('is-open', open);
    drawer.setAttribute('aria-hidden', String(!open));
    overlay.hidden = !open;
    document.body.classList.toggle('no-scroll', open);
    if (open) { renderCart(); const first = $('button', drawer); if (first) first.focus(); }
  }

  /* ------------------------------ التقييمات ------------------------------ */

  const SEED_REVIEWS = [
    { id: 'r1', name: 'أ. م.', rating: 5, text: 'الشرح المتدرّج مفيد جداً في المتابعة المنزلية، خصوصاً فصول التنفّس والوضعية.', at: '2026-01-12' },
    { id: 'r2', name: 'معالج طبيعي', rating: 5, text: 'بروتوكولات واضحة يمكن تحويلها لبرنامج مريض بسهولة. أوصي به لمن يعمل في تأهيل الحوض.', at: '2026-02-03' },
    { id: 'r3', name: 'س. ع.', rating: 4, text: 'ممتاز كمرجع، لكن يحتاج قارئاً بمعرفة أساسية بالإنجليزية الطبية.', at: '2026-02-21' },
    { id: 'r4', name: 'ن. ح.', rating: 4, text: 'وصل بسرعة وحالته ممتازة. أفادني في فهم خطوات البرنامج.', at: '2026-03-08' },
  ];

  function allReviews() {
    return [...SEED_REVIEWS, ...state.reviews];
  }

  function renderReviews() {
    const list = allReviews();
    const avg = list.reduce((s, r) => s + Number(r.rating), 0) / (list.length || 1);
    $('#reviewsAvg').textContent = avg.toFixed(1);
    $('#reviewsStars').textContent = stars(avg);
    $('#reviewsCountLabel').textContent = `${list.length} تقييماً · متوسط ${avg.toFixed(1)} من 5`;

    const dist = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: list.filter((r) => Number(r.rating) === star).length,
    }));
    $('#reviewsBars').innerHTML = dist.map((d) => `
      <div class="bar">
        <span class="tiny">${d.star} ★</span>
        <span class="bar__track"><span class="bar__fill" style="width:${list.length ? (d.count / list.length) * 100 : 0}%"></span></span>
        <span class="tiny muted">${d.count}</span>
      </div>`).join('');

    $('#reviewsList').innerHTML = list.slice().reverse().map((r) => `
      <article class="review">
        <div class="review__head">
          <strong>${escapeHtml(r.name || 'زائر')}</strong>
          <span class="stars" aria-label="${r.rating} من 5">${stars(r.rating)}</span>
          <span class="tiny muted" style="margin-inline-start:auto">${escapeHtml(r.at || '')}</span>
        </div>
        <p class="muted" style="margin:0">${escapeHtml(r.text)}</p>
      </article>`).join('');
  }

  function initReviews() {
    $('#writeReviewBtn').addEventListener('click', () => {
      const form = $('#reviewForm');
      form.hidden = !form.hidden;
      if (!form.hidden) $('#reviewName').focus();
    });
    $('#cancelReview').addEventListener('click', () => { $('#reviewForm').hidden = true; });

    $('#reviewForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const text = ($('#reviewText').value || '').trim();
      const errorBox = $('[data-error-for="reviewText"]');
      if (text.length < 10) {
        if (errorBox) { errorBox.textContent = 'اكتب رأياً في 10 أحرف على الأقل.'; errorBox.style.display = 'block'; }
        return;
      }
      if (errorBox) errorBox.style.display = 'none';

      state.reviews.push({
        id: `local-${Date.now()}`,
        name: ($('#reviewName').value || 'زائر').trim() || 'زائر',
        rating: Number($('#reviewRating').value) || 5,
        text,
        at: new Date().toISOString().slice(0, 10),
      });
      writeStore(REVIEWS_KEY, state.reviews);
      $('#reviewForm').reset();
      $('#reviewForm').hidden = true;
      renderReviews();
      toast('نُشر التقييم — شكراً لك ✓', 'ok');
    });
  }

  /* ------------------------------ إتمام الطلب ------------------------------ */

  function openCheckout() {
    if (!state.cart.length) { toast('السلة فارغة — أضف منتجاً أولاً.', 'err'); openCart(true); return; }
    openCart(false);
    const section = $('#checkout');
    section.hidden = false;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    renderCheckoutSummary();
  }

  function showOrderErrors(errors) {
    $$('.field').forEach((f) => f.classList.remove('has-error'));
    Object.entries(errors || {}).forEach(([key, msg]) => {
      const holder = $(`[data-error-for="${key}"]`);
      if (holder) { holder.textContent = msg; holder.style.display = 'block'; holder.closest('.field').classList.add('has-error'); }
    });
  }

  function initCheckout() {
    $('#checkoutBtn').addEventListener('click', openCheckout);
    $('#continueBtn').addEventListener('click', () => openCart(false));

    const form = $('#orderForm');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const alertBox = $('#orderAlert');
      const btn = $('#placeOrderBtn');
      alertBox.hidden = true;

      const payload = {
        name: $('#orderName').value.trim(),
        phone: $('#orderPhone').value.trim(),
        city: $('#orderCity').value.trim(),
        district: $('#orderDistrict').value.trim(),
        address: $('#orderAddress').value.trim(),
        notes: $('#orderNotes').value.trim(),
        delivery: state.delivery,
        items: state.cart.map((l) => ({ sku: l.sku, qty: l.qty })),
      };

      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = 'جارٍ التسجيل…';
      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          showOrderErrors(data.errors);
          alertBox.hidden = false;
          alertBox.textContent = data.message || 'تعذّر تسجيل الطلب. راجع البيانات.';
          return;
        }

        $('#orderTicket').textContent = data.id;
        $('#orderMeta').textContent = `سُجِّل بتاريخ ${new Date(data.createdAt).toLocaleString('ar')} · الإجمالي ${money(data.totals.total)} عبر ${data.delivery.label}`;
        const lines = [
          `طلب جديد — لمسة (${data.id})`,
          ...state.cart.map((l) => `• ${l.title} × ${l.qty}`),
          `الإجمالي: ${money(data.totals.total)}`,
          `التوصيل: ${data.delivery.label}`,
        ].join('\n');
        $('#orderWhatsapp').setAttribute('href', `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(lines)}`);
        form.hidden = true;
        $('#orderSuccess').hidden = false;
        state.cart = [];
        writeStore(CART_KEY, []);
        renderCart();
        toast('سُجِّل الطلب في النظام ✓', 'ok');
      } catch (err) {
        alertBox.hidden = false;
        alertBox.textContent = 'تعذّر الوصول إلى الخادم. تأكد من تشغيله ثم أعد المحاولة.';
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });

    $('#newOrderBtn').addEventListener('click', () => {
      $('#orderForm').reset();
      $('#orderForm').hidden = false;
      $('#orderSuccess').hidden = true;
      renderCheckoutSummary();
      $('#orderForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  /* --------------------------------- التبويبات --------------------------------- */

  function initTabs() {
    $$('.tab').forEach((tab) => tab.addEventListener('click', () => {
      $$('.tab').forEach((t) => { t.classList.remove('is-active'); t.setAttribute('aria-selected', 'false'); });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      $$('.tab-panel').forEach((panel) => {
        const active = panel.id === `panel-${tab.dataset.tab}`;
        panel.classList.toggle('is-active', active);
        panel.hidden = !active;
      });
    }));
  }

  /* --------------------------------- الإقلاع --------------------------------- */

  async function loadCatalog() {
    try {
      const res = await fetch('/api/catalog', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('لا يوجد كتالوج');
      const data = await res.json();
      if (!data || !Array.isArray(data.products) || !data.products.length) throw new Error('كتالوج فارغ');
      return data;
    } catch {
      return FALLBACK;
    }
  }

  function pickProduct(catalog) {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || params.get('sku');
    if (id) {
      const found = catalog.products.find((p) => p.id === id || p.sku === id);
      if (found) return found;
    }
    return catalog.products.find((p) => p.featured) || catalog.products[0];
  }

  function initBuyActions() {
    const qtyInput = $('#qtyInput');
    $('#qtyMinus').addEventListener('click', () => { state.qty = Math.max(1, state.qty - 1); qtyInput.value = state.qty; renderDelivery(); updateSticky(); });
    $('#qtyPlus').addEventListener('click', () => { state.qty = Math.min(50, state.qty + 1); qtyInput.value = state.qty; renderDelivery(); updateSticky(); });
    qtyInput.addEventListener('change', () => {
      state.qty = Math.max(1, Math.min(50, Number(qtyInput.value) || 1));
      qtyInput.value = state.qty;
      renderDelivery();
      updateSticky();
    });

    const add = () => addToCart(state.product.sku, state.qty);
    $('#addToCartBtn').addEventListener('click', add);
    $('#stickyAddBtn').addEventListener('click', add);
    $('#buyNowBtn').addEventListener('click', () => { add(); openCart(true); });

    $('#cartOpenBtn').addEventListener('click', () => openCart(true));
    $('#cartCloseBtn').addEventListener('click', () => openCart(false));
    $('#cartOverlay').addEventListener('click', () => openCart(false));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') openCart(false); });

    $('#favBtn').addEventListener('click', (event) => {
      const btn = event.currentTarget;
      const sku = state.product.sku;
      const has = state.favorites.includes(sku);
      state.favorites = has ? state.favorites.filter((s) => s !== sku) : [...state.favorites, sku];
      writeStore(FAV_KEY, state.favorites);
      btn.setAttribute('aria-pressed', String(!has));
      btn.textContent = has ? '♡ المفضّلة' : '♥ في المفضّلة';
      toast(has ? 'أُزيل من المفضّلة.' : 'أُضيف إلى المفضّلة ✓', 'ok');
    });

    $('#compareBtn').addEventListener('click', () => toast('أُضيف إلى المقارنة (تجريبية في هذه النسخة).', 'ok'));

    $('#shareBtn').addEventListener('click', async () => {
      const url = window.location.href;
      const data = { title: state.product.title, text: state.product.subtitle || '', url };
      try {
        if (navigator.share) { await navigator.share(data); return; }
        await navigator.clipboard.writeText(url);
        toast('نُسخ رابط المنتج ✓', 'ok');
      } catch { toast('تعذّرت المشاركة تلقائياً.', 'err'); }
    });

    const zoom = $('#zoomBtn');
    zoom.addEventListener('click', () => {
      state.zoomed = !state.zoomed;
      $('#coverMain').classList.toggle('is-zoomed', state.zoomed);
      zoom.textContent = state.zoomed ? '🔍 تصغير' : '🔍 تكبير';
    });
  }

  function updateSticky() {
    const bar = $('#stickyBuy');
    if (!bar || !state.product) return;
    const subtotal = (Number(state.product.price) || 0) * state.qty;
    $('#stickyTitle').textContent = state.product.title;
    $('#stickyPrice').textContent = `${money(subtotal)} × ${state.qty} — ${state.product.stock || ''}`;
    bar.hidden = window.scrollY < 420;
  }

  async function init() {
    const yearEl = $('#year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    state.catalog = await loadCatalog();
    state.product = pickProduct(state.catalog);
    state.cart = readStore(CART_KEY, []);
    state.favorites = readStore(FAV_KEY, []);
    state.reviews = readStore(REVIEWS_KEY, []);

    if (Array.isArray(state.favorites) && state.favorites.includes(state.product.sku)) {
      const fav = $('#favBtn');
      fav.setAttribute('aria-pressed', 'true');
      fav.textContent = '♥ في المفضّلة';
    }

    renderGallery(state.product);
    renderInfo(state.product);
    renderDelivery();
    renderRails();
    renderAvailability();
    renderCart();
    renderReviews();
    initReviews();
    initTabs();
    initBuyActions();
    initCheckout();
    updateSticky();
    window.addEventListener('scroll', updateSticky, { passive: true });

    $('#pdp').setAttribute('aria-busy', 'false');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
