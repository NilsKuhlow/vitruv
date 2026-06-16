/* ============================================================
   Vitruv — app logic
   Flashcard spaced repetition (Leitner), self-assessed.
   Vanilla JS, localStorage. No build, no dependencies.
   ============================================================ */
'use strict';

const STORAGE_KEY = 'vitruv-state-v1';
const ONBOARD_KEY = 'vitruv-onboarded';
const SCHEMA_VERSION = 1;
const BOX_INTERVAL = [0, 1, 3, 7, 14];   // days until due, per box (1..5)
const AHEAD_LIMIT = 20;
const MIX_LIMIT = 20;

const PATHS = (window.PATHS || []);
let QUESTIONS = (window.QUESTIONS || []);
const Q_BY_ID = {};

/* ---------- tiny DOM helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------- date helpers (local day numbers) ---------- */
function dayNum(d = new Date()) {
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}
function todayStr(d = new Date()) {
  const off = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return off.toISOString().slice(0, 10);
}
function strFromDayNum(n) { return todayStr(new Date(n * 86400000)); }

/* ---------- state ---------- */
let state = null;
let quotaWarned = false;

function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    cards: {},
    profile: { examDate: null },
    stats: { streak: 0, lastDay: null, totalReviews: 0, knownReviews: 0, sessionDays: {} },
  };
}

function migrate(s) {
  if (!s || typeof s !== 'object') return defaultState();
  if (!s.schemaVersion) s.schemaVersion = SCHEMA_VERSION;
  s.cards = s.cards || {};
  s.profile = s.profile || { examDate: null };
  s.stats = s.stats || { streak: 0, lastDay: null, totalReviews: 0, knownReviews: 0, sessionDays: {} };
  s.stats.sessionDays = s.stats.sessionDays || {};
  return s;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.debug('loadState failed', e);
    return defaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.debug('saveState failed', e);
    if (e && e.name === 'QuotaExceededError' && !quotaWarned) {
      quotaWarned = true;
      toast('Speicher voll. Bitte Fortschritt exportieren.');
    }
  }
}

/* ---------- card bookkeeping ---------- */
function validateQuestions() {
  const seen = new Set();
  const clean = [];
  for (const q of QUESTIONS) {
    if (!q || !q.id || !q.path || !q.question) continue;
    if (seen.has(q.id)) { console.debug('duplicate id dropped', q.id); continue; }
    seen.add(q.id);
    clean.push(q);
  }
  QUESTIONS = clean;
  for (const q of QUESTIONS) Q_BY_ID[q.id] = q;
}

function ensureCards() {
  const valid = new Set(QUESTIONS.map(q => q.id));
  for (const q of QUESTIONS) {
    if (!state.cards[q.id]) {
      state.cards[q.id] = { box: 1, due: 0, seen: 0, known: 0, bookmarked: false, last: null };
    }
  }
  // drop orphans (e.g. removed questions)
  for (const id of Object.keys(state.cards)) {
    if (!valid.has(id)) delete state.cards[id];
  }
}

