import { REVISIONS, contdOf, dualOf, sceneNumbers, segmentsOf, upper } from './model.js';
import { breaksBefore, fmtOf, formatCSS } from './formats.js';

/* The script laid out on real pages, as the industry format has it (Courier 12, 1.5" left, 1" right, top and
   bottom, character at 3.7", dialogue 2.5"-6", parenthetical 3.1"-5.4", transitions to the right), measured
   page by page in the browser so a scene heading never ends a page and a character's name stays with the lines
   it speaks. The same pages are what the PDF is made of (Electron prints them; a browser opens them to print). */

export const PRINT_CSS = `
.rwprint{--pw:8.27in;--ph:11.69in}
.rwprint.letter{--pw:8.5in;--ph:11in}
.rwprint .pg{position:relative;box-sizing:border-box;width:var(--pw);height:var(--ph);padding:1in 1in 1in 1.5in;background:#fff;color:#000;
  font:12pt/12pt Cousine,"Courier New",Courier,monospace;overflow:hidden;page-break-after:always;break-after:page}
.rwprint .pg:last-child{page-break-after:auto;break-after:auto}
.rwprint .pn{position:absolute;top:.5in;right:1in;font:inherit}
.rwprint .body{height:100%}
.rwprint .p{position:relative;margin:12pt 0 0;white-space:pre-wrap;word-wrap:break-word}
.rwprint[data-sn=left] .p.scene::before,.rwprint[data-sn=both] .p.scene::before{content:attr(data-n);position:absolute;left:-.75in}
.rwprint[data-sn=right] .p.scene::after,.rwprint[data-sn=both] .p.scene::after{content:attr(data-n);position:absolute;right:-.6in}
.rwprint .hd{position:absolute;top:.5in;left:1.5in;font:inherit}
.rwprint .rvh{position:absolute;top:.5in;right:1.6in;font:inherit;text-transform:uppercase}
.rwprint .p[data-rv]::after{content:'*';position:absolute;right:-.45in;top:0}
.rwprint[data-sn=right] .p.scene[data-rv]::after,.rwprint[data-sn=both] .p.scene[data-rv]::after{content:attr(data-n) ' *'}
.rwprint .dd{display:flex;gap:6%;margin-top:12pt}
.rwprint .dd > div{flex:1;min-width:0}
.rwprint .dd .p{width:auto!important;margin-left:0!important;margin-right:0!important}
.rwprint .dd .p:first-child{margin-top:0}
.rwprint .dd .p.character{padding-left:22%;box-sizing:border-box}
.rwprint .dd .p.paren{padding-left:10%;box-sizing:border-box}
.rwprint .wm{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;font:700 64pt/1 Cousine,"Courier New",monospace;color:rgba(0,0,0,.07);transform:rotate(-35deg);text-transform:uppercase;white-space:nowrap}
.rwprint .p:first-child{margin-top:0}
.rwprint .p.scene{margin-top:24pt;text-transform:uppercase}
.rwprint .p.scene:first-child{margin-top:0}
.rwprint .p.character{margin-left:2.2in;text-transform:uppercase}
.rwprint .p.paren{margin:0 0 0 1.6in;width:2.3in}
.rwprint .p.dialogue{margin:0 0 0 1in;width:3.5in}
.rwprint .p.transition{text-align:right;text-transform:uppercase}
.rwprint[data-names=centre]:is([data-fmt=film],[data-fmt=tv],[data-fmt=multicam]) .p.character{margin-left:1in!important;width:3.5in;text-align:center}
.rwprint .p.shot{text-transform:uppercase}
.rwprint .tp{display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:2.6in}
.rwprint .tp h1{font:inherit;text-transform:uppercase;margin:0;text-decoration:underline}
.rwprint .tp .ep{margin:12pt 0 0;text-decoration:underline}
.rwprint .tp .by{margin:48pt 0 0}
.rwprint .tp p{margin:12pt 0 0;white-space:pre-wrap}
.rwprint .tp-foot{position:absolute;left:1.5in;right:1in;bottom:1in;display:flex;flex-direction:column;gap:12pt;white-space:pre-wrap;text-align:left}
@page{size:auto;margin:0}
@media print{html,body{margin:0;background:#fff}}
`;

// each format's own page (formats.js), on the printed lines
const FORMAT_CSS = formatCSS('.rwprint', (t) => `.p.${t}`);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shown = (e) => (['scene', 'character', 'transition', 'shot', 'act', 'endact', 'page', 'panel'].includes(e.t) ? upper(e.x) : e.x);
const HEADS = ['scene', 'act', 'page', 'panel'];
/* what the page adds to the script's own words: the scene numbers and the (CONT'D) of a character who speaks
   again (the script's settings: sceneNumbers off/left/right/both, contd on unless switched off) */
