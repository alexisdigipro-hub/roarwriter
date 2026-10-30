import { KINDS } from './formats.js?v=6b93529';

/* The script as data: a title page and a list of elements, each { id, t (type), x (text) }. The same list is
   what the editor draws, what the scenes and characters come from, and what Fountain, Final Draft and the PDF
   are made of. */

export const TYPES = [
  ['scene', 'Scene Heading', '1'],
  ['action', 'Action', '2'],
  ['character', 'Character', '3'],
  ['paren', 'Parenthetical', '4'],
  ['dialogue', 'Dialogue', '5'],
  ['transition', 'Transition', '6'],
  ['shot', 'Shot', '7'],
  ['general', 'Unformatted Text', '0'], // Final Draft's General: plain text, the whole width, no format
];
// every kind any format uses (formats.js); TYPES above are the film's
export const LABEL = { ...KINDS };

// Enter at the end of an element: what comes next, as in Final Draft
export const NEXT = { scene: 'action', action: 'action', character: 'dialogue', paren: 'dialogue', dialogue: 'character', transition: 'scene', shot: 'action', general: 'general' };
// Tab / Shift+Tab: the element turns into the next / previous kind
const CYCLE = ['action', 'character', 'transition', 'scene', 'shot'];
export function tabType(t, back = false){
  if (t === 'dialogue') return back ? 'character' : 'paren';
  if (t === 'paren') return back ? 'dialogue' : 'dialogue';
  const i = CYCLE.indexOf(t);
  return CYCLE[(i + (back ? CYCLE.length - 1 : 1)) % CYCLE.length];
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));
export const el = (t, x = '') => ({ id: uid(), t, x });

// A scene heading in English or Greek: INT. / EXT. / INT./EXT. / I/E / EST. / ΕΣΩΤ. / ΕΞΩΤ.
export const SCENE_START = /^(INT\.?\/EXT|EXT\.?\/INT|INT|EXT|EST|I\/E|ΕΣΩΤ\.?\/ΕΞΩΤ|ΕΣΩΤ|ΕΞΩΤ|ΕΣ\.|ΕΞ\.)[\.\s]/i;
export const TIMES = ['DAY', 'NIGHT', 'MORNING', 'EVENING', 'CONTINUOUS', 'LATER', 'ΜΕΡΑ', 'ΝΥΧΤΑ', 'ΠΡΩΙ', 'ΑΠΟΓΕΥΜΑ', 'ΣΟΥΡΟΥΠΟ', 'ΣΥΝΕΧΕΙΑ', 'ΑΡΓΟΤΕΡΑ'];

export const upper = (s) => String(s || '').toLocaleUpperCase('el-GR');
export const isGreek = (s) => /[Ͱ-Ͽἀ-῿]/.test(s || '');

export function blankScript(title = 'Untitled'){
  return {
    v: 1,
    title,
    titlePage: { title, episode: '', credit: 'Written by', author: '', copyright: '', draftDate: '', contact: '' },
    settings: { page: 'a4' },
    els: [el('scene', '')],
  };
}

export function normalize(d){
  const s = { ...blankScript(), ...(d || {}) };
  s.titlePage = { ...blankScript().titlePage, ...(d?.titlePage || {}) };
  s.settings = { ...blankScript().settings, ...(d?.settings || {}) };
  s.els = (Array.isArray(d?.els) && d.els.length ? d.els : blankScript().els)
    .filter((e) => e && LABEL[e.t]).map((e) => { const x = String(e.x ?? ''), f = cleanMarks(e.f, x.length); return { id: e.id || uid(), t: e.t, x, ...(e.rv ? { rv: e.rv } : {}), ...(e.du ? { du: 1 } : {}), ...(f.length ? { f } : {}) }; });
  if (!s.els.length) s.els = blankScript().els;
  s.tags = Array.isArray(d?.tags) ? d.tags : [];
  // notes on lines ({ id, el, text, by, at, done }) and the index cards' own words and colours ({ sceneId: { syn, color } })
  s.notes = Array.isArray(d?.notes) ? d.notes.filter((n) => n && n.id && n.el) : [];
  s.cards = d?.cards && typeof d.cards === 'object' && !Array.isArray(d.cards) ? d.cards : {};
  // each scene's storyboard frames ({ sceneId: [{ id, size, angle, move, desc, img }] }) and its other versions
  // ({ sceneId: [{ id, name, at, els }] }), the revision being written ({ on, color, date, locked: { sceneId: '12' } }),
  // the AI's reading of the pace and the seconds each line took read aloud
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  s.boards = obj(d?.boards); s.alts = obj(d?.alts); s.revision = obj(d?.revision); s.timing = obj(d?.timing);
  s.pacing = d?.pacing && Array.isArray(d.pacing.scenes) ? d.pacing : null;
  // what the AI wrote about the whole script, kept so it is not asked (and paid for) again: coverage, continuity, package
  s.reports = obj(d?.reports);
  // the beat board ({ template, items: [{ id, name, desc, scene }] }), the shooting schedule ({ days: [{ id, date, scenes }] })
  // and who writes which scene ({ sceneId: email })
  s.beats = obj(d?.beats); s.schedule = obj(d?.schedule); s.assign = obj(d?.assign);
  return s;
}

