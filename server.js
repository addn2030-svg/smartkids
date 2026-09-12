#!/usr/bin/env node
/**
 * SmartKids — خادم الموقع ونقطة التواصل
 * خادم Node.js بدون أي اعتماديات خارجية:
 *   1) يقدّم الموقع الثابت من مجلد public/
 *   2) يستقبل طلبات صفحة "تواصل" عبر POST /api/contact ويخزّنها في data/messages.json
 *   3) يعرض الرسائل في لوحة "الرسائل" عبر GET /api/messages
 *
 * التشغيل:  node server.js        (المتغيّر PORT اختياري، الافتراضي 3000)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const LOG_FILE = path.join(DATA_DIR, 'contact.log');
const CATALOG_FILE = path.join(ROOT, 'config', 'catalog.json');

const MAX_BODY = 64 * 1024; // 64KB
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 8; // 8 طلبات تواصل لكل IP في الدقيقة

/* ------------------------------ أدوات مساعدة ------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function json(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    ...extraHeaders,
  });
  res.end(body);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function clean(value, max = 500) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('الحمولة كبيرة جداً'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function parsePayload(req) {
  const raw = await readBody(req);
  const type = String(req.headers['content-type'] || '');
  if (type.includes('application/json')) {
    try {
      return JSON.parse(raw || '{}');
    } catch {
      throw Object.assign(new Error('صيغة JSON غير صحيحة'), { status: 400 });
    }
  }
  const params = new URLSearchParams(raw);
  return Object.fromEntries(params.entries());
}

/* --------------------------- التخزين (ملفات JSON) -------------------------- */

async function ensureStorage() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  for (const file of [MESSAGES_FILE, ORDERS_FILE]) {
    try {
      await fsp.access(file);
    } catch {
      await fsp.writeFile(file, '[]\n', 'utf8');
    }
  }
}

let writeChain = Promise.resolve();
function withLock(fn) {
  const next = writeChain.then(fn, fn);
  writeChain = next.catch(() => {});
  return next;
}

