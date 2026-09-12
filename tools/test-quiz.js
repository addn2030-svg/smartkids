#!/usr/bin/env node
/* ==========================================================================
   test-quiz.js — اختبار آلي لأداة «فحص الفجوة» بلا متصفّح
   الاستخدام:
     node tools/test-quiz.js                     # يختبر public/assets/gap-check.js
     node tools/test-quiz.js public/lamsa-physio.html   # يختبر النسخة المستقلة
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { El, MiniDoc } = require('./dom-stub');

const ROOT = path.join(__dirname, '..');
const target = process.argv[2] || 'public/assets/gap-check.js';
const file = path.isAbsolute(target) ? target : path.join(ROOT, target);
if (!fs.existsSync(file)) { console.error(`✗ الملف غير موجود: ${file}`); process.exit(1); }

const source = fs.readFileSync(file, 'utf8');
const scripts = file.endsWith('.html')
  ? [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  : [source];

/* ------------------------------- البيئة ------------------------------- */

const IDS = ['gapQuiz', 'gapResult', 'quizSteps', 'quizBar', 'quizStepLabel', 'quizTag', 'quizDots',
  'quizPrev', 'quizNext', 'quizFinish', 'quizReset', 'copyCardBtn', 'useCardBtn', 'outNoise',
  'outSilent', 'outModel', 'resultSummary', 'outPath', 'outNext', 'toast', 'year'];

const doc = new MiniDoc();
IDS.forEach((id) => doc.register(id, 'div'));

const store = {};
const opened = [];
global.document = doc;
global.window = { open: (url) => { opened.push(url); } };
global.sessionStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
global.setTimeout = (fn) => { fn(); return 0; };
global.clearTimeout = () => {};

scripts.forEach((src) => eval(src)); // eslint-disable-line no-eval
doc.fire('DOMContentLoaded');

/* ------------------------------- أدوات ------------------------------- */

const els = (id) => doc.getElementById(id);
const activeStep = () => els('quizSteps').children.find((c) => c._classes.has('is-active'));
const options = () => {
  const wrap = activeStep().children.find((c) => c._classes.has('quiz__options'));
  return wrap ? wrap.querySelectorAll('input') : [];
};
const next = () => els('quizNext').dispatch('click');
const finish = () => els('quizFinish').dispatch('click');

function choose(values) {
  const inputs = options();
  values.forEach((v) => {
    const input = inputs.find((i) => i.value === v);
    if (!input) throw new Error(`خيار مفقود: ${v} — المتاح: ${inputs.map((i) => i.value).join(', ')}`);
    input.checked = true;
    input.dispatch('change', input);
  });
}
function setRange(value) {
  const input = activeStep().querySelector('input');
  input.value = String(value);
  input.dispatch('input', input);
}

let passed = 0;
let failed = 0;
function check(label, condition, extra = '') {
  if (condition) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed += 1; console.log(`  ✗ ${label} ${extra}`); }
}

/* ------------------------------ الاختبارات ------------------------------ */

const stepCount = els('quizSteps').children.length;
const tags = new Set();

console.log(`\nاختبار: ${path.relative(ROOT, file)}`);
console.log('\n— البناء الأولي —');
check(`عدد الخطوات = ${stepCount}`, stepCount === 8, `(وجد ${stepCount})`);
check('الشريط يظهر التقدّم', /%/.test(els('quizBar').style.width));
check('وسم الباب: المرآة', els('quizTag').textContent === 'المرآة', `(وجد «${els('quizTag').textContent}»)`);
check('زر السابق مخفي في البداية', els('quizPrev').hidden === true);
check('زر الإعادة مخفي في البداية', els('quizReset').hidden === true);

console.log('\n— منع التخطي —');
next();
const err = activeStep().querySelector('.error-msg');
check('لا ينتقل بلا إجابة', els('quizStepLabel').textContent.includes('1 من'), els('(انتقل إلى «' + els('quizStepLabel').textContent + '»)'));
check('رسالة الخطأ تظهر', !!err && err.style.display === 'block');

console.log('\n— إكمال المسار —');
choose(['knee']); tags.add(els('quizTag').textContent); next();
choose(['gt12']); next();
setRange(7);
check('المؤشر يعكس القيمة', activeStep().querySelector('output').textContent === '7');
next();
choose(['wakes']); tags.add(els('quizTag').textContent); next();