/* Bold, italic and underline inside a line (Alex, 25 Oct): e.f = [[from, to, 'b' | 'i' | 'u'], …], kept tidy
   (each style's ranges sorted, joined where they touch, inside the text) */
export function cleanMarks(f, len){
  if (!Array.isArray(f) || !f.length) return [];
  const out = [];
  for (const st of ['b', 'i', 'u']){
    const r = f.filter((m) => Array.isArray(m) && m[2] === st).map(([a, b]) => [Math.max(0, Math.min(len, a | 0)), Math.max(0, Math.min(len, b | 0))]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
    for (const [a, b] of r){ const last = out.length && out[out.length - 1][2] === st ? out[out.length - 1] : null; if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b, st]); }
  }
  return out;
}
// the marks of the part from a to b, counted from a
export const sliceMarks = (f, a, b) => cleanMarks((f || []).map(([p, q, st]) => [Math.max(p, a) - a, Math.min(q, b) - a, st]), b - a);
// the text in pieces, each with its styles
export function segmentsOf(x, f){
  if (!f?.length) return [{ text: x, b: false, i: false, u: false }];
  const cuts = [...new Set([0, x.length, ...f.flatMap(([a, b]) => [a, b])])].filter((c) => c >= 0 && c <= x.length).sort((a, b) => a - b);
  const out = [];
  for (let k = 0; k < cuts.length - 1; k++){
    const a = cuts[k], b = cuts[k + 1], on = (st) => f.some(([p, q, t]) => t === st && p <= a && q >= b);
    out.push({ text: x.slice(a, b), b: on('b'), i: on('i'), u: on('u') });
  }
  return out;
}

// the scenes, numbered, each with where it starts in the list
export function scenesOf(els){
  const out = [];
  // (a comic's pages are its scenes)
  els.forEach((e, i) => { if (e.t === 'scene' || e.t === 'page') out.push({ n: out.length + 1, i, id: e.id, text: upper(e.x).trim() || 'NEW SCENE' }); });
  return out;
}

// the characters: a name without its extension, (V.O.), (O.S.), (CONT'D)
export const cleanName = (x) => upper(x).replace(/\s*\(.*?\)\s*/g, ' ').replace(/\^$/, '').trim();
export function charactersOf(els){
  const map = new Map();
  let scene = 0;
  els.forEach((e, i) => {
    if (e.t === 'scene') scene++;
    if (e.t !== 'character') return;
    const name = cleanName(e.x);
    if (!name) return;
    const c = map.get(name) || { name, lines: 0, words: 0, scenes: new Set(), first: i };
    c.lines++;
    for (let j = i + 1; j < els.length && (els[j].t === 'dialogue' || els[j].t === 'paren'); j++) if (els[j].t === 'dialogue') c.words += els[j].x.trim().split(/\s+/).filter(Boolean).length;
    c.scenes.add(scene);
    map.set(name, c);
  });
  return [...map.values()].map((c) => ({ ...c, scenes: c.scenes.size })).sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name));
}

// the place of a scene heading, for suggestions: INT. HOUSE - NIGHT -> HOUSE
export function placesOf(els){
  const set = new Set();
  els.forEach((e) => { if (e.t !== 'scene') return; const m = upper(e.x).replace(SCENE_START, '').replace(/^[\.\s/]+/, '').split(/\s+[-–—]\s+/)[0].trim(); if (m) set.add(m); });
  return [...set];
}

/* Pages by the industry rule of thumb (55 lines a page, Courier 12): how many lines each element takes at its
   width, with the blank line before it. Good for the count in the bar; the PDF lays the pages out for real. */
