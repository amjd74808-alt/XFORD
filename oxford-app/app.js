(function () {
'use strict';

/* ================= الإعدادات ================= */
const LEVELS = ['A1', 'A2', 'B1', 'B2'];
const LEVEL_INFO = { A1: 'مبتدئ', A2: 'أساسي', B1: 'متوسط', B2: 'فوق المتوسط' };
const PASS = 90;
const MIN_TEST = 10;                       // أقل عدد كلمات محفوظة لأي اختبار
const QUICK_N = 10;                        // الاختبار السريع
const LEVEL_OPTS = [100, 150, 200, 250, 300];
const LEARNED_OPTS = [10, 20, 50, 100, 150, 200, 250, 300];
const WORDS = window.OXFORD_WORDS || [];
const BY_LEVEL = {};
LEVELS.forEach(L => BY_LEVEL[L] = WORDS.filter(w => w.level === L));
const WORD_LEVEL = {};
WORDS.forEach(w => WORD_LEVEL[w.w] = w.level);
const MIXES = [['A1','A2'], ['A2','B1'], ['B1','B2'], ['A1','B1'], ['A2','B2'], LEVELS]
  .map(lv => ({ id: 'mix:' + lv.join('-'), levels: lv }));

/* ================= التخزين ================= */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
let learned = store.get('ox_learned', {});
let records = store.get('ox_records', null);
if (!records) {
  records = {};
  const old = store.get('ox_tests', null);
  if (old && old.levels) Object.keys(old.levels).forEach(L => records['level:' + L] = { best: old.levels[L].best, attempts: old.levels[L].attempts });
}
let mistakes = store.get('ox_mistakes', {});
let custom = store.get('ox_custom', {});
let trans = store.get('ox_trans', {});
if (store.get('ox_trans_v', 0) < 3) { trans = {}; store.set('ox_trans_v', 3); store.set('ox_trans', trans); }
function saveAll() {
  store.set('ox_learned', learned); store.set('ox_records', records); store.set('ox_mistakes', mistakes);
  store.set('ox_custom', custom); store.set('ox_trans', trans);
}
saveAll();

/* ================= أدوات ================= */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const app = $('#app');
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sample = (a, k) => shuffle(a).slice(0, k);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2600); }
function setActiveNav(v) { $$('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === v)); }

function levelDone(L) { return BY_LEVEL[L].every(w => learned[w.w]); }
function levelCount(L) { return BY_LEVEL[L].filter(w => learned[w.w]).length; }
function learnedIn(levels) { return WORDS.filter(w => levels.includes(w.level) && learned[w.w]); }
function mistakeWords() { return WORDS.filter(w => mistakes[w.w]); }
function bestOf(id) { return records[id] ? records[id].best : null; }
function passed(id) { const b = bestOf(id); return b !== null && b >= PASS; }
function isUnlocked(L) { const i = LEVELS.indexOf(L); return i === 0 || passed('level:' + LEVELS[i - 1]); }
function firstUnlocked() { return LEVELS.filter(isUnlocked).pop() || 'A1'; }

/* ================= النطق ================= */
function speak(text, slow) {
  if (!('speechSynthesis' in window)) { toast('المتصفح لا يدعم النطق'); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US'; u.rate = slow ? 0.55 : 0.95;
  speechSynthesis.speak(u);
}

/* ================= المعنى بالعربي ================= */
const AR = /[\u0600-\u06FF]/;
async function getMeaning(word) {
  if (custom[word]) return { text: custom[word], src: 'معنى تكتبه بنفسك' };
  if (trans[word]) return { text: trans[word], src: 'ترجمة تلقائية' };
  try {
    const r = await fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(word) + '&langpair=en|ar');
    const j = await r.json();
    const cands = [];
    (j.matches || []).forEach(m => {
      const seg = String(m.segment || '').trim().toLowerCase();
      const t = String(m.translation || '').trim();
      if (t && AR.test(t) && seg === word.toLowerCase()) cands.push({ t, q: Number(m.quality) || 0 });
    });
    cands.sort((a, b) => b.q - a.q);
    const parts = [];
    cands.forEach(c => c.t.split(/[;،,]/).forEach(p => {
      p = p.trim();
      if (p && AR.test(p) && !parts.includes(p) && parts.length < 4) parts.push(p);
    }));
    if (!parts.length && j.responseData && AR.test(j.responseData.translatedText || '')) parts.push(j.responseData.translatedText.trim());
    if (parts.length) { const text = parts.join('، '); trans[word] = text; saveAll(); return { text, src: 'ترجمة تلقائية، راجعها وعدّلها إن لزم' }; }
    return { text: '', src: 'لم يُعثر على معنى دقيق، اضغط تعديل وأضفه' };
  } catch (e) {
    return { text: '', src: 'تعذر الاتصال، تحقق من الإنترنت' };
  }
}
async function showMeaning(row, word) {
  const box = row.querySelector('.meaning');
  box.hidden = false; box.innerHTML = 'جاري جلب المعنى...';
  const m = await getMeaning(word);
  box.innerHTML = (m.text ? `<b>${esc(m.text)}</b>` : '<span class="muted">—</span>')
    + ` <span class="muted">(${esc(m.src)})</span>
    <div class="row-gap"><button class="btn ghost small" data-act="edit" data-w="${esc(word)}">✏️ تعديل</button></div>`;
}
function editMeaning(row, word) {
  const cur = custom[word] || trans[word] || '';
  const v = prompt('اكتب معنى الكلمة بالعربي (اتركه فارغاً للحذف):', cur);
  if (v === null) return;
  if (v.trim()) custom[word] = v.trim(); else delete custom[word];
  saveAll();
  if (row.querySelector('.meaning') && !document.querySelector('#meaningsList')) showMeaning(row, word);
  else showMeanings();
}

/* ================= التنقل ================= */
$$('[data-nav]').forEach(b => b.addEventListener('click', () => {
  const v = b.dataset.nav;
  if (v === 'home') showHome();
  if (v === 'words') showWords(firstUnlocked());
  if (v === 'tests') showTests();
}));

/* ================= الرئيسية ================= */
function showHome() {
  setActiveNav('home'); window.scrollTo(0, 0);
  const total = WORDS.length, got = WORDS.filter(w => learned[w.w]).length;
  const cards = LEVELS.map(L => {
    const n = levelCount(L), tot = BY_LEVEL[L].length, pct = Math.round(n / tot * 100);
    let badge;
    if (!isUnlocked(L)) badge = '<span class="badge locked">🔒 مقفل</span>';
    else if (passed('level:' + L)) badge = `<span class="badge ok">✅ ${bestOf('level:' + L)}%</span>`;
    else badge = '<span class="badge warn">📖 قيد التعلم</span>';
    return `<div class="card"><div class="level-card"><div><div class="name">${L} - ${LEVEL_INFO[L]}</div>
      <div class="sub">${n} من ${tot} كلمة محفوظة</div></div>${badge}</div>
      <div class="progress"><span style="width:${pct}%"></span></div></div>`;
  }).join('');
  app.innerHTML = `<h2>تقدمك</h2>
    <div class="card center"><div class="name">${got} من ${total} كلمة محفوظة</div>
      <div class="progress"><span style="width:${Math.round(got / total * 100)}%"></span></div></div>
    <p class="muted" style="margin-bottom:12px">احفظ كلمات المستوى، ثم اجتز اختبار المستوى بنسبة 90% أو أكثر لفتح المستوى التالي.</p>
    ${cards}
    <h2 style="margin-top:16px">أدوات</h2>
    <div class="card">
      <div class="row-gap" style="margin-top:0">
        <button class="btn small" id="meaningsBtn">🔎 مراجعة المعاني</button>
        <button class="btn small" id="mistakesBtn">❌ مراجعة الأخطاء (${Object.keys(mistakes).length})</button>
      </div>
    </div>
    <div class="card">
      <div class="row-gap" style="margin-top:0">
        <button class="btn small" id="backupBtn">⬇️ حفظ نسخة</button>
        <button class="btn ghost small" id="restoreBtn">⬆️ استرجاع نسخة</button>
        <input type="file" id="restoreFile" accept="application/json" hidden>
      </div>
      <p class="muted" style="margin-top:8px">التقدم محفوظ على هذا الجهاز. احفظ نسخة لنقله لجهاز آخر.</p>
    </div>
    <div class="card center"><button class="btn danger small" id="resetBtn">إعادة ضبط كل التقدم</button></div>`;
  $('#meaningsBtn').onclick = showMeanings;
  $('#mistakesBtn').onclick = showMistakes;
  $('#backupBtn').onclick = backup;
  $('#restoreBtn').onclick = () => $('#restoreFile').click();
  $('#restoreFile').onchange = e => e.target.files[0] && restore(e.target.files[0]);
  $('#resetBtn').onclick = () => {
    if (confirm('حذف كل التقدم والنتائج والأخطاء؟')) { learned = {}; records = {}; mistakes = {}; custom = {}; trans = {}; saveAll(); showHome(); }
  };
}
function backup() {
  const data = { version: 3, learned, records, mistakes, custom, trans };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  a.download = 'oxford3000-backup.json';
  a.click();
}
function restore(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      learned = d.learned || {}; records = d.records || {}; mistakes = d.mistakes || {};
      custom = d.custom || {}; trans = d.trans || {};
      saveAll(); toast('تم استرجاع النسخة'); showHome();
    } catch (e) { toast('الملف غير صالح'); }
  };
  r.readAsText(file);
}

