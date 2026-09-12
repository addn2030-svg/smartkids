#!/usr/bin/env node
/**
 * build-share.js — يبني نسخة «صفحة واحدة» قابلة للإرسال من صفحة لمسة (physio.html)
 * يُدمج CSS وJS داخل الملف، ويحوّل روابط الصفحات إلى مراسلة واتساب حتى تعمل بلا خادم.
 *
 * الاستخدام:  node tools/build-share.js  [رقم الواتساب]
 * المخرَج:    public/lamsa-physio.html
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public', 'physio.html');
const OUT = path.join(ROOT, 'public', 'lamsa-physio.html');
const WHATSAPP = (process.argv[2] || '966500000000').replace(/\D/g, '');

const read = (p) => fs.readFileSync(p, 'utf8');
const must = (haystack, needle, label) => {
  if (!haystack.includes(needle)) throw new Error(`لم يُعثر على: ${label}`);
  return true;
};

let html = read(SRC);
const css = read(path.join(ROOT, 'public', 'assets', 'styles.css'));
const js = read(path.join(ROOT, 'public', 'assets', 'gap-check.js'));
const favicon = read(path.join(ROOT, 'public', 'assets', 'favicon.svg'));
const faviconUri = `data:image/svg+xml;base64,${Buffer.from(favicon).toString('base64')}`;

const waLink = (text) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;

/* ------------------------------ 1) دمج الأصول ------------------------------ */

must(html, '<link rel="stylesheet" href="assets/styles.css">', 'رابط التنسيقات');
html = html.replace('<link rel="stylesheet" href="assets/styles.css">', `<style>\n${css}\n</style>`);

must(html, '<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">', 'الأيقونة');
html = html.replace('<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">', `<link rel="icon" href="${faviconUri}" type="image/svg+xml">`);

must(html, '<script src="assets/app.js" defer></script>', 'سكربت الواجهة');
html = html.replace('<script src="assets/app.js" defer></script>', '');

must(html, '<script src="assets/gap-check.js" defer></script>', 'سكربت فحص الفجوة');
html = html.replace('<script src="assets/gap-check.js" defer></script>', `<script>\n${js}\n</script>`);

/* --------------------------- 2) تحويل الروابط --------------------------- */

const waBook = waLink('السلام عليكم، أرغب بحجز زيارة تقييم منزلية مع «لمسة». حالتـي باختصار: ');
const waConsult = waLink('مرحباً، لدي استفسار عن العلاج الطبيعي المنزلي في «لمسة».');

// التنقّل
html = html.replace('<body>', '<body id="top">');
html = html.replace('<a class="brand" href="index.html">', '<a class="brand" href="#top">');
html = html.replace('<a href="index.html">الرئيسية</a>', '<a href="#top">الرئيسية</a>');
html = html.replace('<a href="physio.html" class="is-active">علاج طبيعي منزلي</a>', '<a href="#layers" class="is-active">تفكيك الطبقات</a>');
html = html.replace('<a href="inbox.html">لوحة الرسائل</a>', '<a href="#faq">الأسئلة</a>');
html = html.replace(/<a class="btn btn--primary btn--sm" href="contact\.html\?[^"]*">تواصل معنا<\/a>/,
  `<a class="btn btn--primary btn--sm" href="${waBook}" target="_blank" rel="noopener">احجز زيارة ←</a>`);

// رابط المتجر في التنقّل → مراسلة واتساب (لا صفحة متجر في نسخة الملف الواحد)
html = html.replace('<a href="product.html">متجر التأهيل</a>',
  `<a href="${waLink('مرحباً، أرغب بالاستفسار عن منتجات متجر لمسة (الكتب والمستلزمات).')}" target="_blank" rel="noopener">المتجر — استفسار</a>`);

// شريط الدعوة في نهاية الصفحة
html = html.replace(/<a class="btn btn--primary" href="contact\.html\?[^"]*">اطلب[^<]*<\/a>/,
  `<a class="btn btn--primary" href="${waBook}" target="_blank" rel="noopener">اطلب زيارة تقييم منزلية ←</a>`);