export function decorOf(script){
  const locked = script.revision?.lock ? script.revision.locked : null;
  return { nums: sceneNumbers(script.els, fmtOf(script) === 'multicam', locked), contd: script.settings?.contd === false ? new Set() : contdOf(script.els), dual: dualOf(script.els) };
}
const attrs = (e, d) => `${d.nums.has(e.id) ? ` data-n="${d.nums.get(e.id)}"` : ''}${d.dual.has(e.id) ? ` data-dual="${d.dual.get(e.id)}"` : ''}${e.rv ? ` data-rv="${e.rv}"` : ''}`;
const said = (e, d) => shown(e) + (d?.contd.has(e.id) ? " (CONT'D)" : '');
const SPOKEN = ['dialogue', 'paren', 'lyric'];
// a line as HTML, with its bold, italic and underline
const htmlOf = (e, d) => {
  const x = shown(e);
  const body = e.f?.length ? segmentsOf(x, e.f).map((g) => { let t = esc(g.text); if (g.b) t = `<b>${t}</b>`; if (g.i) t = `<i>${t}</i>`; if (g.u) t = `<u>${t}</u>`; return t; }).join('') : esc(x);
  return body + (d?.contd.has(e.id) ? " (CONT'D)" : '');
};

// what has to stay together on a page: a heading with what follows it (an act with its first scene and its
// first lines), a name with its lines, a video with its audio
function units(els){
  const raw = [];
  for (let i = 0; i < els.length; i++){
    const e = els[i];
    if (!e.x.trim() && !HEADS.includes(e.t)) continue;
    if (e.t === 'character'){
      const u = [e];
      while (els[i + 1] && SPOKEN.includes(els[i + 1].t)) u.push(els[++i]);
      // a dual dialogue: the second speaker goes with the first
      if (els[i + 1]?.t === 'character' && els[i + 1].du){ u.push(els[++i]); while (els[i + 1] && SPOKEN.includes(els[i + 1].t)) u.push(els[++i]); }
      raw.push(u);
    } else if (e.t === 'video' && els[i + 1]?.t === 'audio') raw.push([e, els[++i]]);
    else raw.push([e]);
  }
  const out = [];
  for (let i = 0; i < raw.length; i++){
    const u = [...raw[i]];
    while (HEADS.includes(u[u.length - 1].t) && raw[i + 1]) u.push(...raw[++i]);
    out.push(u);
  }
  return out;
}

// the two columns of a dual dialogue around its lines (what is before the first speaker stays outside)
function dualBox(nodes){
  const box = document.createElement('div'); box.className = 'dd';
  const L = document.createElement('div'), R = document.createElement('div');
  box.append(L, R);
  for (const n of nodes) (n.dataset.dual === 'R' ? R : L).appendChild(n);
  return box;
}
export function paginate(script, d = decorOf(script)){
  const letter = script.settings?.page === 'letter';
  const host = document.createElement('div');
  host.className = 'rwprint' + (letter ? ' letter' : '');
  host.dataset.fmt = fmtOf(script);
  host.dataset.names = script.settings?.names || 'fd';
  host.style.cssText = 'position:fixed;left:-20000px;top:0;visibility:hidden';
  const style = document.createElement('style');
  style.textContent = PRINT_CSS + FORMAT_CSS;
  host.appendChild(style);
  const pg = document.createElement('div');
  pg.className = 'pg';
  const body = document.createElement('div');
  body.className = 'body';
  pg.appendChild(body);
  host.appendChild(pg);
  document.body.appendChild(host);
  const limit = body.clientHeight;
  const pages = [[]];
  const deco = d;
  const mk = (e) => { const d = document.createElement('div'); d.className = 'p ' + e.t; const k = deco.dual.get(e.id); if (k) d.dataset.dual = k; d.textContent = said(e, deco) || ' '; return d; };
  const fits = () => body.scrollHeight <= limit + 1;
  const breaks = breaksBefore(script);
  for (const u of units(script.els)){
    // a new act (a sitcom's every scene, a comic's page) starts its own page
    if (breaks.includes(u[0].t) && body.children.length){ body.replaceChildren(); pages.push([]); }
    let nodes = u.map(mk);
    // dual dialogue: the two speeches as two columns, measured as they print
    if (nodes.some((n) => n.dataset.dual === 'R')) nodes = [dualBox(nodes)];
    nodes.forEach((n) => body.appendChild(n));
    if (fits()){ pages[pages.length - 1].push(...u); continue; }
    nodes.forEach((n) => n.remove());
    const pageEmpty = !body.children.length;
    if (!pageEmpty){ body.replaceChildren(); pages.push([]); }
    // a unit taller than a page goes element by element (a dual dialogue stays whole)
    if (nodes.length === 1 && u.length > 1){ body.appendChild(nodes[0]); pages[pages.length - 1].push(...u); continue; }
    nodes.forEach((n, k) => {
      body.appendChild(n);
      if (!fits() && body.children.length > 1){ n.remove(); body.replaceChildren(n); pages.push([]); }
      pages[pages.length - 1].push(u[k]);
    });
  }
  host.remove();
  return pages.filter((p, i) => p.length || i === 0);
}

