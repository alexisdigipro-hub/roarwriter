import { askAI, currentUser, leavePresence, listPresence, putPresence } from './cloud.js';
import { breakdownOf } from './breakdown.js';
import { charactersOf, upper } from './model.js';
import { paginate } from './print.js';
import { FORMATS, fmtOf } from './formats.js';
import { docPDF, langOf, scenesWithLines, scriptForAI } from './studio.js';
import { I, download, esc, h, modal, toast } from './ui.js';

/* Planning the film (Alex, 25 Oct): the story's beats against the pages, the shooting schedule from the breakdown,
   and who is writing where right now. */

const sid = () => crypto.randomUUID().slice(0, 8);

/* ---------- the beat board ---------- */
// each template's beats, with where they fall in the story (a share of its length)
export const BEAT_SETS = {
  stc: ['Save the Cat', [['Opening Image', 0], ['Theme Stated', 5], ['Set-Up', 6], ['Catalyst', 10], ['Debate', 15], ['Break into Two', 20], ['B Story', 22], ['Fun and Games', 30], ['Midpoint', 50], ['Bad Guys Close In', 62], ['All Is Lost', 75], ['Dark Night of the Soul', 78], ['Break into Three', 80], ['Finale', 90], ['Final Image', 99]]],
  three: ['Three acts', [['Setup', 0], ['Inciting Incident', 12], ['Plot Point 1', 25], ['Pinch 1', 37], ['Midpoint', 50], ['Pinch 2', 62], ['Plot Point 2', 75], ['Climax', 90], ['Resolution', 97]]],
  hero: ['Hero’s Journey', [['Ordinary World', 0], ['Call to Adventure', 10], ['Refusal of the Call', 15], ['Meeting the Mentor', 20], ['Crossing the Threshold', 25], ['Tests, Allies, Enemies', 32], ['Approach', 45], ['The Ordeal', 50], ['The Reward', 60], ['The Road Back', 75], ['Resurrection', 90], ['Return with the Elixir', 97]]],
  tv: ['TV hour', [['Teaser', 0], ['Act One break', 20], ['Act Two break', 40], ['Midpoint turn', 50], ['Act Three break', 60], ['Act Four break', 80], ['Act Five / Tag', 95]]],
  free: ['My own', []],
};
// the page each line starts on, as the PDF lays them out
function pagesOf(script){ const m = new Map(); paginate(script).forEach((pg, i) => pg.forEach((e) => m.set(e.id, i + 1))); return m; }

