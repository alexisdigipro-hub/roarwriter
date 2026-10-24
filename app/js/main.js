import { authMessage, askAI, currentUser, onAuth, recover, signIn, signOut, signUp } from './cloud.js';
import { createStore } from './store.js';
import { LABEL, TYPES, blankScript, charactersOf, isGreek, metaOf, normalize, pageCount, scenesOf, upper } from './model.js';
import { Editor } from './editor.js';
import { fountainToEls, parseFountain, toFountain } from './fountain.js';
import { parseFdx, toFdx } from './fdx.js';
import { exportPDF } from './print.js';
import { CAT, CATS, breakdownCSV, breakdownOf, clearPaint, findIn, fold, normalizeTags, paintTags } from './breakdown.js';
import { I, ago, download, esc, h, modal, pickFile, toast } from './ui.js';

/* RoarWriter (The Mad Lions Lab, Oct 2026): write screenplays in the industry format, in English or Greek, on a
   computer (the Mac and Windows app) or in a browser (the web version). Signed in with a RoarMe account, the
   scripts follow the person to every device. */

const app = document.getElementById('app');
const DESKTOP = !!window.rwDesktop;
if (DESKTOP) document.documentElement.dataset.desktop = window.rwDesktop.platform;
let store = null;
let editor = null;
let leaveEditor = null;

const wordmark = () => h('div', { class: 'brand', html: '<span class="a">ROAR</span><span class="b">WRITER</span>' });

/* ---------- routing ---------- */
async function route(){
  if (leaveEditor){ const f = leaveEditor; leaveEditor = null; await f(); }
  const user = currentUser();
  if (!user){ store = null; return viewSignIn(); }
  if (!store || store.uid !== user.id){ store = createStore(user.id); store.uid = user.id; }
  const m = location.hash.match(/^#s\/([\w-]+)$/);
  if (m) return viewScript(m[1]);
  return viewLibrary();
}
window.addEventListener('hashchange', route);
onAuth(() => route());
window.addEventListener('online', () => store?.flush());

/* ---------- sign in (a RoarMe account) ---------- */
function viewSignIn(mode = 'in'){
  document.title = 'RoarWriter';
  const f = { name: '', email: '', password: '' };
  const msg = h('p', { class: 'msg' });
  const say = (t, kind = '') => { msg.textContent = t; msg.className = 'msg' + (kind ? ' ' + kind : ''); };
  const field = (k, label, type = 'text', extra = {}) => h('label', { class: 'field' }, h('span', {}, label), h('input', { class: 'input', type, value: f[k], oninput: (e) => { f[k] = e.target.value; }, ...extra }));
  const card = h('form', { class: 'auth-card', novalidate: true });
  const draw = () => card.replaceChildren(...[
    h('div', { class: 'seg' },
      h('button', { type: 'button', class: mode === 'in' ? 'on' : '', onclick: () => { mode = 'in'; say(''); draw(); } }, 'Sign in'),
      h('button', { type: 'button', class: mode === 'up' ? 'on' : '', onclick: () => { mode = 'up'; say(''); draw(); } }, 'New account')),
    mode === 'up' ? field('name', 'Your name', 'text', { autocomplete: 'name' }) : null,
    field('email', 'Email', 'email', { autocomplete: 'email', required: true }),
    field('password', mode === 'up' ? 'Password (at least 6 characters)' : 'Password', 'password', { autocomplete: mode === 'up' ? 'new-password' : 'current-password', required: true }),
    h('button', { class: 'btn primary', type: 'submit' }, mode === 'up' ? 'Create account' : 'Sign in'),
    mode === 'in' ? h('button', { class: 'linkish', type: 'button', onclick: async () => {
      if (!f.email.trim()) return say('Type your email first, then press Forgot password again.', 'err');
      try { await recover(f.email.trim()); say('We sent you an email with a link for a new password.', 'ok'); } catch (e) { say(authMessage(e), 'err'); }
    } }, 'Forgot password?') : null,
    msg,
    h('p', { class: 'hint' }, 'One account for RoarMe, Roardino and RoarWriter: if you have RoarMe, sign in with the same email and password.')].filter(Boolean));
  card.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = card.querySelector('button[type=submit]');
    if (!f.email.trim() || !f.password) return say('Fill in your email and password.', 'err');
    btn.disabled = true; say(mode === 'up' ? 'Creating your account…' : 'Signing in…');
    try {
      if (mode === 'up'){
        const d = await signUp(f.email.trim(), f.password, f.name.trim());
        if (!d?.access_token){ mode = 'in'; draw(); say(`Almost there: we sent an email to ${f.email.trim()}. Open its link, then sign in here.`, 'ok'); }
      } else await signIn(f.email.trim(), f.password);
    } catch (err) { say(authMessage(err), 'err'); }
    btn.disabled = false;
  });
  draw();
  app.replaceChildren(h('div', { class: 'auth' },
    h('div', { class: 'auth-in' },
      wordmark(),
      h('h1', { class: 'hero-h', html: 'Write the film.<br><b>In the format it is shot from.</b>' }),
      h('p', { class: 'lede' }, 'Scene headings, action, characters and dialogue laid out as the industry reads them, in English or Greek. Final Draft and Fountain in and out, a PDF ready to send, and an AI that helps when you ask.'),
      card),
    h('p', { class: 'auth-foot' }, 'RoarWriter · The Mad Lions Lab')));
}

