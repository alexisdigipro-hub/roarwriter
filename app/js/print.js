import { upper } from './model.js';

/* The script laid out on real pages, as the industry format has it (Courier 12, 1.5" left, 1" right, top and
   bottom, character at 3.7", dialogue 2.5"-6", parenthetical 3.1"-5.4", transitions to the right), measured
   page by page in the browser so a scene heading never ends a page and a character's name stays with the lines
   it speaks. The same pages are what the PDF is made of (Electron prints them; a browser opens them to print). */

export const PRINT_CSS = `
.rwprint{--pw:8.27in;--ph:11.69in}
.rwprint.letter{--pw:8.5in;--ph:11in}
.rwprint .pg{position:relative;box-sizing:border-box;width:var(--pw);height:var(--ph);padding:1in 1in 1in 1.5in;background:#fff;color:#000;
  font:12pt/12pt "Courier Prime","Courier New",Courier,monospace;overflow:hidden;page-break-after:always;break-after:page}
.rwprint .pg:last-child{page-break-after:auto;break-after:auto}
.rwprint .pn{position:absolute;top:.5in;right:1in;font:inherit}
.rwprint .body{height:100%}
.rwprint .p{margin:12pt 0 0;white-space:pre-wrap;word-wrap:break-word}
.rwprint .p:first-child{margin-top:0}
.rwprint .p.scene{margin-top:24pt;text-transform:uppercase}
.rwprint .p.scene:first-child{margin-top:0}
.rwprint .p.character{margin-left:2.2in;text-transform:uppercase}
.rwprint .p.paren{margin:0 0 0 1.6in;width:2.3in}
.rwprint .p.dialogue{margin:0 0 0 1in;width:3.5in}
.rwprint .p.transition{text-align:right;text-transform:uppercase}
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

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shown = (e) => (['scene', 'character', 'transition', 'shot'].includes(e.t) ? upper(e.x) : e.x);

// what has to stay together on a page: a heading with what follows it, a name with its lines
function units(els){
  const out = [];
  for (let i = 0; i < els.length; i++){
    const e = els[i];
    if (!e.x.trim() && e.t !== 'scene') continue;
    if (e.t === 'character'){
      const u = [e];
      while (els[i + 1] && (els[i + 1].t === 'dialogue' || els[i + 1].t === 'paren')) u.push(els[++i]);
      out.push(u);
    } else if (e.t === 'scene' && els[i + 1] && els[i + 1].t !== 'scene'){
      const u = [e];
      if (els[i + 1].t === 'character'){ u.push(els[++i]); while (els[i + 1] && (els[i + 1].t === 'dialogue' || els[i + 1].t === 'paren')) u.push(els[++i]); }
      else u.push(els[++i]);
      out.push(u);
    } else out.push([e]);
  }
  return out;
}

export function paginate(script){
  const letter = script.settings?.page === 'letter';
  const host = document.createElement('div');
  host.className = 'rwprint' + (letter ? ' letter' : '');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;visibility:hidden';
  const style = document.createElement('style');
  style.textContent = PRINT_CSS;
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
  const mk = (e) => { const d = document.createElement('div'); d.className = 'p ' + e.t; d.textContent = shown(e) || ' '; return d; };
  const fits = () => body.scrollHeight <= limit + 1;
  for (const u of units(script.els)){
    const nodes = u.map(mk);
    nodes.forEach((n) => body.appendChild(n));
    if (fits()){ pages[pages.length - 1].push(...u); continue; }
    nodes.forEach((n) => n.remove());
    const pageEmpty = !body.children.length;
    if (!pageEmpty){ body.replaceChildren(); pages.push([]); }
    // a unit taller than a page goes element by element
    nodes.forEach((n, k) => {
      body.appendChild(n);
      if (!fits() && body.children.length > 1){ n.remove(); body.replaceChildren(n); pages.push([]); }
      pages[pages.length - 1].push(u[k]);
    });
  }
  host.remove();
  return pages.filter((p, i) => p.length || i === 0);
}

export function printHTML(script, { titlePage = true } = {}){
  const letter = script.settings?.page === 'letter';
  const pages = paginate(script);
  const tp = script.titlePage || {};
  // the title page as Final Draft lays it out: title and episode underlined, the credit and the author, and at
  // the foot on the left the copyright, the draft and the contact
  const foot = [tp.copyright, tp.draftDate, tp.contact].filter((x) => String(x || '').trim());
  const title = titlePage && (tp.title || tp.author) ? `<section class="pg"><div class="tp">
    <h1>${esc(tp.title || script.title)}</h1>${tp.episode ? `<p class="ep">${esc(tp.episode)}</p>` : ''}<p class="by">${esc(tp.credit || 'Written by')}</p><p>${esc(tp.author)}</p></div>
    ${foot.length ? `<div class="tp-foot">${foot.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}</section>` : '';
  const body = pages.map((els, i) => `<section class="pg">${i ? `<span class="pn">${i + 1}.</span>` : ''}<div class="body">${els.map((e) => `<div class="p ${e.t}">${esc(shown(e)) || '&nbsp;'}</div>`).join('')}</div></section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(script.title || 'Script')}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400&display=swap">
<style>${PRINT_CSS}@page{size:${letter ? '8.5in 11in' : 'A4'};margin:0}</style></head>
<body class="rwprint${letter ? ' letter' : ''}" style="margin:0">${title}${body}</body></html>`;
}

// the PDF: in the app, Electron prints the pages to a file; in a browser, they open in a tab to print or save
export async function exportPDF(script){
  const html = printHTML(script);
  const name = (script.title || 'Script').replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.pdf';
  if (window.rwDesktop?.pdf) return window.rwDesktop.pdf(html, name, script.settings?.page === 'letter' ? 'Letter' : 'A4');
  const w = window.open('', '_blank');
  if (!w) throw new Error('Allow pop-ups for RoarWriter to make the PDF.');
  w.document.open(); w.document.write(html); w.document.close();
  w.onload = () => setTimeout(() => w.print(), 300);
}
