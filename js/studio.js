import { addVersion, askAI, currentUser, deleteVersion, getVersion, listVersions } from './cloud.js?v=6b93529';
import { charactersOf, cleanName, isGreek, metaOf, normalize, scenesOf, upper } from './model.js?v=6b93529';
import { toFountain, fountainToEls } from './fountain.js?v=6b93529';
import { FORMATS, fmtOf } from './formats.js?v=6b93529';
import { I, ago, download, esc, h, modal, toast } from './ui.js?v=6b93529';

/* The writer's studio (Alex, 25 Oct): versions of the script and of a scene, and the AI on the whole script.
   Each gets `ctx`, what the open script gives: { id, script, editor(), save(), setEls(els), goTo(id, page),
   replaceScript(data), me(), readOnly(), caretId(), flush(), pdf(opts), newCopy(data) }. */

export const langOf = (script) => (isGreek(script.els.map((e) => e.x).join(' ')) ? 'el' : 'en');
const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const clone = (v) => JSON.parse(JSON.stringify(v));
const safeName = (s) => (s || 'Untitled').replace(/[\\/:*?"<>|]+/g, ' ').trim();
const seg = (value, opts, on) => { const el = h('div', { class: 'seg' }, ...opts.map(([k, l]) => h('button', { type: 'button', class: value === k ? 'on' : '', onclick: (e) => { [...el.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); on(k); } }, l))); return el; };

// a short fingerprint of what is written, to know whether two versions are the same
export function sigOf(script){
  const s = JSON.stringify([script.titlePage, script.els.map((e) => [e.t, e.x, e.f || 0])]);
  let x = 2166136261;
  for (let i = 0; i < s.length; i++){ x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return (x >>> 0).toString(36);
}

/* the scenes with their lines: [{ n, id, i, j, text, els }] */
export function scenesWithLines(script){
  const sc = scenesOf(script.els);
  return sc.map((s, k) => ({ ...s, j: k + 1 < sc.length ? sc[k + 1].i : script.els.length, els: script.els.slice(s.i, k + 1 < sc.length ? sc[k + 1].i : script.els.length) }));
}
/* the whole script for the AI: Fountain, each scene with its number as [12] */
export function scriptForAI(script){
  const sc = scenesWithLines(script);
  const head = sc.length ? script.els.slice(0, sc[0].i) : script.els;
  return [head.length ? toFountain({ els: head }, { titlePage: false }) : '', ...sc.map((s) => `[${s.n}]\n${toFountain({ els: s.els }, { titlePage: false })}`)].join('\n');
}
// [12] or [3, 14] in an answer: buttons that go to the scene
export function citeText(ctx, text, close){
  const sc = scenesOf(ctx.script.els);
  const out = h('div', { class: 'ai-notes cited' });
  String(text || '').split(/(\[\d+(?:\s*[,–-]\s*\d+)*\])/).forEach((part) => {
    const m = part.match(/^\[(.+)\]$/);
    if (!m){ out.append(part); return; }
    out.append(...m[1].split(/\s*[,–-]\s*/).map((n) => { const s = sc[+n - 1]; return s ? h('button', { type: 'button', class: 'cite', title: s.text, onclick: () => { close?.(); ctx.goTo(s.id, true); } }, n) : `[${n}]`; }));
  });
  return out;
}

/* ---------- comparing two versions ---------- */
/* what changed from a to b, line by line: by the lines' own ids when the two share them (the same script edited),
   else by their words (an imported or translated copy) */
export function diffEls(a, b){
  const key = (e) => e.t + '|' + e.x;
  const ids = new Set(a.map((e) => e.id)), shared = b.filter((e) => ids.has(e.id)).length;
  if (shared >= Math.min(a.length, b.length) * 0.5){
    const A = new Map(a.map((e, i) => [e.id, i])), B = new Set(b.map((e) => e.id));
    const out = []; let ai = 0;
    for (const e of b){
      const i = A.get(e.id);
      if (i == null){ out.push({ k: 'add', e }); continue; }
      while (ai < i){ const x = a[ai++]; if (!B.has(x.id)) out.push({ k: 'del', e: x }); }
      ai = Math.max(ai, i + 1);
      const was = a[i];
      out.push(was.x === e.x && was.t === e.t ? { k: 'same', e } : { k: 'chg', e, was });
    }
    while (ai < a.length){ const x = a[ai++]; if (!B.has(x.id)) out.push({ k: 'del', e: x }); }
    return out;
  }
  // the longest run of lines in common (both lists are a script's lines: a few thousand at most)
  const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = key(a[i]) === key(b[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m){
    if (key(a[i]) === key(b[j])){ out.push({ k: 'same', e: b[j] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ k: 'del', e: a[i++] });
    else out.push({ k: 'add', e: b[j++] });
  }
  while (i < n) out.push({ k: 'del', e: a[i++] });
  while (j < m) out.push({ k: 'add', e: b[j++] });
  // a line taken out and one put in of the same kind, side by side: one changed line
  for (let k = 0; k < out.length - 1; k++) if (out[k].k === 'del' && out[k + 1].k === 'add' && out[k].e.t === out[k + 1].e.t){ out.splice(k, 2, { k: 'chg', e: out[k + 1].e, was: out[k].e }); }
  return out;
}
// the words that changed inside a line
function wordDiff(a, b){
  const A = a.split(/(\s+)/), B = b.split(/(\s+)/), n = A.length, m = B.length;
  if (n * m > 40000) return [h('del', {}, a), ' ', h('ins', {}, b)];
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n || j < m){
    if (i < n && j < m && A[i] === B[j]){ out.push(A[i]); i++; j++; }
    else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) out.push(h('ins', {}, B[j++]));
    else out.push(h('del', {}, A[i++]));
  }
  return out;
}
/* the two side by side as one page: what was added in green, taken out struck in red, changed words marked */
export function compareView(ctx, a, b, { labelA = 'Before', labelB = 'Now' } = {}){
  const rows = diffEls(a.els, b.els);
  const counts = { add: 0, del: 0, chg: 0 };
  rows.forEach((r) => { if (r.k !== 'same') counts[r.k]++; });
  let all = false;
  const list = h('div', { class: 'cmp-page' });
  const line = (r) => h('p', { class: 'e cmp-' + r.k, 'data-t': r.e.t }, r.k === 'chg' ? wordDiff(r.was.x, r.e.x) : r.e.x || ' ');
  const draw = () => {
    if (!counts.add && !counts.del && !counts.chg){ list.replaceChildren(h('p', { class: 'muted center' }, 'The two are the same.')); return; }
    // only the scenes where something changed, unless everything is asked for
    const groups = []; let cur = null;
    for (const r of rows){ if (r.e.t === 'scene' || !cur){ cur = { rows: [], changed: false }; groups.push(cur); } cur.rows.push(r); if (r.k !== 'same') cur.changed = true; }
    list.replaceChildren(...groups.filter((g) => all || g.changed).map((g) => h('div', { class: 'cmp-scene' }, ...g.rows.filter((r) => all || r.k !== 'same' || r.e.t === 'scene' || r.e.t === 'character').map(line))));
  };
  draw();
  return h('div', { class: 'cmp' },
    h('div', { class: 'cmp-top' },
      h('span', { class: 'chip cmp-add' }, `${counts.add} added`), h('span', { class: 'chip cmp-chg' }, `${counts.chg} changed`), h('span', { class: 'chip cmp-del' }, `${counts.del} taken out`),
      h('span', { class: 'spacer' }), h('small', { class: 'muted' }, `${labelA} → ${labelB}`),
      seg('changes', [['changes', 'Changes'], ['all', 'Everything']], (k) => { all = k === 'all'; draw(); })),
    list);
}

/* ---------- versions of the script ---------- */
const LKEY = (id) => `rw:${currentUser()?.id}:v:${id}`;
const localList = (id) => { try { return JSON.parse(localStorage.getItem(LKEY(id)) || '[]'); } catch { return []; } };
const setLocal = (id, l) => { try { localStorage.setItem(LKEY(id), JSON.stringify(l.slice(0, 30))); } catch { toast('This device is full: older versions could not be kept here.'); } };
const missing = (e) => e?.status === 404 || /roarwriter_versions|schema cache|relation/i.test(e?.message || '');
// the account's versions, or (before the Versions part of the SQL is run, or offline) this device's
async function versionsOf(ctx){
  try { return { cloud: true, list: await listVersions(ctx.id) }; }
  catch (e) { return { cloud: false, list: localList(ctx.id).map(({ data, ...v }) => v), why: missing(e) ? 'sql' : 'offline' }; }
}
async function versionData(ctx, v, cloud){ if (!cloud) return localList(ctx.id).find((x) => x.id === v.id)?.data; return (await getVersion(v.id))?.data; }
export async function saveVersion(ctx, name, { auto = false } = {}){
  const data = clone(ctx.script);
  const row = { script_id: ctx.id, name: name || (auto ? 'Auto' : today()), data, meta: { ...metaOf(data), sig: sigOf(data), auto }, by_name: ctx.me() };
  try { await ctx.flush(); const r = await addVersion(row); return { ...row, id: r?.id, created_at: r?.created_at || new Date().toISOString() }; }
  catch {
    const v = { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    setLocal(ctx.id, [v, ...localList(ctx.id)]);
    return v;
  }
}
// once a day, a version of its own when something changed since the last one
export async function autoVersion(ctx){
  if (ctx.readOnly()) return;
  try {
    const { list } = await versionsOf(ctx);
    const last = list[0];
    if (last && (Date.now() - Date.parse(last.created_at) < 20 * 3600e3 || last.meta?.sig === sigOf(ctx.script))) return;
    if (!last && ctx.script.els.length < 3) return;
    await saveVersion(ctx, `Auto · ${today()}`, { auto: true });
  } catch { /* next time */ }
}
export async function openVersions(ctx){
  const body = h('div', { class: 'stack versions' });
  const close = modal('Versions', body, { wide: true });
  const name = h('input', { class: 'input', placeholder: `e.g. Second draft, To the producer · ${today()}` });
  const draw = async () => {
    body.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
    const { cloud, list, why } = await versionsOf(ctx);
    const save = async () => { const v = await saveVersion(ctx, name.value.trim()); name.value = ''; toast(`Saved “${v.name}”`); draw(); };
    name.onkeydown = (e) => { if (e.key === 'Enter'){ e.preventDefault(); save(); } };
    body.replaceChildren(
      ctx.readOnly() ? h('p', { class: 'muted small' }, 'You can read and compare the versions; the people who can edit save and restore them.') : h('div', { class: 'share-add' }, name, h('button', { class: 'btn primary', type: 'button', onclick: save }, h('span', { html: I.plus }), 'Save this version')),
      !cloud ? h('p', { class: 'msg' }, why === 'sql' ? 'Versions are kept on this device until the Versions part of supabase/roarwriter.sql is run in Supabase; then everyone the script is shared with sees them.' : 'No connection: these are the versions kept on this device.') : null,
      list.length ? h('div', { class: 'v-list' }, ...list.map((v) => h('div', { class: 'v-row' + (v.meta?.auto ? ' auto' : '') },
        h('span', { class: 'v-dot', html: v.meta?.auto ? I.clock : I.dup }),
        h('div', { class: 'v-who' }, h('b', {}, v.name || 'Untitled version'), h('small', {}, [ago(v.created_at), v.by_name, v.meta?.pages ? `${v.meta.pages} pages` : '', v.meta?.scenes ? `${v.meta.scenes} scenes` : ''].filter(Boolean).join(' · '))),
        h('button', { class: 'btn', type: 'button', onclick: async () => { const d = await versionData(ctx, v, cloud); if (!d) return toast('This version could not be read.'); showCompare(ctx, normalize(d), ctx.script, v.name, 'Now'); } }, 'Compare'),
        ctx.readOnly() ? null : h('button', { class: 'btn', type: 'button', onclick: async () => {
          if (!confirm(`Go back to “${v.name}”? What is written now is kept as a version first.`)) return;
          const d = await versionData(ctx, v, cloud); if (!d) return toast('This version could not be read.');
          await saveVersion(ctx, `Before going back to “${v.name}”`);
          ctx.replaceScript(normalize(d)); close(); toast(`Back to “${v.name}”`);
        } }, 'Restore'),
        h('button', { class: 'ib', type: 'button', title: 'Delete', 'aria-label': 'Delete', html: I.trash, onclick: async () => {
          if (!confirm(`Delete the version “${v.name}”?`)) return;
          try { if (cloud) await deleteVersion(v.id); else setLocal(ctx.id, localList(ctx.id).filter((x) => x.id !== v.id)); draw(); } catch (e) { toast(e.message || 'Only its owner, or whoever saved it, can delete it.'); }
        } })))) : h('p', { class: 'muted small' }, 'No versions yet. Save one before a big rewrite, or before you send the script; one is also kept on its own every day you write.'),
      list.length > 1 ? h('button', { class: 'linkish', type: 'button', onclick: async () => {
        // two versions with each other: the newest two unless chosen
        const pick = h('select', { class: 'input' }, ...list.map((v, i) => h('option', { value: i, selected: i === 1 }, `${v.name} · ${ago(v.created_at)}`)));
        const pick2 = h('select', { class: 'input' }, ...list.map((v, i) => h('option', { value: i, selected: i === 0 }, `${v.name} · ${ago(v.created_at)}`)));
        const c2 = modal('Compare two versions', h('div', { class: 'stack' }, h('div', { class: 'row2' }, pick, pick2), h('button', { class: 'btn primary', type: 'button', onclick: async () => {
          const [x, y] = [list[+pick.value], list[+pick2.value]];
          const [dx, dy] = await Promise.all([versionData(ctx, x, cloud), versionData(ctx, y, cloud)]);
          if (!dx || !dy) return toast('A version could not be read.');
          c2(); showCompare(ctx, normalize(dx), normalize(dy), x.name, y.name);
        } }, 'Compare')));
      } }, 'Compare two versions with each other') : null);
  };
  draw();
}
function showCompare(ctx, a, b, la, lb){ modal(`${la} → ${lb}`, compareView(ctx, a, b, { labelA: la, labelB: lb }), { wide: true }); }

/* ---------- alternates of a scene: other ways it could go, kept beside it ---------- */
export function sceneAt(ctx, id = ctx.caretId()){
  const sc = scenesWithLines(ctx.script);
  const i = Math.max(0, ctx.script.els.findIndex((e) => e.id === id));
  return sc.filter((s) => s.i <= i).pop() || null;
}
export function openAlternates(ctx){
  const s = sceneAt(ctx);
  if (!s) return toast('Put the cursor in a scene first (after a scene heading).');
  const alts = () => (ctx.script.alts[s.id] ||= []);
  const body = h('div', { class: 'stack alts' });
  const close = modal(`Scene ${s.n} · alternates`, body, { wide: true });
  const current = () => { const n = scenesWithLines(ctx.script).find((x) => x.id === s.id); return n ? n.els : s.els; };
  const keep = (name, els) => { alts().unshift({ id: crypto.randomUUID().slice(0, 8), name, at: new Date().toISOString(), by: ctx.me(), els: clone(els) }); ctx.save(); };
  const use = (a) => {
    const now = current();
    if (!alts().some((x) => JSON.stringify(x.els.map((e) => [e.t, e.x])) === JSON.stringify(now.map((e) => [e.t, e.x])))) keep(`Before “${a.name}”`, now);
    // the alternate takes the scene's place; its heading keeps the scene's id (and with it its alternates, cards, frames)
    const els = a.els.map((e, k) => ({ ...e, id: k === 0 && e.t === now[0].t ? now[0].id : crypto.randomUUID().slice(0, 8) }));
    const all = ctx.script.els, i = all.findIndex((e) => e.id === now[0].id);
    ctx.setEls([...all.slice(0, i), ...els, ...all.slice(i + now.length)]);
    close(); toast(`Scene ${s.n} is now “${a.name}”`);
  };
  const ask = h('textarea', { class: 'input', rows: 2, placeholder: 'Optional: what the other version should try (another point of view, without words, the other character wins…)' });
  let busy = false;
  const draw = () => body.replaceChildren(
    h('p', { class: 'muted small' }, s.text),
    ctx.readOnly() ? null : h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: () => { const n = prompt('A name for this version of the scene', `Version ${alts().length + 1}`); if (n == null) return; keep(n.trim() || `Version ${alts().length + 1}`, current()); draw(); toast('Kept as an alternate'); } }, h('span', { html: I.dup }), 'Keep this version'),
      h('button', { class: 'btn primary', type: 'button', onclick: async () => {
        if (busy) return; busy = true; draw();
        try {
          const r = await askAI({ task: 'rewrite', title: ctx.script.title, lang: langOf(ctx.script), format: FORMATS[fmtOf(ctx.script)].label, characters: charactersOf(ctx.script.els).map((c) => c.name).slice(0, 30),
            scene: toFountain({ els: current() }, { titlePage: false }), prompt: `Write an alternate version of this scene, taking a different approach while keeping its place in the story.${ask.value.trim() ? ' ' + ask.value.trim() : ''}` });
          const els = fountainToEls(r.text || '');
          if (!els.length) throw new Error('The AI gave nothing to use.');
          keep(`AI · ${ask.value.trim().slice(0, 40) || 'another way'}`, els); toast('A new alternate');
        } catch (e) { toast(e.message || 'The AI did not answer.'); }
        busy = false; draw();
      } }, h('span', { html: I.spark }), busy ? 'Writing…' : 'Write one with AI')),
    ctx.readOnly() ? null : ask,
    alts().length ? h('div', { class: 'alt-list' }, ...alts().map((a) => h('article', { class: 'alt' },
      h('div', { class: 'alt-h' }, h('b', {}, a.name), h('small', {}, `${ago(a.at)}${a.by ? ' · ' + a.by : ''}`)),
      h('div', { class: 'ai-preview alt-p' }, ...a.els.slice(0, 14).map((e) => h('p', { class: 'e', 'data-t': e.t }, e.x))),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => modal(`${a.name} → now`, compareView(ctx, { els: a.els }, { els: current() }, { labelA: a.name, labelB: 'Now' }), { wide: true }) }, 'Compare'),
        ctx.readOnly() ? null : h('button', { class: 'btn primary', type: 'button', onclick: () => use(a) }, 'Use this one'),
        ctx.readOnly() ? null : h('button', { class: 'ib', type: 'button', title: 'Delete', 'aria-label': 'Delete', html: I.trash, onclick: () => { ctx.script.alts[s.id] = alts().filter((x) => x.id !== a.id); ctx.save(); draw(); } }))))) : h('p', { class: 'muted small' }, 'No alternates yet: keep this version before you rewrite it, or let the AI write another way it could go.'));
  draw();
}

