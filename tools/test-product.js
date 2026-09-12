#!/usr/bin/env node
/* ==========================================================================
   test-product.js — اختبار آلي لصفحة المنتج بلا متصفّح
   يُحمّل public/product.html في محاكي DOM، ثم يشغّل assets/product.js
   مع كتالوج حقيقي من config/catalog.json وfetch مزيف، ويتحقّق من:
   العرض، خيارات التوصيل والشحن، السلة، التقييمات، وإتمام الطلب (بما فيه أن
   الخادم مصدر الأسعار — والعميل لا يستطيع التلاعب بها).
   الاستخدام: node tools/test-product.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { El, MiniDoc, parseHTML } = require('./dom-stub');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const catalog = JSON.parse(read('config/catalog.json'));

/* ------------------------------ بيئة الاختبار ------------------------------ */

const PAGE_HTML = read('public/product.html');
const doc = new MiniDoc();
doc.body = new El('body');

// تسجيل كل العناصر ذات المعرفات من الصفحة الحقيقية
const registerTree = (nodes) => {
  nodes.forEach((node) => {
    const id = node.getAttribute('id');
    if (id && !doc.map.has(id)) doc.map.set(id, node);
    registerTree(node.children);
  });
};
registerTree(parseHTML(PAGE_HTML));

const storeMap = {};
const requests = [];
let orderResponse = null;

global.document = doc;
global.localStorage = {
  getItem: (k) => (k in storeMap ? storeMap[k] : null),
  setItem: (k, v) => { storeMap[k] = String(v); },
  removeItem: (k) => { delete storeMap[k]; },
};
global.window = {
  location: { search: '', href: 'http://localhost:3000/product.html' },
  addEventListener() {},
  scrollY: 1200,
};
try { Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true }); }
catch { /* Node 22 يجعل navigator غير قابل للإسناد */ }
global.fetch = async (url, options = {}) => {
  requests.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null });
  if (String(url).includes('/api/catalog')) {
    return { ok: true, json: async () => ({ ok: true, ...catalog }) };
  }
  if (String(url).includes('/api/orders')) {
    if (orderResponse) return orderResponse;
    return {
      ok: true,
      json: async () => ({
        ok: true, id: 'ORD-TEST-0001', createdAt: new Date().toISOString(),
        totals: { currency: 'ر.س', subtotal: 447, shipping: 0, total: 447 },
        delivery: { id: 'express', label: 'توصيل سريع (24 – 48 ساعة)', fee: 0 },
      }),
    };
  }
  return { ok: false, json: async () => ({ ok: false }) };
};

let passed = 0; let failed = 0;
function check(label, condition, extra = '') {
  if (condition) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed += 1; console.log(`  ✗ ${label} ${extra}`); }
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const els = (id) => doc.getElementById(id);

