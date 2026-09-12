/* ==========================================================================
   SmartKids — أداة "فحص الفجوة" لقطاع العلاج الطبيعي والتأهيل
   خمس دقائق → بطاقة فجوة: الضجيج السائد، القلق غير المعلن، سبب فشل النموذج السابق،
   ومسار مبدئي من ثلاث مراحل. تُنقل البطاقة إلى صفحة التواصل عبر sessionStorage.
   ⚠ الأداة تحليلية/تسويقية وليست تشخيصاً طبياً.
   ========================================================================== */
(function () {
  'use strict';

  const STORAGE_KEY = 'smartkids:gapCard';

  /* ------------------------------ بنك البيانات ------------------------------ */

  const REGIONS = {
    back: {
      label: 'أسفل الظهر',
      noise: '«كم جلسة؟ وهل عندكم جهاز شدّ أو تعديل فقرات؟»',
      silent: 'أخاف أن يصبح هذا الوجع جزءاً من شخصيتي، وأن أخطّط يومي كلّه حوله.',
      model: 'تسكين العرض يريحك اليوم ويُبقي السبب في مكانه — فيعود أقوى في أول حمل ثقيل.',
      first: 'قياس دالة الجذع والحوض، وفحص المهام التي يمنعك الألم منها.',
    },
    neck: {
      label: 'الرقبة والصداع',
      noise: '«جرّب كرسياً أفضل… أو تمارين يوتيوب.»',
      silent: 'ألمي لم يُصدَّق: تقاريري سليمة، ويظنّون أنني أبالغ.',
      model: 'الجلوس الطويل ونمط التنفّس والشاشات تعيد التحميل نفسه كل يوم، فالنتيجة تعود بنفس السرعة.',
      first: 'فحص مدى الحركة، القوة العميقة، ونمط الاستخدام اليومي للشاشات.',
    },
    shoulder: {
      label: 'الكتف أو الذراع',
      noise: '«كمادات، حزام، وأخفّ تمارين كتف.»',
      silent: 'صرت أوقف نفسي قبل أن أرفع شيئاً… أحسب حساب كل حركة بيدي.',
      model: 'تجنّب الحركة يضعف النسيج أكثر، فيصير الخوف هو المانع الحقيقي لا الإصابة.',
      first: 'تقييم الحركة الكتفية والقوة والمهام فوق الرأس.',
    },
    knee: {
      label: 'الركبة',
      noise: '«دعامة، إبرة، أو إنزال وزن.»',
      silent: 'أخاف أن تُقرّر الركبة عني: ألّا أصعد درجاً، ولا ألعب مع أولادي.',
      model: 'الخلل ميكانيكي ووظيفي؛ الحقن والدعامة يخفّفان الحمل ولا يبنيان القدرة.',
      first: 'قياس القوة والثبات واختبارات القفز/النزول التدريجي.',
    },
    sport: {
      label: 'إصابة رياضية',
      noise: '«أسرع عودة للملعب… بروتوكول مستورد.»',
      silent: 'خايف أرجع بدري وأنجرح مرة ثانية، وما أحد يتحمّل النتيجة غيري.',
      model: 'التصريح بالعودة بالتاريخ لا بالاختبار — هذا ما يجعل الإصابة الثانية تتكرّر.',
      first: 'اختبارات أداء نوعية للرياضة المستهدفة قبل أي تصريح بالعودة.',
    },
    postop: {
      label: 'ما بعد جراحة',
      noise: '«متى أمشي؟ ومعها بطاقة جلسات.»',
      silent: 'أخاف أن تتيبّس المفاصل ويصبح اعتمادي على الآخرين دائماً.',
      model: 'غياب خط زمني واضح يجعلك تتوقّع «المعجزة» ثم تُصاب بالإحباط في الأسبوع الثالث.',
      first: 'خط زمني مراحل ومهام أسبوعية واضحة، بالتعاون مع طبيبك.',
    },
    pelvic: {
      label: 'ما بعد الولادة أو صحة الحوض',
      noise: '«شدّ البطن… وحزام.»',
      silent: 'أحرج من أن أتكلّم عنه، وأخاف ألّا يعود جسدي كما كان.',
      model: 'التمارين العرضية بلا تقييم وظيفي تُبقي المشكلة، والحديث عنها يُؤجَّل فيزداد الوضع سوءاً.',
      first: 'تقييم وظيفي خاص وبيئة آمنة، وأهداف وظيفية لا تجميلية.',
    },
    neuro: {
      label: 'تأهيل عصبي أو حالة مزمنة',
      noise: '«أجهزة متطوّرة وبرنامج مكثّف.»',
      silent: 'أخشى أن أفقد استقلالي، وأن يصبح أهلي هم من يعتنون بي في كل شيء.',
      model: 'التركيز على «الأجهزة» بلا أهداف وظيفية يومية يُهدر الطاقة بلا استقلالية ملموسة.',
      first: 'أهداف استقلالية يومية (لبس، مشي، حمّام) وإشراك الأسرة كمدرَّب شريك.',
    },
  };

  const DURATIONS = {
    lt2: { label: 'أقل من أسبوعين', model: 'الخطر في هذه المرحلة قراران: راحة كاملة أو عودة مبكرة للتحميل. الاثنان يؤخّران التعافي.' },
    w2_6: { label: '2 – 6 أسابيع', model: 'غالباً هنا تُدار الأعراض: مسكّن، كمّادة، راحة… والسبب الوظيفي يبقى كما هو.' },
    w6_12: { label: '6 – 12 أسبوعاً', model: 'صارت المشكلة تُدار بالأعراض وحدها هنا، وهذا بالضبط ما يحوّل الحاد إلى نمط مزمن.' },
    gt12: { label: 'أكثر من 3 أشهر', model: 'الألم المزمن ليس ألماً أكبر، بل نظام عصبي متعلَّم — ويحتاج مقاربة مختلفة وأهدافاً تدريجية.' },
    many: { label: 'فترات متقطّعة منذ سنوات', model: 'النمط متكرر: تحسّن مؤقت ثم انتكاس. المتكرر هو الغائب عن أي خطة سابقة.' },
  };

  const CONCERNS = {
    recur: 'خوفي الأكبر أن يرجع الوجع بعدما أتحسّن، وأبدأ من الصفر من جديد.',
    burden: 'أشعر أنني صرت عبئاً على من حولي، ولا أريد أن يشفق عليّ أحد.',
    unvalidated: 'أحدهم قال لي «تحمّل، عادي» — وأنا أشعر أن ألمي لم يُصدَّق أصلاً.',
    meds: 'المسكّن يهدّي ساعات فقط… وأخاف أن أبقى معلّقاً عليه بقية عمري.',
    value: 'لا أعرف هل أواصل الدفع في الجلسات: لا أرى مؤشراً يقول إنني أتقدّم فعلاً.',
    surgery: 'أخاف أن تكون الجراحة هي الطريق الوحيد الباقي لي.',
    sport: 'أخاف أن أرجع للرياضة وأنجرح مرة ثانية، وما أحد يتحمّل النتيجة غيري.',
    guilt: 'أشعر بالذنب أنني تأخّرت في العلاج، أو أنني أهملت من أحب بسبب حالي.',
  };

  const LOADS = {
    desk: 'عمل مكتبي 8 ساعات',
    lift: 'حمل ورفع في العمل',
    training: 'رياضة أو تمارين منتظمة',
    stand: 'وقوف أو مشي طويل',
    drive: 'قيادة يومية مطوّلة',
    care: 'رعاية أطفال أو والدين',
    sleep: 'نوم قليل أو متأخر',
  };

  const SLEEP = {
    wakes: 'يوقظني من النوم',
    sometimes: 'يزعج نومي أحياناً',
    no: 'لا يؤثر على نومي',
  };

  const GOALS = {
    sport: 'العودة للرياضة أو التمرين',
    work: 'يوم عمل كامل بلا وجع',
    sleep: 'نوم متصل بلا انقطاع',
    carry: 'حمل طفلي ورفع الأشياء بثقة',
    walk: 'المشي مسافات طويلة بلا خوف',
    independence: 'استعادة استقلالي في يومي',
  };

  const STEPS = [
    {
      id: 'region', tag: 'المرآة', kind: 'chips', single: true, required: true,
      title: 'أين يشتدّ الأمر أساساً؟',
      hint: 'اختر المنطقة الأقرب لحالتك — الفحص ليس تشخيصاً طبياً.',
      options: Object.entries(REGIONS).map(([k, v]) => ({ value: k, label: v.label })),
    },
    {
      id: 'duration', tag: 'المرآة', kind: 'chips', single: true, required: true,
      title: 'منذ متى وأنت تحمل هذا؟',
      hint: 'المدة تغيّر المقاربة، لا الشدة فقط.',
      options: Object.entries(DURATIONS).map(([k, v]) => ({ value: k, label: v.label })),
    },
    {
      id: 'severity', tag: 'المرآة', kind: 'range', required: true,
      title: 'ما شدّة الألم في أسوأ ساعات اليوم؟',
      hint: 'قرّب المؤشر: 0 بلا ألم · 10 ألم لا يُحتمل.',
    },
    {
      id: 'sleep', tag: 'الصدمة الفكرية', kind: 'chips', single: true, required: true,
      title: 'وما فعلُ الألم بنومك؟',
      hint: 'النوم عامل تعافٍ حقيقي، لا تفصيل هامشي.',
      options: Object.entries(SLEEP).map(([k, v]) => ({ value: k, label: v })),
    },
    {
      id: 'concerns', tag: 'الصدمة الفكرية', kind: 'chips', single: false, required: true, max: 3,
      title: 'أي هذه العبارات تشبه ما تشعر به فعلاً؟',
      hint: 'اختر حتى ثلاثاً — هذه هي النواة الصلبة التي نحاول تسميتها.',
      options: Object.entries(CONCERNS).map(([k, v]) => ({ value: k, label: v })),
    },
    {
      id: 'loads', tag: 'الإطار الجديد', kind: 'chips', single: false, required: false,
      title: 'ما الذي يضغط على جسدك يومياً؟',
      hint: 'اختياري — لكن كلّما كان أدق، كان المسار واقعياً أكثر.',
      options: Object.entries(LOADS).map(([k, v]) => ({ value: k, label: v })),
    },
    {
      id: 'goal', tag: 'الحل', kind: 'chips', single: true, required: true,
      title: 'ما الهدف الذي تريد استعادته؟',
      hint: 'الهدف الوظيفي هو ما يجعل «التحسّن» قابلاً للقياس.',
      options: Object.entries(GOALS).map(([k, v]) => ({ value: k, label: v })),
    },
  ];

  /* -------------------------------- الحالة -------------------------------- */

  const state = { index: 0, answers: {} };
  let els = {};

  const escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  function toast(message, kind = 'ok') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.className = `toast toast--${kind} is-visible`;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('is-visible'), 3200);
  }

  /* ------------------------------ العرض (UI) ------------------------------ */

  function renderStep(step) {
    const q = document.createElement('div');
    q.className = 'quiz__step';
    q.dataset.step = step.id;

    const head = document.createElement('div');
    head.innerHTML = `<p class="quiz__q">${escapeHtml(step.title)}</p><p class="quiz__hint">${escapeHtml(step.hint || '')}</p>`;
    q.appendChild(head);

    if (step.kind === 'range') {
      const row = document.createElement('div');
      row.className = 'range-row';
      row.innerHTML = `
        <input type="range" min="0" max="10" step="1" value="${state.answers.severity ?? 5}" id="range-${step.id}"
               aria-label="${escapeHtml(step.title)}">
        <output class="range-value" id="rangeOut-${step.id}">${state.answers.severity ?? 5}</output>`;
      q.appendChild(row);

      const scale = document.createElement('div');
      scale.className = 'quiz__options';
      scale.style.marginTop = '14px';
      scale.innerHTML = ['0 · بلا ألم', '3 · خفيف', '5 · مزعج', '7 · يقيّدني', '10 · لا يُحتمل']
        .map((t) => `<span class="badge-soft">${t}</span>`).join('');
      q.appendChild(scale);

      const input = row.querySelector('input');
      const out = row.querySelector('output');
      const sync = () => {
        out.textContent = input.value;
        state.answers.severity = Number(input.value);
      };
      input.addEventListener('input', sync);
      sync();
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'quiz__options';
      step.options.forEach((opt) => {
        const current = state.answers[step.id];
        const checked = step.single ? current === opt.value : Array.isArray(current) && current.includes(opt.value);
        const label = document.createElement('label');
        label.className = 'chip';
        label.innerHTML = `
          <input type="${step.single ? 'radio' : 'checkbox'}" name="${step.id}" value="${escapeHtml(opt.value)}" ${checked ? 'checked' : ''}>
          <span>${escapeHtml(opt.label)}</span>`;
        wrap.appendChild(label);
      });
      q.appendChild(wrap);

      wrap.addEventListener('change', (event) => {
        const input = event.target;
        if (!input.matches('input')) return;
        if (step.single) {
          state.answers[step.id] = input.value;
        } else {
          const picked = Array.from(wrap.querySelectorAll('input:checked')).map((i) => i.value);
          if (step.max && picked.length > step.max) {
            input.checked = false;
            toast(`اختر ${step.max} كحد أقصى — رتّبها بحسب الأهمية.`, 'err');
            return;
          }
          state.answers[step.id] = picked;
        }
        clearError();
      });
    }

    if (step.required) {
      const err = document.createElement('span');
      err.className = 'error-msg';
      err.dataset.errorFor = step.id;
      err.style.display = 'none';
      q.appendChild(err);
    }
    return q;
  }

  function clearError() {
    const box = els.steps.querySelector('.quiz__step.is-active .error-msg');
    if (box) box.style.display = 'none';
  }

  function showError(step) {
    const box = els.steps.querySelector(`.quiz__step[data-step="${step.id}"] .error-msg`);
    if (box) {
      box.textContent = step.kind === 'range' ? 'حدّد درجة الألم من المؤشر.' : 'اختر إجابة للمتابعة.';
      box.style.display = 'block';
    }
  }

  function renderAll() {
    els.steps.innerHTML = '';
    STEPS.forEach((step) => els.steps.appendChild(renderStep(step)));

    els.dots.innerHTML = STEPS.map(() => '<span class="quiz__dot"></span>').join('');
    show(0);
  }

  function show(index) {
    state.index = Math.max(0, Math.min(index, STEPS.length - 1));
    const step = STEPS[state.index];

    els.steps.querySelectorAll('.quiz__step').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.step === step.id);
    });

    els.label.textContent = `الخطوة ${state.index + 1} من ${STEPS.length}`;
    els.tag.textContent = step.tag;
    els.bar.style.width = `${((state.index + 1) / STEPS.length) * 100}%`;

    els.dots.querySelectorAll('.quiz__dot').forEach((dot, i) => {
      dot.classList.toggle('is-done', i < state.index);
      dot.classList.toggle('is-current', i === state.index);
    });

    const last = state.index === STEPS.length - 1;
    els.prev.hidden = state.index === 0;
    els.next.hidden = last;
    els.finish.hidden = !last;
    els.reset.hidden = state.index === 0;
  }

  function answered(step) {
    const value = state.answers[step.id];
    if (step.kind === 'range') return typeof value === 'number';
    if (step.single) return Boolean(value);
    return Array.isArray(value) && value.length > 0;
  }

  function next() {
    const step = STEPS[state.index];
    if (step.required && !answered(step)) {
      showError(step);
      return;
    }
    if (state.index === STEPS.length - 1) return finish();
    show(state.index + 1);
  }

  /* ------------------------------- النتيجة ------------------------------- */

  function buildCard() {
    const a = state.answers;
    const region = REGIONS[a.region];
    const duration = DURATIONS[a.duration];
    const severity = Number(a.severity ?? 0);
    const concerns = (a.concerns || []).map((k) => CONCERNS[k]).filter(Boolean);
    const loads = (a.loads || []).map((k) => LOADS[k]).filter(Boolean);
    const goal = GOALS[a.goal];

    const chronic = ['w6_12', 'gt12', 'many'].includes(a.duration);
    const high = severity >= 7;

    const noise = `${region.noise} — وفي المدة: ${duration.label}.`;
    const silent = [
      concerns[0] || region.silent,
      concerns[1] || null,
    ].filter(Boolean).join(' ');

    const modelParts = [duration.model, region.model];
    if (a.sleep === 'wakes') modelParts.push('والنوم المتقطّع يمنع التعافي الليلي، فيصبح الألم أخفّ بالنهار وأثقل بالليل — وهو ما يُفسَّر غالباً خطأً بأن «الحالة تسوء».');
    if (high && chronic) modelParts.push('شدة عالية مع مدة طويلة تعني أن ما تحتاجه ليس مزيداً من الجلسات، بل تغيير النموذج: قياس، ثم تحميل تدريجي، ثم معايير عودة.');

    const phases = [
      {
        n: '0',
        title: 'تقييم وظيفي (45 دقيقة)',
        text: `${region.first} نحدّد خط أساس مكتوباً: الألم، المهام المتأثرة، والقدرة الحالية — قبل أي تدخل.`,
      },
      {
        n: '1',
        title: chronic ? 'بناء القدرة (4 – 10 أسابيع)' : 'بناء القدرة (2 – 6 أسابيع)',
        text: `تحميل تدريجي بمستويات محسوبة${loads.length ? `، مع تعديل: ${loads.slice(0, 3).join('، ')}` : ''}. تعليم نفسي لمعنى الألم، ومتابعة أسبوعية للالتزام لا للإحساس فقط.`,
      },
      {
        n: '2',
        title: 'الأداء والوقاية من الانتكاس',
        text: `الهدف: ${goal}. لا تصريح بالعودة إلا بعد اجتياز اختبار أداء، مع خطة مكتوبة لما تفعله عند أول إشارة ألم${a.sleep === 'wakes' ? '، وخطة لتحسين النوم' : ''}.`,
      },
    ];

    const whyNow = high || a.sleep === 'wakes'
      ? 'بما أن الشدة عالية والتأثير واضح، احجز تقييماً وظيفياً هذا الأسبوع ولا تؤجّله إلى «ما يهدأ». خذ معك: متى بدأ، ما يزيده، ما يهدّئه، ما جرّبته، وهدفك.'
      : 'احجز تقييماً وظيفياً خلال أسبوعين، قبل أن يتحوّل الحاد إلى مزمن. خذ معك: متى بدأ، ما يزيده، ما يهدّئه، وما جرّبته سابقاً.';

    return {
      createdAt: new Date().toISOString(),
      region: region.label,
      regionKey: a.region,
      duration: duration.label,
      severity,
      sleep: SLEEP[a.sleep] || '',
      concerns: (a.concerns || []).map((k) => CONCERNS[k]),
      loads,
      goal,
      noise,
      silent,
      model: modelParts.join(' '),
      phases,
      whyNow,
      note: 'مخرَج تحليلي من أداة فحص الفجوة — ليس تشخيصاً طبياً ولا خطة علاجية.',
    };
  }

  function cardToText(card) {
    return [
      'بطاقة الفجوة — العلاج الطبيعي والتأهيل (SmartKids)',
      '———————————————————————',
      `المنطقة: ${card.region}`,
      `المدة: ${card.duration}`,
      `شدّة الألم: ${card.severity}/10`,
      `الأثر على النوم: ${card.sleep}`,
      card.loads.length ? `الأحمال اليومية: ${card.loads.join('، ')}` : null,
      `الهدف المرجّح: ${card.goal}`,
      '',
      `الضجيج السائد في السوق: ${card.noise}`,
      `القلق غير المعلن: ${card.silent}`,
      `لماذا لم يكفِ النموذج السابق: ${card.model}`,
      '',
      'مسار مبدئي من ثلاث مراحل:',
      ...card.phases.map((p) => `  (${p.n}) ${p.title} — ${p.text}`),
      '',
      `الخطوة القابلة للتطبيق: ${card.whyNow}`,
      `تنبيه: ${card.note}`,
    ].filter((l) => l !== null).join('\n');
  }

  function fillResult(card) {
    document.getElementById('outNoise').textContent = card.noise;
    document.getElementById('outSilent').textContent = card.silent;
    document.getElementById('outModel').textContent = card.model;
    document.getElementById('resultSummary').textContent =
      `${card.region} · ${card.duration} · شدّة ${card.severity}/10 · الهدف: ${card.goal}`;
    document.getElementById('outPath').innerHTML = card.phases.map((p) => `
      <div class="result__phase">
        <span class="n">${escapeHtml(p.n)}</span>
        <div><strong>${escapeHtml(p.title)}</strong><p>${escapeHtml(p.text)}</p></div>
      </div>`).join('');
    document.getElementById('outNext').textContent = card.whyNow;
  }

  function finish() {
    const card = buildCard();
    state.card = card;
    fillResult(card);

    els.quiz.hidden = true;
    els.result.hidden = false;
    els.result.classList.add('is-active');
    if (els.result.scrollIntoView) els.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('بطاقة الفجوة جاهزة ✓', 'ok');
  }

  function reset() {
    state.index = 0;
    state.answers = {};
    state.card = null;
    els.result.hidden = true;
    els.result.classList.remove('is-active');
    els.quiz.hidden = false;
    renderAll();
    if (els.quiz.scrollIntoView) els.quiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ------------------------------- الربط ------------------------------- */

  function init() {
    const quiz = document.getElementById('gapQuiz');
    const result = document.getElementById('gapResult');
    if (!quiz || !result) return;

    els = {
      quiz,
      result,
      steps: document.getElementById('quizSteps'),
      bar: document.getElementById('quizBar'),
      label: document.getElementById('quizStepLabel'),
      tag: document.getElementById('quizTag'),
      dots: document.getElementById('quizDots'),
      prev: document.getElementById('quizPrev'),
      next: document.getElementById('quizNext'),
      finish: document.getElementById('quizFinish'),
      reset: document.getElementById('quizReset'),
    };

    els.next.addEventListener('click', next);
    els.finish.addEventListener('click', next);
    els.prev.addEventListener('click', () => show(state.index - 1));
    els.reset.addEventListener('click', reset);

    document.getElementById('copyCardBtn').addEventListener('click', async () => {
      if (!state.card) return;
      const text = cardToText(state.card);
      try {
        await navigator.clipboard.writeText(text);
        toast('نُسخت البطاقة إلى الحافظة ✓', 'ok');
      } catch {
        toast('تعذّر النسخ تلقائياً — حدّد النص يدوياً.', 'err');
      }
    });

    document.getElementById('useCardBtn').addEventListener('click', () => {
      if (!state.card) return;
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state.card));
      } catch { /* التخزين غير متاح */ }
    });

    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
