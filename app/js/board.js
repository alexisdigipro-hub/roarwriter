import { askAI, getBoardImage, putBoardImage, removeBoardImage } from './cloud.js';
import { toFountain } from './fountain.js';
import { FORMATS, fmtOf } from './formats.js';
import { docPDF, langOf, scenesWithLines } from './studio.js';
import { I, download, esc, h, modal, pickFile, toast } from './ui.js';

/* The storyboard (Alex, 25 Oct): every scene's frames, each a picture (dropped, pasted or chosen; kept in the
   account, bucket roarwriter-boards, for everyone the script is shared with), the size of the shot, its angle,
   its move and what we see. The AI can break a scene into shots; the frames give the shot list and a PDF. */

export const SIZES = ['WS', 'MS', 'MCU', 'CU', 'ECU', 'OTS', '2S', 'POV', 'INSERT'];
export const ANGLES = ['eye level', 'high', 'low', 'overhead', 'dutch'];
export const MOVES = ['static', 'pan', 'tilt', 'dolly in', 'dolly out', 'tracking', 'handheld', 'crane', 'steadicam'];
const SIZE_NAME = { WS: 'Wide', MS: 'Medium', MCU: 'Medium close-up', CU: 'Close-up', ECU: 'Extreme close-up', OTS: 'Over the shoulder', '2S': 'Two shot', POV: 'Point of view', INSERT: 'Insert' };
const fid = () => crypto.randomUUID().slice(0, 8);

// a picture made small enough to keep (the longest side at most `max`), as JPEG
function shrink(file, max, q){
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? res(b) : rej(new Error('This picture could not be read.'))), 'image/jpeg', q);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('This is not a picture RoarWriter can read.')); };
    img.src = url;
  });
}
const asDataURL = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
// a frame's picture to show: kept in the account (sb:path) or, before the SQL is run, in the script itself (data:)
const cache = new Map();
export async function imageURL(img){
  if (!img) return '';
  if (img.startsWith('data:')) return img;
  if (!img.startsWith('sb:')) return '';
  if (!cache.has(img)) cache.set(img, getBoardImage(img.slice(3)).then((b) => URL.createObjectURL(b)).catch(() => { cache.delete(img); return ''; }));
  return cache.get(img);
}
let warned = false;
async function keepImage(ctx, frame, file){
  const blob = await shrink(file, 1400, 0.8);
  const path = `${ctx.id}/${frame.id}-${Date.now().toString(36)}.jpg`;
  try {
    await putBoardImage(path, blob);
    const old = frame.img; frame.img = 'sb:' + path;
    if (old?.startsWith('sb:')) removeBoardImage(old.slice(3));
  } catch {
    // no bucket yet (the Storyboard part of the SQL) or offline: a smaller copy inside the script
    frame.img = await asDataURL(await shrink(file, 720, 0.62));
    if (!warned){ warned = true; toast('The picture is kept in the script for now: run the Storyboard part of supabase/roarwriter.sql to keep them in the account.'); }
  }
}