/* ================= الكلمات ================= */
let wLevel = 'A1', wAll = false, wQuery = '', wLimit = 100;
function showWords(level) {
  setActiveNav('words');
  if (level) { wLevel = level; wAll = false; }
  if (!isUnlocked(wLevel)) wLevel = firstUnlocked();
  wLimit = 100; renderWordsView();
}
function renderWordsView() {
  const tabs = LEVELS.map(L => `<button data-lvl="${L}" class="${!wAll && L === wLevel ? 'active' : ''}" ${isUnlocked(L) ? '' : 'disabled'}>${isUnlocked(L) ? '' : '🔒 '}${L}</button>`).join('')
    + `<button data-lvl="ALL" class="${wAll ? 'active' : ''}">الكل</button>`;
  const extra = !wAll && isUnlocked(wLevel)
    ? `<button class="btn ghost small" id="markAll">✔️ تحديد كل ${wLevel} كمحفوظ</button>` +
      (levelCount(wLevel) >= MIN_TEST ? `<button class="btn small" id="quickBtn">🧪 اختبار سريع (10)</button>` : '')
    : '';
  app.innerHTML = `<h2>الكلمات</h2>
    <div class="tabs">${tabs}</div>
    <div class="row-gap" style="margin:0 0 10px;justify-content:space-between;align-items:center">
      <span class="muted" id="countLine"></span>${extra}</div>
    <input type="search" id="searchBox" placeholder="ابحث عن كلمة..." value="${esc(wQuery)}">
    <div id="wordList"></div>`;
  $$('.tabs button[data-lvl]').forEach(b => b.onclick = () => {
    if (b.dataset.lvl === 'ALL') wAll = true; else { wAll = false; wLevel = b.dataset.lvl; }
    wQuery = ''; wLimit = 100; renderWordsView();
  });
  $('#searchBox').oninput = e => { wQuery = e.target.value; wLimit = 100; renderWordList(); };
  if ($('#markAll')) $('#markAll').onclick = () => {
    if (confirm(`تحديد كل كلمات ${wLevel} كمحفوظة؟`)) { BY_LEVEL[wLevel].forEach(w => learned[w.w] = true); saveAll(); renderWordsView(); toast('تم التحديد'); }
  };
  if ($('#quickBtn')) $('#quickBtn').onclick = () => startTest('quick:' + wLevel, QUICK_N);
  renderWordList();
}
function renderWordList() {
  const pool = wAll ? WORDS.filter(w => isUnlocked(w.level)) : BY_LEVEL[wLevel];
  const q = wQuery.trim().toLowerCase();
  const list = pool.filter(w => !q || w.w.toLowerCase().includes(q));
  const got = pool.filter(w => learned[w.w]).length;
  $('#countLine').textContent = `محفوظ ${got} من ${pool.length}`;
  const shown = list.slice(0, wLimit);
  $('#wordList').innerHTML = shown.map(wordRow).join('')
    + (list.length > shown.length ? `<button class="btn full" id="moreBtn" style="margin-top:6px">عرض المزيد (${list.length - shown.length} متبقية)</button>` : '');
  if ($('#moreBtn')) $('#moreBtn').onclick = () => { wLimit += 100; renderWordList(); };
}
function wordRow(w) {
  const k = esc(w.w);
  return `<div class="word-row">
    <div class="word-top">
      <div><div class="word-text">${k}</div><div class="word-pos">${esc(w.pos)} · ${w.level}</div></div>
      <div class="word-actions">
        <button class="speak-btn" data-act="speak" data-w="${k}" title="نطق">🔊</button>
        <button class="btn ghost small" data-act="slow" data-w="${k}" title="نطق بطيء">🐢</button>
        <button class="btn ghost small" data-act="meaning" data-w="${k}">المعنى</button>
      </div>
    </div>
    <label class="learned-label"><input type="checkbox" data-act="learn" data-w="${k}" ${learned[w.w] ? 'checked' : ''}> حفظتها</label>
    <div class="meaning" hidden></div>
  </div>`;
}

