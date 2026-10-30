import { charactersOf } from './model.js?v=6b93529';
import { breakdownOf, fold } from './breakdown.js?v=6b93529';
import { I, ago, h, modal, toast } from './ui.js?v=6b93529';

/* A TV series (Alex, 25 Oct): one place for the show's bible (logline, the world, the characters, the places, and
   the facts: who knows what, since which episode) and its episodes, each a script of its own (settings.series).
   The series is kept as a row of its own in roarwriter_scripts (data.kind = 'series'), so it is saved, shared and
   merged like a script. */

export const isSeries = (d) => d?.kind === 'series';
export function blankSeries(name = ''){
  return { kind: 'series', v: 1, title: name, titlePage: { title: name }, settings: { format: 'tv' }, els: [{ id: 'series', t: 'action', x: '' }],
    series: { episodes: [], bible: { logline: '', world: '', characters: {}, places: {}, facts: [] } } };
}
const bibleOf = (s) => { s.series ||= { episodes: [], bible: {} }; const b = s.series.bible ||= {}; b.characters ||= {}; b.places ||= {}; b.facts ||= []; s.series.episodes ||= []; return b; };

/* the series' page: { app, store, id, data, save(), newEpisode(seriesId, n), open(id), back() } */
export async function viewSeries(env){
  const { app, store, id } = env;
  const s = env.data, bible = bibleOf(s);
  document.title = (s.title || 'Untitled series') + ' · RoarWriter';
  const save = () => store.save(id, s);
  const main = h('main', { class: 'series' }, h('p', { class: 'muted' }, 'Loading the episodes…'));
  const titleIn = h('input', { class: 'title-in', value: s.title || '', placeholder: 'Series title', 'aria-label': 'Series title', oninput: (e) => { s.title = e.target.value; s.titlePage.title = e.target.value; save(); } });
  app.replaceChildren(h('header', { class: 'top edit-top' },
    h('a', { class: 'ib', href: '#', title: 'All scripts', 'aria-label': 'All scripts', html: I.back }),
    h('div', { class: 'title-box' }, titleIn), h('span', { class: 'chip fmt' }, 'Series'), h('div', { class: 'spacer' }),
    h('button', { class: 'btn', type: 'button', onclick: () => addExisting() }, h('span', { html: I.import }), h('span', { class: 'lbl' }, 'Add a script')),
    h('button', { class: 'btn primary', type: 'button', onclick: () => newEp() }, h('span', { html: I.plus }), h('span', { class: 'lbl' }, 'New episode'))), main);
  // every episode, read (from this device first, else the account)
  let eps = [];
  const load = async () => {
    const index = new Map((await store.list()).map((r) => [r.id, r]));
    eps = await Promise.all(s.series.episodes.map(async (e) => ({ id: e, row: index.get(e), data: await store.open(e) })));
    draw();
  };
  const newEp = async () => { const n = s.series.episodes.length + 1; const eid = await env.newEpisode(id, n, s.title); s.series.episodes.push(eid); save(); await store.flush(); env.open(eid); };
  const addExisting = async () => {
    const all = (await store.list()).filter((r) => r.id !== id && r.meta?.kind !== 'series' && !s.series.episodes.includes(r.id));
    if (!all.length) return toast('There is no other script to add.');
    const close = modal('Add a script as an episode', h('div', { class: 'v-list' }, ...all.map((r) => h('button', { type: 'button', class: 'v-row', onclick: async () => {
      const d = await store.open(r.id); if (!d) return;
      d.settings.series = id; store.save(r.id, d);
      s.series.episodes.push(r.id); save(); close(); load();
    } }, h('span', { class: 'v-dot', html: I.page }), h('div', { class: 'v-who' }, h('b', {}, r.title || 'Untitled'), h('small', {}, `${r.meta?.pages || 1} pages · ${ago(r.updated_at)}`))))), { wide: true });
  };
  const field = (label, k, rows, ph) => h('label', { class: 'field' }, h('span', {}, label), h('textarea', { class: 'input', rows, placeholder: ph, value: bible[k] || '', oninput: (e) => { bible[k] = e.target.value; save(); } }));
  const draw = () => {
    // the characters and places of every episode, with the episodes they are in
    const chars = new Map(), places = new Map();
    eps.forEach((ep, k) => {
      if (!ep.data) return;
      for (const c of charactersOf(ep.data.els)){ const x = chars.get(c.name) || { name: c.name, lines: 0, eps: [] }; x.lines += c.lines; x.eps.push(k + 1); chars.set(c.name, x); }
      for (const r of breakdownOf(ep.data).rows) for (const p of r.items.locations || []){ const key = fold(p); const x = places.get(key) || { name: p, scenes: 0, eps: new Set() }; x.scenes++; x.eps.add(k + 1); places.set(key, x); }
    });
    const epList = (l) => (l.length > 4 ? `Ep ${l[0]}–${l[l.length - 1]} · ${l.length} episodes` : 'Ep ' + l.join(', '));
    const factsBox = h('div', { class: 'facts' });
    const drawFacts = () => factsBox.replaceChildren(...bible.facts.map((f, i) => h('div', { class: 'fact' },
      h('select', { class: 'input', title: 'Since which episode', onchange: (e) => { f.ep = +e.target.value; save(); } }, ...[0, ...eps.map((_, k) => k + 1)].map((n) => h('option', { value: n, selected: (f.ep || 0) === n }, n ? `From ep ${n}` : 'Always'))),
      h('input', { class: 'input', value: f.text || '', placeholder: 'e.g. Anna knows the driver lied about the accident', oninput: (e) => { f.text = e.target.value; save(); } }),
      h('button', { class: 'ib', type: 'button', title: 'Delete', 'aria-label': 'Delete', html: I.trash, onclick: () => { bible.facts.splice(i, 1); save(); drawFacts(); } }))),
      h('button', { class: 'btn', type: 'button', onclick: () => { bible.facts.push({ id: crypto.randomUUID().slice(0, 8), text: '', ep: 0 }); save(); drawFacts(); factsBox.querySelector('.fact:last-of-type input')?.focus(); } }, h('span', { html: I.plus }), 'A fact'));
    drawFacts();
    main.replaceChildren(
      h('section', { class: 'sr-eps' }, h('div', { class: 'lib-sec' }, h('h3', {}, 'Episodes'), h('span', { class: 'chip' }, String(eps.length))),
        eps.length ? h('div', { class: 'v-list' }, ...eps.map((ep, k) => h('div', { class: 'v-row' },
          h('span', { class: 'sn sr-n' }, String(k + 1)),
          h('button', { type: 'button', class: 'v-who linkish-row', onclick: () => env.open(ep.id) }, h('b', {}, ep.data?.titlePage?.episode || ep.row?.title || 'Untitled'), h('small', {}, `${ep.row?.meta?.pages || 1} pages · ${ep.row?.meta?.scenes || 0} scenes · ${ago(ep.row?.updated_at)}`)),
          h('button', { class: 'ib', type: 'button', title: 'Earlier', 'aria-label': 'Earlier', html: I.up, onclick: () => { if (!k) return; const l = s.series.episodes; [l[k - 1], l[k]] = [l[k], l[k - 1]]; [eps[k - 1], eps[k]] = [eps[k], eps[k - 1]]; save(); draw(); } }),
          h('button', { class: 'ib', type: 'button', title: 'Out of the series', 'aria-label': 'Out of the series', html: I.x, onclick: async () => { if (!confirm('Take this episode out of the series? The script stays in your scripts.')) return; s.series.episodes = s.series.episodes.filter((x) => x !== ep.id); if (ep.data){ delete ep.data.settings.series; store.save(ep.id, ep.data); } save(); load(); } })))) : h('p', { class: 'muted small' }, 'No episodes yet: start the first, or add a script you already have.')),
      h('section', { class: 'sr-bible' },
        h('div', { class: 'lib-sec' }, h('h3', {}, 'The bible')),
        field('Logline', 'logline', 2, 'The series in one or two sentences'),
        field('The world', 'world', 5, 'Where and when, the rules of this world, the tone, what an episode is like'),
        h('div', { class: 'lib-sec' }, h('h3', {}, 'Characters'), h('small', { class: 'muted' }, 'from every episode')),
        chars.size ? h('div', { class: 'sr-grid' }, ...[...chars.values()].sort((a, b) => b.lines - a.lines).map((c) => h('div', { class: 'sr-card' },
          h('div', { class: 'sr-card-h' }, h('b', {}, c.name), h('small', {}, `${epList(c.eps)} · ${c.lines} speeches`)),
          h('textarea', { class: 'input', rows: 2, placeholder: 'Who they are, what they want, their secret', value: bible.characters[c.name] || '', oninput: (e) => { bible.characters[c.name] = e.target.value; save(); } })))) : h('p', { class: 'muted small' }, 'The characters come from the episodes, as they speak.'),
        h('div', { class: 'lib-sec' }, h('h3', {}, 'Places'), h('small', { class: 'muted' }, 'from the scene headings')),
        places.size ? h('div', { class: 'sr-grid' }, ...[...places.values()].sort((a, b) => b.scenes - a.scenes).map((p) => h('div', { class: 'sr-card' },
          h('div', { class: 'sr-card-h' }, h('b', {}, p.name), h('small', {}, `${epList([...p.eps])} · ${p.scenes} scenes`)),
          h('textarea', { class: 'input', rows: 2, placeholder: 'What it looks like, what it means', value: bible.places[p.name] || '', oninput: (e) => { bible.places[p.name] = e.target.value; save(); } })))) : h('p', { class: 'muted small' }, 'The places come from the episodes’ scene headings.'),
        h('div', { class: 'lib-sec' }, h('h3', {}, 'What is known'), h('small', { class: 'muted' }, 'who knows what, since which episode')),
        factsBox));
  };
  load();
}