/* the pages to print; `only` (element ids) makes sides: those scenes alone, numbered as in the whole script */
export function printHTML(script, { titlePage = script.settings?.titlePrint !== false, only = null, onlyRevised = false } = {}){
  const letter = script.settings?.page === 'letter';
  const deco = decorOf(script);
  const part = only ? { ...script, els: script.els.filter((e) => only.has(e.id)) } : script;
  const pages = paginate(part, deco);
  const set = script.settings || {};
  const sn = ['left', 'right', 'both'].includes(set.sceneNumbers) ? set.sceneNumbers : 'off';
  const extra = `${set.header ? `<span class="hd">${esc(set.header)}</span>` : ''}${set.watermark ? `<div class="wm">${esc(set.watermark)}</div>` : ''}`;
  // the revision: its name and date on the pages it changed, the pages in its colour if asked, or only those pages
  const rev = script.revision || {};
  const col = REVISIONS.find(([k]) => k === rev.color);
  const touched = (els) => col && els.some((e) => e.rv === rev.color);
  const tint = (els) => (rev.colorPages && touched(els) ? ` style="background:${col[2]}22"` : '');
  const rvh = (els) => (touched(els) ? `<span class="rvh">${esc(col[1])} Rev. ${esc(rev.date || '')}</span>` : '');
  const tp = script.titlePage || {};
  // the title page as Final Draft lays it out: title and episode underlined, the credit and the author, and at
  // the foot on the left the copyright, the draft and the contact
  const foot = [tp.copyright, tp.draftDate, tp.contact].filter((x) => String(x || '').trim());
  const title = titlePage && (tp.title || tp.author) ? `<section class="pg"><div class="tp">
    <h1>${esc(tp.title || script.title)}</h1>${tp.episode ? `<p class="ep">${esc(tp.episode)}</p>` : ''}<p class="by">${esc(tp.credit || 'Written by')}</p><p>${esc(tp.author)}</p></div>
    ${foot.length ? `<div class="tp-foot">${foot.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}</section>` : '';
  const body = pages.map((els, i) => [els, i]).filter(([els]) => !onlyRevised || touched(els)).map(([els, i]) => `<section class="pg"${tint(els)}>${extra}${rvh(els)}${i ? `<span class="pn">${i + 1}.</span>` : ''}<div class="body">${linesHTML(els, deco)}</div></section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(script.title || 'Script')}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cousine:ital,wght@0,400;0,700;1,400&display=swap">
<style>${PRINT_CSS}${FORMAT_CSS}@page{size:${letter ? '8.5in 11in' : 'A4'};margin:0}</style></head>
<body class="rwprint${letter ? ' letter' : ''}" data-fmt="${fmtOf(script)}" data-sn="${sn}" data-names="${set.names === 'centre' ? 'centre' : 'fd'}" style="margin:0">${title}${body}</body></html>`;
}

// a page's lines; a dual dialogue's two speeches in two columns
function linesHTML(els, deco){
  const line = (e) => `<div class="p ${e.t}"${attrs(e, deco)}>${htmlOf(e, deco) || '&nbsp;'}</div>`;
  let out = '';
  for (let i = 0; i < els.length; i++){
    if (deco.dual.get(els[i].id) === 'L'){
      let j = i; const L = [], R = [];
      while (j < els.length && ['L', 'R'].includes(deco.dual.get(els[j].id))){ (deco.dual.get(els[j].id) === 'L' ? L : R).push(els[j]); j++; }
      out += `<div class="dd"><div>${L.map(line).join('')}</div><div>${R.map(line).join('')}</div></div>`;
      i = j - 1; continue;
    }
    out += line(els[i]);
  }
  return out;
}

// the PDF: in the app, Electron prints the pages to a file; in a browser, they open in a tab to print or save
export async function exportPDF(script, opts = {}){
  const html = printHTML(script, opts);
  const name = (script.title || 'Script').replace(/[\\/:*?"<>|]+/g, ' ').trim() + (opts.only ? ' sides' : '') + '.pdf';
  if (window.rwDesktop?.pdf) return window.rwDesktop.pdf(html, name, script.settings?.page === 'letter' ? 'Letter' : 'A4');
  const w = window.open('', '_blank');
  if (!w) throw new Error('Allow pop-ups for RoarWriter to make the PDF.');
  w.document.open(); w.document.write(html); w.document.close();
  w.onload = () => setTimeout(() => w.print(), 300);
}