/* ---------- queries ---------- */
function cardsOfPath(path) {
  return QUESTIONS.filter(q => !path || q.path === path);
}
function dueList(path) {
  const t = dayNum();
  return cardsOfPath(path).filter(q => (state.cards[q.id]?.due ?? 0) <= t);
}
function pathProgress(path) {
  const qs = cardsOfPath(path);
  if (!qs.length) return 0;
  let sum = 0;
  for (const q of qs) sum += ((state.cards[q.id]?.box || 1) - 1) / 4;
  return Math.round((sum / qs.length) * 100);
}
function knownCount(path) {
  return cardsOfPath(path).filter(q => (state.cards[q.id]?.box || 1) >= 4).length;
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- answer rendering (\n lines, "- " bullets, **bold**) ---------- */
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function inlineMd(s) {
  return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
function renderAnswer(container, text) {
  container.innerHTML = '';
  const lines = (text || '').split('\n');
  let ul = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { ul = null; continue; }
    if (line.startsWith('- ')) {
      if (!ul) { ul = document.createElement('ul'); container.appendChild(ul); }
      const li = document.createElement('li');
      li.innerHTML = inlineMd(line.slice(2));
      ul.appendChild(li);
    } else {
      ul = null;
      const p = document.createElement('p');
      p.innerHTML = inlineMd(line);
      container.appendChild(p);
    }
  }
}

/* ---------- navigation ---------- */
function showScreen(name) {
  $$('.screen').forEach(s => s.classList.toggle('is-active', s.dataset.screen === name));
  $$('.nav-link').forEach(a => a.classList.toggle('is-active', a.dataset.nav === name));
  window.scrollTo(0, 0);
  if (name === 'home') renderHome();
  if (name === 'stats') renderStats();
  if (name === 'browse') renderBrowse();
  if (name === 'exam') renderExamSetup();
  if (name === 'more') $('#exam-date-input').value = state.profile.examDate || '';
}

/* ---------- home ---------- */
function renderHome() {
  renderExamCountdown();
  const list = $('#subject-list');
  list.innerHTML = '';
  let totalDue = 0;
  PATHS.forEach((p, i) => {
    const qs = cardsOfPath(p.id);
    const due = dueList(p.id).length;
    totalDue += due;
    const pct = pathProgress(p.id);
    const card = document.createElement('button');
    card.className = 'subject-card';
    card.dataset.path = p.id;
    if (!qs.length) card.disabled = true;
    card.innerHTML = `
      <span class="subject-index">${String(i + 1).padStart(2, '0')}</span>
      <span class="subject-body">
        <span class="subject-name">${escapeHtml(p.name)}</span>
        <span class="subject-desc">${escapeHtml(p.desc || '')}</span>
        <span class="subject-foot">
          ${qs.length
            ? `<span class="bar"><span class="bar-fill" style="width:${pct}%"></span></span>
               <span class="subject-pct">${pct}%</span>`
            : `<span class="subject-due">Noch keine Fragen</span>`}
        </span>
        ${qs.length ? `<span class="subject-due ${due ? 'has-due' : ''}">${due ? due + ' fällig' : 'nichts fällig · ' + qs.length + ' Karten'}</span>` : ''}
      </span>`;
    list.appendChild(card);
  });
  $('#home-due').textContent = totalDue ? `${totalDue} Karten heute fällig` : 'Heute nichts fällig';
}

function renderExamCountdown() {
  const el = $('#exam-countdown');
  const d = state.profile.examDate;
  if (!d) { el.hidden = true; return; }
  el.hidden = false;
  const days = dayNum(new Date(d + 'T00:00:00')) - dayNum();
  el.classList.toggle('is-urgent', days >= 0 && days <= 14);
  el.classList.toggle('is-past', days < 0);
  if (days < 0) el.innerHTML = `<span class="label">Prüfung</span><span>war am ${formatDate(d)}</span>`;
  else if (days === 0) el.innerHTML = `<span class="label">Prüfung</span><span class="cd-num">heute</span>`;
  else el.innerHTML = `<span class="label">Prüfung in</span><span class="cd-num">${days}</span><span>Tagen · ${formatDate(d)}</span>`;
}
function formatDate(s) {
  const [y, m, d] = s.split('-');
  return `${d}.${m}.${y}`;
}

/* ---------- learn session ---------- */
let session = null; // { queue:[ids], idx, revealed, scope, reviewed, known }

function startSession(scope, mode) {
  const all = cardsOfPath(scope === 'all' ? null : scope);
  if (!all.length) { toast('Für dieses Fach gibt es noch keine Fragen.'); return; }
  let pool;
  if (mode === 'mix') pool = shuffle(all).slice(0, MIX_LIMIT).map(q => q.id);
  else if (mode === 'ahead') pool = all.slice().sort((a, b) => (state.cards[a.id].due) - (state.cards[b.id].due)).slice(0, AHEAD_LIMIT).map(q => q.id);
  else { // due
    pool = shuffle(dueList(scope === 'all' ? null : scope)).map(q => q.id);
  }
  session = { queue: pool, idx: 0, revealed: false, scope, mode, reviewed: 0, known: 0 };
  showScreen('learn');
  $$('.nav-link').forEach(a => a.classList.toggle('is-active', a.dataset.nav === 'learn'));
  if (!pool.length) { renderLearnEmpty('due'); return; }
  renderCard();
}

function renderLearnEmpty(kind) {
  $('#learn-active').hidden = true;
  const box = $('#learn-empty');
  box.hidden = false;
  if (kind === 'done') {
    $('#learn-empty-title').textContent = 'Geschafft.';
    $('#learn-empty-text').textContent = session
      ? `${session.reviewed} Karten wiederholt, ${session.known} davon gewusst.`
      : '';
    $('[data-action="learn-ahead"]').textContent = 'Weiter üben';
  } else {
    $('#learn-empty-title').textContent = 'Nichts fällig.';
    $('#learn-empty-text').textContent = 'Für heute ist alles wiederholt. Du kannst trotzdem vorarbeiten.';
    $('[data-action="learn-ahead"]').textContent = 'Trotzdem üben';
  }
}

function renderCard() {
  const card = $('#learn-active');
  $('#learn-empty').hidden = true;
  card.hidden = false;
  const id = session.queue[session.idx];
  const q = Q_BY_ID[id];
  const c = state.cards[id];
  session.revealed = false;

  $('#lc-category').textContent = q.category || '';
  $('#lc-question').textContent = q.question;
  $('#lc-sketch').hidden = !q.sketch;
  const ans = $('#lc-answer'); ans.hidden = true; renderAnswer(ans, q.answer);
  const src = $('#lc-source');
  if (q.source) { src.hidden = false; src.textContent = q.source; } else src.hidden = true;
  src.classList.add('is-hidden-until-reveal');

  $('#reveal-btn').hidden = false;
  $('#grade-buttons').hidden = true;
  $('#lc-source').hidden = true;

  const total = session.queue.length;
  $('#lc-counter').textContent = `${Math.min(session.idx + 1, total)} / ${total}`;
  $('#lc-progress').style.width = `${(session.idx / total) * 100}%`;

  updateBookmarkBtn($('#bookmark-btn'), c.bookmarked);
}

function revealAnswer() {
  if (!session || session.revealed) return;
  session.revealed = true;
  const id = session.queue[session.idx];
  const q = Q_BY_ID[id];
  $('#lc-answer').hidden = false;
  $('#lc-source').hidden = !q.source;
  $('#reveal-btn').hidden = true;
  $('#grade-buttons').hidden = false;
}

function gradeCard(grade) {
  if (!session || !session.revealed) return;
  const id = session.queue[session.idx];
  const c = state.cards[id];
  const t = dayNum();
  c.seen = (c.seen || 0) + 1;
  c.last = t;
  if (grade === 0) {           // nicht gewusst
    c.box = 1;
    c.due = t;                 // due today; requeue this session
    session.queue.push(id);
  } else if (grade === 1) {    // teils
    c.due = t + BOX_INTERVAL[c.box - 1];
  } else {                     // gewusst
    c.box = Math.min(5, c.box + 1);
    c.due = t + BOX_INTERVAL[c.box - 1];
    c.known = (c.known || 0) + 1;
    session.known++;
  }
  session.reviewed++;
  recordReview(grade === 2);
  saveState();

  session.idx++;
  if (session.idx >= session.queue.length) { renderLearnEmpty('done'); refreshChrome(); }
  else renderCard();
}

function recordReview(known) {
  const ts = todayStr();
  state.stats.totalReviews++;
  if (known) state.stats.knownReviews++;
  state.stats.sessionDays[ts] = (state.stats.sessionDays[ts] || 0) + 1;
  // streak
  const last = state.stats.lastDay;
  if (last !== ts) {
    const y = strFromDayNum(dayNum() - 1);
    state.stats.streak = (last === y) ? (state.stats.streak + 1) : 1;
    state.stats.lastDay = ts;
  }
  // cleanup sessionDays older than 40 days
  const cutoff = dayNum() - 40;
  for (const k of Object.keys(state.stats.sessionDays)) {
    if (dayNum(new Date(k + 'T00:00:00')) < cutoff) delete state.stats.sessionDays[k];
  }
}

/* ---------- bookmark ---------- */
function updateBookmarkBtn(btn, on) {
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  $('.mark-glyph', btn).textContent = on ? '▪' : '▫';
  $('.mark-text', btn).textContent = on ? 'Gemerkt' : 'Merken';
}
function toggleBookmark(id, btn) {
  const c = state.cards[id];
  c.bookmarked = !c.bookmarked;
  updateBookmarkBtn(btn, c.bookmarked);
  saveState();
}

/* ---------- exam ---------- */
let exam = null; // { queue, idx, revealed, scores:[], subject, count }
let examSubject = 'all';
let examCount = 20;

function renderExamSetup() {
  $('#exam-setup').hidden = false;
  $('#exam-run').hidden = true;
  $('#exam-result').hidden = true;
  const row = $('#exam-subjects');
  row.innerHTML = '';
  const opts = [{ id: 'all', name: 'Alle' }].concat(PATHS.filter(p => cardsOfPath(p.id).length));
  opts.forEach(o => {
    const b = document.createElement('button');
    b.className = 'chip' + (o.id === examSubject ? ' is-on' : '');
    b.dataset.examsub = o.id;
    b.textContent = o.name;
    row.appendChild(b);
  });
  $$('#exam-counts .chip').forEach(c => c.classList.toggle('is-on', +c.dataset.count === examCount));
}

function startExam() {
  const all = cardsOfPath(examSubject === 'all' ? null : examSubject);
  if (!all.length) { toast('Kein Fach mit Fragen gewählt.'); return; }
  const queue = shuffle(all).slice(0, Math.min(examCount, all.length)).map(q => q.id);
  exam = { queue, idx: 0, revealed: false, scores: [] };
  $('#exam-setup').hidden = true;
  $('#exam-result').hidden = true;
  $('#exam-run').hidden = false;
  renderExamCard();
}

function renderExamCard() {
  const id = exam.queue[exam.idx];
  const q = Q_BY_ID[id];
  exam.revealed = false;
  $('#ex-category').textContent = q.category || '';
  $('#ex-question').textContent = q.question;
  $('#ex-sketch').hidden = !q.sketch;
  const ans = $('#ex-answer'); ans.hidden = true; renderAnswer(ans, q.answer);
  const src = $('#ex-source');
  if (q.source) { src.textContent = q.source; src.hidden = true; } else src.hidden = true;
  $('#ex-reveal-btn').hidden = false;
  $('#ex-grade-buttons').hidden = true;
  const total = exam.queue.length;
  $('#ex-counter').textContent = `${exam.idx + 1} / ${total}`;
  $('#ex-progress').style.width = `${(exam.idx / total) * 100}%`;
}
function examReveal() {
  if (!exam || exam.revealed) return;
  exam.revealed = true;
  const q = Q_BY_ID[exam.queue[exam.idx]];
  $('#ex-answer').hidden = false;
  $('#ex-source').hidden = !q.source;
  $('#ex-reveal-btn').hidden = true;
  $('#ex-grade-buttons').hidden = false;
}
function examGrade(score) {
  if (!exam || !exam.revealed) return;
  exam.scores.push(score);
  exam.idx++;
  if (exam.idx >= exam.queue.length) finishExam();
  else renderExamCard();
}
function finishExam() {
  $('#exam-run').hidden = true;
  $('#exam-result').hidden = false;
  const pts = exam.scores.reduce((a, b) => a + b, 0);
  const max = exam.scores.length * 2;
  const pct = max ? pts / max : 0;
  const right = exam.scores.filter(s => s === 2).length;
  const part = exam.scores.filter(s => s === 1).length;
  const wrong = exam.scores.filter(s => s === 0).length;
  $('#ex-grade').textContent = grade(pct);
  $('#ex-grade-sub').textContent = `${pts} von ${max} Punkten`;
  $('#ex-breakdown').innerHTML = `
    <div class="row"><span>Richtig</span><span class="mono">${right}</span></div>
    <div class="row"><span>Teils</span><span class="mono">${part}</span></div>
    <div class="row"><span>Falsch</span><span class="mono">${wrong}</span></div>`;
}
function grade(pct) {
  const t = [[0.95,'1,0'],[0.90,'1,3'],[0.85,'1,7'],[0.80,'2,0'],[0.75,'2,3'],
    [0.70,'2,7'],[0.65,'3,0'],[0.60,'3,3'],[0.55,'3,7'],[0.50,'4,0']];
  for (const [thr, g] of t) if (pct >= thr) return g;
  return '5,0';
}

/* ---------- browse / search ---------- */
let browseFilter = { path: 'all', q: '', flag: 'all' };
function renderBrowse() {
  const chips = $('#filter-chips');
  if (!chips.dataset.built) {
    const opts = [{ id: 'all', name: 'Alle' }]
      .concat(PATHS.filter(p => cardsOfPath(p.id).length))
      .concat([{ id: '__mark', name: 'Gemerkt' }]);
    chips.innerHTML = '';
    opts.forEach(o => {
      const b = document.createElement('button');
      b.className = 'chip' + (o.id === 'all' ? ' is-on' : '');
      b.dataset.filter = o.id;
      b.textContent = o.name;
      chips.appendChild(b);
    });
    chips.dataset.built = '1';
  }
  applyBrowse();
}
function applyBrowse() {
  const term = browseFilter.q.trim().toLowerCase();
  let res = QUESTIONS.slice();
  if (browseFilter.path === '__mark') res = res.filter(q => state.cards[q.id]?.bookmarked);
  else if (browseFilter.path !== 'all') res = res.filter(q => q.path === browseFilter.path);
  if (term) res = res.filter(q =>
    q.question.toLowerCase().includes(term) ||
    (q.answer || '').toLowerCase().includes(term) ||
    (q.category || '').toLowerCase().includes(term));
  $('#browse-count').textContent = `${res.length} ${res.length === 1 ? 'Karte' : 'Karten'}`;
  const list = $('#browse-results');
  list.innerHTML = '';
  res.slice(0, 300).forEach(q => {
    const b = document.createElement('button');
    b.className = 'browse-item';
    b.dataset.id = q.id;
    const marked = state.cards[q.id]?.bookmarked;
    b.innerHTML = `<span class="bi-cat">${escapeHtml(pathName(q.path))} · ${escapeHtml(q.category || '')}${marked ? ' · <span class="bi-mark">gemerkt</span>' : ''}</span>
      <span class="bi-q">${escapeHtml(q.question)}</span>`;
    list.appendChild(b);
  });
}
function pathName(id) { return (PATHS.find(p => p.id === id) || {}).name || id; }

function openDetail(id) {
  const q = Q_BY_ID[id];
  const c = state.cards[id];
  $('#bd-category').textContent = `${pathName(q.path)} · ${q.category || ''}`;
  $('#bd-question').textContent = q.question;
  $('#bd-sketch').hidden = !q.sketch;
  renderAnswer($('#bd-answer'), q.answer);
  const src = $('#bd-source');
  if (q.source) { src.hidden = false; src.textContent = q.source; } else src.hidden = true;
  updateBookmarkBtn($('#bd-bookmark'), c.bookmarked);
  $('#bd-bookmark').dataset.id = id;
  $('#browse-detail').hidden = false;
}

/* ---------- stats ---------- */
function renderStats() {
  $('#stat-streak').textContent = state.stats.streak || 0;
  $('#stat-due').textContent = dueList(null).length;
  $('#stat-known').textContent = knownCount(null);
  $('#stat-total').textContent = QUESTIONS.length;

  const sp = $('#subject-progress'); sp.innerHTML = '';
  PATHS.forEach(p => {
    const qs = cardsOfPath(p.id);
    if (!qs.length) return;
    const pct = pathProgress(p.id);
    const row = document.createElement('div');
    row.className = 'sp-row';
    row.innerHTML = `<div class="sp-top"><span>${escapeHtml(p.name)}</span><span class="mono">${pct}%</span></div>
      <span class="bar"><span class="bar-fill" style="width:${pct}%"></span></span>`;
    sp.appendChild(row);
  });

  const bd = $('#box-dist'); bd.innerHTML = '';
  const counts = [0, 0, 0, 0, 0];
  QUESTIONS.forEach(q => { counts[(state.cards[q.id]?.box || 1) - 1]++; });
  const maxc = Math.max(1, ...counts);
  counts.forEach((n, i) => {
    const row = document.createElement('div');
    row.className = 'bd-row';
    row.innerHTML = `<span>Box ${i + 1}</span>
      <span class="bd-bar"><span class="bd-fill" style="width:${(n / maxc) * 100}%"></span></span>
      <span class="bd-count">${n}</span>`;
    bd.appendChild(row);
  });

  const hm = $('#heatmap'); hm.innerHTML = '';
  const today = dayNum();
  for (let i = 29; i >= 0; i--) {
    const dN = today - i;
    const ds = strFromDayNum(dN);
    const n = state.stats.sessionDays[ds] || 0;
    const lvl = n === 0 ? 0 : n < 5 ? 1 : n < 15 ? 2 : n < 30 ? 3 : 4;
    const cell = document.createElement('div');
    cell.className = 'hm-cell' + (lvl ? ' l' + lvl : '');
    cell.title = `${formatDate(ds)}: ${n} Wiederholungen`;
    cell.setAttribute('aria-label', cell.title);
    hm.appendChild(cell);
  }
}

/* ---------- backup / restore / reset ---------- */
function backup() {
  const data = { app: 'vitruv', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), state };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `vitruv-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
function restore(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.state) throw new Error('kein state');
      state = migrate(data.state);
      ensureCards();
      saveState();
      toast('Fortschritt eingespielt.');
      showScreen('home');
    } catch (e) { toast('Datei konnte nicht gelesen werden.'); }
  };
  reader.readAsText(file);
}
function resetAll() {
  if (!confirm('Wirklich allen Lernfortschritt löschen?')) return;
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  ensureCards();
  saveState();
  toast('Zurückgesetzt.');
  showScreen('home');
}

/* ---------- toast ---------- */
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

/* ---------- first visit ---------- */
const FV_STEPS = [
  { title: 'Erst lesen, dann lernen.', body: '<p>Vitruv zeigt dir eine Prüfungsfrage. Überlege deine Antwort, decke dann die Musterantwort auf und schätze ehrlich ein, ob du es wusstest.</p>' },
  { title: 'Wiederholung mit System.', body: '<p>Karten wandern nach dem Leitner-Prinzip durch fünf Boxen. Was du kannst, kommt seltener, was wackelt, öfter. So lernst du gezielt das, was noch fehlt.</p>' },
  { title: 'Ohne Gewähr.', body: '<p>Die Musterantworten sind eigenständig formuliert und ersetzen weder Vorlesung noch Skript noch Norm. Im Zweifel gilt die Lehrveranstaltung.</p><p class="small">Dein Fortschritt bleibt nur auf diesem Gerät.</p>' },
];
let fvStep = 0;
function showFirstVisit() {
  fvStep = 0; renderFv(); $('#first-visit').hidden = false;
}
function renderFv() {
  const s = FV_STEPS[fvStep];
  $('#fv-title').textContent = s.title;
  $('#fv-body').innerHTML = s.body;
  $('#fv-back').hidden = fvStep === 0;
  $('#fv-next').textContent = fvStep === FV_STEPS.length - 1 ? 'Los geht’s' : 'Weiter';
  $('#fv-next').focus();
}

/* ---------- service worker + update ---------- */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          $('#update-banner').hidden = false;
          $('#update-btn').onclick = () => { nw.postMessage('skipWaiting'); };
        }
      });
    });
  }).catch(() => {});
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return; refreshing = true; window.location.reload();
  });
}

/* ---------- refresh visible chrome ---------- */
function refreshChrome() {
  const active = $('.screen.is-active')?.dataset.screen;
  if (active === 'home') renderHome();
  if (active === 'stats') renderStats();
}

/* ---------- events ---------- */
function bindEvents() {
  document.addEventListener('click', (e) => {
    const navEl = e.target.closest('[data-nav]');
    if (navEl) {
      e.preventDefault();
      const n = navEl.dataset.nav;
      if (n === 'learn') startSession('all', 'due');
      else showScreen(n);
      return;
    }
    const actEl = e.target.closest('[data-action]');
    if (actEl) {
      e.preventDefault();
      handleAction(actEl.dataset.action);
      return;
    }
    const subj = e.target.closest('.subject-card');
    if (subj && !subj.disabled) { startSession(subj.dataset.path, 'due'); return; }

    if (e.target.closest('#reveal-btn')) { revealAnswer(); return; }
    const gb = e.target.closest('[data-grade]');
    if (gb) { gradeCard(+gb.dataset.grade); return; }

    if (e.target.closest('#ex-reveal-btn')) { examReveal(); return; }
    const eg = e.target.closest('[data-exgrade]');
    if (eg) { examGrade(+eg.dataset.exgrade); return; }

    if (e.target.closest('#bookmark-btn')) {
      toggleBookmark(session.queue[session.idx], $('#bookmark-btn')); return;
    }
    if (e.target.closest('#bd-bookmark')) {
      toggleBookmark($('#bd-bookmark').dataset.id, $('#bd-bookmark')); applyBrowse(); return;
    }
    const bi = e.target.closest('.browse-item');
    if (bi) { openDetail(bi.dataset.id); return; }

    const esub = e.target.closest('[data-examsub]');
    if (esub) { examSubject = esub.dataset.examsub; renderExamSetup(); return; }
    const ecount = e.target.closest('[data-count]');
    if (ecount) { examCount = +ecount.dataset.count; renderExamSetup(); return; }
    const fl = e.target.closest('[data-filter]');
    if (fl) {
      browseFilter.path = fl.dataset.filter;
      $$('#filter-chips .chip').forEach(c => c.classList.toggle('is-on', c === fl));
      applyBrowse(); return;
    }
  });

  $('#search-input').addEventListener('input', (e) => { browseFilter.q = e.target.value; applyBrowse(); });
  $('#exam-date-input').addEventListener('change', (e) => {
    state.profile.examDate = e.target.value || null; saveState(); renderExamCountdown();
  });
  $('#restore-input').addEventListener('change', (e) => { if (e.target.files[0]) restore(e.target.files[0]); });

  // first visit
  $('#fv-next').addEventListener('click', () => {
    if (fvStep < FV_STEPS.length - 1) { fvStep++; renderFv(); }
    else { localStorage.setItem(ONBOARD_KEY, '1'); $('#first-visit').hidden = true; }
  });
  $('#fv-back').addEventListener('click', () => { if (fvStep > 0) { fvStep--; renderFv(); } });

  // keyboard
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    const learning = $('.screen.is-active')?.dataset.screen === 'learn' && !$('#learn-active').hidden;
    const examing = $('.screen.is-active')?.dataset.screen === 'exam' && !$('#exam-run').hidden;
    if (learning) {
      if (!session.revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); revealAnswer(); }
      else if (session.revealed && ['1', '2', '3'].includes(e.key)) { e.preventDefault(); gradeCard(+e.key - 1); }
      else if (e.key.toLowerCase() === 'm') { toggleBookmark(session.queue[session.idx], $('#bookmark-btn')); }
    } else if (examing) {
      if (!exam.revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); examReveal(); }
      else if (exam.revealed && ['1', '2', '3'].includes(e.key)) { e.preventDefault(); examGrade(+e.key - 1); }
    }
    if (e.key === 'Escape') {
      if (!$('#browse-detail').hidden) $('#browse-detail').hidden = true;
    }
  });

  // cross-tab sync
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    const learning = $('.screen.is-active')?.dataset.screen === 'learn' && !$('#learn-active').hidden;
    const examing = $('.screen.is-active')?.dataset.screen === 'exam' && !$('#exam-run').hidden;
    if (learning || examing) return; // don't disrupt an active run
    state = loadState(); ensureCards(); refreshChrome();
  });
}

function handleAction(a) {
  switch (a) {
    case 'learn-all': startSession('all', 'due'); break;
    case 'mix': startSession('all', 'mix'); break;
    case 'learn-ahead': startSession(session?.scope || 'all', 'ahead'); break;
    case 'exam': showScreen('exam'); break;
    case 'exam-start': startExam(); break;
    case 'exam-quit': renderExamSetup(); break;
    case 'backup': backup(); break;
    case 'reset': resetAll(); break;
    case 'detail-close': $('#browse-detail').hidden = true; break;
  }
}

/* ---------- URL action (icon shortcuts) ---------- */
function handleUrlAction() {
  const a = new URLSearchParams(location.search).get('action');
  if (a === 'mix') startSession('all', 'mix');
  else if (a === 'exam') showScreen('exam');
  else if (a === 'browse') showScreen('browse');
}

/* ---------- boot ---------- */
function boot() {
  state = loadState();
  validateQuestions();
  ensureCards();
  saveState();
  bindEvents();
  renderHome();
  registerSW();
  if (!localStorage.getItem(ONBOARD_KEY)) showFirstVisit();
  handleUrlAction();
}
document.addEventListener('DOMContentLoaded', boot);