/* ---------- the library: every script ---------- */
let libSearch = '';
async function viewLibrary(){
  document.title = 'RoarWriter';
  const user = currentUser();
  const grid = h('div', { class: 'grid' }, h('p', { class: 'muted' }, 'Loading…'));
  const search = h('label', { class: 'pill-search' }, h('span', { html: I.search }), h('input', { type: 'search', placeholder: 'Search', value: libSearch, oninput: (e) => { libSearch = e.target.value; draw(); } }));
  app.replaceChildren(
    h('header', { class: 'top' },
      wordmark(),
      h('h1', { class: 'top-title' }, 'Scripts'),
      search,
      h('button', { class: 'btn', onclick: importScript }, h('span', { html: I.import }), h('span', { class: 'lbl' }, 'Import')),
      h('button', { class: 'btn primary', onclick: () => newScript() }, h('span', { html: I.plus }), h('span', { class: 'lbl' }, 'New script')),
      h('button', { class: 'ib', title: user.email, 'aria-label': 'Account', html: I.user, onclick: account })),
    h('main', { class: 'lib' }, grid));
  let list = [];
  const draw = () => {
    const w = libSearch.trim().toLowerCase();
    const shown = list.filter((s) => !w || [s.title, s.meta?.author].join(' ').toLowerCase().includes(w));
    if (!list.length){
      grid.replaceChildren(h('div', { class: 'empty' }, h('b', {}, 'Your first script'), h('span', {}, 'Start a new one, or bring one in from Final Draft (.fdx) or Fountain.'),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => newScript() }, 'New script'), h('button', { class: 'btn', onclick: importScript }, 'Import'))));
      return;
    }
    grid.replaceChildren(...shown.map((s) => h('article', { class: 'tile', tabindex: 0, onclick: () => { location.hash = '#s/' + s.id; }, onkeydown: (e) => { if (e.key === 'Enter') location.hash = '#s/' + s.id; } },
      h('div', { class: 'tile-page' }, h('b', {}, upper(s.title || 'Untitled')), h('span', {}, s.meta?.author ? `by ${s.meta.author}` : '')),
      h('div', { class: 'tile-body' },
        h('div', { class: 'tile-title' }, s.title || 'Untitled'),
        h('div', { class: 'chips' },
          h('span', { class: 'chip' }, `${s.meta?.pages || 1} ${s.meta?.pages === 1 ? 'page' : 'pages'}`),
          h('span', { class: 'chip' }, `${s.meta?.scenes || 0} ${s.meta?.scenes === 1 ? 'scene' : 'scenes'}`),
          h('span', { class: 'chip quiet' }, ago(s.updated_at)))),
      h('div', { class: 'tile-acts' },
        h('button', { class: 'ib glass', title: 'Duplicate', 'aria-label': 'Duplicate', html: I.dup, onclick: async (e) => { e.stopPropagation(); const d = await store.open(s.id); if (d){ d.title = (d.title || 'Untitled') + ' (copy)'; d.titlePage.title = d.title; await newScript(d, false); draw(list = await store.list()); toast('Duplicated'); } } }),
        h('button', { class: 'ib glass danger', title: 'Delete', 'aria-label': 'Delete', html: I.trash, onclick: async (e) => {
          e.stopPropagation();
          if (!confirm(`Delete “${s.title || 'Untitled'}”? This cannot be undone.`)) return;
          try { await store.remove(s.id); } catch { toast('Deleted here; it will go from the account when the connection is back.'); }
          list = list.filter((x) => x.id !== s.id); draw();
        } })))));
  };
  list = await store.list();
  draw();
}

function account(){
  const user = currentUser();
  const close = modal('Account', h('div', { class: 'stack' },
    h('p', {}, h('b', {}, user.user_metadata?.name || ''), h('br'), h('span', { class: 'muted' }, user.email)),
    h('p', { class: 'muted small' }, 'Your RoarMe account. Your scripts are kept in it and on this computer.'),
    h('button', { class: 'btn', onclick: async () => { await store?.flush(); await signOut(); close(); } }, 'Sign out')));
}

async function newScript(data, open = true){
  const id = crypto.randomUUID();
  const s = normalize(data || blankScript('Untitled'));
  if (!data){ s.titlePage.author = currentUser()?.user_metadata?.name || ''; }
  store.save(id, s);
  await store.flush();
  if (open) location.hash = '#s/' + id;
  return id;
}

async function readScriptFile(file){
  const text = await file.text();
  if (/\.fdx$/i.test(file.name) || /<FinalDraft/i.test(text.slice(0, 400))) return parseFdx(text);
  const s = parseFountain(text);
  if (!s.title) s.title = s.titlePage.title = file.name.replace(/\.[^.]+$/, '');
  return s;
}
async function importScript(){
  const file = await pickFile('.fdx,.fountain,.spmd,.txt,text/plain');
  if (!file) return;
  try { const s = await readScriptFile(file); await newScript(s); toast(`Imported ${file.name}`); }
  catch (e) { toast(e.message || 'This file could not be read.'); }
}

