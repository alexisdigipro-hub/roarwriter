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
export const LABEL = Object.fromEntries(TYPES.map(([k, l]) => [k, l]));

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
    .filter((e) => e && LABEL[e.t]).map((e) => ({ id: e.id || uid(), t: e.t, x: String(e.x ?? '') }));
  if (!s.els.length) s.els = blankScript().els;
  s.tags = Array.isArray(d?.tags) ? d.tags : [];
  return s;
}

// the scenes, numbered, each with where it starts in the list
export function scenesOf(els){
  const out = [];
  els.forEach((e, i) => { if (e.t === 'scene') out.push({ n: out.length + 1, i, id: e.id, text: upper(e.x).trim() || 'NEW SCENE' }); });
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
const WIDTH = { scene: 61, action: 61, character: 38, paren: 25, dialogue: 35, transition: 61, shot: 61, general: 61 };
const GAP = { scene: 2, action: 1, character: 1, paren: 0, dialogue: 0, transition: 1, shot: 1, general: 1 };
export function pageCount(els){
  let lines = 0;
  els.forEach((e, i) => {
    const text = e.x || ' ';
    const n = text.split('\n').reduce((a, l) => a + Math.max(1, Math.ceil(l.length / WIDTH[e.t])), 0);
    lines += n + (i ? GAP[e.t] : 0);
  });
  return Math.max(1, Math.ceil(lines / 55));
}

export const metaOf = (s) => ({ author: s.titlePage.author || '', pages: pageCount(s.els), scenes: scenesOf(s.els).length });

/* Two people on one script (Collaborate): what each changed since the copy both started from (base) is kept.
   The other side's script is taken as it is, then this side's own changes are put on it: lines it edited or
   added (after the line they follow), lines it deleted that the other side left alone, the title page's fields
   and the settings it changed, and the tags it added or removed. */
export function mergeScripts(base, mine, theirs){
  base = normalize(base); mine = normalize(mine); theirs = normalize(theirs);
  const B = new Map(base.els.map((e) => [e.id, e])), M = new Map(mine.els.map((e) => [e.id, e]));
  const same = (a, b) => a && b && a.t === b.t && a.x === b.x;
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
  return { ...theirs, title: mine.title !== base.title ? mine.title : theirs.title, titlePage: fields(base.titlePage, mine.titlePage, theirs.titlePage), settings: fields(base.settings, mine.settings, theirs.settings), els, tags };
}