// تفويض الأحداث داخل التطبيق
app.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const w = b.dataset.w || '', act = b.dataset.act, row = b.closest('.word-row');
  if (act === 'speak') speak(w, false);
  else if (act === 'slow') speak(w, true);
  else if (act === 'meaning') showMeaning(row, w);
  else if (act === 'edit') editMeaning(row, w);
  else if (act === 'refetch') { delete trans[w]; saveAll(); showMeaning(row, w); }
  else if (act === 'forget') { if (confirm('حذف هذا المعنى؟')) { delete trans[w]; delete custom[w]; saveAll(); showMeanings(); } }
  else if (act === 'clearAuto') { if (confirm('حذف كل الترجمات التلقائية؟ المعاني التي كتبتها تبقى.')) { trans = {}; saveAll(); showMeanings(); } }
  else if (act === 'done') { delete mistakes[w]; saveAll(); showMistakes(); }
});
app.addEventListener('change', e => {
  const c = e.target.closest('[data-act="learn"]');
  if (!c) return;
  const w = c.dataset.w, lvl = WORD_LEVEL[w];
  if (c.checked) learned[w] = true; else delete learned[w];
  saveAll();
  if (!c.checked || !lvl) return;
  const cnt = levelCount(lvl);
  if (levelDone(lvl)) toast(`أحسنت! حفظت كل كلمات ${lvl}. يمكنك الآن أخذ اختبار ${lvl}`);
  else if (cnt >= MIN_TEST && cnt % 10 === 0 && confirm(`حفظت ${cnt} كلمة من ${lvl}. هل تريد اختبار نفسك الآن على 10 كلمات من التي حفظتها؟`))
    startTest('quick:' + lvl, QUICK_N);
});

