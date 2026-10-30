import { SCENE_START, charactersOf, cleanName, scenesOf, uid, upper } from './model.js?v=6b93529';

/* Breakdown (Alex, 24 Oct): the script's elements for the shoot. A tag is a word or a phrase with a category
   ({ id, cat, name } in script.tags); every place it appears in the script counts, as Final Draft's "tag all", and
   is lit on the page in its category's colour (CSS Custom Highlights, so the text itself stays plain). The cast
   and the locations come from the script by themselves (who speaks, the scene headings); tagging adds to them. */

export const CATS = [
  ['cast', 'Cast', '#e5484d'],
  ['extras', 'Extras', '#30a46c'],
  ['props', 'Props', '#8e4ec6'],
  ['locations', 'Locations', '#0091ff'],
  ['wardrobe', 'Wardrobe', '#f76b15'],
  ['makeup', 'Makeup & Hair', '#d6409f'],
  ['vehicles', 'Vehicles', '#12a594'],
  ['animals', 'Animals', '#a18072'],
  ['sfx', 'Special Effects', '#ffb224'],
  ['stunts', 'Stunts', '#e54666'],
  ['sound', 'Sound & Music', '#3e63dd'],
  ['set', 'Set Dressing', '#7c66dc'],
];
export const CAT = Object.fromEntries(CATS.map(([k, l, c]) => [k, { label: l, color: c }]));

export function normalizeTags(list){
  const seen = new Set();
  return (Array.isArray(list) ? list : []).filter((t) => t && CAT[t.cat] && String(t.name || '').trim())
    .map((t) => ({ id: t.id || uid(), cat: t.cat, name: String(t.name).trim().slice(0, 120) }))
    .filter((t) => { const k = t.cat + '|' + fold(t.name); if (seen.has(k)) return false; seen.add(k); return true; });
}

// one character for one character, without accents or case (ΝΙΚΟΣ finds Νίκος, final ς finds σ), so a place
// found in the folded text is the same place in the real one
export function fold(s){
  let out = '';
  for (const c of String(s || '')){ const b = c.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('el-GR'); out += (b === 'ς' ? 'σ' : b)[0] || c; }
  return out;
}
const isWord = (c) => !!c && /[\p{L}\p{N}]/u.test(c);
// where a tag's name is in a text: whole words only
export function findIn(text, name){
  const t = fold(text), n = fold(name).trim(), out = [];
  if (!n) return out;
  for (let i = t.indexOf(n); i >= 0; i = t.indexOf(n, i + 1)) if (!isWord(t[i - 1]) && !isWord(t[i + n.length])) out.push([i, i + n.length]);
  return out;
}

// a scene heading in its parts: INT. / EXT., the place, the time of day
export function headingParts(x){
  const up = upper(x).trim();
  const m = up.match(SCENE_START);
  const ie = m ? m[0].replace(/[\s.]+$/, '') : '';
  const rest = (m ? up.slice(m[0].length) : up).replace(/^[\.\s/]+/, '');
  const [place, ...time] = rest.split(/\s+[-–—]\s+/);
  return { ie, place: (place || '').trim(), time: time.join(' - ').trim() };
}

/* By scene: for every scene, its heading's parts, the cast (who speaks, and tagged cast seen in it) and every
   tagged element seen in it. By element: every element with the scenes it is in. */
export function breakdownOf(script){
  const els = script.els, tags = script.tags || [];
  const scenes = scenesOf(els);
  if (!scenes.length || scenes[0].i > 0) scenes.unshift({ n: 0, i: 0, id: els[0]?.id, text: '' });
  const rows = scenes.map((s, k) => {
    const end = k + 1 < scenes.length ? scenes[k + 1].i : els.length;
    const part = els.slice(s.i, end);
    const items = Object.fromEntries(CATS.map(([c]) => [c, new Set()]));
    charactersOf(part).forEach((c) => items.cast.add(c.name));
    const h = s.n ? headingParts(els[s.i].x) : { ie: '', place: '', time: '' };
    if (h.place) items.locations.add(h.place);
    for (const t of tags) if (part.some((e) => findIn(e.x, t.name).length)) items[t.cat].add(t.cat === 'cast' ? cleanName(t.name) : t.name);
    return { n: s.n, id: s.id, heading: s.text, ...h, items: Object.fromEntries(Object.entries(items).map(([c, v]) => [c, [...v]])) };
  }).filter((r) => r.n || Object.values(r.items).some((v) => v.length));
  const byEl = Object.fromEntries(CATS.map(([c]) => [c, new Map()]));
  rows.forEach((r) => Object.entries(r.items).forEach(([c, list]) => list.forEach((name) => {
    const key = fold(name); const m = byEl[c];
    const e = m.get(key) || { name, scenes: [] }; if (!e.scenes.includes(r.n)) e.scenes.push(r.n); m.set(key, e);
  })));
  return { rows, byEl: Object.fromEntries(Object.entries(byEl).map(([c, m]) => [c, [...m.values()].sort((a, b) => b.scenes.length - a.scenes.length || a.name.localeCompare(b.name))])) };
}

export function breakdownCSV(script){
  const { rows } = breakdownOf(script);
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ['Scene', 'INT/EXT', 'Location', 'Time', ...CATS.filter(([c]) => c !== 'locations').map(([, l]) => l)];
  const lines = rows.map((r) => [r.n || '', r.ie, r.items.locations.join('; '), r.time, ...CATS.filter(([c]) => c !== 'locations').map(([c]) => r.items[c].join('; '))].map(q).join(','));
  return '﻿' + [head.map(q).join(','), ...lines].join('\r\n');
}

/* The colours on the page: one highlight per category over every place a tag is found (and, for cast, every
   name that speaks is lit by the category too, in its character line). Browsers without highlights simply
   show no colours. */
export function paintTags(box, tags){
  if (!window.CSS?.highlights || typeof Highlight === 'undefined') return;
  const per = Object.fromEntries(CATS.map(([c]) => [c, []]));
  if (tags?.length) for (const p of box.children){
    const nodes = [], walk = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let n, text = '';
    while ((n = walk.nextNode())){ nodes.push([n, text.length]); text += n.data; }
    if (!text) continue;
    const at = (i) => { for (let k = nodes.length - 1; k >= 0; k--) if (i >= nodes[k][1]) return [nodes[k][0], i - nodes[k][1]]; return [nodes[0][0], 0]; };
    for (const t of tags) for (const [a, b] of findIn(text, t.name)){
      const r = new Range(); const [sn, so] = at(a), [en, eo] = at(b);
      try { r.setStart(sn, so); r.setEnd(en, Math.min(eo, en.length)); per[t.cat].push(r); } catch {}
    }
  }
  for (const [c] of CATS){ if (per[c].length) CSS.highlights.set('rw-' + c, new Highlight(...per[c])); else CSS.highlights.delete('rw-' + c); }
}
export const clearPaint = () => { if (window.CSS?.highlights) CATS.forEach(([c]) => CSS.highlights.delete('rw-' + c)); };
