// small helpers for building the screens
export function h(tag, attrs = {}, ...kids){
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})){
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e && typeof v !== 'string') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()){ if (kid == null || kid === false) continue; e.append(kid.nodeType ? kid : document.createTextNode(kid)); }
  return e;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastT = 0;
export function toast(msg){
  let t = document.getElementById('toast');
  if (!t){ t = h('div', { id: 'toast', class: 'toast', role: 'status' }); document.body.append(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200);
}

// a window over the page; returns its close()
export function modal(title, body, { wide = false, onClose } = {}){
  const close = () => { bg.remove(); document.removeEventListener('keydown', esc); onClose?.(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const bg = h('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) close(); } },
    h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'modal-head' }, h('h3', {}, title), h('button', { class: 'ib', type: 'button', title: 'Close', 'aria-label': 'Close', html: I.x, onclick: () => close() })),
      body));
  document.body.append(bg);
  document.addEventListener('keydown', esc);
  setTimeout(() => bg.querySelector('input,textarea,button.primary')?.focus(), 30);
  return close;
}

export function pickFile(accept){
  return new Promise((res) => {
    const i = h('input', { type: 'file', accept, style: 'display:none', onchange: () => { res(i.files[0] || null); i.remove(); } });
    document.body.append(i); i.click();
  });
}
export function download(name, text, type = 'text/plain'){
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export const ago = (iso) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!isFinite(s)) return '';
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
};

const svg = (d, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const I = {
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>', 2.2),
  tag: svg('<path d="M3 12V4a1 1 0 011-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.6"/>'),
  people: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.8c1.9.7 3.1 2.4 3.5 5.2"/>'),
  leave: svg('<path d="M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>'),
  minus: svg('<path d="M5 12h14"/>', 2.4),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 2.4),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  import: svg('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>'),
  export: svg('<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 21h14"/>'),
  dup: svg('<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1"/>'),
  trash: svg('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>'),
  spark: svg('<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>', 1.8),
  page: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  down: svg('<path d="M6 9l6 6 6-6"/>'),
  scenes: svg('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  more: svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>', 2.4),
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>'),
  redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>'),
};