/* ---------- writing ---------- */
async function viewScript(id){
  app.replaceChildren(h('p', { class: 'center muted' }, 'Opening…'));
  const script = await store.open(id);
  if (!script){ toast('This script is not here.'); location.hash = ''; return; }
  document.title = (script.title || 'Untitled') + ' · RoarWriter';
  script.tags = normalizeTags(script.tags);

  const saveState = h('span', { class: 'save' }, 'Saved');
  // on a phone the pages and Saved sit under the title (.title-sub); the bar's own ones are hidden there
  const pagesSub = h('span', {}, '1 page'), saveSub = h('span', { class: 'save' }, 'Saved');
  store.onState((s) => { for (const e of [saveState, saveSub]){ e.textContent = s === 'saving' ? 'Saving…' : s === 'offline' ? (e === saveSub ? 'Saved here' : 'Saved on this computer') : 'Saved'; e.dataset.s = s; } });
  const save = () => store.save(id, script);

  // the bar: back, the title, the kind of element, pages, exports, AI
  const titleIn = h('input', { class: 'title-in', value: script.title || '', placeholder: 'Untitled', 'aria-label': 'Title', oninput: (e) => { script.title = e.target.value; script.titlePage.title = e.target.value; document.title = (script.title || 'Untitled') + ' · RoarWriter'; tpTitle.textContent = e.target.value; save(); } });
  const typeBtn = h('button', { class: 'btn type-btn', type: 'button', onclick: () => typeMenu() }, h('span', { class: 'type-l' }, 'Action'), h('span', { html: I.down }));
  const pages = h('span', { class: 'chip' }, '1 page');
  const aiBtn = h('button', { class: 'btn', type: 'button', onclick: () => toggleAI() }, h('span', { html: I.spark }), h('span', { class: 'lbl' }, 'AI'));
  const exportBtn = h('button', { class: 'btn wide-only', type: 'button', onclick: () => exportMenu() }, h('span', { html: I.export }), h('span', { class: 'lbl' }, 'Export'));
  // narrow screens only: the scenes and characters (the side is hidden there), and on a phone one menu for the
  // title page and the exports
  const scenesBtn = h('button', { class: 'btn narrow-only', type: 'button', title: 'Scenes and characters', 'aria-label': 'Scenes and characters', onclick: () => openSide() }, h('span', { html: I.scenes }));
  const moreBtn = h('button', { class: 'btn phone-only', type: 'button', title: 'More', 'aria-label': 'More', onclick: () => moreMenu() }, h('span', { html: I.more }));
  const bar = h('header', { class: 'top edit-top' },
    h('a', { class: 'ib', href: '#', title: 'All scripts', 'aria-label': 'All scripts', html: I.back }),
    h('div', { class: 'title-box' }, titleIn, h('div', { class: 'title-sub' }, pagesSub, ' · ', saveSub)),
    typeBtn, pages, h('div', { class: 'spacer' }), saveState,
    h('button', { class: 'btn wide-only', type: 'button', onclick: () => showBreakdown() }, h('span', { html: I.tag }), h('span', { class: 'lbl' }, 'Breakdown')),
    h('button', { class: 'btn wide-only', type: 'button', onclick: () => titlePage() }, h('span', { html: I.page }), h('span', { class: 'lbl' }, 'Title page')),
    exportBtn, scenesBtn, aiBtn, moreBtn);

  // the side: scenes and characters
  let side = 'scenes';
  const sideList = h('div', { class: 'side-list' });
  const sideSeg = h('div', { class: 'seg' }, ...[['scenes', 'Scenes'], ['chars', 'Characters']].map(([k, l]) => h('button', { type: 'button', class: k === side ? 'on' : '', onclick: (e) => { side = k; [...sideSeg.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); drawSide(); } }, l)));
  const sideClose = h('button', { class: 'ib side-close', type: 'button', title: 'Close', 'aria-label': 'Close', html: I.x, onclick: () => closeSide() });
  const sidePanel = h('aside', { class: 'side' }, h('div', { class: 'side-head' }, sideSeg, sideClose), sideList);
  // on a narrow screen the side opens over the page; a tap on a scene or a character closes it and goes there
  const openSide = () => { drawSide(); sidePanel.classList.add('open'); };
  const closeSide = () => sidePanel.classList.remove('open');
  const goTo = (eid) => { closeSide(); editor.focusEl(eid, 0); };
  let caretId = '';
  const drawSide = () => {
    if (side === 'scenes'){
      const sc = scenesOf(script.els);
      const at = (() => { const i = script.els.findIndex((e) => e.id === caretId); let n = -1; sc.forEach((s, k) => { if (s.i <= i) n = k; }); return n; })();
      sideList.replaceChildren(...(sc.length ? sc.map((s, k) => h('button', { type: 'button', class: 'srow' + (k === at ? ' on' : ''), onclick: () => goTo(s.id) }, h('span', { class: 'sn' }, String(s.n)), h('span', { class: 'st' }, s.text))) : [h('p', { class: 'muted small' }, 'Scenes appear here as you write scene headings (INT. / EXT. / ΕΣΩΤ. / ΕΞΩΤ.).')]));
    } else {
      const cs = charactersOf(script.els);
      sideList.replaceChildren(...(cs.length ? cs.map((c) => h('button', { type: 'button', class: 'crow', onclick: () => goTo(script.els[c.first].id) }, h('span', { class: 'cn' }, c.name), h('span', { class: 'cc' }, `${c.lines} lines · ${c.scenes} sc.`))) : [h('p', { class: 'muted small' }, 'Characters appear here once they speak.')]));
    }
  };

  // the page
  const paper = h('div', { class: 'paper' + (script.settings.page === 'letter' ? ' letter' : '') });
  /* the title page, written on the page itself as Final Draft lays it out (Alex, 24 Oct): the title and the
     episode underlined in the middle, the credit and the author under them, the copyright, the draft and the
     contact at the foot on the left. An empty line shows what goes there, and does not print. */
  const tp = script.titlePage;
  const tpField = (k, ph, { multi = false, cls = '' } = {}) => {
    const f = h('div', { class: 'tpf ' + cls, 'data-k': k, 'data-ph': ph, spellcheck: 'true' });
    try { f.contentEditable = 'plaintext-only'; } catch { f.contentEditable = 'true'; }
    if (f.contentEditable !== 'plaintext-only') f.contentEditable = 'true';
    f.textContent = tp[k] || '';
    f.addEventListener('input', () => {
      tp[k] = (multi ? f.innerText : f.textContent).replace(/\n$/, '');
      if (!f.textContent) f.replaceChildren();
      if (k === 'title'){ script.title = tp.title.split('\n')[0]; titleIn.value = script.title; document.title = (script.title || 'Untitled') + ' · RoarWriter'; }
      save();
    });
    f.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || multi && !e.metaKey && !e.ctrlKey) return;
      e.preventDefault();
      const all = [...tpPaper.querySelectorAll('.tpf')], next = all[all.indexOf(f) + 1];
      if (next) next.focus(); else editor.focusEl(script.els[0].id, 0);
    });
    f.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
    return f;
  };
  const tpTitle = tpField('title', 'TITLE', { cls: 'tp-title' });
  const tpPaper = h('div', { class: 'paper tp-paper' + (script.settings.page === 'letter' ? ' letter' : '') },
    h('div', { class: 'tp-mid' }, tpTitle, tpField('episode', 'Episode Title', { cls: 'tp-ep' }),
      tpField('credit', 'Written by', { cls: 'tp-by' }), tpField('author', "Author's Name")),
    h('div', { class: 'tp-low' }, tpField('copyright', 'Copyright (c)'), tpField('draftDate', 'First Draft'), tpField('contact', 'Contact information', { multi: true })));
  const desk = h('div', { class: 'desk' }, tpPaper, paper);
  // Greek capitals lose their accents (ΝΥΧΤΑ, not ΝΎΧΤΑ) when the page knows it is Greek
  desk.lang = isGreek([tp.title, ...script.els.map((e) => e.x)].join(' ')) ? 'el' : 'en';
  const zoom = pageZoom(paper, desk);

  // the AI
  const aiPanel = h('aside', { class: 'ai', hidden: true });

  // phones and tablets: the kinds of line over the keyboard (there is no Tab there), with undo and redo
  const kinds = h('div', { class: 'kinds-in' }, ...TYPES.map(([k, l]) => h('button', { type: 'button', 'data-k': k, onmousedown: (e) => e.preventDefault(), onclick: () => editor.setCurrentType(k) }, SHORT[k] || l)));
  const tagBtn = h('button', { class: 'btn primary tag-btn', type: 'button', onmousedown: (e) => e.preventDefault(), onclick: () => { const r = tagBtn.getBoundingClientRect(); tagMenu(r.left, r.top, true); } }, h('span', { html: I.tag }), 'Tag');
  const kindBar = h('div', { class: 'kindbar' },
    tagBtn,
    h('button', { class: 'ib', type: 'button', title: 'Undo', 'aria-label': 'Undo', html: I.undo, onmousedown: (e) => e.preventDefault(), onclick: () => editor.doUndo() }),
    kinds,
    h('button', { class: 'ib', type: 'button', title: 'Redo', 'aria-label': 'Redo', html: I.redo, onmousedown: (e) => e.preventDefault(), onclick: () => editor.doRedo() }));

  app.replaceChildren(bar, h('div', { class: 'work' }, sidePanel, desk, aiPanel), kindBar);

  let sideT = 0;
  editor = new Editor(paper, script, {
    onChange: () => { save(); showPages(); clearTimeout(sideT); sideT = setTimeout(drawSide, 250); repaint(); },
    onCaret: ({ type, id: eid }) => {
      typeBtn.querySelector('.type-l').textContent = LABEL[type] || 'Action';
      kinds.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === type));
      const on = kinds.querySelector('.on');
      if (on && kinds.clientWidth && (on.offsetLeft < kinds.scrollLeft || on.offsetLeft + on.offsetWidth > kinds.scrollLeft + kinds.clientWidth)) kinds.scrollLeft = on.offsetLeft - (kinds.clientWidth - on.offsetWidth) / 2;
      if (eid !== caretId){ caretId = eid; clearTimeout(sideT); sideT = setTimeout(drawSide, 120); }
    },
  });
  let paintT = 0;
  function repaint(){ clearTimeout(paintT); paintT = setTimeout(() => editor && paintTags(editor.box, script.tags), 120); }
  repaint();
  // right click on a word or a selection: tag it for the breakdown (on a phone, select it and press Tag)
  editor.box.addEventListener('contextmenu', (e) => {
    if (!pickWord()) return;
    e.preventDefault();
    tagMenu(e.clientX, e.clientY);
  });
  const onSel = () => { const sel = getSelection(); kindBar.classList.toggle('sel', !!(sel.rangeCount && !sel.isCollapsed && editor?.box.contains(sel.anchorNode) && sel.toString().trim())); };
  document.addEventListener('selectionchange', onSel);
  function showPages(){ const n = pageCount(script.els); pages.textContent = pagesSub.textContent = `${n} ${n === 1 ? 'page' : 'pages'}`; }
  showPages();
  const offKeyboard = followKeyboard(kindBar);
  drawSide();
  const first = script.els[script.els.length - 1];
  editor.focusEl(first.id, first.x.length);

  const keys = (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 's'){ e.preventDefault(); store.flush(); }
    if (mod && e.key === 'p'){ e.preventDefault(); pdf(); }
    if (mod && e.shiftKey && (e.key === 'a' || e.key === 'A')){ e.preventDefault(); toggleAI(); }
  };
  document.addEventListener('keydown', keys);
  const offMenu = window.rwDesktop?.onMenu?.((cmd) => {
    if (cmd === 'pdf') pdf(); else if (cmd === 'fdx') saveAs('fdx'); else if (cmd === 'fountain') saveAs('fountain'); else if (cmd === 'title') titlePage(); else if (cmd === 'ai') toggleAI();
    else if (cmd.startsWith('type:')) editor.setCurrentType(cmd.slice(5));
  });
  leaveEditor = async () => { document.removeEventListener('keydown', keys); offMenu?.(); offKeyboard(); zoom.off(); document.removeEventListener('selectionchange', onSel); clearPaint(); editor?.destroy(); editor = null; await store.flush(); };

  function typeMenu(){
    const r = typeBtn.getBoundingClientRect();
    const menu = h('div', { class: 'menu', style: `left:${r.left}px;top:${r.bottom + 6}px` }, ...TYPES.map(([k, l, n]) => h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); editor.setCurrentType(k); menu.remove(); } }, h('span', {}, l), h('kbd', {}, (navigator.platform.includes('Mac') ? '⌘' : 'Ctrl ') + n))),
      h('p', { class: 'menu-hint' }, 'Enter goes on to what usually comes next. Tab changes the kind.'));
    showMenu(menu);
  }
  function exportMenu(){
    const r = exportBtn.getBoundingClientRect();
    const menu = h('div', { class: 'menu', style: `left:${Math.max(8, r.right - 240)}px;top:${r.bottom + 6}px` },
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); pdf(); } }, h('span', {}, 'PDF'), h('kbd', {}, 'to send or print')),
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); saveAs('fdx'); } }, h('span', {}, 'Final Draft'), h('kbd', {}, '.fdx')),
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); saveAs('fountain'); } }, h('span', {}, 'Fountain'), h('kbd', {}, '.fountain')));
    showMenu(menu);
  }
  /* the word to tag: the selection (one line of it, without the punctuation at its ends), or a tag under the caret */
  function pickWord(){
    const sel = getSelection();
    if (!sel.rangeCount || !editor.box.contains(sel.anchorNode)) return null;
    const text = sel.toString().split('\n')[0].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (text) return { text, tags: script.tags.filter((t) => fold(t.name) === fold(text)) };
    const p = editor.current(); if (!p) return null;
    const at = editor.offset(p), x = editor.textOf(p);
    const tags = script.tags.filter((t) => findIn(x, t.name).some(([a, b]) => at >= a && at <= b));
    return tags.length ? { text: tags[0].name, tags } : null;
  }
  function tagMenu(x, y, above = false){
    const w = pickWord();
    if (!w) return toast('Select a word or a phrase first.');
    const add = (cat) => (e) => {
      e.preventDefault(); menu.remove();
      if (!script.tags.some((t) => t.cat === cat && fold(t.name) === fold(w.text))) script.tags.push({ id: crypto.randomUUID().slice(0, 8), cat, name: w.text });
      save(); repaint(); getSelection().collapseToEnd();
      toast(`${w.text} · ${CAT[cat].label}`);
    };
    const menu = h('div', { class: 'menu', style: `left:${x}px;top:${y}px` },
      h('p', { class: 'menu-title' }, 'Tag ', h('b', {}, `“${w.text}”`)),
      h('div', { class: 'bd-cats' }, ...CATS.map(([k, l, c]) => h('button', { type: 'button', onmousedown: add(k) }, h('i', { class: 'bd-dot', style: `background:${c}` }), h('span', {}, l)))),
      ...w.tags.map((t) => h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); script.tags = script.tags.filter((x) => x.id !== t.id); save(); repaint(); toast('Tag removed'); } }, h('span', {}, `Remove from ${CAT[t.cat].label}`), h('i', { class: 'bd-dot', style: `background:${CAT[t.cat].color}` }))));
    showMenu(menu);
    // kept on the screen, above the finger on a phone
    const r = menu.getBoundingClientRect();
    if (above || r.bottom > innerHeight - 8) menu.style.top = `${Math.max(8, (above ? y - 8 : innerHeight - 8) - r.height)}px`;
  }

  /* the breakdown: by scene (where, when, who and what) or by element (each one with its scenes) */
  let bdView = 'scene';
  function showBreakdown(){
    const body = h('div', { class: 'bd' });
    const draw = () => {
      const { rows, byEl } = breakdownOf(script);
      const seg = h('div', { class: 'seg' }, ...[['scene', 'By scene'], ['el', 'By element']].map(([k, l]) => h('button', { type: 'button', class: bdView === k ? 'on' : '', onclick: () => { bdView = k; draw(); } }, l)));
      const csv = h('button', { class: 'btn', type: 'button', onclick: () => download(`${(script.title || 'Untitled').replace(/[\\/:*?"<>|]+/g, ' ').trim()} breakdown.csv`, breakdownCSV(script), 'text/csv') }, h('span', { html: I.export }), 'CSV');
      const chip = (cat, name, extra) => h('span', { class: 'bd-chip', style: `--c:${CAT[cat].color}` }, name, extra);
      const tagged = (cat, name) => script.tags.find((t) => t.cat === cat && fold(t.name) === fold(name));
      const hint = h('p', { class: 'bd-empty' }, 'The cast and the locations come from the script. Select a word on the page and right-click it (on a phone: select it and press Tag) to add props, wardrobe, vehicles and the rest.');
      let list;
      if (bdView === 'scene'){
        list = h('div', { class: 'bd-list' }, ...rows.map((r) => h('div', { class: 'bd-scene' },
          h('button', { class: 'bd-scene-h', type: 'button', onclick: () => { close(); if (r.id) goTo(r.id); } }, h('span', { class: 'sn' }, r.n ? String(r.n) : '·'), h('span', { class: 'st' }, r.heading || 'Before the first scene'), h('small', {}, [r.ie, r.time].filter(Boolean).join(' · '))),
          ...CATS.filter(([c]) => r.items[c].length).map(([c, l, col]) => h('div', { class: 'bd-row' }, h('span', {}, h('i', { class: 'bd-dot', style: `background:${col}` }), l), h('div', { class: 'bd-items' }, ...r.items[c].map((n) => chip(c, n))))))));
      } else {
        list = h('div', { class: 'bd-list' }, ...CATS.filter(([c]) => byEl[c].length).map(([c, l, col]) => h('div', { class: 'bd-scene' },
          h('div', { class: 'bd-row' }, h('span', {}, h('i', { class: 'bd-dot', style: `background:${col}` }), l), h('div', { class: 'bd-items' }, ...byEl[c].map((e) => {
            const t = tagged(c, e.name);
            return chip(c, e.name, [h('i', {}, `sc. ${e.scenes.filter(Boolean).join(', ') || '-'}`), t ? h('button', { type: 'button', title: 'Remove the tag', 'aria-label': 'Remove the tag', onclick: () => { script.tags = script.tags.filter((x) => x.id !== t.id); save(); repaint(); draw(); } }, '×') : null]);
          }))))));
      }
      body.replaceChildren(h('div', { class: 'bd-top' }, seg, h('span', { class: 'spacer' }), csv), list, hint);
    };
    draw();
    const close = modal('Breakdown', body, { wide: true });
  }

  function moreMenu(){
    const r = moreBtn.getBoundingClientRect();
    const pct = h('b', {}, zoom.label());
    const step = (d) => (e) => { e.preventDefault(); zoom.by(d); pct.textContent = zoom.label(); };
    const menu = h('div', { class: 'menu', style: `right:${Math.max(8, innerWidth - r.right)}px;top:${r.bottom + 6}px` },
      h('div', { class: 'zoom-row' }, h('span', {}, 'Zoom'),
        h('button', { class: 'ib', type: 'button', 'aria-label': 'Smaller', html: I.minus, onmousedown: step(-0.1) }), pct,
        h('button', { class: 'ib', type: 'button', 'aria-label': 'Bigger', html: I.plus, onmousedown: step(0.1) })),
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); showBreakdown(); } }, h('span', {}, 'Breakdown'), h('kbd', {}, 'cast, locations, props')),
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); titlePage(); } }, h('span', {}, 'Title page'), h('kbd', {}, 'title, author, page size')),
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); pdf(); } }, h('span', {}, 'Export PDF'), h('kbd', {}, 'to send or print')),
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); saveAs('fdx'); } }, h('span', {}, 'Save as Final Draft'), h('kbd', {}, '.fdx')),
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); saveAs('fountain'); } }, h('span', {}, 'Save as Fountain'), h('kbd', {}, '.fountain')));
    showMenu(menu);
  }
  async function pdf(){ try { await exportPDF(script); } catch (e) { toast(e.message || 'The PDF could not be made.'); } }
  async function saveAs(kind){
    const base = (script.title || 'Untitled').replace(/[\\/:*?"<>|]+/g, ' ').trim();
    const text = kind === 'fdx' ? toFdx(script) : toFountain(script);
    const name = `${base}.${kind}`;
    if (window.rwDesktop?.saveText){ const ok = await window.rwDesktop.saveText(name, text); if (ok) toast('Saved'); }
    else download(name, text, kind === 'fdx' ? 'application/xml' : 'text/plain');
  }
  function titlePage(){
    const tp = script.titlePage;
    const f = (k, label, area) => h('label', { class: 'field' }, h('span', {}, label), h(area ? 'textarea' : 'input', { class: 'input', value: tp[k] || '', rows: area ? 3 : undefined, oninput: (e) => { tp[k] = e.target.value; if (k === 'title'){ script.title = e.target.value; titleIn.value = e.target.value; } const on = tpPaper.querySelector(`.tpf[data-k="${k}"]`); if (on) on.textContent = e.target.value; save(); } }));
    const page = h('div', { class: 'seg' }, ...[['a4', 'A4'], ['letter', 'US Letter']].map(([k, l]) => h('button', { type: 'button', class: script.settings.page === k ? 'on' : '', onclick: (e) => { script.settings.page = k; [...page.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); paper.classList.toggle('letter', k === 'letter'); tpPaper.classList.toggle('letter', k === 'letter'); save(); } }, l)));
    modal('Title page', h('div', { class: 'stack' }, f('title', 'Title'), f('episode', 'Episode'), h('div', { class: 'row2' }, f('credit', 'Credit'), f('author', 'Author')), h('div', { class: 'row2' }, f('copyright', 'Copyright'), f('draftDate', 'Draft / date')), f('contact', 'Contact', true),
      h('div', { class: 'field' }, h('span', {}, 'Page size'), page)));
  }

  /* the AI: about the scene with the caret, answering in the script's language */
  function sceneRange(){
    const i = Math.max(0, script.els.findIndex((e) => e.id === caretId));
    let a = i; while (a > 0 && script.els[a].t !== 'scene') a--;
    let b = i + 1; while (b < script.els.length && script.els[b].t !== 'scene') b++;
    return [a, b];
  }
  let aiBusy = false;
  function toggleAI(){
    closeSide();
    aiPanel.hidden = !aiPanel.hidden;
    if (!aiPanel.hidden) drawAI();
  }
  function drawAI(result){
    const prompt = h('textarea', { class: 'input', rows: 3, placeholder: 'Ask about this scene, or say what you want…' });
    const out = h('div', { class: 'ai-out' });
    const run = async (task, label) => {
      if (aiBusy) return;
      const [a, b] = sceneRange();
      const sceneEls = script.els.slice(a, b);
      const before = script.els.slice(Math.max(0, a - 40), a);
      const lang = isGreek(script.els.map((e) => e.x).join(' ')) ? 'el' : 'en';
      aiBusy = true;
      out.replaceChildren(h('p', { class: 'muted' }, `${label}…`));
      try {
        const r = await askAI({ task, prompt: prompt.value.trim(), title: script.title, lang,
          characters: charactersOf(script.els).map((c) => c.name).slice(0, 30),
          scene: toFountain({ els: sceneEls }, { titlePage: false }), before: toFountain({ els: before }, { titlePage: false }) });
        showResult(out, task, r.text || '', a, b);
      } catch (e) { out.replaceChildren(h('p', { class: 'msg err' }, e.message || 'The AI did not answer.')); }
      aiBusy = false;
    };
    aiPanel.replaceChildren(
      h('div', { class: 'ai-head' }, h('b', { html: I.spark + ' AI' }), h('button', { class: 'ib', title: 'Close', html: I.x, onclick: () => { aiPanel.hidden = true; } })),
      h('p', { class: 'muted small' }, 'Works on the scene with the cursor. Nothing changes until you press Insert or Replace.'),
      h('div', { class: 'ai-quick' },
        h('button', { class: 'btn', onclick: () => run('dialogue', 'Writing dialogue') }, 'Suggest dialogue'),
        h('button', { class: 'btn', onclick: () => run('rewrite', 'Rewriting the scene') }, 'Rewrite scene'),
        h('button', { class: 'btn', onclick: () => run('continue', 'Writing what comes next') }, 'What comes next'),
        h('button', { class: 'btn', onclick: () => run('ideas', 'Thinking') }, 'Ideas & notes')),
      prompt,
      h('button', { class: 'btn primary', onclick: () => { if (!prompt.value.trim()) return toast('Write what you want first.'); run('custom', 'Working'); } }, 'Ask'),
      out);
    if (result) out.replaceChildren(result);
  }
  function showResult(out, task, text, a, b){
    const notes = task === 'ideas';
    const els = notes ? [] : fountainToEls(text);
    const preview = notes || !els.length
      ? h('div', { class: 'ai-notes' }, text)
      : h('div', { class: 'ai-preview' }, ...els.map((e) => h('p', { class: 'e', 'data-t': e.t }, e.x)));
    out.replaceChildren(preview, h('div', { class: 'row' },
      !notes && els.length ? h('button', { class: 'btn primary', onclick: () => { editor.insertEls(els.map((e) => ({ ...e, id: crypto.randomUUID().slice(0, 8) }))); toast('Inserted'); } }, 'Insert') : null,
      !notes && els.length && (task === 'rewrite' || task === 'custom') ? h('button', { class: 'btn', onclick: () => { if (!confirm('Replace the whole scene with this?')) return; editor.insertEls(els.map((e) => ({ ...e, id: crypto.randomUUID().slice(0, 8) })), { replaceFrom: a, replaceTo: b }); toast('Scene replaced'); } }, 'Replace scene') : null,
      h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Could not copy'); } } }, 'Copy')));
  }
}

/* Zoom of the page on phones and tablets (Alex, 24 Oct): the letters grow or shrink and the lines wrap again, so
   the page never has to be moved sideways. Two fingers on the page pinch it; ⋯ > Zoom has − and +. Kept per device. */
function pageZoom(paper, desk){
  const MIN = 0.7, MAX = 2;
  let z = 1;
  try { z = Math.min(MAX, Math.max(MIN, +localStorage.getItem('rw_zoom') || 1)); } catch {}
  const set = (v, keep = true) => {
    z = Math.round(Math.min(MAX, Math.max(MIN, v)) * 100) / 100;
    desk.style.setProperty('--z', z);
    if (keep) try { localStorage.setItem('rw_zoom', String(z)); } catch {}
  };
  set(z, false);
  let start = 0, from = 1;
  const gap = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const down = (e) => { if (e.touches.length === 2){ start = gap(e.touches); from = z; } };
  const move = (e) => { if (e.touches.length === 2 && start){ e.preventDefault(); set(from * gap(e.touches) / start, false); } };
  const up = (e) => { if (start && e.touches.length < 2){ start = 0; set(z); } };
  // Safari's own pinch would zoom the whole window instead
  const gesture = (e) => e.preventDefault();
  desk.addEventListener('touchstart', down, { passive: true });
  desk.addEventListener('touchmove', move, { passive: false });
  desk.addEventListener('touchend', up); desk.addEventListener('touchcancel', up);
  desk.addEventListener('gesturestart', gesture); desk.addEventListener('gesturechange', gesture);
  return {
    by: (d) => set(z + d),
    label: () => `${Math.round(z * 100)}%`,
    off: () => {},
  };
}

// short names for the kinds on the phone's bar
const SHORT = { scene: 'Scene', paren: '(Paren)' };

/* The kinds bar stays on the keyboard: a phone's keyboard covers the bottom of the window without making it any
   smaller, so the bar is lifted by what the visible part (visualViewport) leaves out, and the line being written
   is scrolled up when it would go under the bar. */
function followKeyboard(bar){
  const vv = window.visualViewport;
  if (!vv) return () => {};
  let raf = 0;
  const place = () => {
    raf = 0;
    const lift = Math.max(0, innerHeight - vv.height - vv.offsetTop);
    bar.style.transform = lift ? `translateY(${-lift}px)` : '';
    bar.classList.toggle('kb', lift > 80);
    if (getComputedStyle(bar).display === 'none') return;
    const s = getSelection();
    if (!s.rangeCount || !document.activeElement?.classList.contains('script')) return;
    const r = s.getRangeAt(0).getClientRects()[0] || s.anchorNode?.parentElement?.getBoundingClientRect?.();
    if (!r) return;
    const bottom = vv.offsetTop + vv.height - bar.offsetHeight - 12;
    if (r.bottom > bottom) window.scrollBy(0, r.bottom - bottom);
  };
  const ask = () => { if (!raf) raf = requestAnimationFrame(place); };
  vv.addEventListener('resize', ask); vv.addEventListener('scroll', ask);
  document.addEventListener('selectionchange', ask);
  document.addEventListener('input', ask);
  ask();
  return () => { vv.removeEventListener('resize', ask); vv.removeEventListener('scroll', ask); document.removeEventListener('selectionchange', ask); document.removeEventListener('input', ask); };
}

function showMenu(menu){
  document.querySelectorAll('.menu').forEach((m) => m.remove());
  document.body.append(menu);
  // kept on the screen (a phone is narrow)
  const r = menu.getBoundingClientRect();
  if (r.right > innerWidth - 8){ menu.style.left = `${Math.max(8, innerWidth - 8 - r.width)}px`; menu.style.right = 'auto'; }
  const off = (e) => { if (!menu.contains(e.target)){ menu.remove(); document.removeEventListener('mousedown', off); } };
  setTimeout(() => document.addEventListener('mousedown', off), 0);
}

window.addEventListener('beforeunload', () => { store?.flush(); });
route();
