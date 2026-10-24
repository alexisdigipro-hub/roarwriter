import { authMessage, askAI, currentUser, onAuth, recover, signIn, signOut, signUp } from './cloud.js';
import { createStore } from './store.js';
import { LABEL, TYPES, blankScript, charactersOf, isGreek, metaOf, normalize, pageCount, scenesOf, upper } from './model.js';
import { Editor } from './editor.js';
import { fountainToEls, parseFountain, toFountain } from './fountain.js';
import { parseFdx, toFdx } from './fdx.js';
import { exportPDF } from './print.js';
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
          h('span', { class: 'chip' }, `${s.meta?.scenes || 0} scenes`),
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

  const saveState = h('span', { class: 'save' }, 'Saved');
  store.onState((s) => { saveState.textContent = s === 'saving' ? 'Saving…' : s === 'offline' ? 'Saved on this computer' : 'Saved'; saveState.dataset.s = s; });
  const save = () => store.save(id, script);

  // the bar: back, the title, the kind of element, pages, exports, AI
  const titleIn = h('input', { class: 'title-in', value: script.title || '', placeholder: 'Untitled', 'aria-label': 'Title', oninput: (e) => { script.title = e.target.value; script.titlePage.title = e.target.value; document.title = (script.title || 'Untitled') + ' · RoarWriter'; save(); } });
  const typeBtn = h('button', { class: 'btn type-btn', type: 'button', onclick: () => typeMenu() }, h('span', { class: 'type-l' }, 'Action'), h('span', { html: I.down }));
  const pages = h('span', { class: 'chip' }, '1 page');
  const aiBtn = h('button', { class: 'btn', type: 'button', onclick: () => toggleAI() }, h('span', { html: I.spark }), h('span', { class: 'lbl' }, 'AI'));
  const exportBtn = h('button', { class: 'btn', type: 'button', onclick: () => exportMenu() }, h('span', { html: I.export }), h('span', { class: 'lbl' }, 'Export'));
  const bar = h('header', { class: 'top edit-top' },
    h('a', { class: 'ib', href: '#', title: 'All scripts', 'aria-label': 'All scripts', html: I.back }),
    titleIn, typeBtn, pages, h('div', { class: 'spacer' }), saveState,
    h('button', { class: 'btn', type: 'button', onclick: () => titlePage() }, h('span', { html: I.page }), h('span', { class: 'lbl' }, 'Title page')),
    exportBtn, aiBtn);

  // the side: scenes and characters
  let side = 'scenes';
  const sideList = h('div', { class: 'side-list' });
  const sideSeg = h('div', { class: 'seg' }, ...[['scenes', 'Scenes'], ['chars', 'Characters']].map(([k, l]) => h('button', { type: 'button', class: k === side ? 'on' : '', onclick: (e) => { side = k; [...sideSeg.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); drawSide(); } }, l)));
  const sidePanel = h('aside', { class: 'side' }, sideSeg, sideList);
  let caretId = '';
  const drawSide = () => {
    if (side === 'scenes'){
      const sc = scenesOf(script.els);
      const at = (() => { const i = script.els.findIndex((e) => e.id === caretId); let n = -1; sc.forEach((s, k) => { if (s.i <= i) n = k; }); return n; })();
      sideList.replaceChildren(...(sc.length ? sc.map((s, k) => h('button', { type: 'button', class: 'srow' + (k === at ? ' on' : ''), onclick: () => editor.focusEl(s.id, 0) }, h('span', { class: 'sn' }, String(s.n)), h('span', { class: 'st' }, s.text))) : [h('p', { class: 'muted small' }, 'Scenes appear here as you write scene headings (INT. / EXT. / ΕΣΩΤ. / ΕΞΩΤ.).')]));
    } else {
      const cs = charactersOf(script.els);
      sideList.replaceChildren(...(cs.length ? cs.map((c) => h('button', { type: 'button', class: 'crow', onclick: () => editor.focusEl(script.els[c.first].id, 0) }, h('span', { class: 'cn' }, c.name), h('span', { class: 'cc' }, `${c.lines} lines · ${c.scenes} sc.`))) : [h('p', { class: 'muted small' }, 'Characters appear here once they speak.')]));
    }
  };

  // the page
  const paper = h('div', { class: 'paper' + (script.settings.page === 'letter' ? ' letter' : '') });
  const desk = h('div', { class: 'desk' }, paper);

  // the AI
  const aiPanel = h('aside', { class: 'ai', hidden: true });

  app.replaceChildren(bar, h('div', { class: 'work' }, sidePanel, desk, aiPanel));

  let sideT = 0;
  editor = new Editor(paper, script, {
    onChange: () => { save(); pages.textContent = `${pageCount(script.els)} ${pageCount(script.els) === 1 ? 'page' : 'pages'}`; clearTimeout(sideT); sideT = setTimeout(drawSide, 250); },
    onCaret: ({ type, id: eid }) => { typeBtn.querySelector('.type-l').textContent = LABEL[type] || 'Action'; if (eid !== caretId){ caretId = eid; clearTimeout(sideT); sideT = setTimeout(drawSide, 120); } },
  });
  pages.textContent = `${pageCount(script.els)} ${pageCount(script.els) === 1 ? 'page' : 'pages'}`;
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
  leaveEditor = async () => { document.removeEventListener('keydown', keys); offMenu?.(); editor?.destroy(); editor = null; await store.flush(); };

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
    const f = (k, label, area) => h('label', { class: 'field' }, h('span', {}, label), h(area ? 'textarea' : 'input', { class: 'input', value: tp[k] || '', rows: area ? 3 : undefined, oninput: (e) => { tp[k] = e.target.value; if (k === 'title'){ script.title = e.target.value; titleIn.value = e.target.value; } save(); } }));
    const page = h('div', { class: 'seg' }, ...[['a4', 'A4'], ['letter', 'US Letter']].map(([k, l]) => h('button', { type: 'button', class: script.settings.page === k ? 'on' : '', onclick: (e) => { script.settings.page = k; [...page.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); paper.classList.toggle('letter', k === 'letter'); save(); } }, l)));
    modal('Title page', h('div', { class: 'stack' }, f('title', 'Title'), h('div', { class: 'row2' }, f('credit', 'Credit'), f('author', 'Author')), f('draftDate', 'Draft / date'), f('contact', 'Contact', true),
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

function showMenu(menu){
  document.querySelectorAll('.menu').forEach((m) => m.remove());
  document.body.append(menu);
  const off = (e) => { if (!menu.contains(e.target)){ menu.remove(); document.removeEventListener('mousedown', off); } };
  setTimeout(() => document.addEventListener('mousedown', off), 0);
}

window.addEventListener('beforeunload', () => { store?.flush(); });
route();
