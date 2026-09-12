/* ==========================================================================
   dom-stub.js — محاكي DOM مصغّر للاختبار الآلي بلا متصفّح (لا اعتماديات خارجية)
   يدعم ما يحتاجه موقع لمسة: إنشاء/إلحاح عناصر، السمات وdataset، الأصناف،
   value/checked، والأحداث المتصاعدة (bubbling)، وquerySelectorAll المبسّط.
   ========================================================================== */
'use strict';

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this._attrs = {};
    this._classes = new Set();
    this.style = {};
    this._text = '';
    this._html = '';
    this._listeners = {};
    this.hidden = false;
    this.checked = false;
    this.value = '';
    const attrs = this._attrs;
    this.dataset = new Proxy({}, {
      get: (_, k) => attrs[`data-${String(k).replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`],
      set: (_, k, v) => { attrs[`data-${String(k).replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`] = String(v); return true; },
      has: (_, k) => (`data-${String(k).replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`) in attrs,
      deleteProperty: (_, k) => { delete attrs[`data-${String(k).replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`]; return true; },
    });
  }

  get id() { return this._attrs.id || ''; }
  set id(v) { this._attrs.id = String(v); }
  get href() { return this._attrs.href || ''; }
  set href(v) { this._attrs.href = String(v); }
  get src() { return this._attrs.src || ''; }
  set src(v) { this._attrs.src = String(v); }

  get className() { return [...this._classes].join(' '); }
  set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }

  get classList() {
    const self = this;
    return {
      add: (...c) => c.forEach((x) => x && self._classes.add(x)),
      remove: (...c) => c.forEach((x) => self._classes.delete(x)),
      contains: (c) => self._classes.has(c),
      toggle: (c, force) => {
        const on = force === undefined ? !self._classes.has(c) : !!force;
        on ? self._classes.add(c) : self._classes.delete(c);
        return on;
      },
    };
  }

  get value() { return 'value' in this._attrs ? this._attrs.value : ''; }
  set value(v) { this._attrs.value = String(v); }
  get checked() { return 'checked' in this._attrs && this._attrs.checked !== false; }
  set checked(v) { if (v) this._attrs.checked = true; else delete this._attrs.checked; }

  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }

  set innerHTML(v) {
    this._html = String(v);
    this.children = parseHTML(this._html);
    this.children.forEach((c) => { c.parentNode = this; });
  }
  get innerHTML() { return this._html; }

  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }

  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }

  /** يُشعل الحدث على هذا العنصر ثم يتصاعد إلى الآباء — كما في المتصفّح */
  dispatch(type, target) {
    let node = this;
    while (node) {
      const current = node;
      (node._listeners[type] || []).forEach((fn) => fn({ target: target || this, currentTarget: current, preventDefault() {} }));
      node = node.parentNode;
    }
  }

  setAttribute(k, v) {
    this._attrs[k] = String(v);
    if (k === 'class') this._classes = new Set(String(v).split(/\s+/).filter(Boolean));
    if (k === 'hidden') this.hidden = true;
  }
  getAttribute(k) {
    if (k === 'class') return this.className;
    if (k === 'id') return this._attrs.id;
    return k in this._attrs ? this._attrs[k] : null;
  }
  hasAttribute(k) { return k in this._attrs; }

  /* واجهات مستخدمة في الصفحة لكن لا معنى لها في الاختبار */
  focus() {}
  blur() {}
  scrollIntoView() {}
  reset() {
    walk(this, (n) => {
      if (n.tagName === 'INPUT') { if (n._attrs.type === 'checkbox' || n._attrs.type === 'radio') delete n._attrs.checked; else n._attrs.value = ''; }
      if (n.tagName === 'TEXTAREA' || n.tagName === 'SELECT') n._attrs.value = '';
    });
  }
  get firstChild() { return this.children[0] || null; }
  matches(sel) { return matchComplex(this, sel); }
  closest(sel) {
    let node = this;
    while (node) {
      if (matchComplex(node, sel)) return node;
      node = node.parentNode;
    }
    return null;
  }
  querySelectorAll(sel) {
    const out = [];
    walk(this, (n) => { if (matchComplex(n, sel)) out.push(n); });
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

function walk(node, fn) { node.children.forEach((c) => { fn(c); walk(c, fn); }); }

function matchSimple(el, sel) {
  const tokens = sel.match(/(^[a-zA-Z]+|#[\w-]+|\.[\w-]+|\[[^\]]+\]|:checked)/g) || [];
  if (!tokens.length) return false; // محدّد غير مدعوم لا يجب أن يطابق كل شيء
  return tokens.every((tk) => {
    if (tk.startsWith('#')) return el.getAttribute('id') === tk.slice(1);
    if (tk.startsWith('.')) return el._classes.has(tk.slice(1));
    if (tk === ':checked') return !!el.checked;
    if (tk.startsWith('[')) {
      const m = tk.match(/\[([\w-]+)(?:="([^"]*)")?\]/);
      if (!m) return false;
      const val = m[1] === 'class' ? el.className : el.getAttribute(m[1]);
      return m[2] === undefined ? val != null && val !== false : String(val) === m[2];
    }
    return el.tagName === tk.toUpperCase();
  });
}

function matchComplex(el, sel) {
  const parts = sel.trim().split(/\s+/);
  if (!matchSimple(el, parts[parts.length - 1])) return false;
  let node = el.parentNode;
  for (let i = parts.length - 2; i >= 0; i -= 1) {
    let found = false;
    while (node) {
      if (matchSimple(node, parts[i])) { found = true; node = node.parentNode; break; }
      node = node.parentNode;
    }
    if (!found) return false;
  }
  return true;
}

function parseHTML(html) {
  const root = new El('div');
  const stack = [root];
  const re = /<\/?([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*(\/?)>/g;
  let last = 0;
  let m = re.exec(html);
  while (m) {
    const text = html.slice(last, m.index);
    last = re.lastIndex;
    if (text.trim()) stack[stack.length - 1]._text += text;
    const [full, tag, attrStr, selfClose] = m;
    if (full.startsWith('</')) {
      if (stack.length > 1) stack.pop();
    } else {
      const el = new El(tag);
      (attrStr.match(/[\w:-]+(?:="[^"]*")?/g) || []).forEach((a) => {
        const [k, v] = a.split('=');
        el.setAttribute(k, v ? v.replace(/"/g, '') : true);
      });
      stack[stack.length - 1].appendChild(el);
      if (!/^(input|br|img|hr|meta|link|source|track|wbr|area|base|col|embed)$/i.test(tag) && !selfClose) stack.push(el);
    }
    m = re.exec(html);
  }
  const tail = html.slice(last);
  if (tail.trim()) root._text += tail;
  return root.children;
}

class MiniDoc {
  constructor() { this.map = new Map(); this._listeners = {}; }
  getElementById(id) { return this.map.get(id) || null; }
  createElement(tag) { return new El(tag); }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  fire(type) { (this._listeners[type] || []).forEach((fn) => fn({})); }
  register(id, tag = 'div') { const el = new El(tag); el.setAttribute('id', id); this.map.set(id, el); return el; }
  /** بحث مبسّط في العناصر المسجّلة وفروعها */
  querySelectorAll(sel) {
    const out = [];
    this.map.forEach((el) => {
      if (matchComplex(el, sel)) out.push(el);
      walk(el, (n) => { if (matchComplex(n, sel)) out.push(n); });
    });
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

module.exports = { El, MiniDoc, parseHTML, matchSimple, matchComplex };