/* ================= المعاني ================= */
function showMeanings() {
  setActiveNav('home'); window.scrollTo(0, 0);
  const list = WORDS.filter(w => trans[w.w] || custom[w.w]);
  const rows = list.map(w => {
    const k = esc(w.w), isC = !!custom[w.w], txt = custom[w.w] || trans[w.w];
    return `<div class="word-row">
      <div class="word-top"><div><div class="word-text">${k}</div><div class="word-pos">${esc(w.pos)} · ${w.level}</div></div>
        <button class="speak-btn small-speak" data-act="speak" data-w="${k}">🔊</button></div>
      <div class="meaning" style="display:block"><b>${esc(txt)}</b> <span class="muted">(${isC ? 'معنى تكتبه بنفسك' : 'ترجمة تلقائية'})</span></div>
      <div class="row-gap">
        <button class="btn ghost small" data-act="edit" data-w="${k}">✏️ تعديل</button>
        <button class="btn ghost small" data-act="refetch" data-w="${k}">🔄 إعادة جلب</button>
        <button class="btn danger small" data-act="forget" data-w="${k}">🗑 حذف</button>
      </div></div>`;
  }).join('');
  app.innerHTML = `<h2>مراجعة المعاني</h2>
    <div class="card"><div class="row-gap" style="margin-top:0;justify-content:space-between;align-items:center">
      <span class="muted" id="meaningsList">المعاني المحفوظة: ${list.length}</span>
      ${trans && Object.keys(trans).length ? '<button class="btn danger small" data-act="clearAuto">مسح الترجمات التلقائية</button>' : ''}</div>
      <p class="muted" style="margin-top:8px">الترجمة التلقائية تُجلب من الإنترنت وقد تحتاج تصحيحاً. اضغط ✏️ لكتابة المعنى الصحيح، فيُستخدم بدلها.</p></div>
    ${rows || '<div class="card center muted">لا توجد معاني محفوظة بعد. افتح أي كلمة واضغط "المعنى".</div>'}
    <div class="row-gap" style="justify-content:center"><button class="btn ghost small" id="backHome">رجوع</button></div>`;
  $('#backHome').onclick = showHome;
}