export function boardView(ctx){
  const { script } = ctx;
  const wrap = h('div', { class: 'board' });
  const framesOf = (id) => (script.boards[id] ||= []);
  const busy = new Set();
  const select = (value, opts, on, label) => h('select', { class: 'fr-sel', title: label, 'aria-label': label, disabled: ctx.readOnly(), onchange: (e) => on(e.target.value) }, ...opts.map((o) => h('option', { value: o, selected: o === value }, o)));
  const frameTile = (s, f, k, list) => {
    const pic = h('div', { class: 'fr-pic', tabindex: 0, title: ctx.readOnly() ? '' : 'Click, drop or paste a picture' });
    const show = async () => { const url = await imageURL(f.img); pic.replaceChildren(url ? h('img', { src: url, alt: f.desc || '' }) : h('span', { class: 'fr-empty', html: I.image })); };
    show();
    const put = async (file) => { if (ctx.readOnly() || !file) return; pic.classList.add('loading'); try { await keepImage(ctx, f, file); ctx.save(); await show(); } catch (e) { toast(e.message); } pic.classList.remove('loading'); };
    pic.addEventListener('click', async () => { if (!ctx.readOnly()) put(await pickFile('image/*')); });
    pic.addEventListener('dragover', (e) => { e.preventDefault(); pic.classList.add('over'); });
    pic.addEventListener('dragleave', () => pic.classList.remove('over'));
    pic.addEventListener('drop', (e) => { e.preventDefault(); pic.classList.remove('over'); put([...e.dataTransfer.files].find((x) => x.type.startsWith('image/'))); });
    pic.addEventListener('paste', (e) => { const it = [...(e.clipboardData?.items || [])].find((x) => x.type.startsWith('image/')); if (it){ e.preventDefault(); put(it.getAsFile()); } });
    const move = (d) => { const j = k + d; if (j < 0 || j >= list.length) return; [list[k], list[j]] = [list[j], list[k]]; ctx.save(); draw(); };
    return h('article', { class: 'frame' },
      pic,
      h('div', { class: 'fr-meta' }, h('b', { class: 'fr-n' }, `${s.n}.${k + 1}`),
        select(f.size || 'MS', SIZES, (v) => { f.size = v; ctx.save(); }, 'Size'),
        select(f.angle || 'eye level', ANGLES, (v) => { f.angle = v; ctx.save(); }, 'Angle'),
        select(f.move || 'static', MOVES, (v) => { f.move = v; ctx.save(); }, 'Move')),
      h('textarea', { class: 'fr-desc', rows: 2, placeholder: 'What we see', readOnly: ctx.readOnly(), value: f.desc || '', oninput: (e) => { f.desc = e.target.value; ctx.save(); } }),
      ctx.readOnly() ? null : h('div', { class: 'fr-acts' },
        h('button', { class: 'ib', type: 'button', title: 'Earlier', 'aria-label': 'Earlier', html: I.left, onclick: () => move(-1) }),
        h('button', { class: 'ib', type: 'button', title: 'Later', 'aria-label': 'Later', html: I.right, onclick: () => move(1) }),
        h('span', { class: 'spacer' }),
        h('button', { class: 'ib danger', type: 'button', title: 'Delete the frame', 'aria-label': 'Delete the frame', html: I.trash, onclick: () => { if (f.img && !confirm('Delete this frame and its picture?')) return; if (f.img?.startsWith('sb:')) removeBoardImage(f.img.slice(3)); list.splice(k, 1); ctx.save(); draw(); } })));
  };
  const shots = async (s) => {
    if (busy.has(s.id)) return;
    busy.add(s.id); draw();
    try {
      const r = await askAI({ task: 'shots', title: script.title, lang: langOf(script), format: FORMATS[fmtOf(script)].label, scene: toFountain({ els: s.els }, { titlePage: false }) });
      const got = (r.data?.shots || []).map((x) => ({ id: fid(), size: SIZES.includes(x.size) ? x.size : 'MS', angle: ANGLES.includes(x.angle) ? x.angle : 'eye level', move: MOVES.includes(x.move) ? x.move : 'static', desc: x.desc || '' }));
      if (!got.length) throw new Error('The AI gave no shots for this scene.');
      framesOf(s.id).push(...got); ctx.save(); toast(`${got.length} shots for scene ${s.n}`);
    } catch (e) { toast(e.message || 'The AI did not answer.'); }
    busy.delete(s.id); draw();
  };
  let only = 'all';
  const draw = () => {
    const sc = scenesWithLines(script).filter((s) => script.els[s.i].t === 'scene');
    if (!sc.length){ wrap.replaceChildren(h('p', { class: 'muted center' }, 'The storyboard is made of scenes: write a scene heading first.')); return; }
    const total = sc.reduce((a, s) => a + (script.boards[s.id]?.length || 0), 0);
    wrap.replaceChildren(
      h('div', { class: 'board-top' }, h('b', {}, `${total} ${total === 1 ? 'frame' : 'frames'}`), h('span', { class: 'muted small' }, `in ${sc.filter((s) => script.boards[s.id]?.length).length} of ${sc.length} scenes`),
        h('span', { class: 'spacer' }),
        h('div', { class: 'seg' }, ...[['all', 'Every scene'], ['with', 'With frames']].map(([k, l]) => h('button', { type: 'button', class: only === k ? 'on' : '', onclick: () => { only = k; draw(); } }, l))),
        h('button', { class: 'btn', type: 'button', onclick: () => openShotList(ctx) }, h('span', { html: I.scenes }), 'Shot list'),
        h('button', { class: 'btn', type: 'button', onclick: () => boardPDF(ctx).catch((e) => toast(e.message)) }, h('span', { html: I.export }), 'PDF')),
      ...sc.filter((s) => only === 'all' || script.boards[s.id]?.length).map((s) => {
        const list = framesOf(s.id);
        return h('section', { class: 'bd-sc' },
          h('div', { class: 'bd-sc-h' }, h('span', { class: 'sn' }, String(s.n)), h('button', { type: 'button', class: 'card-t', title: 'Go to this scene', onclick: () => ctx.goTo(s.id, true) }, s.text),
            h('span', { class: 'spacer' }),
            ctx.readOnly() ? null : h('button', { class: 'btn', type: 'button', onclick: () => shots(s) }, h('span', { html: I.spark }), busy.has(s.id) ? 'Breaking it into shots…' : 'Shots with AI'),
            ctx.readOnly() ? null : h('button', { class: 'btn', type: 'button', onclick: () => { list.push({ id: fid(), size: 'MS', angle: 'eye level', move: 'static', desc: '' }); ctx.save(); draw(); } }, h('span', { html: I.plus }), 'Frame')),
          list.length ? h('div', { class: 'frames' }, ...list.map((f, k) => frameTile(s, f, k, list))) : null);
      }));
  };
  return { el: wrap, draw };
}

