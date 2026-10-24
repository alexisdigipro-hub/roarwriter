import { breakdownOf, fold, headingParts } from './breakdown.js';
import { REVISIONS, charactersOf, cleanName, isGreek, pageCount, sceneNumbers, scenesOf, upper } from './model.js';
import { FORMATS, FORMAT_LIST, fmtOf } from './formats.js';
import { pref, setPref } from './prefs.js';
import { I, ago, h, modal, toast } from './ui.js';

/* The writer's tools around the page (Alex, 24 Oct: what the other screenwriting apps have, and a place for
   settings): Settings, Find & Replace, notes on lines, index cards, reading aloud, the report and sides.
   Each gets `ctx`, what the open script gives them: { script, editor(), save(), setEls(els), goTo(id), redecorate(),
   setFormat(k), setPage(k), titlePage(), zoom, me, readOnly() }. */

const toggle = (on, onChange, label, hint) => {
  const b = h('button', { type: 'button', class: 'sw' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(!!on), onclick: () => { on = !on; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); onChange(on); } }, h('i'));
  return h('div', { class: 'set-row' }, h('div', { class: 'set-l' }, h('b', {}, label), hint ? h('small', {}, hint) : null), b);
};
const segOf = (value, opts, onChange) => {
  const s = h('div', { class: 'seg' }, ...opts.map(([k, l]) => h('button', { type: 'button', class: value === k ? 'on' : '', onclick: (e) => { [...s.children].forEach((x) => x.classList.toggle('on', x === e.currentTarget)); onChange(k); } }, l)));
  return s;
};
const row = (label, control, hint) => h('div', { class: 'set-row' }, h('div', { class: 'set-l' }, h('b', {}, label), hint ? h('small', {}, hint) : null), control);

/* ---------- Settings ---------- */
/* With a script open: its own settings and this device's. From the list of scripts (ctx.global): this device's,
   what a new script starts with, and the account. */