/* ================= الاختبارات ================= */
function configFor(id, n) {
  const [type, rest] = id.split(':');
  if (type === 'level') return { id, name: 'اختبار المستوى ' + rest, kind: 'level', levels: [rest], pool: 'all', n: n || 100 };
  if (type === 'learned') return { id, name: 'محفوظات ' + rest, kind: 'learned', levels: [rest], pool: 'learned', n: n || 50 };
  if (type === 'quick') return { id, name: 'اختبار سريع: ' + rest, kind: 'learned', levels: [rest], pool: 'learned', n: QUICK_N };
  if (type === 'mix') { const lv = rest.split('-'); return { id, name: 'شامل: ' + lv.join(' + '), kind: 'mixed', levels: lv, pool: 'learned', n: n || 50 }; }
  if (type === 'mistakes') return { id: 'mistakes', name: 'مراجعة الأخطاء', kind: 'mistakes', levels: LEVELS, pool: 'mistakes', n: n || 10 };
  return null;
}
function getPool(cfg) {
  if (cfg.pool === 'all') return BY_LEVEL[cfg.levels[0]];
  if (cfg.pool === 'learned') return learnedIn(cfg.levels);
  return mistakeWords();
}
function available(cfg) {
  if (cfg.kind === 'level') {
    const L = cfg.levels[0], unlocked = isUnlocked(L), done = levelDone(L);
    return { ok: unlocked && done, reason: !unlocked ? 'مقفل: اجتز المستوى السابق أولاً' : `احفظ كل كلمات ${L} أولاً (${levelCount(L)} / ${BY_LEVEL[L].length})` };
  }
  const size = getPool(cfg).length;
  return { ok: size >= MIN_TEST, reason: `تحتاج ${MIN_TEST} كلمات على الأقل (لديك ${size})` };
}
function countOptions(cfg) {
  const size = getPool(cfg).length;
  const base = cfg.kind === 'level' ? LEVEL_OPTS : LEARNED_OPTS;
  return base.filter(n => n <= size);
}
function showTests() {
  setActiveNav('tests'); window.scrollTo(0, 0);
  const groups = [
    ['level', 'اختبارات المستويات', LEVELS.map(L => 'level:' + L)],
    ['learned', 'اختبارات محفوظاتي حسب المستوى', LEVELS.map(L => 'learned:' + L)],
    ['mixed', 'اختبارات شاملة لكلماتي المحفوظة', MIXES.map(m => m.id)]
  ];
  let html = '<h2>الاختبارات</h2>';
  groups.forEach(([g, title, ids]) => {
    html += `<h2 style="margin-top:14px;font-size:16px">${title}</h2>`;
    ids.forEach(id => {
      const cfg = configFor(id), av = available(cfg), b = bestOf(id);
      const status = av.ok
        ? (b === null ? '<span class="badge">جاهز</span>' : `<span class="badge ${b >= PASS ? 'ok' : 'warn'}">أفضل نتيجة ${b}%</span>`)
        : `<span class="badge locked">🔒 ${esc(av.reason)}</span>`;
      const opts = countOptions(cfg).map(n => `<option value="${n}">${n} سؤال</option>`).join('');
      const control = av.ok
        ? `<div class="row-gap" style="margin-top:8px"><select class="cnt" data-sel="${id}">${opts}</select>
           <button class="btn small" data-start="${id}">${b === null ? 'ابدأ' : 'إعادة'}</button></div>` : '';
      html += `<div class="card"><div class="name" style="font-size:16px">${cfg.name}</div>
        <div style="margin-top:6px">${status}</div>${control}</div>`;
    });
  });
  const mcount = Object.keys(mistakes).length;
  html += `<h2 style="margin-top:14px;font-size:16px">الأخطاء</h2>
    <div class="card"><div class="name" style="font-size:16px">❌ مراجعة الأخطاء</div>
    <div class="sub">${mcount ? `لديك ${mcount} كلمة في قسم الأخطاء` : 'لا توجد أخطاء حالياً'}</div>
    <div class="row-gap"><button class="btn small" id="openMistakes">فتح قسم مراجعة الأخطاء</button></div></div>`;
  app.innerHTML = html;
  $$('[data-start]').forEach(b => b.onclick = () => {
    const sel = document.querySelector(`[data-sel="${b.dataset.start}"]`);
    startTest(b.dataset.start, Number(sel.value));
  });
  $('#openMistakes').onclick = showMistakes;
}