export function beatsView(ctx){
  const { script } = ctx;
  const wrap = h('div', { class: 'beats' });
  let busy = false;
  const set = () => script.beats;
  const use = (k) => {
    const old = set().items || [];
    if (old.some((b) => b.scene || b.desc) && !confirm('Start again with this template? The beats you placed go (the script stays as it is).')) return;
    script.beats = { template: k, items: BEAT_SETS[k][1].map(([name, at]) => ({ id: sid(), name, at, desc: '', scene: '' })) };
    ctx.save(); draw();
  };
  const findAI = async () => {
    if (busy) return; busy = true; draw();
    try {
      const names = set().items.map((b) => b.name);
      const r = await askAI({ task: 'beats', script: scriptForAI(script), title: script.title, lang: langOf(script), format: FORMATS[fmtOf(script)].label, answer: langOf(script), prompt: names.join(' | ') });
      const sc = scenesWithLines(script);
      for (const x of r.data?.beats || []){
        const b = set().items.find((y) => y.name.toLowerCase() === String(x.name || '').toLowerCase());
        const s = sc[+x.scene - 1];
        if (b && s){ b.scene = s.id; if (x.note && !b.desc) b.desc = x.note; }
      }
      ctx.save(); toast('The beats are placed');
    } catch (e) { toast(e.message || 'The AI did not answer.'); }
    busy = false; draw();
  };
  const draw = () => {
    const B = set();
    const sc = scenesWithLines(script);
    if (!B.template){
      wrap.replaceChildren(h('div', { class: 'beats-start' }, h('b', {}, 'The story’s beats'), h('p', { class: 'muted' }, 'Pick a structure: each beat gets the page where it should fall, you (or the AI) put the scene where it does, and you see at once where the story runs early or late.'),
        h('div', { class: 'row' }, ...Object.entries(BEAT_SETS).map(([k, [l]]) => h('button', { class: 'btn' + (k === 'stc' ? ' primary' : ''), type: 'button', disabled: ctx.readOnly(), onclick: () => use(k) }, l)))));
      return;
    }
    const pageOf = pagesOf(script), total = Math.max(1, paginate(script).length);
    const scenePage = (id) => pageOf.get(id) || 1;
    // the strip along the top: the pages, every scene a tick, the beats where they should be and where they are
    const X = (pg) => `${Math.min(100, Math.max(0, (pg - 1) / Math.max(1, total - 1) * 100))}%`;
    const strip = h('div', { class: 'bt-strip' },
      ...sc.map((s) => h('i', { class: 'bt-tick', style: `left:${X(scenePage(s.id))}`, title: `${s.n}. ${s.text}` })),
      ...B.items.filter((b) => B.template !== 'free').map((b) => h('span', { class: 'bt-want', style: `left:${b.at}%`, title: `${b.name}: page ${Math.max(1, Math.round(b.at / 100 * total))}` })),
      ...B.items.filter((b) => b.scene && sc.some((s) => s.id === b.scene)).map((b) => h('button', { type: 'button', class: 'bt-is', style: `left:${X(scenePage(b.scene))}`, title: b.name, onclick: () => ctx.goTo(b.scene, true) }, b.name.split(' ').map((w) => w[0]).join('').slice(0, 3))));
    const card = (b, k) => {
      const want = Math.max(1, Math.round((b.at || 0) / 100 * total));
      const s = sc.find((x) => x.id === b.scene);
      const is = s ? scenePage(s.id) : 0, off = s ? is - want : 0, slack = Math.max(2, total * 0.05);
      const state = !s ? '' : Math.abs(off) <= slack ? 'ok' : Math.abs(off) <= slack * 2 ? 'near' : 'far';
      return h('article', { class: 'beat ' + state },
        h('div', { class: 'beat-h' }, B.template === 'free'
          ? h('input', { class: 'beat-name', value: b.name, readOnly: ctx.readOnly(), oninput: (e) => { b.name = e.target.value; ctx.save(); } })
          : h('b', {}, b.name),
        B.template !== 'free' ? h('small', {}, `page ${want}`) : null),
        h('select', { class: 'input beat-sc', disabled: ctx.readOnly(), onchange: (e) => { b.scene = e.target.value; ctx.save(); draw(); } },
          h('option', { value: '' }, 'Which scene?'), ...sc.map((x) => h('option', { value: x.id, selected: x.id === b.scene }, `${x.n}. ${x.text.slice(0, 48)}`))),
        s ? h('div', { class: 'beat-at' }, h('span', {}, `on page ${is}`), B.template !== 'free' ? h('b', {}, off === 0 ? 'right on' : `${off > 0 ? '+' : ''}${off} ${Math.abs(off) === 1 ? 'page' : 'pages'}`) : null, h('button', { class: 'linkish', type: 'button', onclick: () => ctx.goTo(s.id, true) }, 'Go there')) : null,
        h('textarea', { class: 'beat-desc', rows: 2, placeholder: 'What happens here', readOnly: ctx.readOnly(), value: b.desc || '', oninput: (e) => { b.desc = e.target.value; ctx.save(); } }),
        B.template === 'free' && !ctx.readOnly() ? h('button', { class: 'ib danger', type: 'button', title: 'Delete', 'aria-label': 'Delete', html: I.trash, onclick: () => { B.items.splice(k, 1); ctx.save(); draw(); } }) : null);
    };
    wrap.replaceChildren(
      h('div', { class: 'board-top' }, h('b', {}, BEAT_SETS[B.template][0]), h('span', { class: 'muted small' }, `${total} pages · ${B.items.filter((b) => b.scene).length} of ${B.items.length} beats placed`), h('span', { class: 'spacer' }),
        ctx.readOnly() ? null : h('select', { class: 'input bt-tpl', onchange: (e) => use(e.target.value) }, ...Object.entries(BEAT_SETS).map(([k, [l]]) => h('option', { value: k, selected: k === B.template }, l))),
        ctx.readOnly() || B.template === 'free' ? null : h('button', { class: 'btn primary', type: 'button', onclick: findAI }, h('span', { html: I.spark }), busy ? 'Reading the script…' : 'Find the beats with AI'),
        B.template === 'free' && !ctx.readOnly() ? h('button', { class: 'btn', type: 'button', onclick: () => { B.items.push({ id: sid(), name: 'New beat', at: 0, desc: '', scene: '' }); ctx.save(); draw(); } }, h('span', { html: I.plus }), 'Beat') : null),
      strip,
      h('div', { class: 'beat-grid' }, ...B.items.map(card)));
  };
  return { el: wrap, draw };
}