// التذييل وروابط النهاية
html = html.replace(/<a href="contact\.html\?[^"]*">[^<]*<\/a>/g, `<a href="${waBook}" target="_blank" rel="noopener">اطلب زيارة منزلية</a>`);
html = html.replace('<a href="index.html">الرئيسية</a>', '<a href="#top">الرئيسية</a>');
html = html.replace(/href="physio\.html#/g, 'href="#');
html = html.replace('<a href="contact.html?domain=%D9%85%D8%AC%D8%A7%D9%84%20%D8%B5%D8%AD%D9%8A&scope=physio">تواصل</a>',
  `<a href="${waBook}" target="_blank" rel="noopener">تواصل</a>`);
html = html.replace('<a href="inbox.html">لوحة الرسائل</a>', '');

// زر «استخدم البطاقة» → إرسال البطاقة على واتساب
must(html, 'id="useCardBtn"', 'زر البطاقة');
html = html.replace(/<a class="btn btn--primary" id="useCardBtn"[^>]*>[^<]*<\/a>/,
  '<button class="btn btn--primary" type="button" id="useCardBtn">أرسل بطاقة الفجوة على واتساب ←</button>');

/* ------------------- 3) شريط تعريفي + سلوك الواتساب ------------------- */

const strip = `
  <div class="wrap" style="margin-top:14px">
    <div class="badge-line">
      <span class="badge-soft badge-soft--mint">نسخة صفحة واحدة — تعمل بلا خادم</span>
      <span class="badge-soft">يمكنك حفظها أو إرسالها على واتساب أو البريد</span>
      <span class="badge-soft badge-soft--gold">لمسة تُعيد البسمة</span>
    </div>
  </div>`;
html = html.replace('<main>', `<main>${strip}`);

const boot = `
<script>
(function () {
  'use strict';
  function toast(message, kind) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.className = 'toast toast--' + (kind || 'ok') + ' is-visible';
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('is-visible'); }, 3400);
  }
  document.addEventListener('DOMContentLoaded', function () {
    var y = document.getElementById('year');
    if (y) y.textContent = String(new Date().getFullYear());

    var toggle = document.querySelector('.nav__toggle');
    if (toggle) toggle.addEventListener('click', function () {
      var links = document.getElementById(toggle.getAttribute('aria-controls'));
      if (!links) return;
      var open = links.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    document.querySelectorAll('.nav__links a').forEach(function (a) {
      a.addEventListener('click', function () {
        var box = a.closest('.nav__links');
        if (box) box.classList.remove('is-open');
      });
    });

    // كشف العناصر عند التمرير
    var items = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -8% 0px' });
      items.forEach(function (el) { io.observe(el); });
    } else {
      items.forEach(function (el) { el.classList.add('is-in'); });
    }

    // إرسال بطاقة الفجوة عبر واتساب (القراءة بعد أن يخزّنها فحص الفجوة)
    var useBtn = document.getElementById('useCardBtn');
    if (useBtn) useBtn.addEventListener('click', function () {
      setTimeout(function () {
        var card = null;
        try { card = JSON.parse(sessionStorage.getItem('smartkids:gapCard') || 'null'); } catch (e) { card = null; }
        if (!card) { toast('أكمل فحص الفجوة أولاً لعرض البطاقة.', 'err'); return; }
        var lines = [
          'بطاقة الفجوة — العلاج الطبيعي المنزلي (لمسة)',
          '———————————————',
          'المنطقة: ' + card.region,
          'المدة: ' + card.duration,
          'شدّة الألم: ' + card.severity + '/10',
          card.sleep ? 'الأثر على النوم: ' + card.sleep : null,
          (card.loads || []).length ? 'الأحمال اليومية: ' + card.loads.join('، ') : null,
          (card.barriers || []).length ? 'عوائق الوصول للمركز: ' + card.barriers.join('، ') : null,
          'الهدف: ' + card.goal,
          '',
          'الضجيج السائد: ' + card.noise,
          'القلق غير المعلن: ' + card.silent,
          'لماذا لم يكفِ النموذج السابق: ' + card.model,
          '',
          'المسار المبدئي:',
          card.phases.map(function (p) { return '  (' + p.n + ') ' + p.title + ' — ' + p.text; }).join('\\n'),
          '',
          'الخطوة القابلة للتطبيق: ' + card.whyNow,
          '',
          'تنبيه: ' + card.note
        ].filter(function (l) { return l !== null; });
        var url = 'https://wa.me/${WHATSAPP}?text=' + encodeURIComponent(lines.join('\\n'));
        window.open(url, '_blank', 'noopener');
        toast('فُتح واتساب بالبطاقة — أرسلها لنصل إليك ✓', 'ok');
      }, 0);
    });
  });
})();
</script>`;

html = html.replace('</body>', `${boot}\n</body>`);

/* ------------------------------- 4) الكتابة ------------------------------- */

html = html.replace('<title>لمسة | علاج طبيعي منزلي — المحرك التحليلي للفجوة</title>',
  '<title>لمسة | علاج طبيعي منزلي — صفحة قابلة للإرسال</title>');

fs.writeFileSync(OUT, html, 'utf8');
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`✓ تم البناء: ${path.relative(ROOT, OUT)} (${kb}KB) — واتساب: ${WHATSAPP}`);

const checks = [
  ['لا روابط ملفات مفقودة', !/(?:href|src)="(?!#|https?:|mailto:|data:|#top)[^"]*\.(?:html|css|js|svg)"/.test(html)],
  ['سكربتات خارجية متبقية', !/<script src=/.test(html)],
  ['تنسيقات مدمجة', html.includes('<style>') && !/href="assets\/styles\.css"/.test(html)],
  ['فحص الفجوة مدمج', html.includes('const BARRIERS') && html.includes('buildCard')],
  ['زر واتساب للبطاقة', html.includes('useCardBtn') && html.includes('wa.me')],
];
checks.forEach(([label, ok]) => console.log(`  ${ok ? '✓' : '✗'} ${label}`));
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