function showMistakes() {
  setActiveNav('tests'); window.scrollTo(0, 0);
  const list = mistakeWords(), n = list.length;
  const cfg = configFor('mistakes');
  const opts = countOptions(cfg).map(x => `<option value="${x}">${x} سؤال</option>`).join('');
  const quiz = n >= MIN_TEST
    ? `<div class="row-gap"><select class="cnt" id="mistakeCnt">${opts}</select><button class="btn small" id="startMistakes">ابدأ اختبار المراجعة</button></div>`
    : `<p class="muted">تحتاج ${MIN_TEST} أخطاء على الأقل لبدء اختبار المراجعة (لديك ${n})</p>`;
  const rows = list.map(w => {
    const k = esc(w.w);
    return `<div class="word-row">
      <div class="word-top"><div><div class="word-text">${k}</div><div class="word-pos">${esc(w.pos)} · ${w.level}</div></div>
        <div class="word-actions">
          <button class="speak-btn" data-act="speak" data-w="${k}">🔊</button>
          <button class="btn ghost small" data-act="meaning" data-w="${k}">المعنى</button>
        </div></div>
      <div class="meaning" hidden></div>
      <div class="row-gap"><button class="btn ghost small" data-act="done" data-w="${k}">✅ تمت مراجعتها</button></div>
    </div>`;
  }).join('');
  app.innerHTML = `<h2>مراجعة الأخطاء</h2>
    <div class="card"><div class="name" style="font-size:16px">الكلمات التي أخطأت فيها: ${n}</div>
      <p class="muted" style="margin-top:6px">تُضاف الكلمة هنا عند الخطأ في أي اختبار، وتُزال عند الإجابة الصحيحة في اختبار المراجعة أو عند الضغط على "تمت مراجعتها".</p>
      ${quiz}</div>
    ${rows || '<div class="card center muted">لا توجد أخطاء. ممتاز!</div>'}
    <div class="row-gap" style="justify-content:center"><button class="btn ghost small" id="backTests">رجوع</button></div>`;
  if ($('#startMistakes')) $('#startMistakes').onclick = () => startTest('mistakes', Number($('#mistakeCnt').value));
  $('#backTests').onclick = showTests;
}

function makeQuestions(cfg) {
  const pool = getPool(cfg);
  const all = WORDS.filter(w => cfg.levels.includes(w.level));
  const picks = shuffle(pool).slice(0, Math.min(cfg.n, pool.length));
  return picks.map((w, i) => {
    const others = sample(all.filter(x => x.w !== w.w), 3).map(x => x.w);
    const idxs = [];
    for (let k = 1; k < w.w.length; k++) if (/[a-z]/i.test(w.w[k])) idxs.push(k);
    if (i % 2 === 1 && w.w.length >= 4 && idxs.length) {
      const idx = idxs[Math.floor(Math.random() * idxs.length)];
      const ans = w.w[idx].toLowerCase();
      const masked = w.w.slice(0, idx) + '_' + w.w.slice(idx + 1);
      const wrong = sample('aeiourstnlcdmpgbhk'.split('').filter(c => c !== ans), 3);
      return { type: 'letter', word: w.w, masked, answer: ans, opts: shuffle([ans, ...wrong]) };
    }
    return { type: 'listen', word: w.w, answer: w.w, opts: shuffle([w.w, ...others]) };
  });
}