/* in an episode: the series' bible at the side (Series tab), read from the series row */
export async function bibleSide(store, seriesId, epId){
  const s = await store.open(seriesId);
  if (!s || !isSeries(s)) return [h('p', { class: 'muted small' }, 'The series is not here.')];
  const b = bibleOf(s), n = s.series.episodes.indexOf(epId) + 1;
  return [
    h('button', { class: 'btn side-add', type: 'button', onclick: () => { location.hash = '#s/' + seriesId; } }, h('span', { html: I.back }), s.title || 'The series'),
    n ? h('p', { class: 'muted small' }, `Episode ${n} of ${s.series.episodes.length}`) : null,
    b.logline ? h('p', { class: 'small' }, b.logline) : null,
    ...Object.entries(b.characters).filter(([, v]) => v).map(([k, v]) => h('div', { class: 'sr-side' }, h('b', {}, k), h('small', {}, v))),
    b.facts.filter((f) => f.text && (!f.ep || !n || f.ep <= n)).length ? h('h4', { class: 'sr-side-h' }, 'Known by now') : null,
    ...b.facts.filter((f) => f.text && (!f.ep || !n || f.ep <= n)).map((f) => h('div', { class: 'sr-side' }, h('small', {}, `${f.ep ? `Ep ${f.ep}: ` : ''}${f.text}`))),
  ];
}