const WIDTH = { scene: 61, action: 61, character: 38, paren: 25, dialogue: 35, transition: 61, shot: 61, general: 61, act: 61, endact: 61, lyric: 50, sound: 61, music: 61, video: 29, audio: 29, page: 61, panel: 61, caption: 50 };
const GAP = { scene: 2, action: 1, character: 1, paren: 0, dialogue: 0, transition: 1, shot: 1, general: 1, act: 0, endact: 2, lyric: 0, sound: 1, music: 1, video: 1, audio: 0, page: 0, panel: 2, caption: 1 };
export function pageCount(els){
  let lines = 0;
  els.forEach((e, i) => {
    const text = e.x || ' ';
    const n = text.split('\n').reduce((a, l) => a + Math.max(1, Math.ceil(l.length / WIDTH[e.t])), 0);
    lines += n + (i ? GAP[e.t] : 0);
  });
  return Math.max(1, Math.ceil(lines / 55));
}

// what the list of scripts shows: the numbers, and the first lines (peek), drawn small as the page begins
export const metaOf = (s) => ({ author: s.titlePage.author || '', pages: pageCount(s.els), scenes: scenesOf(s.els).length, format: s.settings?.format || 'film',
  ...(s.kind === 'series' ? { kind: 'series', episodes: s.series?.episodes?.length || 0 } : {}), ...(s.settings?.series ? { series: s.settings.series, episode: s.titlePage.episode || '' } : {}),
  words: s.els.reduce((a, e) => a + (e.x.trim() ? e.x.trim().split(/\s+/).length : 0), 0),
  peek: s.els.filter((e) => e.x.trim()).slice(0, 12).map((e) => [e.t, e.x.split('\n')[0].slice(0, 80)]) });

/* Two people on one script (Collaborate): what each changed since the copy both started from (base) is kept.
   The other side's script is taken as it is, then this side's own changes are put on it: lines it edited or
   added (after the line they follow), lines it deleted that the other side left alone, the title page's fields
   and the settings it changed, and the tags it added or removed. */
export function mergeScripts(base, mine, theirs){
  base = normalize(base); mine = normalize(mine); theirs = normalize(theirs);
  const B = new Map(base.els.map((e) => [e.id, e])), M = new Map(mine.els.map((e) => [e.id, e]));
  const same = (a, b) => a && b && a.t === b.t && a.x === b.x && (a.rv || '') === (b.rv || '') && !!a.du === !!b.du && JSON.stringify(a.f || []) === JSON.stringify(b.f || []);
  let els = theirs.els.filter((e) => {
    if (M.has(e.id)) return true;
    return !(B.has(e.id) && same(B.get(e.id), e)); // deleted here, untouched there: gone
  }).map((e) => { const m = M.get(e.id); return m && !same(m, B.get(e.id)) ? { ...m } : e; });
  mine.els.forEach((e, i) => {
    if (B.has(e.id) || els.some((x) => x.id === e.id)) return;
    let at = -1;
    for (let k = i - 1; k >= 0 && at < 0; k--) at = els.findIndex((x) => x.id === mine.els[k].id);
    els.splice(at + 1, 0, { ...e });
  });
  if (!els.length) els = theirs.els;
  const fields = (b, m, t) => Object.fromEntries([...new Set([...Object.keys(t), ...Object.keys(m)])].map((k) => [k, m[k] !== b[k] ? m[k] : t[k]]));
  const tag = (t) => t.cat + '|' + String(t.name).toLowerCase();
  const bt = new Set((base.tags || []).map(tag)), mt = new Set((mine.tags || []).map(tag));
  const tags = [...(theirs.tags || []).filter((t) => mt.has(tag(t)) || !bt.has(tag(t))), ...(mine.tags || []).filter((t) => !bt.has(tag(t)) && !(theirs.tags || []).some((x) => tag(x) === tag(t)))];
  // notes: one by one, what changed here wins, what was added on either side stays, what was deleted here goes
  const byId = (l) => new Map((l || []).map((n) => [n.id, n]));
  const bn = byId(base.notes), mn = byId(mine.notes), tn = byId(theirs.notes);
  const notes = [...new Set([...tn.keys(), ...mn.keys()])].map((k) => {
    const m = mn.get(k), t = tn.get(k), b = bn.get(k);
    if (!m) return b ? null : t;                        // deleted here (or only theirs)
    if (!t) return b ? null : m;                        // deleted there (or only mine)
    return JSON.stringify(m) !== JSON.stringify(b) ? m : t;
  }).filter(Boolean);
  const cards = fields(base.cards || {}, mine.cards || {}, theirs.cards || {});
  // (each entry compared by what it holds: a scene's frames, its alternates, a report)
  const keyed = (k) => { const b = base[k] || {}, m = mine[k] || {}, t = theirs[k] || {}, J = JSON.stringify;
    return Object.fromEntries([...new Set([...Object.keys(t), ...Object.keys(m), ...Object.keys(b)])].map((x) => [x, J(m[x]) !== J(b[x]) ? m[x] : t[x]]).filter(([, v]) => v !== undefined)); };
  return { ...theirs, title: mine.title !== base.title ? mine.title : theirs.title, titlePage: fields(base.titlePage, mine.titlePage, theirs.titlePage), settings: fields(base.settings, mine.settings, theirs.settings), els, tags, notes, cards,
    boards: keyed('boards'), alts: keyed('alts'), timing: keyed('timing'), revision: keyed('revision'), reports: keyed('reports'), ...(theirs.kind || mine.kind ? { kind: theirs.kind || mine.kind, series: JSON.stringify(mine.series) !== JSON.stringify(base.series) ? mine.series : theirs.series } : {}), beats: keyed('beats'), schedule: keyed('schedule'), assign: keyed('assign'), pacing: JSON.stringify(mine.pacing) !== JSON.stringify(base.pacing) ? mine.pacing : theirs.pacing };
}