let quiz = null;
function backFor(id) {
  if (id === 'mistakes') return showMistakes;
  if (id.startsWith('quick:')) return () => showWords(id.split(':')[1]);
  return showTests;
}
function startTest(id, n) {
  const cfg = configFor(id, n);
  if (!cfg) return;
  const av = available(cfg);
  if (!av.ok) { toast(av.reason); return; }
  cfg.n = Math.min(n || cfg.n, getPool(cfg).length);
  quiz = { cfg, qs: makeQuestions(cfg), i: 0, correct: 0, answered: false, wrong: [], back: backFor(id) };
  renderQuestion();
}
function renderQuestion() {
  const q = quiz.qs[quiz.i], n = quiz.qs.length;
  const pct = Math.round(quiz.i / n * 100);
  const body = q.type === 'listen'
    ? '<p class="muted">استمع واختر الكلمة الصحيحة</p><button class="speak-btn" id="playBtn">🔊</button>'
    : `<p class="muted">اختر الحرف الناقص</p><div class="q-word">${esc(q.masked)}</div>`;
  const opts = q.opts.map(o => `<button class="opt" data-opt="${esc(o)}">${esc(o)}</button>`).join('');
  app.innerHTML = `<h2>${esc(quiz.cfg.name)}</h2>
    <div class="q-title">سؤال ${quiz.i + 1} من ${n} · صحيح: ${quiz.correct} · خطأ: ${quiz.wrong.length}</div>
    <div class="progress"><span style="width:${pct}%"></span></div>
    <div class="card center" style="margin-top:12px">${body}<div class="opts">${opts}</div>
      <div class="row-gap" id="nextRow"></div></div>
    <div class="row-gap"><button class="btn ghost small" id="quitBtn">إنهاء الاختبار</button></div>`;
  if (q.type === 'listen') {
    $('#playBtn').onclick = () => speak(q.word, false);
    setTimeout(() => speak(q.word, false), 300);
  }
  $$('.opt').forEach(b => b.onclick = () => answer(b, q));
  $('#quitBtn').onclick = () => { if (confirm('إنهاء الاختبار؟ لن تُحفظ النتيجة.')) { const back = quiz.back; quiz = null; back(); } };
}
function answer(btn, q) {
  if (quiz.answered) return;
  quiz.answered = true;
  const ok = btn.dataset.opt.toLowerCase() === String(q.answer).toLowerCase();
  if (ok) {
    quiz.correct++;
    if (quiz.cfg.kind === 'mistakes') delete mistakes[q.word];
  } else {
    quiz.wrong.push(q.word);
    mistakes[q.word] = true;
  }
  saveAll();
  $$('.opt').forEach(b => {
    b.disabled = true;
    if (b.dataset.opt.toLowerCase() === String(q.answer).toLowerCase()) b.classList.add('correct');
  });
  if (!ok) btn.classList.add('wrong');
  speak(q.word, false);
  const last = quiz.i === quiz.qs.length - 1;
  $('#nextRow').innerHTML = `<button class="btn full" id="nextBtn">${last ? 'عرض النتيجة' : 'التالي'}</button>`;
  $('#nextBtn').onclick = () => { quiz.answered = false; if (last) finishTest(); else { quiz.i++; renderQuestion(); } };
}
function finishTest() {
  const { cfg, qs, correct, back } = quiz;
  const score = Math.round(correct / qs.length * 100);
  const passedNow = score >= PASS;
  const idx = LEVELS.indexOf(cfg.levels[0]);
  const next = cfg.kind === 'level' && idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;
  const wasNextUnlocked = next ? isUnlocked(next) : true;

  const rec = records[cfg.id] || { best: 0, attempts: 0 };
  rec.best = Math.max(rec.best, score);
  rec.attempts += 1; rec.last = score;
  rec.date = new Date().toLocaleDateString('ar');
  records[cfg.id] = rec;
  saveAll();

  const extra = next && passedNow && !wasNextUnlocked
    ? `<p class="result-pass" style="margin-top:10px">🎉 تم فتح مستوى ${next}!</p>` : '';
  const wrongUnique = [...new Set(quiz.wrong)];
  const wrongHtml = wrongUnique.length ? `
    <div class="card" style="margin-top:12px">
      <b>الكلمات التي أخطأت فيها (${wrongUnique.length})</b> <span class="muted">تُضاف لقسم مراجعة الأخطاء</span>
      <div class="wrong-list">${wrongUnique.map(w => `<span class="wrong-chip"><button class="speak-btn small-speak" data-say="${esc(w)}">🔊</button>${esc(w)}</span>`).join('')}</div>
      <div class="row-gap"><button class="btn ghost small" id="reviewBtn">فتح مراجعة الأخطاء</button></div>
    </div>` : '';
  quiz = null;
  app.innerHTML = `<h2>${esc(cfg.name)}</h2>
    <div class="card center">
      <div class="score ${passedNow ? 'result-pass' : 'result-fail'}">${score}%</div>
      <p>الإجابات الصحيحة: ${correct} من ${qs.length}</p>
      <p style="margin-top:10px" class="${passedNow ? 'result-pass' : 'result-fail'}">${passedNow ? '✅ ممتاز! نجحت' : '❌ لم تصل إلى 90%، حاول مرة أخرى'}</p>
      ${extra}
      <div class="row-gap" style="justify-content:center">
        <button class="btn" id="retryBtn">إعادة الاختبار</button>
        <button class="btn ghost" id="backBtn">رجوع</button>
      </div>
    </div>${wrongHtml}`;
  $('#retryBtn').onclick = () => startTest(cfg.id, qs.length);
  $('#backBtn').onclick = back;
  if ($('#reviewBtn')) $('#reviewBtn').onclick = showMistakes;
  $$('[data-say]').forEach(b => b.onclick = () => speak(b.dataset.say, false));
  setActiveNav(cfg.kind === 'level' ? 'home' : 'tests');
}