async function readMessages() {
  try {
    const raw = await fsp.readFile(MESSAGES_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function appendMessage(record) {
  return withLock(async () => {
    const all = await readMessages();
    all.push(record);
    const tmp = `${MESSAGES_FILE}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, `${JSON.stringify(all, null, 2)}\n`, 'utf8');
    await fsp.rename(tmp, MESSAGES_FILE);
    await fsp.appendFile(LOG_FILE, `${JSON.stringify({ id: record.id, at: record.createdAt, domain: record.domain, email: record.email })}\n`, 'utf8');
    return all.length;
  });
}

async function readOrders() {
  try {
    const raw = await fsp.readFile(ORDERS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function appendOrder(record) {
  return withLock(async () => {
    const all = await readOrders();
    all.push(record);
    const tmp = `${ORDERS_FILE}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, `${JSON.stringify(all, null, 2)}\n`, 'utf8');
    await fsp.rename(tmp, ORDERS_FILE);
    return all.length;
  });
}

/* --------------------------------- الحدود --------------------------------- */

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > RATE_MAX;
}

/* ------------------------------ كتالوج المنتجات --------------------------- */

let catalogCache = null;
function loadCatalog() {
  if (catalogCache) return catalogCache;
  try {
    const raw = fs.readFileSync(CATALOG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    catalogCache = {
      currency: parsed.currency || 'ر.س',
      vatIncluded: parsed.vatIncluded !== false,
      deliveryOptions: Array.isArray(parsed.deliveryOptions) ? parsed.deliveryOptions : [],
      products: Array.isArray(parsed.products) ? parsed.products : [],
    };
  } catch (err) {
    console.error('[كتالوج] تعذّر قراءة config/catalog.json:', err.message);
    catalogCache = { currency: 'ر.س', vatIncluded: true, deliveryOptions: [], products: [] };
  }
  return catalogCache;
}

function findProduct(sku) {
  return loadCatalog().products.find((p) => p.sku === sku || p.id === sku) || null;
}

function deliveryOption(id) {
  const list = loadCatalog().deliveryOptions;
  return list.find((d) => d.id === id) || list[0] || { id: 'pickup', label: 'استلام من العيادة', fee: 0 };
}

function shippingFee(option, subtotal) {
  if (!option) return 0;
  if (typeof option.freeAbove === 'number' && subtotal >= option.freeAbove) return 0;
  return Math.max(0, Number(option.fee) || 0);
}

/* ------------------------------- التحقّق ---------------------------------- */

const DOMAINS = [
  'مجال صحي',
  'مجال تقني',
  'منصة تعليمية',
  'حلول أتمتة وبناء أنظمة',
  'أخرى',
];
const REQUEST_TYPES = [
  'زيارة تقييم منزلية (60 دقيقة)',
  'برنامج تأهيل منزلي كامل',
  'استشارة / متابعة أونلاين',
  'شراكة تحليلية (للعيادات والمراكز)',
];
const SERVICE_MODES = ['زيارة منزلية', 'مراجعة أونلاين', 'عيادة'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(payload) {
  const errors = {};
  const data = {
    name: clean(payload.name, 120),
    email: clean(payload.email, 160).toLowerCase(),
    phone: clean(payload.phone, 40),
    domain: clean(payload.domain, 80),
    requestType: clean(payload.requestType, 80),
    serviceMode: clean(payload.serviceMode, 40),
    surfaceNoise: clean(payload.surfaceNoise, 300),
    silentPain: clean(payload.silentPain, 1200),
    budget: clean(payload.budget, 60),
    consent: payload.consent === true || payload.consent === 'true' || payload.consent === 'on',
  };

  if (data.name.length < 2) errors.name = 'الاسم مطلوب (حرفان على الأقل).';
  if (!EMAIL_RE.test(data.email)) errors.email = 'صيغة البريد الإلكتروني غير صحيحة.';
  if (data.silentPain.length < 15) errors.silentPain = 'اشرح الفجوة/الألم الصامت في 15 حرفاً على الأقل.';
  if (!DOMAINS.includes(data.domain)) errors.domain = 'اختر المجال من القائمة.';
  if (data.requestType && !REQUEST_TYPES.includes(data.requestType)) errors.requestType = 'نوع الطلب غير معروف.';
  if (data.serviceMode && !SERVICE_MODES.includes(data.serviceMode)) errors.serviceMode = 'طريقة الخدمة غير معروفة.';
  if (data.phone && !/^[+\d\s()-]{6,}$/.test(data.phone)) errors.phone = 'رقم الجوال غير صحيح.';
  if (!data.consent) errors.consent = 'يلزم الموافقة على التواصل.';

  return { data, errors, valid: Object.keys(errors).length === 0 };
}

const DELIVERY_IDS = () => loadCatalog().deliveryOptions.map((d) => d.id);

function validateOrder(payload) {
  const errors = {};
  const customer = {
    name: clean(payload.name, 120),
    phone: clean(payload.phone, 40),
    city: clean(payload.city, 80),
    district: clean(payload.district, 120),
    address: clean(payload.address, 300),
    notes: clean(payload.notes, 500),
    email: clean(payload.email, 160).toLowerCase(),
  };

  if (customer.name.length < 2) errors.name = 'الاسم مطلوب.';
  if (!/^[+\d\s()-]{6,}$/.test(customer.phone)) errors.phone = 'رقم الجوال غير صحيح.';
  if (customer.city.length < 2) errors.city = 'المدينة مطلوبة.';

  const requested = Array.isArray(payload.items) ? payload.items : [];
  if (!requested.length) errors.items = 'السلة فارغة.';

  const items = [];
  for (const line of requested.slice(0, 20)) {
    const product = findProduct(clean(line.sku, 60));
    if (!product) { errors.items = `منتج غير معروف: ${clean(line.sku, 60)}`; continue; }
    const qty = Math.min(50, Math.max(1, Number(line.qty) || 1));
    items.push({
      sku: product.sku,
      title: product.title,
      type: product.type || 'product',
      qty,
      unitPrice: Number(product.price) || 0,
      lineTotal: Math.round((Number(product.price) || 0) * qty * 100) / 100,
    });
  }

  const deliveryId = clean(payload.delivery, 40) || (loadCatalog().deliveryOptions[0] || {}).id || 'pickup';
  if (!DELIVERY_IDS().includes(deliveryId)) errors.delivery = 'طريقة التوصيل غير معروفة.';
  if (deliveryId !== 'pickup' && customer.address.length < 8) errors.address = 'العنوان مطلوب للتوصيل.';

  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const option = deliveryOption(deliveryId);
  const shipping = shippingFee(option, subtotal);

  return {
    errors,
    valid: Object.keys(errors).length === 0,
    customer,
    items,
    delivery: { id: option.id, label: option.label, fee: shipping },
    totals: {
      currency: loadCatalog().currency,
      vatIncluded: loadCatalog().vatIncluded,
      subtotal: Math.round(subtotal * 100) / 100,
      shipping,
      total: Math.round((subtotal + shipping) * 100) / 100,
    },
  };
}

function stamp() {
  const d = new Date();
  return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function makeId(prefix = 'SK') {
  return `${prefix}-${stamp()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

/* --------------------------- نقاط النهاية (API) --------------------------- */

async function handleApi(req, res, url) {
  const { pathname } = url;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  if (pathname === '/api/health') {
    const catalog = loadCatalog();
    return json(res, 200, {
      ok: true,
      service: 'lamsa-site',
      time: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      products: catalog.products.length,
      deliveryOptions: catalog.deliveryOptions.length,
    });
  }

  if (pathname === '/api/meta') {
    return json(res, 200, { domains: DOMAINS, requestTypes: REQUEST_TYPES, serviceModes: SERVICE_MODES });
  }

  if (pathname === '/api/catalog' && req.method === 'GET') {
    const catalog = loadCatalog();
    return json(res, 200, { ok: true, updatedAt: catalog.updatedAt, ...catalog });
  }

  if (pathname === '/api/orders' && req.method === 'POST') {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    if (rateLimited(ip)) {
      return json(res, 429, { ok: false, message: 'محاولات كثيرة — انتظر دقيقة ثم أعد المحاولة.' });
    }

    let payload;
    try {
      payload = await parsePayload(req);
    } catch (err) {
      return json(res, err.status || 400, { ok: false, message: err.message });
    }

    const result = validateOrder(payload);
    if (!result.valid) {
      return json(res, 422, { ok: false, message: 'تحقّق من بيانات الطلب.', errors: result.errors });
    }

    const record = {
      id: makeId('ORD'),
      createdAt: new Date().toISOString(),
      status: 'جديد',
      customer: result.customer,
      items: result.items,
      delivery: result.delivery,
      totals: result.totals,
      meta: { ip, userAgent: clean(req.headers['user-agent'], 300) },
    };

    const total = await appendOrder(record);
    console.log(`[طلب] ${record.id} — ${record.items.length} صنف — ${record.totals.total} ${record.totals.currency} (الإجمالي: ${total})`);
    return json(res, 201, { ok: true, id: record.id, createdAt: record.createdAt, totals: record.totals, items: record.items, delivery: record.delivery, message: 'تم تسجيل الطلب.' });
  }

  if (pathname === '/api/orders' && req.method === 'GET') {
    const all = await readOrders();
    const sorted = all.slice().reverse();
    const revenue = all.reduce((sum, o) => sum + (o.totals ? o.totals.total : 0), 0);
    return json(res, 200, {
      ok: true,
      count: sorted.length,
      stats: { revenue: Math.round(revenue * 100) / 100, currency: loadCatalog().currency, lastAt: sorted[0] ? sorted[0].createdAt : null },
      orders: sorted,
    });
  }

  if (pathname === '/api/contact' && req.method === 'POST') {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    if (rateLimited(ip)) {
      return json(res, 429, { ok: false, message: 'محاولات كثيرة — انتظر دقيقة ثم أعد المحاولة.' });
    }

    let payload;
    try {
      payload = await parsePayload(req);
    } catch (err) {
      return json(res, err.status || 400, { ok: false, message: err.message });
    }

    // فخّ الروبوتات: حقل مخفي يجب أن يبقى فارغاً
    if (clean(payload.website, 50)) {
      return json(res, 200, { ok: true, id: 'SK-IGNORED', message: 'تم الاستلام.' });
    }

    const { data, errors, valid } = validate(payload);
    if (!valid) {
      return json(res, 422, { ok: false, message: 'تحقّق من الحقول المعلّمة.', errors });
    }

    const record = {
      id: makeId(),
      createdAt: new Date().toISOString(),
      status: 'جديدة',
      ...data,
      meta: {
        ip,
        userAgent: clean(req.headers['user-agent'], 300),
        referer: clean(req.headers.referer, 300),
      },
    };

    const total = await appendMessage(record);
    console.log(`[تواصل] ${record.id} — ${record.domain} — ${record.email} (الإجمالي: ${total})`);
    return json(res, 201, {
      ok: true,
      id: record.id,
      createdAt: record.createdAt,
      total,
      message: 'وصلت رسالتك وتم ربطها بلوحة المتابعة.',
    });
  }

  if (pathname === '/api/messages' && req.method === 'GET') {
    const q = clean(url.searchParams.get('q'), 80).toLowerCase();
    const domain = clean(url.searchParams.get('domain'), 80);
    let all = await readMessages();
    if (domain) all = all.filter((m) => m.domain === domain);
    if (q) {
      all = all.filter((m) => [m.name, m.email, m.domain, m.silentPain, m.surfaceNoise, m.id]
        .join(' ').toLowerCase().includes(q));
    }
    const sorted = all.slice().reverse();
    const byDomain = {};
    const byType = {};
    const byService = {};
    for (const m of sorted) {
      byDomain[m.domain] = (byDomain[m.domain] || 0) + 1;
      byType[m.requestType || 'غير محدّد'] = (byType[m.requestType || 'غير محدّد'] || 0) + 1;
      if (m.serviceMode) byService[m.serviceMode] = (byService[m.serviceMode] || 0) + 1;
    }
    return json(res, 200, {
      ok: true,
      count: sorted.length,
      stats: {
        total: (await readMessages()).length,
        byDomain,
        byType,
        byService,
        lastAt: sorted[0] ? sorted[0].createdAt : null,
      },
      messages: sorted,
    });
  }

  if (pathname === '/api/export.md' && req.method === 'GET') {
    const all = (await readMessages()).slice().reverse();
    const lines = [
      '# سجل طلبات التواصل — لمسة',
      '',
      `_آخر تحديث: ${new Date().toISOString()} — العدد: ${all.length}_`,
      '',
    ];
    for (const m of all) {
      lines.push(
        `## ${m.id} — ${m.name}`,
        '',
        `- **التاريخ:** ${m.createdAt}`,
        `- **البريد:** ${m.email}`,
        `- **الجوال:** ${m.phone || '—'}`,
        `- **المجال:** ${m.domain}`,
        `- **نوع الطلب:** ${m.requestType || '—'}`,
        `- **طريقة الخدمة:** ${m.serviceMode || '—'}`,
        `- **الميزانية:** ${m.budget || '—'}`,
        `- **الضجيج على السطح:** ${m.surfaceNoise || '—'}`,
        `- **القلق غير المعلن:** ${m.silentPain}`,
        '',
      );
    }
    const body = lines.join('\n');
    res.writeHead(200, {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Content-Disposition': 'attachment; filename="lamsa-requests.md"',
      'Access-Control-Allow-Origin': '*',
    });
    return res.end(body);
  }

  const single = pathname.match(/^\/api\/messages\/([\w-]+)$/);
  if (single && req.method === 'GET') {
    const all = await readMessages();
    const found = all.find((m) => m.id.toLowerCase() === single[1].toLowerCase());
    if (!found) return json(res, 404, { ok: false, message: 'الرسالة غير موجودة.' });
    return json(res, 200, { ok: true, message: found });
  }

  return json(res, 404, { ok: false, message: 'نقطة نهاية غير معروفة.' });
}

/* ------------------------------ الملفات الثابتة ---------------------------- */

async function serveStatic(req, res, url) {
  let relative = decodeURIComponent(url.pathname);
  if (relative.endsWith('/')) relative += 'index.html';

  const safePath = path.normalize(path.join(PUBLIC_DIR, relative));
  if (!safePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('ممنوع');
  }

  try {
    const stat = await fsp.stat(safePath);
    if (stat.isDirectory()) return serveStatic(req, res, new URL(`${url.pathname}/`, url.origin));
    const ext = path.extname(safePath).toLowerCase();
    const isHtml = ext === '.html';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(safePath).pipe(res);
  } catch {
    try {
      const notFound = await fsp.readFile(path.join(PUBLIC_DIR, '404.html'));
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': notFound.length });
      return res.end(req.method === 'HEAD' ? undefined : notFound);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('الصفحة غير موجودة');
    }
  }
}

/* --------------------------------- الخادم --------------------------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (!['GET', 'HEAD'].includes(req.method)) {
      return json(res, 405, { ok: false, message: 'طريقة غير مسموحة.' });
    }
    return await serveStatic(req, res, url);
  } catch (err) {
    console.error('[خطأ]', err);
    return json(res, err.status || 500, { ok: false, message: err.status ? err.message : 'خطأ داخلي في الخادم.' });
  }
});

ensureStorage().then(() => {
  server.listen(PORT, HOST, () => {
    console.log(`لمسة — الخادم يعمل على http://${HOST}:${PORT}`);
    console.log(`الرسائل تُخزَّن في: ${MESSAGES_FILE}`);
  });
});