export function openSettings(ctx, tab = ctx.global ? 'new' : 'script'){
  const { script } = ctx, set = script?.settings || {};
  const body = h('div', { class: 'settings' });
  const tabs = ctx.global
    ? [['new', 'New scripts'], ['writing', 'Writing'], ['look', 'Look'], ['read', 'Read aloud'], ['keys', 'Shortcuts'], ['account', 'Account']]
    : [['script', 'Script'], ['writing', 'Writing'], ['revisions', 'Revisions'], ['look', 'Look'], ['pdf', 'PDF'], ['read', 'Read aloud'], ['keys', 'Shortcuts']];
  const mod = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';
  const panes = {
    script: () => [
      row('Format', h('select', { class: 'input', onchange: (e) => ctx.setFormat(e.target.value) }, ...FORMAT_LIST.map((k) => h('option', { value: k, selected: fmtOf(script) === k }, FORMATS[k].label))), 'The lines keep their kinds; the page is laid out as the format has it.'),
      row('Page size', segOf(set.page || 'a4', [['a4', 'A4'], ['letter', 'US Letter']], (k) => ctx.setPage(k))),
      row('Scene numbers', segOf(set.sceneNumbers || 'off', [['off', 'Off'], ['left', 'Left'], ['right', 'Right'], ['both', 'Both']], (k) => { set.sceneNumbers = k; ctx.save(); ctx.redecorate(); }), 'On the page and in the PDF, as a shooting script has them.'),
      row('Character names', segOf(set.names || 'fd', [['fd', 'As Final Draft'], ['centre', 'Centred']], (k) => { set.names = k; ctx.save(); ctx.redecorate(); }), 'As Final Draft: at 3.7", the industry layout. Centred: over the dialogue, on the page and in the PDF.'),
      toggle(set.contd !== false, (on) => { set.contd = on; ctx.save(); ctx.redecorate(); }, "(CONT'D)", 'A character who speaks again in the same scene, with only action between.'),
      row('Title page', h('button', { class: 'btn', type: 'button', onclick: () => ctx.titlePage() }, 'Edit the title page'), 'Or click on it, on the first page, and type.'),
    ],
    writing: () => [
      toggle(pref('suggest'), (on) => setPref('suggest', on), 'Suggestions', 'Names, INT./EXT., places and the time of day while you type.'),
      toggle(pref('spell'), (on) => { setPref('spell', on); const box = ctx.editor?.()?.box; if (box) box.spellcheck = on; }, 'Spelling', 'Greek and English: the words the dictionary does not know are underlined. In a browser, the languages are the browser’s own (Chrome: Settings > Languages > Spell check).'),
      toggle(pref('typewriter'), (on) => setPref('typewriter', on), 'Typewriter scrolling', 'The line you write stays in the middle of the window.'),
      toggle(pref('focus'), (on) => { setPref('focus', on); ctx.redecorate(); }, 'Focus on the scene', 'Every other scene fades while you write.'),
      h('p', { class: 'hint' }, 'Enter goes on to what usually comes next, Tab changes the kind of line, as in Final Draft.'),
    ],
    /* Revision mode (a production draft): every line changed while it is on carries the revision's colour and an
       asterisk; the scene numbers can be locked (a new scene after 12 is 12A); the PDF names the revision on the
       pages it changed, can colour them, or give only them */
    revisions: () => {
      const rv = (script.revision ||= {});
      const today = new Date().toLocaleDateString('en-GB');
      const marked = script.els.filter((e) => e.rv).length;
      const changed = () => { ctx.save(); ctx.revisionChanged(); };
      const colors = h('div', { class: 'rv-colors' }, ...REVISIONS.map(([k, l, c]) => h('button', { type: 'button', class: 'rv-c' + (rv.color === k ? ' on' : ''), style: `--rv:${c}`, title: l, onclick: () => { rv.color = k; changed(); draw(); } }, h('i'), l)));
      return [
        toggle(!!rv.on, (on) => { rv.on = on; if (on){ rv.color ||= 'blue'; rv.date ||= today; } changed(); draw(); }, 'Revision mode', 'What you change from now on is marked with an asterisk in the margin, in the revision’s colour.'),
        row('Colour', colors, 'In the order the industry uses: Blue, Pink, Yellow, Green, Goldenrod…'),
        row('Date', h('input', { class: 'input', value: rv.date || '', placeholder: today, oninput: (e) => { rv.date = e.target.value; ctx.save(); } }), 'Printed at the top of the pages it changed: Blue Rev. ' + (rv.date || today)),
        toggle(!!rv.lock, (on) => { if (on){ const nums = sceneNumbers(script.els, fmtOf(script) === 'multicam'); rv.locked = Object.fromEntries(nums); } rv.lock = on; if (on && (set.sceneNumbers || 'off') === 'off'){ set.sceneNumbers = 'both'; ctx.redecorate(); } changed(); }, 'Lock the scene numbers', 'A shooting script: every scene keeps its number; a new one after 12 becomes 12A, 12B.'),
        toggle(!!rv.colorPages, (on) => { rv.colorPages = on; ctx.save(); }, 'Coloured pages in the PDF', 'The pages it changed, tinted in its colour, as they go out on set.'),
        toggle(!rv.hide, (on) => { rv.hide = !on; changed(); }, 'Show the asterisks on the page'),
        row('The PDF', h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: () => ctx.pdf({ onlyRevised: true, titlePage: false }) }, 'Only the revised pages'),
          h('button', { class: 'btn', type: 'button', onclick: () => ctx.pdf() }, 'The whole script')), 'The revised pages alone are what goes to the crew.'),
        row('Next revision', h('button', { class: 'btn', type: 'button', onclick: () => { const i = REVISIONS.findIndex(([k]) => k === rv.color); rv.color = REVISIONS[(i + 1) % REVISIONS.length][0]; rv.date = today; rv.on = true; changed(); draw(); toast(`${REVISIONS.find(([k]) => k === rv.color)[1]} revision`); } }, 'Start the next colour'), 'The marks of this one stay; the next one marks in its own colour.'),
        row('Clear the marks', h('button', { class: 'btn danger', type: 'button', onclick: () => { if (!marked) return toast('There are no marks.'); if (!confirm(`Clear the ${marked} revision marks? The words stay as they are.`)) return; ctx.setEls(script.els.map(({ rv: _, ...e }) => e), { mark: false }); changed(); draw(); } }, `Clear ${marked} marks`), 'For a clean draft, once a revision is locked in.'),
      ];
    },
    look: () => [
      row('The page', segOf(pref('page'), [['white', 'White'], ['sepia', 'Sepia'], ['midnight', 'Midnight']], (k) => setPref('page', k)), 'Midnight is a dark page with light letters; the PDF stays white.'),
      toggle(pref('breaks'), (on) => setPref('breaks', on), 'Show where pages end', 'The edge between two sheets, with the page number.'),
      ctx.zoom ? row('Zoom', h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => ctx.zoom.by(-0.1) }, '−'), h('button', { class: 'btn', type: 'button', onclick: () => ctx.zoom.reset() }, '100%'), h('button', { class: 'btn', type: 'button', onclick: () => ctx.zoom.by(0.1) }, '+')), `Also ${mod} + and ${mod} −, or a pinch.`) : null,
    ],
    pdf: () => [
      toggle(set.titlePrint !== false, (on) => { set.titlePrint = on; ctx.save(); }, 'Title page', 'The first page of the PDF.'),
      row('Header', h('input', { class: 'input', value: set.header || '', placeholder: 'e.g. BLUE REVISION · 24/10/2026', oninput: (e) => { set.header = e.target.value; ctx.save(); } }), 'At the top of every page, on the left.'),
      row('Watermark', h('input', { class: 'input', value: set.watermark || '', placeholder: 'e.g. CONFIDENTIAL, or the reader’s name', oninput: (e) => { set.watermark = e.target.value; ctx.save(); } }), 'Faintly across every page, to send a draft safely.'),
    ],
    read: () => [
      toggle(pref('readAction'), (on) => setPref('readAction', on), 'Read the action too', 'Off: only the characters speak, as at a table read.'),
      row('Speed', segOf(String(pref('readRate')), [['0.8', 'Slow'], ['1', 'Normal'], ['1.25', 'Fast']], (k) => setPref('readRate', +k))),
      h('p', { class: 'hint' }, 'Each character gets a voice of their own from the ones your device has, in the script’s language.'),
    ],
    // what every new script starts with (on this device)
    new: () => [
      row('Format', h('select', { class: 'input', onchange: (e) => setPref('format', e.target.value) }, ...FORMAT_LIST.map((k) => h('option', { value: k, selected: pref('format') === k }, FORMATS[k].label))), 'Offered first when you start a new script, and what Start a new one opens.'),
      row('Page size', segOf(pref('pageSize') || 'a4', [['a4', 'A4'], ['letter', 'US Letter']], (k) => setPref('pageSize', k)), 'A4 in Europe, US Letter for the American market.'),
      row('Written by', h('input', { class: 'input', value: pref('author') || '', placeholder: ctx.me?.() || 'Your name', oninput: (e) => setPref('author', e.target.value) }), 'The author on a new script’s title page; empty, your account’s name.'),
      row('Credit', h('input', { class: 'input', value: pref('credit') || '', placeholder: 'Written by', oninput: (e) => setPref('credit', e.target.value) }), 'e.g. Written by, Screenplay by, Σενάριο.'),
      row('Contact', h('textarea', { class: 'input', rows: 3, value: pref('contact') || '', placeholder: 'Name, phone, email, agent', oninput: (e) => setPref('contact', e.target.value) }), 'At the foot of a new script’s title page.'),
      row('Scene numbers', segOf(pref('sceneNumbers') || 'off', [['off', 'Off'], ['left', 'Left'], ['right', 'Right'], ['both', 'Both']], (k) => setPref('sceneNumbers', k)), 'For a new script; each script keeps its own after.'),
    ],
    account: () => [
      row(ctx.me?.() || 'Your account', h('button', { class: 'btn', type: 'button', onclick: () => ctx.signOut?.() }, 'Sign out'), ctx.email || ''),
      h('p', { class: 'hint' }, `One account for RoarMe, Roardino and RoarWriter. Your scripts are kept in it and on this device. ${ctx.version ? `RoarWriter ${ctx.version}.` : ''}`),
    ],
    keys: () => [h('div', { class: 'keys' }, ...[
      ['Enter', 'The next kind of line'], ['Tab / ⇧Tab', 'Change the kind of line'], [`${navigator.platform.includes('Mac') ? '⌥' : 'Alt+'}1 … 9`, 'Pick a kind (0: Unformatted)'],
      [`${mod} Z / ⇧${mod} Z`, 'Undo / redo'], [`${mod} B / I / U`, 'Bold, italic, underline'], [`${mod} D`, 'Dual dialogue (on the second character)'], [`${mod} F`, 'Find & replace'], [`${mod} ⇧ M`, 'A note on this line'],
      [`${mod} P`, 'PDF'], [`${mod} ⇧ A`, 'AI'], [`${mod} + / −`, 'Zoom'], ['Right click on a word', 'Tag it, or add a note'],
    ].map(([k, l]) => h('div', { class: 'key-row' }, h('kbd', {}, k), h('span', {}, l))))],
  };
  const tabSeg = segOf(tab, tabs, (k) => { tab = k; draw(); });
  tabSeg.classList.add('set-tabs');
  const pane = h('div', { class: 'set-pane' });
  const draw = () => pane.replaceChildren(...panes[tab]());
  body.append(tabSeg, pane);
  draw();
  modal('Settings', body, { wide: true, onClose: ctx.onClose });
}