/* the shot list: every frame as a line, for the director of photography and the first AD */
function rowsOf(script){
  return scenesWithLines(script).flatMap((s) => (script.boards[s.id] || []).map((f, k) => ({ n: `${s.n}.${k + 1}`, scene: s.text, size: f.size || 'MS', angle: f.angle || 'eye level', move: f.move || 'static', desc: f.desc || '' })));
}
export function openShotList(ctx){
  const rows = rowsOf(ctx.script);
  if (!rows.length) return toast('No frames yet: add them in the storyboard, or let the AI break a scene into shots.');
  const csv = () => ['Shot,Scene,Size,Angle,Move,Description', ...rows.map((r) => [r.n, r.scene, r.size, r.angle, r.move, r.desc].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
  const table = (html) => `<table><tr><th>Shot</th><th>Size</th><th>Angle</th><th>Move</th><th>What we see</th></tr>${rows.map((r, i) => `${i === 0 || rows[i - 1].scene !== r.scene ? `<tr><td colspan="5"><b>${html(r.scene)}</b></td></tr>` : ''}<tr><td>${r.n}</td><td>${r.size}</td><td>${html(r.angle)}</td><td>${html(r.move)}</td><td>${html(r.desc)}</td></tr>`).join('')}</table>`;
  modal('Shot list', h('div', { class: 'stack' },
    h('div', { class: 'row' }, h('span', { class: 'muted small' }, `${rows.length} shots`), h('span', { class: 'spacer' }),
      h('button', { class: 'btn', type: 'button', onclick: () => download(`${ctx.script.title || 'Untitled'} shot list.csv`, csv(), 'text/csv') }, 'CSV'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => docPDF('Shot list', `<h1>${esc(ctx.script.title || 'Untitled')}</h1><p class="muted">Shot list · ${rows.length} shots</p>${table(esc)}`, `${ctx.script.title || 'Untitled'} shot list.pdf`).catch((e) => toast(e.message)) }, 'PDF')),
    h('div', { class: 'shot-list', html: table(esc) })), { wide: true });
}
// the storyboard PDF: six frames a page, each with its number, shot and what we see
export async function boardPDF(ctx){
  const sc = scenesWithLines(ctx.script).filter((s) => ctx.script.boards[s.id]?.length);
  if (!sc.length) throw new Error('No frames yet.');
  toast('Making the storyboard PDF…');
  const pics = new Map();
  for (const s of sc) for (const f of ctx.script.boards[s.id]){
    if (!f.img) continue;
    const url = await imageURL(f.img);
    if (url) pics.set(f.id, url.startsWith('data:') ? url : await fetch(url).then((r) => r.blob()).then(asDataURL).catch(() => ''));
  }
  const cells = sc.flatMap((s) => ctx.script.boards[s.id].map((f, k) => ({ s, f, k })));
  const html = `<style>.sb{display:grid;grid-template-columns:1fr 1fr;gap:6mm}.cell{break-inside:avoid}.ph{aspect-ratio:16/9;background:#eee;border:1px solid #ccc;display:flex;align-items:center;justify-content:center;overflow:hidden}.ph img{width:100%;height:100%;object-fit:cover}.cap{font-size:9pt;margin-top:1.5mm}.cap b{color:#c2410c}</style>
  <h1>${esc(ctx.script.title || 'Untitled')}</h1><p class="muted">Storyboard · ${cells.length} frames</p>
  <div class="sb">${cells.map(({ s, f, k }) => `<div class="cell"><div class="ph">${pics.get(f.id) ? `<img src="${pics.get(f.id)}">` : ''}</div><div class="cap"><b>${s.n}.${k + 1}</b> ${esc(SIZE_NAME[f.size] || f.size || '')} · ${esc(f.angle || '')} · ${esc(f.move || '')}<br>${esc(f.desc || '')}<br><span class="muted">${esc(s.text)}</span></div></div>`).join('')}</div>`;
  return docPDF('Storyboard', html, `${ctx.script.title || 'Untitled'} storyboard.pdf`);
}