/* Scene numbers: 1, 2, 3 (a sitcom letters them, A, B, C); a comic's pages and a play's scenes count too */
export function sceneNumbers(els, letters = false, locked = null){
  const out = new Map(); let n = 0;
  const L = (k) => { let s = ''; for (k++; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s; return s; };
  if (locked && Object.keys(locked).length){
    // locked numbers (a shooting script): a scene keeps its number; a new one after 12 is 12A, 12B…, before the first A1
    let last = '', added = 0;
    const first = els.find((e) => e.t === 'scene' && locked[e.id]);
    for (const e of els) if (e.t === 'scene'){
      if (locked[e.id]){ last = locked[e.id]; added = 0; out.set(e.id, last); }
      else { out.set(e.id, last ? last + L(added) : L(added) + (first ? locked[first.id] : '1')); added++; }
    }
    return out;
  }
  for (const e of els) if (e.t === 'scene'){ out.set(e.id, letters ? L(n) : String(n + 1)); n++; }
  return out;
}
/* Dual dialogue: a character marked du speaks at the same time as the one before; their blocks sit side by side */
export function dualOf(els){
  const out = new Map(); // id -> 'L' | 'R' (and 'C' for the line after the pair, which clears it)
  const blockAt = (i) => { const ids = [els[i].id]; for (let k = i + 1; k < els.length && ['dialogue', 'paren', 'lyric'].includes(els[k].t); k++) ids.push(els[k].id); return ids; };
  els.forEach((e, i) => {
    if (e.t !== 'character' || !e.du) return;
    let j = i - 1; while (j >= 0 && ['dialogue', 'paren', 'lyric'].includes(els[j].t)) j--;
    if (j < 0 || els[j].t !== 'character') return;
    blockAt(j).forEach((id) => out.set(id, 'L'));
    const r = blockAt(i); r.forEach((id) => out.set(id, 'R'));
    const after = els[i + r.length]; if (after && !out.has(after.id)) out.set(after.id, 'C');
  });
  return out;
}
// the colours of the revisions, in the order the industry uses them
export const REVISIONS = [['blue', 'Blue', '#4a90e2'], ['pink', 'Pink', '#f48fb1'], ['yellow', 'Yellow', '#f2c230'], ['green', 'Green', '#5cb85c'], ['goldenrod', 'Goldenrod', '#daa520'], ['buff', 'Buff', '#d8b98a'], ['salmon', 'Salmon', '#fa8072'], ['cherry', 'Cherry', '#d2042d'], ['tan', 'Tan', '#c8a97e']];
/* (CONT'D): a character who speaks again in the same scene with only action between, as Final Draft adds it */
export function contdOf(els){
  const out = new Set(); let last = '';
  for (const e of els){
    if (e.t === 'scene' || e.t === 'act' || e.t === 'page') last = '';
    else if (e.t === 'character'){ const n = cleanName(e.x); if (n && n === last && !/\(CONT'?D\)|\(ΣΥΝ\.?\)/i.test(e.x)) out.add(e.id); last = n; }
    else if (!['action', 'dialogue', 'paren', 'lyric', 'general'].includes(e.t)) last = '';
  }
  return out;
}