/* ---------- Find & Replace ---------- */
export function findBar(ctx, host){
  const { script } = ctx;
  let hits = [], at = -1, matchCase = false, whole = false;
  const q = h('input', { class: 'input', placeholder: 'Find', 'aria-label': 'Find', oninput: () => run(), onkeydown: (e) => { if (e.key === 'Enter'){ e.preventDefault(); go(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') close(); } });
  const rep = h('input', { class: 'input', placeholder: 'Replace with', 'aria-label': 'Replace with', onkeydown: (e) => { if (e.key === 'Enter'){ e.preventDefault(); one(); } if (e.key === 'Escape') close(); } });
  const count = h('span', { class: 'fb-n' }, '');
  const opt = (label, get, set) => { const b = h('button', { type: 'button', class: 'fb-opt', title: label, onclick: () => { set(!get()); b.classList.toggle('on', get()); run(); } }, label === 'Match case' ? 'Aa' : 'W'); return b; };
  const bar = h('div', { class: 'findbar', hidden: true },
    h('div', { class: 'fb-row' }, h('span', { class: 'fb-i', html: I.search }), q, count,
      opt('Match case', () => matchCase, (v) => { matchCase = v; }), opt('Whole words', () => whole, (v) => { whole = v; }),
      h('button', { class: 'ib', type: 'button', title: 'Previous', 'aria-label': 'Previous', html: I.up, onclick: () => go(-1) }),
      h('button', { class: 'ib', type: 'button', title: 'Next', 'aria-label': 'Next', html: I.down, onclick: () => go(1) }),
      h('button', { class: 'ib', type: 'button', title: 'Close', 'aria-label': 'Close', html: I.x, onclick: () => close() })),
    h('div', { class: 'fb-row' }, h('span', { class: 'fb-i', html: I.swap }), rep,
      h('button', { class: 'btn', type: 'button', onclick: () => one() }, 'Replace'),
      h('button', { class: 'btn', type: 'button', onclick: () => all() }, 'All')));
  host.prepend(bar);
  const norm = (s) => (matchCase ? String(s) : fold(s));
  const isW = (c) => !!c && /[\p{L}\p{N}]/u.test(c);
  function search(){
    const n = norm(q.value), out = [];
    if (!n) return out;
    script.els.forEach((e, i) => {
      const t = norm(e.x);
      for (let k = t.indexOf(n); k >= 0; k = t.indexOf(n, k + 1)) if (!whole || (!isW(t[k - 1]) && !isW(t[k + n.length]))) out.push([i, k, k + n.length]);
    });
    return out;
  }
  function paint(){
    if (!window.CSS?.highlights || typeof Highlight === 'undefined') return;
    const box = ctx.editor().box, all = [], cur = [];
    hits.forEach(([i, a, b], k) => {
      const p = box.children[i]; if (!p) return;
      const r = rangeIn(p, a, b); if (!r) return;
      (k === at ? cur : all).push(r);
    });
    CSS.highlights.set('rw-find', new Highlight(...all));
    CSS.highlights.set('rw-find-on', new Highlight(...cur));
  }
  function run(){ hits = search(); at = hits.length ? 0 : -1; show(); }
  function show(scroll = true){
    count.textContent = q.value ? (hits.length ? `${at + 1} / ${hits.length}` : 'None') : '';
    paint();
    const hit = hits[at];
    if (hit && scroll){ const p = ctx.editor().box.children[hit[0]]; p?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }
  function go(d){ if (!hits.length) return; at = (at + d + hits.length) % hits.length; show(); }
  function apply(list){
    if (ctx.readOnly()) return toast('This script is view only.');
    const els = script.els.map((e) => ({ ...e }));
    // from the end, so the places before stay right
    [...list].sort((x, y) => y[0] - x[0] || y[1] - x[1]).forEach(([i, a, b]) => { els[i].x = els[i].x.slice(0, a) + rep.value + els[i].x.slice(b); });
    ctx.setEls(els);
  }
  function one(){ const hit = hits[at]; if (!hit) return; apply([hit]); const keep = at; hits = search(); at = Math.min(keep, hits.length - 1); show(); }
  function all(){ if (!hits.length) return; const n = hits.length; apply(hits); run(); toast(`Replaced ${n}`, { action: 'Undo', fn: () => { ctx.editor().doUndo(); run(); } }); }
  function close(){ bar.hidden = true; if (window.CSS?.highlights){ CSS.highlights.delete('rw-find'); CSS.highlights.delete('rw-find-on'); } }
  return {
    open(replace = false){ bar.hidden = false; bar.classList.toggle('with-rep', replace || bar.classList.contains('with-rep')); const sel = getSelection().toString().trim(); if (sel && !sel.includes('\n')) q.value = sel; q.focus(); q.select(); run(); },
    showReplace(){ bar.classList.add('with-rep'); },
    refresh(){ if (!bar.hidden && q.value){ hits = search(); at = Math.min(Math.max(at, 0), hits.length - 1); show(false); } },
    close,
  };
}
// a range over characters a..b of a line, whatever text nodes it is made of
export function rangeIn(p, a, b){
  const walk = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  let n, pos = 0, r = document.createRange(), started = false;
  while ((n = walk.nextNode())){
    const end = pos + n.length;
    if (!started && a <= end){ r.setStart(n, a - pos); started = true; }
    if (started && b <= end){ r.setEnd(n, b - pos); return r; }
    pos = end;
  }
  return null;
}

/* ---------- Notes on lines ---------- */
export function notesLayer(ctx, paper){
  const layer = h('div', { class: 'nt-layer' });
  paper.append(layer);
  const place = () => {
    const box = ctx.editor()?.box; if (!box) return;
    if (!paper.contains(layer)) paper.append(layer);
    const by = new Map();
    for (const n of ctx.script.notes || []) if (!n.done){ by.set(n.el, (by.get(n.el) || 0) + 1); }
    const marks = [];
    for (const p of box.children){
      const c = by.get(p.dataset.id); if (!c) continue;
      marks.push(h('button', { type: 'button', class: 'nt-mark', style: `top:${p.offsetTop}px`, title: 'Notes', onclick: (e) => openNotesOf(ctx, p.dataset.id, e.currentTarget) }, h('span', { html: I.note }), c > 1 ? h('b', {}, String(c)) : null));
    }
    layer.replaceChildren(...marks);
  };
  return { place };
}
export function addNote(ctx, elId){
  if (ctx.readOnly()) return toast('This script is view only.');
  if (!elId) return toast('Put the cursor on a line first.');
  const text = h('textarea', { class: 'input', rows: 4, placeholder: 'A note on this line (a change to make, a question for the director…)' });
  const close = modal('Note', h('div', { class: 'stack' }, h('p', { class: 'muted small' }, linePreview(ctx.script, elId)), text,
    h('button', { class: 'btn primary', type: 'button', onclick: () => {
      if (!text.value.trim()) return toast('Write the note first.');
      (ctx.script.notes ||= []).push({ id: crypto.randomUUID().slice(0, 8), el: elId, text: text.value.trim(), by: ctx.me(), at: new Date().toISOString(), done: false });
      ctx.save(); ctx.notesChanged(); close(); toast('Note added');
    } }, 'Add note')));
}
const linePreview = (script, elId) => { const e = script.els.find((x) => x.id === elId); return e ? (e.x.length > 90 ? e.x.slice(0, 90) + '…' : e.x) || '(an empty line)' : ''; };
function openNotesOf(ctx, elId, anchor){
  const list = (ctx.script.notes || []).filter((n) => n.el === elId);
  const r = anchor.getBoundingClientRect();
  const pop = h('div', { class: 'menu nt-pop', style: `left:${Math.max(8, r.left - 300)}px;top:${r.bottom + 6}px` },
    ...list.map((n) => noteCard(ctx, n, () => { pop.remove(); })),
    h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); pop.remove(); addNote(ctx, elId); } }, h('span', {}, '+ Another note')));
  document.querySelectorAll('.menu').forEach((m) => m.remove());
  document.body.append(pop);
  const off = (e) => { if (!pop.contains(e.target)){ pop.remove(); document.removeEventListener('mousedown', off); } };
  setTimeout(() => document.addEventListener('mousedown', off), 0);
}
export function noteCard(ctx, n, after = () => {}){
  return h('div', { class: 'nt-card' + (n.done ? ' done' : '') },
    h('p', {}, n.text),
    h('div', { class: 'nt-meta' }, h('small', {}, `${n.by || ''} · ${ago(n.at)}`),
      h('button', { class: 'linkish', type: 'button', onclick: () => { n.done = !n.done; ctx.save(); ctx.notesChanged(); after(); } }, n.done ? 'Open again' : 'Resolve'),
      h('button', { class: 'linkish', type: 'button', onclick: () => { ctx.script.notes = ctx.script.notes.filter((x) => x.id !== n.id); ctx.save(); ctx.notesChanged(); after(); } }, 'Delete')));
}
export function notesList(ctx){
  const order = new Map(ctx.script.els.map((e, i) => [e.id, i]));
  const notes = [...(ctx.script.notes || [])].sort((a, b) => (a.done - b.done) || ((order.get(a.el) ?? 1e9) - (order.get(b.el) ?? 1e9)));
  if (!notes.length) return [h('p', { class: 'muted small' }, 'No notes yet. Right-click a line, or press ' + (navigator.platform.includes('Mac') ? '⌘⇧M' : 'Ctrl+Shift+M') + ', to leave a note on it.')];
  return notes.map((n) => h('div', { class: 'nt-item' },
    h('button', { type: 'button', class: 'nt-line', onclick: () => ctx.goTo(n.el) }, linePreview(ctx.script, n.el) || '(a line that is gone)'),
    noteCard(ctx, n)));
}

/* ---------- Index cards: the scenes as cards, to see the story and move it around ---------- */
const COLORS = ['', '#e5484d', '#f76b15', '#ffb224', '#30a46c', '#0091ff', '#8e4ec6', '#d6409f'];
export function cardsView(ctx){
  const { script } = ctx;
  const wrap = h('div', { class: 'cards' });
  const blocks = () => {
    const sc = scenesOf(script.els).filter((s) => script.els[s.i].t === 'scene' || script.els[s.i].t === 'page');
    const head = sc.length ? script.els.slice(0, sc[0].i) : script.els;
    return { head, list: sc.map((s, k) => ({ ...s, els: script.els.slice(s.i, k + 1 < sc.length ? sc[k + 1].i : script.els.length) })) };
  };
  const move = (from, to) => {
    if (ctx.readOnly()) return toast('This script is view only.');
    const { head, list } = blocks();
    if (to < 0 || to >= list.length || from === to) return;
    const [b] = list.splice(from, 1); list.splice(to, 0, b);
    ctx.setEls([...head, ...list.flatMap((x) => x.els)]);
    draw();
  };
  let dragFrom = -1;
  const draw = () => {
    const { list } = blocks();
    if (!list.length){ wrap.replaceChildren(h('p', { class: 'muted center' }, 'Cards appear here as you write scene headings.')); return; }
    wrap.replaceChildren(...list.map((s, k) => {
      const c = (script.cards ||= {})[s.id] || {};
      const preview = s.els.slice(1).filter((e) => e.x.trim()).slice(0, 3).map((e) => (e.t === 'character' ? upper(e.x) + ':' : e.x)).join(' ');
      const lines = s.els.reduce((a, e) => a + Math.max(1, Math.ceil((e.x || ' ').length / 60)) + 1, 0);
      const eighths = Math.max(1, Math.round(lines / 55 * 8));
      const len = `${Math.floor(eighths / 8) ? Math.floor(eighths / 8) + ' ' : ''}${eighths % 8 ? (eighths % 8) + '/8' : ''}`.trim() + ' pg';
      const syn = h('textarea', { class: 'card-syn', rows: 3, placeholder: 'What happens in this scene', value: c.syn || '', oninput: (e) => { script.cards[s.id] = { ...(script.cards[s.id] || {}), syn: e.target.value }; ctx.save(); } });
      const card = h('article', { class: 'card', draggable: 'true', style: c.color ? `--cc:${c.color}` : '',
        ondragstart: (e) => { dragFrom = k; e.dataTransfer.effectAllowed = 'move'; card.classList.add('drag'); },
        ondragend: () => card.classList.remove('drag'),
        ondragover: (e) => { e.preventDefault(); card.classList.add('over'); },
        ondragleave: () => card.classList.remove('over'),
        ondrop: (e) => { e.preventDefault(); card.classList.remove('over'); if (dragFrom >= 0) move(dragFrom, k); dragFrom = -1; } },
        h('div', { class: 'card-h' }, h('span', { class: 'sn' }, String(k + 1)), h('button', { type: 'button', class: 'card-t', title: 'Go to this scene', onclick: () => ctx.goTo(s.id, true) }, s.text), h('small', {}, len)),
        syn,
        preview ? h('p', { class: 'card-p' }, preview.length > 160 ? preview.slice(0, 160) + '…' : preview) : null,
        // who writes this scene (a script shared with other writers)
        ctx.writers?.().length > 1 ? h('select', { class: 'input card-w', disabled: ctx.readOnly(), onchange: (e) => { if (e.target.value) script.assign[s.id] = e.target.value; else delete script.assign[s.id]; ctx.save(); } },
          h('option', { value: '' }, 'Writer: anyone'), ...ctx.writers().map((w) => h('option', { value: w, selected: script.assign?.[s.id] === w }, w))) : null,
        h('div', { class: 'card-f' },
          h('div', { class: 'card-colors' }, ...COLORS.map((col) => h('button', { type: 'button', class: 'cdot' + ((c.color || '') === col ? ' on' : ''), style: col ? `background:${col}` : '', title: col ? 'Colour' : 'No colour', onclick: () => { script.cards[s.id] = { ...(script.cards[s.id] || {}), color: col }; ctx.save(); draw(); } }))),
          h('button', { class: 'ib', type: 'button', title: 'Earlier', 'aria-label': 'Earlier', html: I.left, onclick: () => move(k, k - 1) }),
          h('button', { class: 'ib', type: 'button', title: 'Later', 'aria-label': 'Later', html: I.right, onclick: () => move(k, k + 1) })));
      return card;
    }));
  };
  return { el: wrap, draw };
}

/* ---------- Reading aloud: a table read with the voices the device has ---------- */
export function reader(ctx){
  const synth = window.speechSynthesis;
  const pill = h('div', { class: 'reader', hidden: true });
  document.body.append(pill);
  let playing = false, paused = false, queue = [], idx = 0, voiceOf = new Map(), lit = null;
  let timed = false;
  const stop = () => { if (timed){ timed = false; ctx.save(); } playing = false; paused = false; synth?.cancel(); pill.hidden = true; if (lit) delete lit.dataset.reading; lit = null; };
  const voicesFor = (lang) => (synth?.getVoices() || []).filter((v) => v.lang?.toLowerCase().startsWith(lang));
  function draw(who){
    pill.hidden = false;
    pill.replaceChildren(
      h('span', { class: 'rd-who' }, who || 'Reading'),
      h('button', { class: 'ib', type: 'button', title: paused ? 'Go on' : 'Pause', 'aria-label': paused ? 'Go on' : 'Pause', html: paused ? I.play : I.pause, onclick: () => { if (paused){ synth.resume(); paused = false; } else { synth.pause(); paused = true; } draw(who); } }),
      h('button', { class: 'ib', type: 'button', title: 'Stop', 'aria-label': 'Stop', html: I.stop, onclick: stop }));
  }
  function next(){
    if (!playing) return;
    const item = queue[idx++];
    if (!item){ stop(); return; }
    const p = ctx.editor()?.box.querySelector(`p[data-id="${CSS.escape(item.id)}"]`);
    if (lit) delete lit.dataset.reading;
    if (p){ p.dataset.reading = '1'; p.scrollIntoView({ block: 'center', behavior: 'smooth' }); lit = p; }
    const u = new SpeechSynthesisUtterance(item.text);
    const v = item.voice; if (v){ u.voice = v.voice; u.lang = v.voice?.lang || u.lang; u.pitch = v.pitch; }
    u.lang ||= item.lang;
    u.rate = pref('readRate') || 1;
    // how long each speech really takes, for the running time (Report > Runtime): kept at normal speed
    let t0 = 0;
    u.onstart = () => { t0 = performance.now(); };
    u.onend = () => { if (t0 && item.spoken && !ctx.readOnly()){ (ctx.script.timing ||= {})[item.id] = Math.round((performance.now() - t0) / 1000 * (u.rate || 1) * 10) / 10; timed = true; } next(); };
    u.onerror = () => next();
    draw(item.who);
    synth.speak(u);
  }
  return {
    start(fromId){
      if (!synth) return toast('This browser cannot read aloud.');
      stop();
      const els = ctx.script.els;
      const lang = isGreek(els.map((e) => e.x).join(' ')) ? 'el' : 'en';
      const pool = voicesFor(lang);
      if (!pool.length) toast(lang === 'el' ? 'No Greek voice on this device: it reads with the one it has.' : 'Reading with the voice this device has.');
      // the narrator reads the action; every character gets the next voice (or the same voice, higher or lower)
      const narrator = { voice: pool[0], pitch: 1 };
      voiceOf = new Map();
      const pitches = [0.85, 1.15, 0.95, 1.3, 0.75, 1.05];
      charactersOf(els).forEach((c, k) => voiceOf.set(c.name, { voice: pool.length > 1 ? pool[(k + 1) % pool.length] : pool[0], pitch: pool.length > 2 ? 1 : pitches[k % pitches.length] }));
      let start = Math.max(0, els.findIndex((e) => e.id === fromId));
      while (start > 0 && els[start].t !== 'scene') start--;
      queue = []; let who = '';
      for (const e of els.slice(start)){
        const text = e.x.trim(); if (!text) continue;
        if (e.t === 'character'){ who = cleanName(e.x); continue; }
        if (e.t === 'dialogue' || e.t === 'lyric') queue.push({ id: e.id, text, who, voice: voiceOf.get(who) || narrator, lang, spoken: true });
        else if (e.t === 'paren') continue;
        else if (pref('readAction') || e.t === 'scene') queue.push({ id: e.id, text: e.t === 'scene' ? headingSpoken(text, lang) : text, who: e.t === 'scene' ? 'Scene' : 'Action', voice: narrator, lang });
      }
      if (!queue.length) return toast('There is nothing to read from here.');
      idx = 0; playing = true; next();
    },
    stop,
    get playing(){ return playing; },
  };
}
// INT. KITCHEN - NIGHT said as a person would say it
function headingSpoken(x, lang){
  const p = headingParts(x);
  const ie = { INT: lang === 'el' ? 'Εσωτερικό' : 'Interior', EXT: lang === 'el' ? 'Εξωτερικό' : 'Exterior', 'ΕΣΩΤ': 'Εσωτερικό', 'ΕΞΩΤ': 'Εξωτερικό' }[p.ie.replace(/\..*$/, '')] || p.ie;
  return [ie, p.place, p.time].filter(Boolean).join('. ') || x;
}

/* ---------- The report: the script in numbers ---------- */
export function reportOf(script){
  const els = script.els, sc = scenesOf(els), pages = pageCount(els);
  const rows = breakdownOf(script).rows.filter((r) => r.n);
  const count = (f) => rows.filter(f).length;
  const ie = (r) => upper(r.ie || '');
  const words = (e) => e.x.trim().split(/\s+/).filter(Boolean).length;
  const dialogueWords = els.filter((e) => e.t === 'dialogue').reduce((a, e) => a + words(e), 0) || 1;
  const chars = charactersOf(els);
  const locs = new Map();
  rows.forEach((r) => r.items.locations.forEach((l) => locs.set(l, (locs.get(l) || 0) + 1)));
  const stat = (n, l) => h('div', { class: 'rp-stat' }, h('b', {}, String(n)), h('span', {}, l));
  const bar = (label, n, of) => h('div', { class: 'rp-bar' }, h('span', {}, label), h('i', { style: `--w:${of ? Math.round(n / of * 100) : 0}%` }), h('b', {}, String(n)));
  return h('div', { class: 'report' },
    h('div', { class: 'rp-stats' }, stat(pages, pages === 1 ? 'page' : 'pages'), stat(`~${pages}′`, 'on screen'), stat(sc.length, 'scenes'), stat(chars.length, 'speaking parts'), stat(locs.size, 'locations')),
    h('div', { class: 'rp-cols' },
      h('section', {}, h('h4', {}, 'Scenes'),
        bar('INT. / ΕΣΩΤ.', count((r) => /^(INT|ΕΣΩΤ)/.test(ie(r)) && !/EXT|ΕΞΩΤ/.test(ie(r))), rows.length),
        bar('EXT. / ΕΞΩΤ.', count((r) => /^(EXT|ΕΞΩΤ)/.test(ie(r))), rows.length),
        bar('INT./EXT.', count((r) => /INT.*EXT|ΕΣΩΤ.*ΕΞΩΤ|I\/E/.test(ie(r))), rows.length),
        bar('Day / Μέρα', count((r) => /DAY|MORNING|ΜΕΡΑ|ΠΡΩΙ|ΑΠΟΓΕΥΜΑ/.test(upper(r.time))), rows.length),
        bar('Night / Νύχτα', count((r) => /NIGHT|EVENING|ΝΥΧΤΑ|ΒΡΑΔΥ|ΣΟΥΡΟΥΠΟ/.test(upper(r.time))), rows.length)),
      h('section', {}, h('h4', {}, 'Locations'), ...[...locs].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([l, n]) => bar(l, n, rows.length)))),
    h('section', {}, h('h4', {}, 'Characters'),
      h('div', { class: 'rp-table' }, h('div', { class: 'rp-tr rp-th' }, h('span', {}, 'Name'), h('span', {}, 'Speeches'), h('span', {}, 'Words'), h('span', {}, 'Scenes'), h('span', {}, 'Share')),
        ...chars.map((c) => h('div', { class: 'rp-tr' }, h('span', {}, c.name), h('span', {}, String(c.lines)), h('span', {}, String(c.words)), h('span', {}, String(c.scenes)), h('span', {}, `${Math.round(c.words / dialogueWords * 100)}%`))))));
}

/* ---------- Sides: chosen scenes as their own PDF, for an audition or a day's shoot ---------- */
export function sidesDialog(script, makePdf){
  const sc = scenesOf(script.els).filter((s) => script.els[s.i].t === 'scene');
  if (!sc.length) return toast('Sides are made of scenes: write a scene heading first.');
  const ranges = sc.map((s, k) => ({ ...s, els: script.els.slice(s.i, k + 1 < sc.length ? sc[k + 1].i : script.els.length) }));
  const picked = new Set();
  const boxes = ranges.map((s) => { const c = h('input', { type: 'checkbox', onchange: () => { c.checked ? picked.add(s.id) : picked.delete(s.id); } }); return [s, c]; });
  const chars = charactersOf(script.els);
  const who = h('select', { class: 'input', onchange: (e) => {
    const name = e.target.value;
    boxes.forEach(([s, c]) => { const on = !!name && s.els.some((x) => x.t === 'character' && cleanName(x.x) === name); c.checked = on; on ? picked.add(s.id) : picked.delete(s.id); });
  } }, h('option', { value: '' }, 'Every scene of…'), ...chars.map((c) => h('option', { value: c.name }, c.name)));
  const close = modal('Sides', h('div', { class: 'stack' },
    h('p', { class: 'muted small' }, 'The scenes you choose, on their own, numbered as in the whole script.'),
    who,
    h('div', { class: 'sides-list' }, ...boxes.map(([s, c]) => h('label', { class: 'sides-row' }, c, h('span', { class: 'sn' }, String(s.n)), h('span', { class: 'st' }, s.text)))),
    h('button', { class: 'btn primary', type: 'button', onclick: () => {
      if (!picked.size) return toast('Choose a scene first.');
      const only = new Set(ranges.filter((s) => picked.has(s.id)).flatMap((s) => s.els.map((e) => e.id)));
      close(); makePdf(only);
    } }, 'Make the PDF')), { wide: true });
}