(async function run() {
  console.log('\nاختبار: public/product.html + assets/product.js');

  const source = read('public/assets/product.js');
  eval(source); // eslint-disable-line no-eval
  doc.fire('DOMContentLoaded');
  for (let i = 0; i < 6; i += 1) await flush(); // انتظار init غير المتزامن

  const featured = catalog.products.find((p) => p.featured);

  console.log('\n— عرض بيانات المنتج من الكتالوج —');
  check('العنوان معروض', els('productTitle').textContent === featured.title, `(«${els('productTitle').textContent}»)`);
  check('رقم الصنف والمرجع', els('productSku').textContent === featured.sku && els('productIsbn').textContent === featured.isbn);
  check('الناشر معروض', els('productPublisher').textContent === featured.publisher);
  check('السعر بالعملة الصحيحة', els('productPrice').textContent.includes('269') && els('productPrice').textContent.includes('ر.س'));
  check('سعر المقارنة ووفّر', els('productCompare').textContent.includes('320') && els('productCompare').textContent.includes('وفّر'));
  check('التقسيط محسوب', /شهر/.test(els('productInstallment').textContent), `(«${els('productInstallment').textContent}»)`);
  check('المزايا الثلاث', els('productHighlights').children.length === featured.highlights.length);
  check('المواصفات جدول كامل', els('specsBody').children.length === featured.specs.length, `(${els('specsBody').children.length} صفوف)`);
  check('المسار (breadcrumbs) محدّث', els('crumbTitle').textContent === featured.title);
  check('صفحة المنتج انتهت التحميل', els('pdp').getAttribute('aria-busy') === 'false');

  console.log('\n— التوصيل والتوفّر —');
  const deliveryLabels = els('deliveryList').children;
  check('ثلاث خيارات توصيل', deliveryLabels.length === 3, `(${deliveryLabels.length})`);
  check('الخيار الأول محدّد', els('deliveryList').querySelectorAll('input').filter((i) => i.checked).length === 1);
  check('الشحن مجاني فوق 200 ر.س', els('deliveryList').textContent.includes('مجاناً'));
  els('availabilityCity').value = 'الدمام';
  els('availabilityBtn').dispatch('click');
  check('منطقة مغطاة تُعطي رسالة إيجابية', els('availabilityResult').textContent.includes('متوفر في'));
  els('availabilityCity').value = 'أبها';
  els('availabilityBtn').dispatch('click');
  check('منطقة أخرى تُعطي مساراً بديلاً', els('availabilityResult').textContent.includes('نغطّيها'), `(«${els('availabilityResult').textContent.slice(0, 45)}…»)`);

  console.log('\n— السلة —');
  els('qtyPlus').dispatch('click');
  els('addToCartBtn').dispatch('click');
  let cart = JSON.parse(storeMap['lamsa:cart'] || '[]');
  check('أُضيف المنتج بالكمية 2', cart.length === 1 && cart[0].qty === 2, JSON.stringify(cart));
  check('عدّاد السلة في التنقّل = 2', els('navCartCount').textContent === '2');
  check('السلة تعرض البنود', els('cartBody').textContent.includes(featured.title));
  check('الإجمالي محسوب', els('cartTotals').textContent.includes('538'), `(«${els('cartTotals').textContent.replace(/\s+/g, ' ').slice(0, 80)}»)`);

  // إضافة صنف ثانٍ (دليل رقمي) من العروض
  const addBtn = els('relatedRail').querySelectorAll('[data-add]')[0];
  addBtn.dispatch('click');
  cart = JSON.parse(storeMap['lamsa:cart']);
  check('الأصناف في السلة = 2', cart.length === 2, JSON.stringify(cart.map((l) => l.sku)));
  check('التوصيل يتغيّر مع تجاوز حدّ الشحن (0)', els('cartTotals').textContent.includes('مجاناً'));

  els('cartBody').querySelectorAll('[data-inc]')[0].dispatch('click');
  cart = JSON.parse(storeMap['lamsa:cart']);
  check('زر + يزيد الكمية', cart.some((l) => l.qty === 3), JSON.stringify(cart.map((l) => l.qty)));
  els('cartBody').querySelectorAll('[data-remove]')[0].dispatch('click');
  cart = JSON.parse(storeMap['lamsa:cart']);
  check('زر ✕ يحذف البند', cart.length === 1, JSON.stringify(cart.length));

  console.log('\n— التقييمات —');
  const before = els('reviewsList').children.length;
  check('التقييمات الأولية معروضة (4)', before === 4, `(${before})`);
  els('writeReviewBtn').dispatch('click');
  check('نموذج التقييم ظهر', els('reviewForm').hidden === false);
  els('reviewText').value = 'قصير';
  els('reviewForm').dispatch('submit');
  check('يرفض النص القصير', els('reviewsList').children.length === before);
  els('reviewText').value = 'دليل عملي واضح، أفادني في متابعة البرنامج في البيت.';
  els('reviewName').value = 'أبو محمد';
  els('reviewForm').dispatch('submit');
  check('نُشر التقييم', els('reviewsList').children.length === before + 1);
  check('التقييم محفوظ محلياً', (JSON.parse(storeMap['lamsa:reviews'] || '[]')).length === 1);
  check('المتوسط أُعيد حسابه', els('reviewsCountLabel').textContent.includes('5 تقييم'), `(«${els('reviewsCountLabel').textContent}»)`);

  console.log('\n— المفضّلة والتبويبات —');
  els('favBtn').dispatch('click');
  check('المفضّلة تُحفظ', (JSON.parse(storeMap['lamsa:favorites'] || '[]')).includes(featured.sku));
  els('favBtn').dispatch('click');
  check('المفضّلة تُلغى', (JSON.parse(storeMap['lamsa:favorites'])).length === 0);
  els('tab-specs').dispatch('click');
  check('التبويب يتبدّل (المواصفات)', els('panel-specs').hidden === false && els('panel-desc').hidden === true);
  els('tab-reviews').dispatch('click');
  check('التبويب يتبدّل (التقييمات)', els('panel-reviews').hidden === false && els('panel-specs').hidden === true);

  console.log('\n— إتمام الطلب —');
  els('checkoutBtn').dispatch('click');
  check('قسم الإتمام ظهر', els('checkout').hidden === false);
  check('ملخّص الإتمام يعرض الأصناف', els('checkoutSummary').textContent.includes('الإجمالي'));

  els('orderName').value = 'نورة الدوسري';
  els('orderPhone').value = '+966 55 909 1122';
  els('orderCity').value = 'الدمام';
  els('orderAddress').value = 'شارع الأمير محمد، مبنى 12، قرب الصيدلية';
  els('orderForm').dispatch('submit');
  for (let i = 0; i < 4; i += 1) await flush();

  const orderReq = requests.find((r) => r.url.includes('/api/orders') && r.body);
  check('أُرسل الطلب إلى /api/orders', !!orderReq);
  check('الطلب يحمل الأصناف والكميات فقط', !!orderReq && orderReq.body.items.every((i) => Object.keys(i).sort().join(',') === 'qty,sku'),
    orderReq ? JSON.stringify(orderReq.body.items) : '');
  check('الطلب يحمل بيانات العميل', !!orderReq && orderReq.body.name === 'نورة الدوسري' && orderReq.body.city === 'الدمام');
  check('الطلب يحمل طريقة التوصيل', !!orderReq && typeof orderReq.body.delivery === 'string' && orderReq.body.delivery.length > 0);
  check('لا يُرسل السعر من العميل', !!orderReq && !JSON.stringify(orderReq.body).includes('unitPrice'));
  check('ظهرت بطاقة النجاح برقم الطلب', els('orderSuccess').hidden === false && els('orderTicket').textContent === 'ORD-TEST-0001');
  check('رابط واتساب يحتوي الطلب', els('orderWhatsapp').getAttribute('href').includes('wa.me'));
  check('تُفرَّغ السلة بعد الطلب', JSON.parse(storeMap['lamsa:cart']).length === 0);
  check('عدّاد السلة يعود صفراً', els('navCartCount').textContent === '0');

  console.log('\n— معالجة رفض الخادم —');
  orderResponse = {
    ok: false,
    json: async () => ({ ok: false, message: 'تحقّق من بيانات الطلب.', errors: { phone: 'رقم الجوال غير صحيح.' } }),
  };
  els('orderSuccess').hidden = true;
  els('orderForm').hidden = false;
  els('newOrderBtn').dispatch('click');
  els('addToCartBtn').dispatch('click');
  els('orderPhone').value = '12';
  els('orderForm').dispatch('submit');
  for (let i = 0; i < 4; i += 1) await flush();
  check('يُظهر رسالة الخادم', els('orderAlert').hidden === false && els('orderAlert').textContent.includes('تحقّق من بيانات الطلب'));
  check('يُعلّم الحقل الخاطئ', els('orderForm').querySelector('[data-error-for="phone"]').textContent.includes('رقم الجوال'));

  console.log(`\n${failed === 0 ? '✓ نجحت كل الاختبارات' : '✗ فشل بعضها'}: ${passed} ناجح، ${failed} فاشل\n`);
  if (failed) process.exitCode = 1;
})();