/* ================= تثبيت التطبيق ================= */
let deferredPrompt = null;
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
if (!isStandalone) $('#installBtn').hidden = false;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; $('#installBtn').hidden = false; });
window.addEventListener('appinstalled', () => { $('#installBtn').hidden = true; deferredPrompt = null; toast('تم تثبيت التطبيق على جهازك ✅'); });
function showInstallHelp(title, lines) {
  const box = document.createElement('div');
  box.id = 'installHelp';
  box.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:50;padding:16px';
  box.innerHTML = `<div class="card" style="max-width:420px;margin:0;text-align:right">
    <h2>${esc(title)}</h2>${lines.map(l => `<p style="margin:8px 0">${esc(l)}</p>`).join('')}
    <div class="row-gap" style="justify-content:flex-start"><button class="btn small" id="closeHelp">حسناً</button></div></div>`;
  document.body.appendChild(box);
  box.querySelector('#closeHelp').onclick = () => box.remove();
  box.onclick = e => { if (e.target === box) box.remove(); };
}
$('#installBtn').onclick = async () => {
  if (!secure) {
    showInstallHelp('يلزم فتح الموقع من رابط https', [
      'التثبيت لا يعمل وأنت تفتح الملف محلياً أو من رابط غير آمن.',
      'ارفع مجلد التطبيق على استضافة مثل Netlify أو GitHub Pages، ثم افتح الرابط الجديد وجرّب التثبيت.']);
    return;
  }
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null;
    if (choice && choice.outcome === 'accepted') $('#installBtn').hidden = true;
    return;
  }
  if (isIOS) {
    showInstallHelp('التثبيت على iPhone', [
      '1) افتح الموقع في متصفح Safari (لا يعمل في Chrome على iPhone).',
      '2) اضغط زر المشاركة (المربع مع السهم للأعلى).',
      '3) اختر "إضافة إلى الشاشة الرئيسية".']);
  } else {
    showInstallHelp('التثبيت على Android أو الكمبيوتر', [
      'من قائمة المتصفح (⋮ أو أيقونة التثبيت في شريط العنوان) اختر "تثبيت التطبيق" أو "Install app".',
      'إذا لم يظهر الخيار: تأكد أنك في Chrome أو Edge، وأن الصفحة مفتوحة من رابط https، ثم أعد تحميل الصفحة مرة واحدة.']);
  }
};
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

showHome();
})();