/* ---------- the AI on the whole script ---------- */
const ask = (ctx, task, extra = {}) => askAI({ task, script: scriptForAI(ctx.script), title: ctx.script.title, lang: langOf(ctx.script), format: FORMATS[fmtOf(ctx.script)].label, ...extra });
const list = (items, f = (x) => x) => h('ul', { class: 'rp-ul' }, ...(items || []).filter(Boolean).map((x) => h('li', {}, f(x))));
const sceneBtn = (ctx, n, close) => { const s = scenesOf(ctx.script.els)[+n - 1]; return s ? h('button', { type: 'button', class: 'cite', title: s.text, onclick: () => { close(); ctx.goTo(s.id, true); } }, String(n)) : null; };
// a PDF of a report: in the app a file, in a browser the print window
export async function docPDF(title, html, file){
  const page = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
  body{font:11pt/1.5 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:#111;margin:0;padding:18mm 18mm}h1{font-size:20pt;margin:0 0 4mm}h2{font-size:13pt;margin:7mm 0 2mm;color:#c2410c}h3{font-size:11pt;margin:4mm 0 1mm}
  p{margin:0 0 3mm;white-space:pre-wrap}ul{margin:0 0 3mm;padding-left:5mm}.muted{color:#666}.chip{display:inline-block;padding:1mm 3mm;border:1px solid #ccc;border-radius:3mm;margin:0 2mm 2mm 0;font-size:9pt}
  table{border-collapse:collapse;width:100%;font-size:9.5pt}td,th{border-bottom:1px solid #ddd;padding:1.5mm 2mm;text-align:left;vertical-align:top}@page{size:A4;margin:0}</style></head><body>${html}</body></html>`;
  if (window.rwDesktop?.pdf) return window.rwDesktop.pdf(page, file, 'A4');
  const w = window.open('', '_blank'); if (!w) throw new Error('Allow pop-ups for RoarWriter to make the PDF.');
  w.document.open(); w.document.write(page); w.document.close(); w.onload = () => setTimeout(() => w.print(), 300);
}
/* a report the AI writes on the whole script: kept in the script (script.reports[key]) so it is not asked again
   until "Read it again"; in English or Greek */
function reportWindow(ctx, { key, title, task, intro, render, text, extra = () => ({}), what = 'Reading the script' }){
  const body = h('div', { class: 'stack report-w' });
  const close = modal(title, body, { wide: true });
  let answer = ctx.script.reports[key]?.lang || langOf(ctx.script);
  const run = async () => {
    body.replaceChildren(h('div', { class: 'ai-wait' }, h('span', { class: 'spin' }), h('span', {}, `${what}… a long script takes a minute or two.`)));
    try {
      const r = await ask(ctx, task, { answer, ...extra() });
      ctx.script.reports[key] = { at: new Date().toISOString(), lang: answer, data: r.data };
      ctx.save(); draw();
    } catch (e) { body.replaceChildren(h('p', { class: 'msg err' }, e.message || 'The AI did not answer.'), h('button', { class: 'btn', type: 'button', onclick: draw }, 'Back')); }
  };
  const langSeg = () => seg(answer, [['en', 'English'], ['el', 'Ελληνικά']], (k) => { answer = k; });
  const draw = () => {
    const saved = ctx.script.reports[key];
    if (!saved){
      body.replaceChildren(h('p', { class: 'muted' }, intro), h('div', { class: 'row' }, langSeg(), h('span', { class: 'spacer' }), h('button', { class: 'btn primary', type: 'button', onclick: run }, h('span', { html: I.spark }), 'Read the script')));
      return;
    }
    const t = text(saved.data);
    body.replaceChildren(
      h('div', { class: 'row rp-bar-top' }, h('small', { class: 'muted' }, `Read ${ago(saved.at)} · ${saved.lang === 'el' ? 'Ελληνικά' : 'English'}`), h('span', { class: 'spacer' }), langSeg(),
        h('button', { class: 'btn', type: 'button', onclick: run }, 'Read it again'),
        h('button', { class: 'ib', type: 'button', title: 'Copy', 'aria-label': 'Copy', html: I.copy, onclick: async () => { try { await navigator.clipboard.writeText(t); toast('Copied'); } catch { toast('Could not copy'); } } }),
        h('button', { class: 'ib', type: 'button', title: 'Save as text', 'aria-label': 'Save as text', html: I.export, onclick: () => download(`${safeName(ctx.script.title)} ${title.toLowerCase()}.txt`, t) }),
        h('button', { class: 'btn', type: 'button', onclick: () => docPDF(title, `<h1>${esc(ctx.script.title || 'Untitled')}</h1><p class="muted">${esc(title)} · ${esc(new Date(saved.at).toLocaleDateString('en-GB'))}</p>${esc(t).split(/\n{2,}/).map((p) => /^[A-Z][A-Z &/]+$/.test(p) ? `<h2>${p}</h2>` : `<p>${p}</p>`).join('')}`, `${safeName(ctx.script.title)} ${title}.pdf`).catch((e) => toast(e.message)) }, 'PDF')),
      render(saved.data, close));
  };
  draw();
  return close;
}

// Coverage: the reader's report
export function openCoverage(ctx){
  reportWindow(ctx, { key: 'coverage', title: 'Coverage', task: 'coverage', what: 'Writing the coverage',
    intro: 'A reader’s report on the whole script, as a producer or a fund would get it: logline, synopsis, structure, characters, what works, what does not, scores and a verdict.',
    render: (d, close) => h('div', { class: 'cov' },
      h('div', { class: 'cov-head' }, h('span', { class: 'cov-v v-' + String(d.verdict || '').toLowerCase() }, d.verdict || ''), h('p', { class: 'cov-log' }, d.logline || '')),
      h('div', { class: 'chips' }, d.genre ? h('span', { class: 'chip' }, d.genre) : null, d.tone ? h('span', { class: 'chip' }, d.tone) : null),
      d.why ? h('p', {}, d.why) : null,
      h('div', { class: 'cov-scores' }, ...Object.entries(d.scores || {}).map(([k, v]) => h('div', { class: 'rp-bar' }, h('span', {}, k[0].toUpperCase() + k.slice(1)), h('i', { style: `--w:${Math.max(0, Math.min(10, +v || 0)) * 10}%` }), h('b', {}, String(v))))),
      h('h4', {}, 'Synopsis'), h('p', {}, d.synopsis || ''),
      d.structure?.length ? [h('h4', {}, 'Structure'), list(d.structure, (s) => [h('b', {}, s.beat), ' ', s.scene ? sceneBtn(ctx, s.scene, close) : '', ' ', s.note || ''])] : null,
      d.characters?.length ? [h('h4', {}, 'Characters'), list(d.characters, (c) => [h('b', {}, c.name), c.role ? ` · ${c.role}` : '', h('br'), h('span', { class: 'muted' }, c.arc || '')])] : null,
      h('div', { class: 'rp-cols' }, h('section', {}, h('h4', {}, 'Strengths'), list(d.strengths)), h('section', {}, h('h4', {}, 'Weaknesses'), list(d.weaknesses))),
      d.notes?.length ? [h('h4', {}, 'Notes for the next draft'), list(d.notes, (n) => citeText(ctx, n, close))] : null),
    text: (d) => [`COVERAGE`, `${d.verdict || ''}: ${d.why || ''}`, `LOGLINE`, d.logline, `GENRE / TONE`, `${d.genre || ''} / ${d.tone || ''}`, `SYNOPSIS`, d.synopsis,
      `STRUCTURE`, (d.structure || []).map((s) => `${s.beat} (scene ${s.scene || '-'}): ${s.note || ''}`).join('\n'), `CHARACTERS`, (d.characters || []).map((c) => `${c.name}, ${c.role || ''}: ${c.arc || ''}`).join('\n'),
      `STRENGTHS`, (d.strengths || []).map((x) => '- ' + x).join('\n'), `WEAKNESSES`, (d.weaknesses || []).map((x) => '- ' + x).join('\n'), `NOTES`, (d.notes || []).map((x) => '- ' + x).join('\n'),
      `SCORES`, Object.entries(d.scores || {}).map(([k, v]) => `${k}: ${v}/10`).join('\n')].join('\n\n') });
}

/* Continuity: what this device finds at once (a name spelt two ways), and the AI's reading of the rest */
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleUpperCase('el-GR');
function lev(a, b){ const m = a.length, n = b.length; if (Math.abs(m - n) > 1) return 2; const d = Array.from({ length: m + 1 }, (_, i) => [i]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
export function localContinuity(script){
  const out = [], names = charactersOf(script.els), sc = scenesOf(script.els);
  const sceneOf = (i) => { let n = 0; sc.forEach((s) => { if (s.i <= i) n = s.n; }); return n; };
  for (let a = 0; a < names.length; a++) for (let b = a + 1; b < names.length; b++){
    const x = names[a].name, y = names[b].name;
    if (x.length < 3 || y.length < 3) continue;
    if (fold(x) === fold(y) || (Math.max(x.length, y.length) >= 4 && lev(fold(x), fold(y)) === 1)) out.push({ scene: sceneOf(names[b].first), kind: 'names', text: `“${x}” (${names[a].lines} lines) and “${y}” (${names[b].lines}): the same person written two ways?`, also: [sceneOf(names[a].first)] });
  }
  return out;
}
export function openContinuity(ctx){
  const local = localContinuity(ctx.script);
  const KIND = { knowledge: 'Who knows what', props: 'Props and wounds', time: 'Time and weather', names: 'Names', place: 'Places', setup: 'Set up, never paid off', other: 'Other' };
  reportWindow(ctx, { key: 'continuity', title: 'Continuity', task: 'continuity', what: 'Checking the continuity',
    intro: `What does not hold together: a character who knows something before they learn it, a prop that changes, a night that turns into day, a thread set up and never paid off.${local.length ? ` Already found here: ${local.length} name${local.length === 1 ? '' : 's'} written two ways.` : ''}`,
    render: (d, close) => {
      const items = [...local, ...(d.issues || [])];
      if (!items.length) return h('p', { class: 'muted' }, 'Nothing found that does not hold together.');
      return h('div', { class: 'cont' }, ...items.map((x) => h('div', { class: 'cont-row' }, h('span', { class: 'chip' }, KIND[x.kind] || x.kind || 'Other'),
        h('div', {}, h('p', {}, x.text), h('div', { class: 'row' }, x.scene ? ['Scene ', sceneBtn(ctx, x.scene, close)] : null, ...(x.also || []).filter((n) => n && n !== x.scene).map((n) => [' · ', sceneBtn(ctx, n, close)]))))));
    },
    text: (d) => [...local, ...(d.issues || [])].map((x) => `[${x.scene || '-'}] ${KIND[x.kind] || x.kind}: ${x.text}`).join('\n') });
}

/* The pitch and funding package: logline, synopses, treatment, characters, director's statement */
export function openPackage(ctx){
  const PARTS = [['logline', 'Logline'], ['tagline', 'Tagline'], ['short', 'Short synopsis'], ['long', 'Synopsis'], ['treatment', 'Treatment'], ['characters', 'Characters'], ['statement', 'Director’s statement (first draft)'], ['themes', 'Themes'], ['audience', 'Audience'], ['comparables', 'Comparable titles']];
  const asText = (d, k) => k === 'characters' ? (d.characters || []).map((c) => `${c.name}\n${c.bio}`).join('\n\n') : Array.isArray(d[k]) ? d[k].join('\n') : String(d[k] || '');
  reportWindow(ctx, { key: 'package', title: 'Pitch package', task: 'package', what: 'Writing the package',
    intro: 'What a fund, a market or a producer asks for, from your script: logline, tagline, short and long synopsis, a treatment, the characters, a first draft of the director’s statement, themes, audience and comparable films. In English or Greek; every part can be copied on its own.',
    render: (d) => h('div', { class: 'pack' }, ...PARTS.filter(([k]) => asText(d, k).trim()).map(([k, l]) => h('section', { class: 'pack-part' },
      h('div', { class: 'pack-h' }, h('h4', {}, l), h('small', { class: 'muted' }, `${asText(d, k).split(/\s+/).filter(Boolean).length} words`), h('button', { class: 'ib', type: 'button', title: 'Copy', 'aria-label': 'Copy ' + l, html: I.copy, onclick: async () => { try { await navigator.clipboard.writeText(asText(d, k)); toast(`${l} copied`); } catch { toast('Could not copy'); } } })),
      h('p', {}, asText(d, k))))),
    text: (d) => [d.title ? d.title.toUpperCase() : '', ...PARTS.map(([k, l]) => (asText(d, k).trim() ? `${l.toUpperCase()}\n\n${asText(d, k)}` : ''))].filter(Boolean).join('\n\n') });
}

/* The budget pass (Alex, 25 Oct): what makes it expensive to shoot, and a cheaper way to the same story value */
export function openBudget(ctx){
  const COST = { high: 'High', mid: 'Medium', low: 'Low' };
  reportWindow(ctx, { key: 'budget', title: 'Budget pass', task: 'budget', what: 'Reading it as a line producer',
    intro: 'The script read as a line producer reads it: night exteriors, crowds, rain, stunts, vehicles, animals, children, period, VFX, locations used once. For each, why it costs and a cheaper way to keep what it gives the story.',
    render: (d, close) => h('div', { class: 'bud' },
      h('div', { class: 'cov-head' }, h('span', { class: 'cov-v v-' + (d.level || '') }, ({ micro: 'Micro budget', low: 'Low budget', medium: 'Medium budget', high: 'High budget' })[d.level] || ''), h('p', {}, d.summary || '')),
      d.locations ? h('p', { class: 'muted' }, d.locations) : null,
      ...(d.items || []).map((x) => h('div', { class: 'bud-row c-' + x.cost },
        h('div', { class: 'bud-h' }, h('span', { class: 'chip dot', style: `--d:${x.cost === 'high' ? '#e5484d' : x.cost === 'mid' ? '#f2c230' : '#5cb85c'}` }, COST[x.cost] || x.cost), h('b', {}, x.what), x.scene ? sceneBtn(ctx, x.scene, close) : null),
        h('p', { class: 'muted' }, x.why), h('p', {}, h('b', {}, 'Cheaper: '), x.cheaper)))),
    text: (d) => [`BUDGET PASS`, d.summary, d.locations, ...(d.items || []).map((x) => `[${x.scene || '-'}] ${x.what} (${x.cost})\n${x.why}\nCheaper: ${x.cheaper}`)].filter(Boolean).join('\n\n') });
}

/* ---------- runtime and the tension of the story ---------- */
/* how long it runs: from the words (dialogue as it is spoken, action as it plays), corrected by what reading it
   aloud has measured (script.timing: seconds per line) */
export function runtimeOf(script){
  const words = (e) => (e.x.trim() ? e.x.trim().split(/\s+/).length : 0);
  const est = (e) => (['dialogue', 'lyric'].includes(e.t) ? words(e) / 2.7 + 0.5 : e.t === 'scene' ? 1.5 : ['character', 'paren'].includes(e.t) ? 0 : e.t === 'transition' ? 1 : words(e) / 3.4 + 0.6);
  const timed = script.els.filter((e) => script.timing?.[e.id] && ['dialogue', 'lyric'].includes(e.t));
  const k = timed.length >= 5 ? Math.min(2, Math.max(0.5, timed.reduce((a, e) => a + script.timing[e.id], 0) / timed.reduce((a, e) => a + est(e), 0))) : 1;
  const sec = (e) => script.timing?.[e.id] ?? (['dialogue', 'lyric'].includes(e.t) ? est(e) * k : est(e));
  const scenes = scenesWithLines(script).map((s) => ({ n: s.n, id: s.id, text: s.text, sec: s.els.reduce((a, e) => a + sec(e), 0) }));
  const total = script.els.reduce((a, e) => a + sec(e), 0);
  return { total, scenes, measured: timed.length };
}
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
// for the Report: the minutes, and the tension of every scene along them
export function paceSection(ctx, redraw){
  const rt = runtimeOf(ctx.script), pace = ctx.script.pacing;
  const W = 640, H = 170, P = 24;
  let x = 0; const xs = rt.scenes.map((s) => { const a = x; x += s.sec; return a + s.sec / 2; });
  const X = (t) => P + (rt.total ? t / rt.total : 0) * (W - 2 * P);
  const tension = new Map((pace?.scenes || []).map((s) => [+s.scene, s]));
  const pts = rt.scenes.map((s, i) => tension.has(s.n) ? [X(xs[i]), H - P - (Math.max(1, Math.min(10, +tension.get(s.n).tension || 1)) - 1) / 9 * (H - 2 * P), s] : null).filter(Boolean);
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'pace-svg');
  const add = (tag, a) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) n.setAttribute(k, v); svg.appendChild(n); return n; };
  // the minutes along the bottom, every ten
  for (let m = 0; m * 60 <= rt.total; m += 10){ add('line', { x1: X(m * 60), x2: X(m * 60), y1: P, y2: H - P, class: 'pace-grid' }); add('text', { x: X(m * 60), y: H - 6, class: 'pace-t' }).textContent = `${m}′`; }
  rt.scenes.forEach((s, i) => add('rect', { x: X(xs[i] - s.sec / 2), y: H - P, width: Math.max(1, X(s.sec) - P - 1), height: 4, class: 'pace-scene' }));
  if (pts.length > 1) add('path', { d: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '), class: 'pace-line' });
  pts.forEach(([px, py, s]) => { const c = add('circle', { cx: px, cy: py, r: 4.5, class: 'pace-dot' }); const t = document.createElementNS(NS, 'title'); t.textContent = `Scene ${s.n} · ${tension.get(s.n).tension}/10 · ${tension.get(s.n).note || ''}`; c.appendChild(t); c.addEventListener('click', () => { document.querySelector('.modal-bg')?.remove(); ctx.goTo(s.id, true); }); });
  let busy = false;
  const read = h('button', { class: 'btn', type: 'button', onclick: async () => {
    if (busy) return; busy = true; read.textContent = 'Reading the tension…';
    try { const r = await ask(ctx, 'pacing', { answer: langOf(ctx.script) }); ctx.script.pacing = { at: new Date().toISOString(), ...r.data }; ctx.save(); redraw(); }
    catch (e) { toast(e.message || 'The AI did not answer.'); read.textContent = 'Read the tension with AI'; }
    busy = false;
  } }, h('span', { html: I.spark }), pace ? 'Read it again' : 'Read the tension with AI');
  return h('section', { class: 'pace' },
    h('div', { class: 'pace-h' }, h('h4', {}, 'Runtime and tension'), h('span', { class: 'spacer' }), read),
    h('div', { class: 'rp-stats' },
      h('div', { class: 'rp-stat' }, h('b', {}, mmss(rt.total)), h('span', {}, 'estimated running time')),
      h('div', { class: 'rp-stat' }, h('b', {}, rt.scenes.length ? mmss(rt.total / rt.scenes.length) : '0:00'), h('span', {}, 'a scene, on average')),
      h('div', { class: 'rp-stat' }, h('b', {}, String(rt.measured)), h('span', {}, 'speeches timed by Read aloud'))),
    svg,
    pace?.summary ? h('p', { class: 'muted' }, pace.summary) : h('p', { class: 'muted small' }, 'The time comes from the words (dialogue as spoken, action as it plays) and gets truer every time you read the script aloud. The AI rates the tension of every scene, drawn here along the minutes.'),
    h('div', { class: 'pace-list' }, ...rt.scenes.slice().sort((a, b) => b.sec - a.sec).slice(0, 6).map((s) => h('div', { class: 'rp-bar' }, h('span', {}, `${s.n}. ${s.text}`), h('i', { style: `--w:${rt.scenes.length ? Math.round(s.sec / Math.max(...rt.scenes.map((x) => x.sec)) * 100) : 0}%` }), h('b', {}, mmss(s.sec))))));
}

/* ---------- a translated copy, keeping the format (Fade In / Final Draft as it was, in the other language) ---------- */
export function openTranslate(ctx){
  const from = langOf(ctx.script);
  let to = from === 'el' ? 'en' : 'el';
  const body = h('div', { class: 'stack' });
  const close = modal('Translate', body);
  const draw = () => body.replaceChildren(
    h('p', { class: 'muted' }, 'A new copy of the script in the other language: every scene heading, action and speech translated, the format, the scenes and the names kept (each name written the same way everywhere). This script stays as it is.'),
    h('div', { class: 'row' }, h('span', {}, 'Into'), seg(to, [['en', 'English'], ['el', 'Ελληνικά']], (k) => { to = k; })),
    h('button', { class: 'btn primary', type: 'button', onclick: run }, h('span', { html: I.globe }), 'Make the translated copy'));
  const run = async () => {
    const els = ctx.script.els;
    const bar = h('i', { style: '--w:0%' }), msg = h('span', {}, 'The names first…');
    body.replaceChildren(h('div', { class: 'rp-bar tr-bar' }, msg, bar, h('b', {}, '')));
    try {
      // the names, once, so every line writes them the same way
      const names = charactersOf(els).map((c) => c.name);
      const map = new Map();
      if (names.length){
        const r = await askAI({ task: 'translate', to, items: names.map((x) => ({ t: 'character', x })) });
        names.forEach((n, i) => map.set(n, upper(String(r.items?.[i] || n).trim()) || n));
      }
      const glossary = [...map].map(([a, b]) => `${a} = ${b}`).join(', ');
      const todo = els.map((e, i) => [e, i]).filter(([e]) => e.x.trim() && e.t !== 'character');
      const out = els.map((e) => ({ ...e }));
      const batches = []; for (let i = 0; i < todo.length; i += 90) batches.push(todo.slice(i, i + 90));
      let done = 0;
      // three batches at a time
      const work = async () => { while (batches.length){ const b = batches.shift(); const r = await askAI({ task: 'translate', to, glossary, items: b.map(([e]) => ({ t: e.t, x: e.x })) }); b.forEach(([e, i], k) => { const t = r.items?.[k]; if (typeof t === 'string' && t.trim()){ out[i].x = t; delete out[i].f; } }); done += b.length; bar.style.setProperty('--w', `${Math.round(done / todo.length * 100)}%`); msg.textContent = `${done} of ${todo.length} lines`; } };
      await Promise.all([work(), work(), work()]);
      for (const e of out) if (e.t === 'character'){ const base = cleanName(e.x); if (map.has(base)) e.x = e.x.replace(/^[^(]*/, (m) => map.get(base) + (m.endsWith(' ') ? ' ' : '')); }
      const tTitle = ctx.script.titlePage.title ? (await askAI({ task: 'translate', to, items: [{ t: 'title', x: ctx.script.titlePage.title }] })).items?.[0] || ctx.script.titlePage.title : '';
      const copy = normalize({ ...clone(ctx.script), els: out.map(({ rv, ...e }) => e), notes: [], alts: {}, reports: {}, pacing: null, revision: {}, timing: {},
        tags: (ctx.script.tags || []).filter((t) => t.cat === 'cast').map((t) => ({ ...t, name: map.get(upper(t.name)) || t.name })) });
      copy.title = copy.titlePage.title = tTitle;
      copy.titlePage.credit = to === 'el' ? 'Σενάριο' : 'Written by';
      close(); ctx.newCopy(copy); toast(to === 'el' ? 'The Greek copy is ready' : 'The English copy is ready');
    } catch (e) { body.replaceChildren(h('p', { class: 'msg err' }, e.message || 'The translation stopped.'), h('button', { class: 'btn', type: 'button', onclick: draw }, 'Back')); }
  };
  draw();
}

/* ---------- the AI panel's other two modes: the whole script, and the research desk ---------- */
export function scriptPane(ctx){
  const q = h('textarea', { class: 'input', rows: 3, placeholder: 'Ask anything about the script: where does Anna first lie? Does the midpoint land? Which threads are left open?' });
  const out = h('div', { class: 'ai-out' });
  let busy = false;
  const go = async () => {
    if (!q.value.trim()) return toast('Write the question first.');
    if (busy) return; busy = true;
    out.replaceChildren(h('div', { class: 'ai-wait' }, h('span', { class: 'spin' }), h('span', {}, 'Reading the whole script…')));
    try { const r = await ask(ctx, 'ask', { prompt: q.value.trim(), answer: isGreek(q.value) ? 'el' : 'en' }); out.replaceChildren(citeText(ctx, r.text), h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(r.text); toast('Copied'); } catch {} } }, 'Copy'))); }
    catch (e) { out.replaceChildren(h('p', { class: 'msg err' }, e.message || 'The AI did not answer.')); }
    busy = false;
  };
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)){ e.preventDefault(); go(); } });
  const tool = (icon, label, fn) => h('button', { class: 'btn', type: 'button', onclick: fn }, h('span', { html: icon }), label);
  return [
    h('p', { class: 'muted small' }, 'Reads the whole script. The scenes it mentions, like [12], take you there.'),
    q, h('button', { class: 'btn primary', type: 'button', onclick: go }, 'Ask the script'), out,
    h('div', { class: 'ai-tools' },
      tool(I.page, 'Coverage', () => openCoverage(ctx)),
      tool(I.find, 'Continuity', () => openContinuity(ctx)),
      tool(I.tag, 'Budget pass', () => openBudget(ctx)),
      tool(I.spark, 'Pitch package', () => openPackage(ctx)),
      tool(I.globe, 'Translate', () => (ctx.readOnly() ? toast('Make a copy of a script you can edit to translate it.') : openTranslate(ctx))),
      tool(I.clock, 'Runtime & tension', () => ctx.showReport())),
  ];
}
export function researchPane(ctx){
  const q = h('textarea', { class: 'input', rows: 3, placeholder: 'e.g. How does a criminal trial run in Greece? What phone would a trucker have in 2008? What does a nurse say at shift change?' });
  const out = h('div', { class: 'ai-out' });
  let busy = false;
  const go = async () => {
    if (!q.value.trim()) return toast('Write the question first.');
    if (busy) return; busy = true;
    out.replaceChildren(h('div', { class: 'ai-wait' }, h('span', { class: 'spin' }), h('span', {}, 'Searching…')));
    const s = sceneAt(ctx);
    try {
      const r = await askAI({ task: 'research', prompt: q.value.trim(), title: ctx.script.title, answer: isGreek(q.value) ? 'el' : 'en', scene: s ? toFountain({ els: s.els }, { titlePage: false }) : '' });
      const src = r.sources || [];
      const noteText = `${q.value.trim()}\n\n${r.text}${src.length ? '\n\nSources:\n' + src.map((x) => `${x.title} ${x.url}`).join('\n') : ''}`;
      out.replaceChildren(h('div', { class: 'ai-notes' }, r.text),
        src.length ? h('div', { class: 'srcs' }, h('b', {}, 'Sources'), ...src.map((x) => h('a', { href: x.url, target: '_blank', rel: 'noopener' }, x.title))) : h('p', { class: 'muted small' }, 'No source was found for this.'),
        h('div', { class: 'row' },
          ctx.readOnly() ? null : h('button', { class: 'btn primary', type: 'button', onclick: () => {
            const el = s?.id || ctx.caretId(); if (!el) return toast('Put the cursor in a scene first.');
            (ctx.script.notes ||= []).push({ id: crypto.randomUUID().slice(0, 8), el, text: noteText, by: 'Research', at: new Date().toISOString(), done: false });
            ctx.save(); ctx.notesChanged(); toast(s ? `Kept as a note on scene ${s.n}` : 'Kept as a note');
          } }, h('span', { html: I.note }), 'Keep it as a note on this scene'),
          h('button', { class: 'btn', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(noteText); toast('Copied'); } catch {} } }, 'Copy')));
    } catch (e) { out.replaceChildren(h('p', { class: 'msg err' }, e.message || 'The research did not answer.')); }
    busy = false;
  };
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)){ e.preventDefault(); go(); } });
  return [h('p', { class: 'muted small' }, 'Facts for the scene from the web, with their sources: law, medicine, police, history, places, how people in a job really talk. Keep the answer as a note on the scene.'), q, h('button', { class: 'btn primary', type: 'button', onclick: go }, 'Search'), out];
}