/* ---------- the shooting schedule: strips from the breakdown, put on days ---------- */
// a scene's length in eighths of a page, as the industry counts it
const eighthsOf = (els) => Math.max(1, Math.round(els.reduce((a, e) => a + Math.max(1, Math.ceil((e.x || ' ').length / 60)) + 1, 0) / 55 * 8));
export const eighths = (n) => `${Math.floor(n / 8) ? Math.floor(n / 8) + ' ' : ''}${n % 8 ? `${n % 8}/8` : ''}`.trim() || '0';
function stripsOf(script){
  const rows = new Map(breakdownOf(script).rows.filter((r) => r.n).map((r) => [r.id, r]));
  const castNo = new Map(charactersOf(script.els).map((c, i) => [c.name, i + 1]));
  return scenesWithLines(script).filter((s) => script.els[s.i].t === 'scene').map((s) => {
    const r = rows.get(s.id) || { ie: '', place: '', time: '', items: { cast: [] } };
    const ext = /EXT|ΕΞΩΤ/.test(upper(r.ie)) && !/^(INT|ΕΣΩΤ)/.test(upper(r.ie)) ? 'EXT' : /INT.*EXT|ΕΣΩΤ.*ΕΞΩΤ|I\/E/.test(upper(r.ie)) ? 'I/E' : 'INT';
    const night = /NIGHT|EVENING|DUSK|ΝΥΧΤΑ|ΒΡΑΔΥ|ΣΟΥΡΟΥΠΟ/.test(upper(r.time));
    return { id: s.id, n: s.n, ie: ext, dn: night ? 'N' : 'D', place: r.place || s.text, time: r.time, cast: (r.items.cast || []).map((c) => castNo.get(c)).filter(Boolean).sort((a, b) => a - b), castNames: r.items.cast || [], len: eighthsOf(s.els), text: s.text };
  });
}
export function openSchedule(ctx){
  const { script } = ctx;
  const S = () => (script.schedule.days ||= []);
  const body = h('div', { class: 'sched' });
  const close = modal('Shooting schedule', body, { wide: true });
  body.closest('.modal')?.classList.add('xwide');
  let tab = 'board', drag = null;
  const strips = () => stripsOf(script);
  const placed = () => new Set(S().flatMap((d) => d.scenes));
  const moveTo = (sceneId, dayId, before = null) => {
    if (ctx.readOnly()) return;
    for (const d of S()) d.scenes = d.scenes.filter((x) => x !== sceneId);
    if (dayId){ const d = S().find((x) => x.id === dayId); const i = before ? d.scenes.indexOf(before) : -1; i >= 0 ? d.scenes.splice(i, 0, sceneId) : d.scenes.push(sceneId); }
    ctx.save(); draw();
  };
  const dateOf = (k) => { if (!script.schedule.start) return ''; const d = new Date(script.schedule.start); d.setDate(d.getDate() + k); return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); };
  const strip = (st, dayId) => h('div', { class: `strip s-${st.ie === 'EXT' ? 'ext' : 'int'}-${st.dn === 'N' ? 'n' : 'd'}`, draggable: String(!ctx.readOnly()), title: st.text,
    ondragstart: (e) => { drag = st.id; e.dataTransfer.effectAllowed = 'move'; },
    ondragover: (e) => { e.preventDefault(); },
    ondrop: (e) => { e.preventDefault(); e.stopPropagation(); if (drag && drag !== st.id) moveTo(drag, dayId, st.id); drag = null; } },
    h('b', { class: 'st-n' }, String(st.n)), h('span', { class: 'st-ie' }, `${st.ie} ${st.dn === 'N' ? 'NIGHT' : 'DAY'}`), h('span', { class: 'st-place' }, st.place),
    h('span', { class: 'st-cast', title: st.castNames.join(', ') }, st.cast.join(', ')), h('span', { class: 'st-len' }, eighths(st.len)),
    // on a phone (no dragging): a day to choose
    h('select', { class: 'st-day', 'aria-label': 'Day', disabled: ctx.readOnly(), onchange: (e) => moveTo(st.id, e.target.value || null) }, h('option', { value: '' }, '–'), ...S().map((d, k) => h('option', { value: d.id, selected: d.id === dayId }, `Day ${k + 1}`))));
  const lane = (title, sub, dayId, list, extra) => h('section', { class: 'lane' + (dayId ? '' : ' unplaced'),
    ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('over'); },
    ondragleave: (e) => e.currentTarget.classList.remove('over'),
    ondrop: (e) => { e.preventDefault(); e.currentTarget.classList.remove('over'); if (drag) moveTo(drag, dayId); drag = null; } },
    h('div', { class: 'lane-h' }, h('b', {}, title), h('small', {}, sub), h('span', { class: 'spacer' }), extra), ...list);
  // a first plan: the scenes not yet placed, grouped by location and by day or night, about five pages a day
  const auto = () => {
    const free = strips().filter((s) => !placed().has(s.id));
    if (!free.length) return toast('Every scene is on a day.');
    const groups = new Map();
    for (const s of free){ const k = s.place + '|' + s.dn; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
    let day = null, len = 0;
    for (const g of [...groups.values()].sort((a, b) => b.length - a.length)) for (const s of g){
      if (!day || len + s.len > 40){ day = { id: sid(), scenes: [] }; S().push(day); len = 0; }
      day.scenes.push(s.id); len += s.len;
    }
    ctx.save(); draw(); toast('A first plan: by location, about five pages a day. Move the strips as the shoot needs.');
  };
  const dood = () => {
    // Day out of Days: for each speaking part, the days they work (SW start, W work, WF finish, SWF only one day, H hold)
    const all = strips(), byId = new Map(all.map((s) => [s.id, s]));
    const cast = charactersOf(script.els);
    const days = S().map((d) => new Set(d.scenes.flatMap((x) => byId.get(x)?.castNames || [])));
    const rows = cast.map((c, i) => {
      const on = days.map((d) => d.has(c.name)), first = on.indexOf(true), last = on.lastIndexOf(true);
      const cells = on.map((w, k) => (first < 0 ? '' : k === first && k === last ? 'SWF' : k === first ? 'SW' : k === last ? 'WF' : w ? 'W' : k > first && k < last ? 'H' : ''));
      return { no: i + 1, name: c.name, cells, work: on.filter(Boolean).length, hold: cells.filter((x) => x === 'H').length };
    });
    return { rows, n: S().length };
  };
  const doodHTML = (d, e = esc) => `<table class="dood"><tr><th>#</th><th>Cast</th>${S().map((x, k) => `<th>${k + 1}${dateOf(k) ? `<br><small>${e(dateOf(k))}</small>` : ''}</th>`).join('')}<th>Work</th><th>Hold</th></tr>${d.rows.map((r) => `<tr><td>${r.no}</td><td>${e(r.name)}</td>${r.cells.map((c) => `<td class="c-${c.toLowerCase()}">${c}</td>`).join('')}<td>${r.work}</td><td>${r.hold}</td></tr>`).join('')}</table>`;
  const exportPDF = () => {
    const all = strips(), byId = new Map(all.map((s) => [s.id, s]));
    const day = (d, k) => `<h2>Day ${k + 1}${dateOf(k) ? ` · ${esc(dateOf(k))}` : ''} <span class="muted">${eighths(d.scenes.reduce((a, x) => a + (byId.get(x)?.len || 0), 0))} pages</span></h2><table><tr><th>Sc.</th><th>I/E</th><th>D/N</th><th>Location</th><th>Cast</th><th>Pages</th></tr>${d.scenes.map((x) => byId.get(x)).filter(Boolean).map((s) => `<tr><td>${s.n}</td><td>${s.ie}</td><td>${s.dn}</td><td>${esc(s.place)}</td><td>${esc(s.castNames.join(', '))}</td><td>${eighths(s.len)}</td></tr>`).join('')}</table>`;
    docPDF('Shooting schedule', `<h1>${esc(script.title || 'Untitled')}</h1><p class="muted">Shooting schedule · ${S().length} days</p>${S().map(day).join('')}<h2>Day out of Days</h2>${doodHTML(dood())}`, `${script.title || 'Untitled'} schedule.pdf`).catch((e) => toast(e.message));
  };
  const draw = () => {
    const all = strips(), byId = new Map(all.map((s) => [s.id, s])), on = placed();
    // scenes that are gone from the script go from the days too
    for (const d of S()) d.scenes = d.scenes.filter((x) => byId.has(x));
    const top = h('div', { class: 'board-top' },
      h('div', { class: 'seg' }, ...[['board', 'Stripboard'], ['dood', 'Day out of Days']].map(([k, l]) => h('button', { type: 'button', class: tab === k ? 'on' : '', onclick: () => { tab = k; draw(); } }, l))),
      h('span', { class: 'muted small' }, `${S().length} ${S().length === 1 ? 'day' : 'days'} · ${on.size} of ${all.length} scenes placed`), h('span', { class: 'spacer' }),
      h('label', { class: 'row' }, h('small', { class: 'muted' }, 'First day'), h('input', { class: 'input st-date', type: 'date', value: script.schedule.start || '', disabled: ctx.readOnly(), onchange: (e) => { script.schedule.start = e.target.value; ctx.save(); draw(); } })),
      ctx.readOnly() ? null : h('button', { class: 'btn', type: 'button', onclick: auto }, h('span', { html: I.spark }), 'First plan'),
      ctx.readOnly() ? null : h('button', { class: 'btn', type: 'button', onclick: () => { S().push({ id: sid(), scenes: [] }); ctx.save(); draw(); } }, h('span', { html: I.plus }), 'Day'),
      h('button', { class: 'btn', type: 'button', onclick: exportPDF }, h('span', { html: I.export }), 'PDF'),
      h('button', { class: 'btn', type: 'button', onclick: () => { const d = dood(); download(`${script.title || 'Untitled'} day out of days.csv`, [['#', 'Cast', ...S().map((x, k) => `Day ${k + 1}`), 'Work', 'Hold'].join(','), ...d.rows.map((r) => [r.no, `"${r.name}"`, ...r.cells, r.work, r.hold].join(','))].join('\n'), 'text/csv'); } }, 'CSV'));
    if (tab === 'dood'){
      body.replaceChildren(top, S().length ? h('div', { class: 'dood-w', html: doodHTML(dood()) }) : h('p', { class: 'muted' }, 'Put scenes on days first: then every speaking part’s days are counted here (SW the first day, W work, WF the last, SWF a single day, H hold between).'));
      return;
    }
    body.replaceChildren(top,
      h('div', { class: 'lanes' },
        lane('Not on a day yet', `${all.filter((s) => !on.has(s.id)).length} scenes`, null, all.filter((s) => !on.has(s.id)).map((s) => strip(s, null))),
        ...S().map((d, k) => lane(`Day ${k + 1}`, [dateOf(k), `${eighths(d.scenes.reduce((a, x) => a + (byId.get(x)?.len || 0), 0))} pages`].filter(Boolean).join(' · '), d.id, d.scenes.map((x) => byId.get(x)).filter(Boolean).map((s) => strip(s, d.id)),
          ctx.readOnly() ? null : h('button', { class: 'ib', type: 'button', title: 'Delete the day', 'aria-label': 'Delete the day', html: I.trash, onclick: () => { script.schedule.days = S().filter((x) => x.id !== d.id); ctx.save(); draw(); } })))),
      h('p', { class: 'hint' }, 'Drag the strips onto days (on a phone, pick the day on the strip). The colours are the industry’s: white INT DAY, yellow EXT DAY, blue INT NIGHT, green EXT NIGHT; the numbers are the cast, as in the Day out of Days.'));
  };
  draw();
  return close;
}

/* ---------- who is writing where (Collaborate) ---------- */
/* every few seconds: this person's line goes to the others, theirs come back; fn(others) draws them */
export function presence(ctx, fn){
  const me = currentUser();
  let stopped = false, missing = false, t = 0;
  const tick = async () => {
    if (stopped || missing || document.hidden || !navigator.onLine) return;
    try {
      await putPresence({ script_id: ctx.id, name: me?.user_metadata?.name || '', email: me?.email || '', el_id: ctx.caretId() || '' });
      const all = await listPresence(ctx.id);
      fn(all.filter((p) => p.user_id !== me?.id));
    } catch (e) { if (e.status === 404 || e.status === 400) missing = true; }
  };
  t = setInterval(tick, 8000); setTimeout(tick, 1500);
  return () => { stopped = true; clearInterval(t); leavePresence(ctx.id); };
}