// الخطوة 5: المخاوف — بحدّ أقصى 3
const concernsBox = els('quizStepLabel').textContent;
check('خطوة المخاوف = 5 من 8', concernsBox.includes('5 من'), `(وجد «${concernsBox}»)`);
choose(['recur', 'value', 'burden']);
const fourth = options().find((i) => i.value === 'sport');
fourth.checked = true;
fourth.dispatch('change', fourth);
check('يرفض الخيار الرابع (حدّ 3)', fourth.checked === false);
next();

// الخطوة 6: الأحمال اليومية — اختيارية
check('خطوة اختيارية يمكن تخطّيها', els('quizStepLabel').textContent.includes('6 من'), `(وجد «${els('quizStepLabel').textContent}»)`);
next();
check('خطوة عوائق الوصول موجودة', els('quizStepLabel').textContent.includes('7 من'), `(وجد «${els('quizStepLabel').textContent}»)`);
check('خيارات العوائق ستة', options().length === 6, `(وجد ${options().length})`);
choose(['noRide', 'privacy']);
tags.add(els('quizTag').textContent); next();
check('الخطوة الأخيرة = 8 من 8', els('quizStepLabel').textContent.includes('8 من'));
check('زر الإنهاء ظاهر', els('quizFinish').hidden === false);
tags.add(els('quizTag').textContent);
choose(['sport']);
finish();

console.log('\n— بطاقة الفجوة —');
check('أُخفيت الأداة', els('gapQuiz').hidden === true);
check('ظهرت النتيجة', els('gapResult').hidden === false);
console.log('   ↳ ملخص فعلي:', JSON.stringify(els('resultSummary').textContent));
check('الملخص يحتوي المنطقة والهدف', els('resultSummary').textContent.includes('الركبة') && els('resultSummary').textContent.includes('الهدف:'));
check('الضجيج مذكور', els('outNoise').textContent.includes('دعامة') || els('outNoise').textContent.includes('كم جلسة'));
check('القلق غير المعلن حلّ محلّ نص عام', els('outSilent').textContent.includes('يرجع الوجع'), `(وجد «${els('outSilent').textContent.slice(0, 40)}…»)`);
check('المسار ثلاث مراحل', els('outPath').children.length === 3, `(وجد ${els('outPath').children.length})`);
check('أُدرج بُعد العلاج المنزلي', els('outModel').textContent.includes('العلاج المنزلي'));
check('خطوة قابلة للتطبيق مذكورة', els('outNext').textContent.includes('زيارة تقييم منزلية'));

console.log('\n— النقل إلى التواصل / الإرسال —');
els('useCardBtn').dispatch('click');
const card = store['smartkids:gapCard'] ? JSON.parse(store['smartkids:gapCard']) : null;
check('البطاقة حُفظت للجلسة', !!card);
check('البطاقة تحمل المنطقة والشدة والهدف', !!card && card.region === 'الركبة' && card.severity === 7 && !!card.goal);
check('البطاقة تحمل المخاوف والعوائق', !!card && card.concerns.length === 3 && card.barriers.length === 2,
  card ? `(مخاوف: ${card.concerns.length}، عوائق: ${card.barriers.length})` : '');
check('البطاقة تحمل ثلاث مراحل', !!card && card.phases.length === 3);
if (file.endsWith('.html')) {
  check('النسخة المستقلة تفتح واتساب', opened.some((u) => u.includes('wa.me')), `(فُتح: ${opened.length})`);
  check('رسالة واتساب تحتوي البطاقة', opened.some((u) => decodeURIComponent(u).includes('القلق غير المعلن')));
}

console.log('\n— إعادة الفحص —');
els('quizReset').dispatch('click');
check('عادت الأداة للخطوة 1', els('quizStepLabel').textContent.includes('1 من'));
check('أُخفيت النتيجة', els('gapResult').hidden === true);
check('ظهرت الأداة من جديد', els('gapQuiz').hidden === false);
check('الأبواب الأربعة ظهرت عبر المسار', tags.size >= 3, `(ظهرت: ${[...tags].join(' → ')})`);

console.log(`\n${failed === 0 ? '✓ نجحت كل الاختبارات' : '✗ فشل بعضها'}: ${passed} ناجح، ${failed} فاشل\n`);
if (failed) process.exitCode = 1;
