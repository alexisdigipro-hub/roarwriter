import { addShare, authMessage, askAI, currentUser, listShares, myRole, onAuth, recover, removeShare, setShareRole, signIn, signOut, signUp } from './cloud.js?v=6b93529';
import { createStore } from './store.js?v=6b93529';
import { REVISIONS, cleanName as cleanNameOf, blankScript, charactersOf, isGreek, metaOf, normalize, pageCount, scenesOf, upper } from './model.js?v=6b93529';
import { Editor } from './editor.js?v=6b93529';
import { fountainToEls, parseFountain, toFountain } from './fountain.js?v=6b93529';
import { parseFdx, toFdx } from './fdx.js?v=6b93529';
import { parseFadein, toFadein } from './fadein.js?v=6b93529';
import { FORMATS, FORMAT_LIST, fmtOf, formatCSS, kindsOf, labelOf, startOf } from './formats.js?v=6b93529';
import { addNote, cardsView, findBar, noteCard, notesLayer, notesList, openSettings, reader, reportOf, sidesDialog } from './tools.js?v=6b93529';
import { onPref, pref } from './prefs.js?v=6b93529';
import { decorOf, exportPDF, paginate } from './print.js?v=6b93529';
import { CAT, CATS, breakdownCSV, breakdownOf, clearPaint, findIn, fold, normalizeTags, paintTags } from './breakdown.js?v=6b93529';
import { I, ago, download, esc, h, modal, pickFile, toast } from './ui.js?v=6b93529';
import { VERSION } from './version.js?v=6b93529';
import { boardView } from './board.js?v=6b93529';
import { dictation } from './dictate.js?v=6b93529';
import { beatsView, openSchedule, presence } from './plan.js?v=6b93529';
import { bibleSide, blankSeries, isSeries, viewSeries } from './series.js?v=6b93529';
import { autoVersion, openAlternates, openVersions, paceSection, researchPane, scriptPane } from './studio.js?v=6b93529';

/* RoarWriter (The Mad Lions Lab, Oct 2026): write screenplays in the industry format, in English or Greek, on a
   computer (the Mac and Windows app) or in a browser (the web version). Signed in with a RoarMe account, the
   scripts follow the person to every device. */

const app = document.getElementById('app');
// each format's own page (formats.js), once for the whole app
document.head.append(h('style', {}, formatCSS('.paper', (t) => `.script p[data-t=${t}]`)));
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
    h('p', { class: 'hint' }, 'One account for RoarMe, Roardino and RoarWriter: if you have RoarMe, sign in with the same email and password.'),
    // Privacy Policy and Terms (Alex, 25 Oct): on the company site, both on one page
    mode === 'up' ? h('p', { class: 'hint' }, 'By creating an account you agree to the ', legalLink('#terms', 'Terms'), ' and the ', legalLink('#privacy', 'Privacy Policy'), '.') : null].filter(Boolean));
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
    h('p', { class: 'auth-foot' }, 'RoarWriter · The Mad Lions Lab · ', legalLink('#privacy', 'Privacy Policy'), ' · ', legalLink('#terms', 'Terms'))));
}
function legalLink(at, label){ return h('a', { href: 'https://themadlions.com/legal/roarwriter/' + at, target: '_blank', rel: 'noopener' }, label); }

/* ---------- the library: every script ---------- */
/* Alex, 25 Oct ("smarter, handier, fresher, more 2026"): one top row with every control; the script being written
   first, big, to go straight back to it; new scripts one click away in their format; then every script as a
   small page showing how it really begins, filtered (all, mine, shared) and sorted (recent, A to Z) */
let libSearch = '', libWho = 'all', libSort = 'recent';
const FMT_DOT = { film: '#ff3b30', tv: '#4a90e2', multicam: '#f2c230', stage: '#c77dff', musical: '#f48fb1', audio: '#5cb85c', av: '#38bdf8', comic: '#fa8072' };
// the first lines of a script, as its page begins (the title page when there is nothing written yet)
function peekOf(s, big = false){
  if (s.meta?.kind === 'series') return h('div', { class: 'pk pk-tp pk-series' }, h('small', {}, 'SERIES'), h('b', {}, upper(s.title || 'Untitled')), h('span', {}, `${s.meta.episodes || 0} episodes`));
  const lines = (s.meta?.peek || []).slice(0, big ? 12 : 8);
  if (!lines.length) return h('div', { class: 'pk pk-tp' }, h('b', {}, upper(s.title || 'Untitled')), h('span', {}, s.meta?.author ? `by ${s.meta.author}` : ''));
  return h('div', { class: 'pk' }, ...lines.map(([t, x]) => h('p', { 'data-t': t }, ['scene', 'character', 'transition', 'shot', 'act', 'endact', 'page', 'panel'].includes(t) ? upper(x) : x)));
}
const pagesOf = (s) => `${s.meta?.pages || 1} ${s.meta?.pages === 1 ? 'page' : 'pages'}`;
const fmtChip = (s) => { if (s.meta?.kind === 'series') return h('span', { class: 'chip dot', style: '--d:#4a90e2' }, `Series · ${s.meta.episodes || 0} episodes`); const k = s.meta?.format || 'film'; return h('span', { class: 'chip dot', style: `--d:${FMT_DOT[k] || FMT_DOT.film}` }, FORMATS[k]?.label || 'Feature Film'); };
async function viewLibrary(){
  document.title = 'RoarWriter';
  const user = currentUser();
  const main = h('main', { class: 'lib' }, h('p', { class: 'muted' }, 'Loading…'));
  const seg = (value, opts, on) => { const el = h('div', { class: 'seg' }, ...opts.map(([k, l]) => h('button', { type: 'button', class: value === k ? 'on' : '', onclick: (e) => { [...el.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); on(k); } }, l))); return el; };
  const who = seg(libWho, [['all', 'All'], ['mine', 'Mine'], ['shared', 'Shared']], (k) => { libWho = k; draw(); });
  const sort = seg(libSort, [['recent', 'Recent'], ['az', 'A–Z']], (k) => { libSort = k; draw(); });
  who.classList.add('wide-only'); sort.classList.add('wide-only');
  const search = h('label', { class: 'pill-search' }, h('span', { html: I.search }), h('input', { type: 'search', placeholder: 'Search scripts', value: libSearch, oninput: (e) => { libSearch = e.target.value; draw(); } }));
  app.replaceChildren(
    h('header', { class: 'top lib-top' },
      wordmark(),
      h('h1', { class: 'top-title' }, 'Scripts'),
      who, h('div', { class: 'spacer' }), search, sort,
      h('button', { class: 'btn', onclick: importScript }, h('span', { html: I.import }), h('span', { class: 'lbl' }, 'Import')),
      h('button', { class: 'btn primary', onclick: () => pickFormat() }, h('span', { html: I.plus }), h('span', { class: 'lbl' }, 'New script')),
      h('button', { class: 'ib', title: 'Settings', 'aria-label': 'Settings', html: I.gear, onclick: () => openSettings({ global: true, me: () => user.user_metadata?.name || user.email, email: user.email, version: VERSION, signOut: async () => { await store?.flush(); await signOut(); document.querySelector('.modal-bg')?.remove(); }, onClose: () => draw() }) }),
      h('button', { class: 'ib', title: user.email, 'aria-label': 'Account', html: I.user, onclick: account })),
    main);
  let list = [];
  const open = (s) => { location.hash = '#s/' + s.id; };
  const shared = (s) => s.role && s.role !== 'owner';
  const acts = (s) => h('div', { class: 'tile-acts' },
    h('button', { class: 'ib glass', title: 'Duplicate', 'aria-label': 'Duplicate', html: I.dup, onclick: async (e) => { e.stopPropagation(); const d = await store.open(s.id); if (d){ d.title = (d.title || 'Untitled') + ' (copy)'; d.titlePage.title = d.title; await newScript(d, false); list = await store.list(); draw(); toast('Duplicated'); } } }),
    shared(s) ? h('button', { class: 'ib glass danger', title: 'Leave', 'aria-label': 'Leave', html: I.leave, onclick: async (e) => {
      e.stopPropagation();
      if (!confirm(`Leave “${s.title || 'Untitled'}”? It will go from your scripts; ${s.owner_name || 'its owner'} can share it again.`)) return;
      try { await removeShare(s.id, currentUser().email.toLowerCase()); store.forget(s.id); list = list.filter((x) => x.id !== s.id); draw(); } catch (err) { toast(err.message || 'Could not leave it now.'); }
    } }) : h('button', { class: 'ib glass danger', title: 'Delete', 'aria-label': 'Delete', html: I.trash, onclick: async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete “${s.title || 'Untitled'}”? This cannot be undone.`)) return;
      try { await store.remove(s.id); } catch { toast('Deleted here; it will go from the account when the connection is back.'); }
      list = list.filter((x) => x.id !== s.id); draw();
    } }));
  const sharedChip = (s) => (shared(s) ? h('span', { class: 'chip shared' }, h('span', { html: I.people }), s.owner_name ? `by ${s.owner_name}` : 'Shared', s.role === 'view' ? ' · view' : '') : null);
  // the one being written: big, with how far it has come
  const hero = (s) => h('section', { class: 'hero', tabindex: 0, onclick: () => open(s), onkeydown: (e) => { if (e.key === 'Enter') open(s); } },
    h('div', { class: 'hero-page' }, peekOf(s, true)),
    h('div', { class: 'hero-body' },
      h('span', { class: 'kicker' }, 'Continue writing'),
      h('h2', {}, s.title || 'Untitled'),
      h('div', { class: 'chips' }, fmtChip(s), sharedChip(s), h('span', { class: 'chip quiet' }, `edited ${ago(s.updated_at)}`)),
      h('div', { class: 'hero-stats' },
        h('div', {}, h('b', {}, String(s.meta?.pages || 1)), h('span', {}, s.meta?.pages === 1 ? 'page' : 'pages')),
        h('div', {}, h('b', {}, String(s.meta?.scenes || 0)), h('span', {}, s.meta?.scenes === 1 ? 'scene' : 'scenes')),
        h('div', {}, h('b', {}, `~${s.meta?.pages || 1}′`), h('span', {}, 'on screen')),
        s.meta?.words ? h('div', {}, h('b', {}, s.meta.words.toLocaleString()), h('span', {}, 'words')) : null),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: (e) => { e.stopPropagation(); open(s); } }, h('span', { html: I.edit }), 'Open'))),
    acts(s));
  // a new script in a click: the formats used most, the rest one step further
  const starts = () => h('section', { class: 'starts' },
    h('span', { class: 'kicker' }, 'Start a new one'),
    ...[...new Set([pref('format') || 'film', 'film', 'tv', 'stage'])].slice(0, 3).map((k) => h('button', { type: 'button', class: 'start', onclick: () => newScript(null, true, k) },
      h('span', { class: 'fmt-mini', 'data-fmt': k, 'aria-hidden': 'true' }, ...miniOf(k)),
      h('span', { class: 'start-t' }, h('b', {}, FORMATS[k].label), h('small', {}, ({ film: 'Feature or short', tv: 'An episode, in acts', stage: 'Theatre, acts and scenes' })[k] || FORMATS[k].note.split(/[:.]/)[0])))),
    h('div', { class: 'start-row' },
      h('button', { type: 'button', class: 'btn', onclick: async () => { const sid = crypto.randomUUID(); store.save(sid, normalize(blankSeries(''))); await store.flush(); location.hash = '#s/' + sid; } }, h('span', { html: I.board }), 'A series'),
      h('button', { type: 'button', class: 'btn', onclick: () => pickFormat() }, h('span', { html: I.cards }), 'Every format'),
      h('button', { type: 'button', class: 'btn', onclick: importScript }, h('span', { html: I.import }), 'Import a file')),
    h('small', { class: 'muted' }, 'Final Draft (.fdx), Fade In (.fadein) and Fountain come in as they are.'));
  const tile = (s) => h('article', { class: 'tile', tabindex: 0, onclick: () => open(s), onkeydown: (e) => { if (e.key === 'Enter') open(s); } },
    h('div', { class: 'tile-page' }, peekOf(s)),
    h('div', { class: 'tile-body' },
      h('div', { class: 'tile-title' }, s.title || 'Untitled'),
      s.meta?.series ? h('div', { class: 'tile-meta' }, h('span', { class: 'chip quiet' }, s.meta.episode || 'Episode')) : null,
      h('div', { class: 'tile-meta' }, h('i', { class: 'fdot', style: `--d:${FMT_DOT[s.meta?.format || 'film'] || FMT_DOT.film}`, title: FORMATS[s.meta?.format || 'film']?.label || '' }), `${pagesOf(s)} · ${ago(s.updated_at)}`),
      sharedChip(s)),
    acts(s));
  const draw = () => {
    if (!list.length){
      main.replaceChildren(h('div', { class: 'lib-first' }, h('div', { class: 'empty' }, h('b', {}, 'Your first script'), h('span', {}, 'Pick its format and start writing, or bring one in.')), starts()));
      return;
    }
    const w = fold(libSearch.trim());
    let shown = list.filter((s) => (!w || fold([s.title, s.meta?.author].join(' ')).includes(w)) && (libWho === 'all' || (libWho === 'shared') === shared(s)));
    if (libSort === 'az') shown = [...shown].sort((a, b) => (a.title || 'Untitled').localeCompare(b.title || 'Untitled', 'el'));
    const latest = list[0];
    const top = !w && libWho === 'all' && libSort === 'recent';
    main.replaceChildren(
      top ? h('div', { class: 'lib-head' }, hero(latest), starts()) : null,
      h('div', { class: 'lib-sec' }, h('h3', {}, top ? 'All scripts' : w ? 'Found' : libWho === 'shared' ? 'Shared with you' : libWho === 'mine' ? 'Yours' : 'All scripts'), h('span', { class: 'chip' }, String(top ? shown.length - 1 : shown.length))),
      (top ? shown.slice(1) : shown).length
        ? h('div', { class: 'grid' }, ...(top ? shown.slice(1) : shown).map(tile))
        : h('p', { class: 'muted lib-none' }, top ? 'Your other scripts appear here.' : 'No script here.'));
  };
  list = await store.list();
  draw();
}

function account(){
  const user = currentUser();
  const close = modal('Account', h('div', { class: 'stack' },
    h('p', {}, h('b', {}, user.user_metadata?.name || ''), h('br'), h('span', { class: 'muted' }, user.email)),
    h('p', { class: 'muted small' }, 'Your RoarMe account. Your scripts are kept in it and on this computer.'),
    h('p', { class: 'muted small' }, `RoarWriter ${VERSION}${DESKTOP ? ' for ' + (window.rwDesktop.platform === 'darwin' ? 'Mac' : 'Windows') : ' on the web'}`),
    h('button', { class: 'btn', onclick: async () => { await store?.flush(); await signOut(); close(); } }, 'Sign out')));
}

/* a new script: first its format (Feature Film, TV, Stage Play…); each one begins as its format does */
function pickFormat(){
  const close = modal('New script', h('div', { class: 'fmt-grid' }, ...FORMAT_LIST.map((k) => h('button', { type: 'button', class: 'fmt-tile' + (k === pref('format') ? ' on' : ''), onclick: () => { close(); newScript(null, true, k); } },
    h('span', { class: 'fmt-mini', 'data-fmt': k, 'aria-hidden': 'true' }, ...miniOf(k)),
    h('b', {}, FORMATS[k].label), h('small', {}, FORMATS[k].note)))), { wide: true });
}
// a few lines of each format, drawn as its page looks
function miniOf(k){
  const L = (t, w) => h('i', { class: 'm-' + t, style: `width:${w}%` });
  if (k === 'av') return [L('scene', 40), h('span', { class: 'm-av' }, L('video', 90), L('audio', 80)), h('span', { class: 'm-av' }, L('video', 70), L('audio', 95))];
  if (k === 'stage' || k === 'musical') return [L('act', 30), L('scene', 26), L('action', 55), L('character', 22), L('dialogue', 95), k === 'musical' ? L('lyric', 60) : L('dialogue', 70), L('character', 22), L('dialogue', 85)];
  if (k === 'comic') return [L('page', 35), L('panel', 25), L('action', 90), L('character', 20), L('dialogue', 55), L('caption', 50), L('panel', 25), L('action', 80)];
  if (k === 'audio') return [L('scene', 55), L('sound', 45), L('character', 22), L('dialogue', 70), L('music', 40), L('character', 22), L('dialogue', 60)];
  return [k === 'film' ? null : L('act', 30), L('scene', 60), L('action', 90), L('character', 20), L('dialogue', 50), k === 'multicam' ? L('dialogue', 45) : L('action', 75), L('character', 20), L('dialogue', 45)].filter(Boolean);
}

async function newScript(data, open = true, format = 'film', patch = null){
  const id = crypto.randomUUID();
  const s = normalize(data || blankScript('Untitled'));
  if (!data){
    // what a new script starts with (Settings > New scripts, on this device)
    s.titlePage.author = pref('author') || currentUser()?.user_metadata?.name || '';
    if (pref('credit')) s.titlePage.credit = pref('credit');
    if (pref('contact')) s.titlePage.contact = pref('contact');
    s.settings.page = pref('pageSize') || 'a4';
    if (pref('sceneNumbers') && pref('sceneNumbers') !== 'off') s.settings.sceneNumbers = pref('sceneNumbers');
    // no title yet: the bar and the title page show what goes there, instead of the word Untitled itself
    s.title = ''; s.titlePage.title = '';
    s.settings.format = format;
    s.els = startOf(format).map(([t, x]) => ({ id: crypto.randomUUID().slice(0, 8), t, x }));
  }
  patch?.(s);
  store.save(id, s);
  await store.flush();
  if (open) location.hash = '#s/' + id;
  return id;
}

async function readScriptFile(file){
  // Fade In: a zip (or its bare OSF xml)
  if (/\.fadein$/i.test(file.name)) return parseFadein(await file.arrayBuffer());
  const text = await file.text();
  if (/\.xml$/i.test(file.name) && /Open Screenplay Format/i.test(text.slice(0, 600))) return parseFadein(new TextEncoder().encode(text).buffer);
  if (/\.fdx$/i.test(file.name) || /<FinalDraft/i.test(text.slice(0, 400))) return parseFdx(text);
  const s = parseFountain(text);
  if (!s.title) s.title = s.titlePage.title = file.name.replace(/\.[^.]+$/, '');
  return s;
}
async function importScript(){
  const file = await pickFile('.fdx,.fadein,.fountain,.spmd,.txt,.xml,text/plain');
  if (!file) return;
  try { const s = await readScriptFile(file); await newScript(s); toast(`Imported ${file.name}`); }
  catch (e) { toast(e.message || 'This file could not be read.'); }
}

/* ---------- writing ---------- */
async function viewScript(id){
  app.replaceChildren(h('p', { class: 'center muted' }, 'Opening…'));
  const script = await store.open(id);
  if (!script){ toast('This script is not here.'); location.hash = ''; return; }
  // a series: its bible and its episodes (series.js)
  if (isSeries(script)) return viewSeries({ app, store, id, data: script, open: (x) => { location.hash = '#s/' + x; },
    newEpisode: (sid, n, name) => newScript(null, false, 'tv', (s) => { s.settings.series = sid; s.titlePage.title = name || ''; s.titlePage.episode = `Episode ${n}`; s.title = `${name || 'Untitled'} · Ep ${n}`; }) });
  document.title = (script.title || 'Untitled') + ' · RoarWriter';
  script.tags = normalizeTags(script.tags);
  // older scripts kept the word Untitled as their title: it goes, so the title page shows TITLE to type over
  if (script.title === 'Untitled' && script.titlePage.title === 'Untitled'){ script.title = ''; script.titlePage.title = ''; }
  // Collaborate: 'owner', 'edit' or 'view' (read only: nothing is changed or sent)
  let role = store.roleOf(id);
  myRole(id).then((r) => { if (r !== role){ role = r; applyRole(); } });

  const saveState = h('span', { class: 'save' }, 'Saved');
  // on a phone the pages and Saved sit under the title (.title-sub); the bar's own ones are hidden there
  const pagesSub = h('span', {}, '1 page'), saveSub = h('span', { class: 'save' }, 'Saved');
  store.onState((s) => { for (const e of [saveState, saveSub]){ e.textContent = s === 'saving' ? 'Saving…' : s === 'offline' ? (e === saveSub ? 'Saved here' : 'Saved on this computer') : 'Saved'; e.dataset.s = s; } });
  const save = () => { if (role !== 'view') store.save(id, script); };

  // the bar: back, the title, the kind of element, pages, exports, AI
  const titleIn = h('input', { class: 'title-in', value: script.title || '', placeholder: 'Untitled', 'aria-label': 'Title', oninput: (e) => { script.title = e.target.value; script.titlePage.title = e.target.value; document.title = (script.title || 'Untitled') + ' · RoarWriter'; tpTitle.textContent = e.target.value; save(); } });
  const typeBtn = h('button', { class: 'btn type-btn', type: 'button', onclick: () => typeMenu() }, h('span', { class: 'type-l' }, 'Action'), h('span', { html: I.down }));
  const pages = h('span', { class: 'chip' }, '1 page');
  const aiBtn = h('button', { class: 'btn', type: 'button', onclick: () => toggleAI() }, h('span', { html: I.spark }), h('span', { class: 'lbl' }, 'AI'));
  const exportBtn = h('button', { class: 'btn wide-only', type: 'button', title: 'Export', onclick: () => exportMenu() }, h('span', { html: I.export }), h('span', { class: 'lbl' }, 'Export'));
  // narrow screens only: the scenes and characters (the side is hidden there), and on a phone one menu for the
  // title page and the exports
  const scenesBtn = h('button', { class: 'btn narrow-only', type: 'button', title: 'Scenes and characters', 'aria-label': 'Scenes and characters', onclick: () => openSide() }, h('span', { html: I.scenes }));
  const moreBtn = h('button', { class: 'btn phone-only', type: 'button', title: 'More', 'aria-label': 'More', onclick: () => moreMenu() }, h('span', { html: I.more }));
  const roChip = h('span', { class: 'chip ro', hidden: true }, 'View only');
  // Collaborate: who else is in the script now (their initial; on hover, where they are)
  const herePill = h('div', { class: 'presence' });
  let people = [];
  // Revision mode on: its colour in the bar, a click opens its settings
  const revChip = h('button', { type: 'button', class: 'chip rev wide-only', hidden: true, onclick: () => openSettings(ctx, 'revisions') });
  const showRev = () => { const r = script.revision || {}, c = REVISIONS.find(([k]) => k === r.color); revChip.hidden = !(r.on && c); if (c) { revChip.style.setProperty('--rv', c[2]); revChip.textContent = `${c[1]} Rev.`; } };
  // bold, italic, underline (and Cmd/Ctrl+B, I, U)
  const fmtBtn = (st, label, key) => h('button', { type: 'button', class: 'fb-' + st, title: `${label} (${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+'}${key})`, 'aria-label': label, onmousedown: (e) => { e.preventDefault(); if (role !== 'view') editor.format(st); } }, st.toUpperCase());
  const fmtPill = h('div', { class: 'fmt-pill wide-only' }, fmtBtn('b', 'Bold', 'B'), fmtBtn('i', 'Italic', 'I'), fmtBtn('u', 'Underline', 'U'));
  /* the bar (Alex, 24 Oct: tidier): on the left what is being written (the title, the kind of line, the pages,
     Page or Cards), on the right the tools as round icons with their names on hover (find, read aloud,
     breakdown, share, export, AI, settings) */
  const iconBtn = (icon, label, fn, cls = 'wide-only') => h('button', { class: 'btn icon ' + cls, type: 'button', title: label, 'aria-label': label, onclick: fn }, h('span', { html: icon }));
  const VIEWS = [['page', 'Page'], ['cards', 'Cards'], ['beats', 'Beats'], ['board', 'Board']];
  const viewSeg = h('div', { class: 'seg view-seg wide-only' }, ...VIEWS.map(([k, l]) => h('button', { type: 'button', 'data-v': k, class: k === 'page' ? 'on' : '', onclick: () => setView(k) }, l)));
  const bar = h('header', { class: 'top edit-top' },
    h('a', { class: 'ib', href: '#', title: 'All scripts', 'aria-label': 'All scripts', html: I.back }),
    h('div', { class: 'title-box' }, titleIn, h('div', { class: 'title-sub' }, pagesSub, ' · ', saveSub)), roChip,
    typeBtn, fmtPill, revChip, pages, viewSeg, h('div', { class: 'spacer' }), herePill, saveState,
    iconBtn(I.find, 'Find & replace', () => openFind()),
    iconBtn(I.speak, 'Read aloud', () => readAloud()),
    iconBtn(I.clock, 'Versions', () => openVersions(ctx)),
    iconBtn(I.mic, 'Dictate', () => speech.start()),
    h('button', { class: 'btn wide-only', type: 'button', title: 'Breakdown', onclick: () => showBreakdown() }, h('span', { html: I.tag }), h('span', { class: 'lbl' }, 'Breakdown')),
    h('button', { class: 'btn wide-only', type: 'button', title: 'Share', onclick: () => share() }, h('span', { html: I.people }), h('span', { class: 'lbl' }, 'Share')),
    exportBtn, scenesBtn, aiBtn, iconBtn(I.gear, 'Settings', () => openSettings(ctx), 'wide-only'), moreBtn);

  // the side: scenes and characters
  let side = 'scenes';
  const sideList = h('div', { class: 'side-list' });
  const sideSeg = h('div', { class: 'seg' }, ...[['scenes', 'Scenes'], ['chars', 'Characters'], ['notes', 'Notes'], ...(script.settings.series ? [['series', 'Series']] : [])].map(([k, l]) => h('button', { type: 'button', class: k === side ? 'on' : '', onclick: (e) => { side = k; [...sideSeg.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); drawSide(); } }, l)));
  const sideClose = h('button', { class: 'ib side-close', type: 'button', title: 'Close', 'aria-label': 'Close', html: I.x, onclick: () => closeSide() });
  const sidePanel = h('aside', { class: 'side' }, h('div', { class: 'side-head' }, sideSeg, sideClose), sideList);
  // on a narrow screen the side opens over the page; a tap on a scene or a character closes it and goes there
  const openSide = () => { drawSide(); sidePanel.classList.add('open'); };
  const closeSide = () => sidePanel.classList.remove('open');
  const goTo = (eid, page = false) => { closeSide(); if (page || view !== 'page') setView('page'); editor.focusEl(eid, 0); };
  let caretId = '';
  const drawSide = () => {
    if (side === 'scenes'){
      const sc = scenesOf(script.els);
      const at = (() => { const i = script.els.findIndex((e) => e.id === caretId); let n = -1; sc.forEach((s, k) => { if (s.i <= i) n = k; }); return n; })();
      // who is in each scene now, and who writes it (Cards > Writer)
      const inScene = new Map(); for (const p of people){ const x = sceneOfEl(p.el_id); if (x) inScene.set(x.id, [...(inScene.get(x.id) || []), p]); }
      sideList.replaceChildren(...(sc.length ? sc.map((s, k) => h('button', { type: 'button', class: 'srow' + (k === at ? ' on' : ''), onclick: () => goTo(s.id) }, h('span', { class: 'sn' }, String(s.n)), h('span', { class: 'st' }, s.text),
        script.assign[s.id] ? h('span', { class: 'pr-as', title: `Written by ${script.assign[s.id]}` }, script.assign[s.id][0].toUpperCase()) : null,
        ...(inScene.get(s.id) || []).map((p) => h('span', { class: 'pr-av sm', title: `${p.name || p.email} is here` }, initial(p))))) : [h('p', { class: 'muted small' }, 'Scenes appear here as you write scene headings (INT. / EXT. / ΕΣΩΤ. / ΕΞΩΤ.).')]));
    } else if (side === 'chars'){
      const cs = charactersOf(script.els);
      sideList.replaceChildren(...(cs.length ? cs.map((c) => h('div', { class: 'crow-w' },
        h('button', { type: 'button', class: 'crow', onclick: () => goTo(script.els[c.first].id) }, h('span', { class: 'cn' }, c.name), h('span', { class: 'cc' }, `${c.lines} lines · ${c.scenes} sc.`)),
        h('button', { class: 'ib crow-ed', type: 'button', title: 'Rename', 'aria-label': 'Rename ' + c.name, html: I.edit, onclick: () => renameCharacter(c.name) }))) : [h('p', { class: 'muted small' }, 'Characters appear here once they speak.')]));
    } else if (side === 'series'){
      bibleSide(store, script.settings.series, id).then((kids) => { if (side === 'series') sideList.replaceChildren(...kids.filter(Boolean)); });
    } else {
      sideList.replaceChildren(
        h('button', { class: 'btn side-add', type: 'button', onclick: () => addNote(ctx, caretId) }, '+ Note on this line'),
        ...notesList(ctx));
    }
  };

  // the page
  const paper = h('div', { class: 'paper' + (script.settings.page === 'letter' ? ' letter' : ''), 'data-fmt': fmtOf(script) });
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
  // on a computer the zoom sits in the bar: − 100% + (and Cmd/Ctrl + − 0, or a pinch on the trackpad)
  const zoomPct = h('b', {}, zoom.label());
  zoom.onChange(() => { zoomPct.textContent = zoom.label(); });
  const zoomPill = h('div', { class: 'zoom-pill wide-only', title: 'Zoom' },
    h('button', { type: 'button', 'aria-label': 'Zoom out', html: I.minus, onclick: () => zoom.by(-0.1) }),
    h('button', { type: 'button', class: 'zp-v', 'aria-label': 'Actual size', onclick: () => zoom.reset() }, zoomPct),
    h('button', { type: 'button', 'aria-label': 'Zoom in', html: I.plus, onclick: () => zoom.by(0.1) }));
  bar.insertBefore(zoomPill, saveState.nextSibling);

  // the AI
  const aiPanel = h('aside', { class: 'ai', hidden: true });

  // phones and tablets: the kinds of line over the keyboard (there is no Tab there), with undo and redo
  const kinds = h('div', { class: 'kinds-in' });
  const drawKinds = () => kinds.replaceChildren(...kindsOf(script).map(([k, l]) => h('button', { type: 'button', 'data-k': k, onmousedown: (e) => e.preventDefault(), onclick: () => editor.setCurrentType(k) }, SHORT[l] || l)));
  drawKinds();
  const tagBtn = h('button', { class: 'btn primary tag-btn', type: 'button', onmousedown: (e) => e.preventDefault(), onclick: () => { const r = tagBtn.getBoundingClientRect(); tagMenu(r.left, r.top, true); } }, h('span', { html: I.tag }), 'Tag');
  const kindBar = h('div', { class: 'kindbar' },
    tagBtn,
    h('div', { class: 'fmt-pill kb-fmt' }, ...['b', 'i', 'u'].map((st) => h('button', { type: 'button', class: 'fb-' + st, 'aria-label': { b: 'Bold', i: 'Italic', u: 'Underline' }[st], onmousedown: (e) => e.preventDefault(), onclick: () => editor.format(st) }, st.toUpperCase()))),
    h('button', { class: 'ib', type: 'button', title: 'Undo', 'aria-label': 'Undo', html: I.undo, onmousedown: (e) => e.preventDefault(), onclick: () => editor.doUndo() }),
    kinds,
    h('button', { class: 'ib', type: 'button', title: 'Redo', 'aria-label': 'Redo', html: I.redo, onmousedown: (e) => e.preventDefault(), onclick: () => editor.doRedo() }));

  const mid = h('div', { class: 'mid' }, desk);
  const work = h('div', { class: 'work' }, sidePanel, mid, aiPanel);
  work.append(resizer(work, 'l'), resizer(work, 'r'));
  app.replaceChildren(bar, work, kindBar);

  let sideT = 0;
  editor = new Editor(paper, script, {
    // Typewriter: the line being written stays in the middle of the window (while typing; a click leaves the page where it is)
    onChange: () => { if (pref('typewriter')){ const p = editor?.current(); if (p) requestAnimationFrame(() => p.scrollIntoView({ block: 'center' })); } save(); showPages(); clearTimeout(sideT); sideT = setTimeout(drawSide, 250); repaint(); },
    onCaret: ({ type, id: eid }) => {
      typeBtn.querySelector('.type-l').textContent = labelOf(script, type);
      kinds.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === type));
      const on = kinds.querySelector('.on');
      if (on && kinds.clientWidth && (on.offsetLeft < kinds.scrollLeft || on.offsetLeft + on.offsetWidth > kinds.scrollLeft + kinds.clientWidth)) kinds.scrollLeft = on.offsetLeft - (kinds.clientWidth - on.offsetWidth) / 2;
      if (eid !== caretId){ caretId = eid; clearTimeout(sideT); sideT = setTimeout(drawSide, 120); here(); }
    },
  });
  editor.onDualMiss = () => toast('Put the cursor on the second character (or their lines): they speak at the same time as the one before.');
  /* what the tools around the page need (tools.js) */
  const ctx = {
    script, editor: () => editor, save, zoom,
    // a change made by a tool (rename, cards, an alternate): marked as a revision too, unless it clears the marks
    setEls: (els, { mark = true } = {}) => { editor.setEls(els, { mark }); editor.commit(true); },
    pdf: (opts) => pdf(opts), revisionChanged: () => { showRev(); markPages(); },
    id, caretId: () => caretId, flush: () => store.flush(),
    // a version brought back: the whole script as it was (title page, settings, lines, cards…)
    replaceScript: (data) => { const d = normalize(data); for (const k of Object.keys(d)){ if (k === 'titlePage' || k === 'settings'){ Object.keys(script[k]).forEach((x) => delete script[k][x]); Object.assign(script[k], d[k]); } else script[k] = d[k]; } editor.setEls(script.els); editor.commit(true); titleIn.value = script.title || ''; tpPaper.querySelectorAll('.tpf').forEach((f) => { f.textContent = script.titlePage[f.dataset.k] || ''; }); paper.dataset.fmt = fmtOf(script); drawKinds(); showRev(); showPages(); drawSide(); repaint(); save(); },
    newCopy: async (data) => { await store.flush(); await newScript(data); },
    showReport: () => { bdView = 'report'; showBreakdown(); },
    // the people a scene can be given to (Cards > Writer): whoever the script is shared with to edit, and its owner
    writers: () => writers,
    goTo: (id, page) => goTo(id, page),
    redecorate: () => { paper.dataset.sn = script.settings.sceneNumbers || 'off'; paper.dataset.names = script.settings.names || 'fd'; markPages(); here(); },
    setFormat: (k) => setFormat(k), setPage: (k) => setPage(k), titlePage: () => titlePage(),
    me: () => currentUser()?.user_metadata?.name || currentUser()?.email || '',
    readOnly: () => role === 'view',
    notesChanged: () => { notes.place(); if (side === 'notes') drawSide(); },
  };
  showRev();
  paper.dataset.sn = script.settings.sceneNumbers || 'off';
  paper.dataset.names = script.settings.names || 'fd';
  const finder = findBar(ctx, mid);
  const notes = notesLayer(ctx, paper);
  const cards = cardsView(ctx);
  mid.append(cards.el); cards.el.hidden = true;
  // the storyboard, and the page's other views (beats.js adds the beat board)
  const board = boardView(ctx), beats = beatsView(ctx);
  mid.append(board.el, beats.el); board.el.hidden = true; beats.el.hidden = true;
  const others = { cards, board, beats };
  const speech = dictation(ctx);
  const voice = reader(ctx);
  let view = 'page';
  function setView(k){
    view = k;
    [...viewSeg.children].forEach((b) => b.classList.toggle('on', b.dataset.v === k));
    desk.hidden = k !== 'page';
    if (k === 'page') drawSide();
    for (const [n, v] of Object.entries(others)){ v.el.hidden = n !== k; if (n === k) v.draw(); }
  }
  // Find works on the page: from the cards, it goes back to it
  function openFind(replace = false){ setView('page'); finder.open(replace); }
  function readAloud(){ if (voice.playing) voice.stop(); else voice.start(caretId); }
  function renameCharacter(name){
    if (role === 'view') return toast('This script is view only.');
    const inp = h('input', { class: 'input', value: name });
    const close = modal('Rename ' + name, h('div', { class: 'stack' }, inp,
      h('p', { class: 'muted small' }, 'Every time the name heads a speech, and its tag in the breakdown.'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => {
        const to = upper(inp.value.trim()); if (!to) return;
        const els = script.els.map((e) => e.t === 'character' && cleanNameOf(e.x) === name ? { ...e, x: e.x.replace(/^[^(]*/, (m) => to + (m.endsWith(' ') ? ' ' : '')) } : e);
        script.tags = script.tags.map((t) => (t.cat === 'cast' && upper(t.name) === name ? { ...t, name: to } : t));
        ctx.setEls(els); close(); toast(`${name} is now ${to}`);
      } }, 'Rename')));
    setTimeout(() => { inp.focus(); inp.select(); }, 40);
  }
  // the scene the caret is in, for Focus (the others fade)
  function here(){
    if (!editor) return;
    const ps = [...editor.box.children], i = ps.findIndex((p) => p.dataset.id === caretId);
    let a = i; while (a > 0 && ps[a].dataset.t !== 'scene') a--;
    let b = i + 1; while (b < ps.length && ps[b].dataset.t !== 'scene') b++;
    ps.forEach((p, k) => { if (pref('focus') && i >= 0 && k >= a && k < b) p.dataset.here = '1'; else delete p.dataset.here; });
  }
  const offPref = onPref((k) => { if (k === 'focus') here(); if (k === 'breaks') markPages(); });
  let paintT = 0;
  function repaint(){
    clearTimeout(paintT);
    paintT = setTimeout(() => {
      if (!editor) return;
      paintTags(editor.box, script.tags);
      // Greek capitals without accents as soon as the script is Greek (a new one is not, when it opens)
      desk.lang = isGreek([script.titlePage.title, ...script.els.map((e) => e.x)].join(' ')) ? 'el' : 'en';
    }, 120);
    markPages();
  }
  /* the pages, as the PDF lays them out (Alex, 24 Oct: "it does not show me the second page"): where a page
     starts the page gets a gap like the edge between two sheets, with the page's number */
  const breaks = h('div', { class: 'pb-layer', 'aria-hidden': 'true' });
  paper.append(breaks);
  let pageT = 0;
  function markPages(){
    clearTimeout(pageT);
    pageT = setTimeout(() => {
      if (!editor) return;
      const pages = paginate(script);
      const starts = new Map(pages.slice(1).map((pg, k) => [pg[0]?.id, k + 2]));
      const deco = decorOf(script);
      for (const p of editor.box.children){
        const n = starts.get(p.dataset.id); if (n && pref('breaks')) p.dataset.pg = n; else delete p.dataset.pg;
        const sn = deco.nums.get(p.dataset.id); if (sn) p.dataset.n = sn; else delete p.dataset.n;
        if (deco.contd.has(p.dataset.id)) p.dataset.contd = '1'; else delete p.dataset.contd;
        const du = deco.dual.get(p.dataset.id); if (du) p.dataset.dual = du; else delete p.dataset.dual;
      }
      here();
      if (!paper.contains(breaks)) paper.append(breaks);
      requestAnimationFrame(() => { alignDual(); placeBreaks(); notes.place(); });
      finder.refresh();
    }, 400);
  }
  /* dual dialogue: the second speaker's block starts level with the first one's (a float cannot go above the one
     before it, so it is pulled up by the difference) */
  const alignDual = () => {
    if (!editor) return;
    for (const p of editor.box.querySelectorAll('p[style*="margin-top"]')) p.style.marginTop = '';
    for (const r of editor.box.querySelectorAll('p[data-dual=R]')){
      if (r.previousElementSibling?.dataset.dual !== 'L') continue;
      let l = r.previousElementSibling; while (l.previousElementSibling?.dataset.dual === 'L') l = l.previousElementSibling;
      const d = r.offsetTop - l.offsetTop;
      if (d > 0) r.style.marginTop = `${parseFloat(getComputedStyle(r).marginTop) - d}px`;
    }
  };
  /* the revision's asterisks in the right margin, each in the colour of the revision that changed the line */
  const placeBreaks = () => editor && breaks.replaceChildren(
    ...[...editor.box.querySelectorAll('p[data-pg]')].map((p) => h('div', { class: 'pb', style: `top:${p.offsetTop}px` }, h('span', {}, `${p.dataset.pg}.`))),
    ...(script.revision?.hide ? [] : [...editor.box.querySelectorAll('p[data-rv]')].map((p) => h('div', { class: 'rvm', style: `top:${p.offsetTop}px;height:${p.offsetHeight}px;--rv:${REVISIONS.find(([k]) => k === p.dataset.rv)?.[2] || '#888'}`, title: `${REVISIONS.find(([k]) => k === p.dataset.rv)?.[1] || ''} revision` }, '*'))));
  // a wider or narrower window, or the zoom, moves the lines: the gaps follow
  const sizeWatch = new ResizeObserver(() => requestAnimationFrame(() => { placeBreaks(); notes.place(); }));
  sizeWatch.observe(paper);
  repaint();
  // right click on a word or a selection: tag it for the breakdown (on a phone, select it and press Tag)
  editor.box.addEventListener('contextmenu', (e) => {
    if (role === 'view' || !pickWord()) return;
    e.preventDefault();
    tagMenu(e.clientX, e.clientY);
  });
  const onSel = () => { const sel = getSelection(); kindBar.classList.toggle('sel', !!(sel.rangeCount && !sel.isCollapsed && editor?.box.contains(sel.anchorNode) && sel.toString().trim())); };
  document.addEventListener('selectionchange', onSel);
  function showPages(){ const n = pageCount(script.els); pages.textContent = pagesSub.textContent = `${n} ${n === 1 ? 'page' : 'pages'}`; }
  showPages();
  const offKeyboard = followKeyboard(kindBar);

  /* Collaborate: someone else's changes come in while the script is open (merged with what is written here) */
  const offWatch = store.watch(id, (data) => {
    if (!editor) return;
    script.title = data.title; Object.assign(script.titlePage, data.titlePage); Object.assign(script.settings, data.settings); script.tags = normalizeTags(data.tags); script.notes = data.notes || []; script.cards = data.cards || {};
    for (const k of ['boards', 'alts', 'timing', 'revision', 'reports', 'beats', 'schedule', 'assign']) script[k] = data[k] || {};
    script.pacing = data.pacing || null; showRev();
    editor.setEls(data.els);
    if (others[view] && !others[view].el.contains(document.activeElement)) others[view].draw();
    if (document.activeElement !== titleIn) titleIn.value = script.title || '';
    tpPaper.querySelectorAll('.tpf').forEach((f) => { if (document.activeElement !== f) f.textContent = script.titlePage[f.dataset.k] || ''; });
    showPages(); drawSide(); repaint();
    saveState.textContent = saveSub.textContent = 'Updated';
  });
  // read only: the page, the title page and the title cannot be changed, and nothing is sent
  function applyRole(){
    if (!editor) return;
    const ro = role === 'view';
    editor.readOnly(ro);
    tpPaper.querySelectorAll('.tpf').forEach((f) => { f.contentEditable = ro ? 'false' : (f.dataset.ce || 'true'); });
    titleIn.readOnly = ro;
    roChip.hidden = !ro;
    document.body.classList.toggle('rw-readonly', ro);
  }
  tpPaper.querySelectorAll('.tpf').forEach((f) => { f.dataset.ce = f.contentEditable; });
  applyRole();

  /* Share: the owner invites people by email to edit or to read; everyone sees who it is shared with */
  async function share(){
    const me = currentUser();
    const body = h('div', { class: 'stack share' });
    const msg = h('p', { class: 'msg' });
    const say = (t, kind = '') => { msg.textContent = t; msg.className = 'msg' + (kind ? ' ' + kind : ''); };
    const roleSeg = (value, on) => { const seg = h('div', { class: 'seg' }, ...[['edit', 'Can edit'], ['view', 'Can view']].map(([k, l]) => h('button', { type: 'button', class: value === k ? 'on' : '', onclick: (e) => { [...seg.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); on(k); } }, l))); return seg; };
    const draw = async () => {
      let people = [];
      try { people = await listShares(id); }
      catch (e) { body.replaceChildren(h('p', { class: 'msg err' }, e.status === 404 ? 'Sharing is not switched on yet: run the Collaborate part of supabase/roarwriter.sql in Supabase.' : (e.message || 'No connection.'))); return; }
      const owner = role === 'owner';
      const rows = people.map((p) => h('div', { class: 'share-row' },
        h('span', { class: 'share-av' }, p.email[0].toUpperCase()),
        h('span', { class: 'share-who' }, h('b', {}, p.email === me.email?.toLowerCase() ? 'You' : p.email), h('small', {}, p.email === me.email?.toLowerCase() ? p.email : `added ${ago(p.created_at)}`)),
        owner ? roleSeg(p.role, async (r) => { try { await setShareRole(id, p.email, r); say(`${p.email} ${r === 'edit' ? 'can edit' : 'can read'} it now.`, 'ok'); } catch (e) { say(e.message, 'err'); } }) : h('span', { class: 'chip' }, p.role === 'edit' ? 'Can edit' : 'Can view'),
        owner || p.email === me.email?.toLowerCase() ? h('button', { class: 'ib', type: 'button', title: owner ? 'Remove' : 'Leave', 'aria-label': owner ? 'Remove' : 'Leave', html: I.x, onclick: async () => {
          if (!owner && !confirm('Leave this script? It will go from your scripts.')) return;
          try { await removeShare(id, p.email); if (owner) draw(); else { close(); store.forget(id); location.hash = ''; } } catch (e) { say(e.message, 'err'); }
        } }) : null));
      let invRole = 'edit';
      const email = h('input', { class: 'input', type: 'email', placeholder: 'Their email (their RoarMe account)', autocomplete: 'off' });
      const invite = async () => {
        const v = email.value.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return say('Type an email address.', 'err');
        if (v === me.email?.toLowerCase()) return say('That is you.', 'err');
        try { await addShare(id, v, invRole); email.value = ''; say(`Shared with ${v}. They see it in their scripts when they sign in to RoarWriter with this email.`, 'ok'); draw(); }
        catch (e) { say(e.message || 'Could not share it now.', 'err'); }
      };
      email.addEventListener('keydown', (e) => { if (e.key === 'Enter'){ e.preventDefault(); invite(); } });
      body.replaceChildren(...[
        owner ? h('div', { class: 'share-add' }, email, roleSeg(invRole, (r) => { invRole = r; }), h('button', { class: 'btn primary', type: 'button', onclick: invite }, 'Invite')) : h('p', { class: 'muted small' }, role === 'edit' ? 'You can edit this script. Only its owner can share it with others.' : 'You can read this script. Only its owner can share it or let you edit.'),
        msg,
        h('div', { class: 'share-list' },
          h('div', { class: 'share-row' }, h('span', { class: 'share-av own' }, (owner ? me.email : '★')[0].toUpperCase()), h('span', { class: 'share-who' }, h('b', {}, owner ? 'You' : (store.list && (await store.list()).find((x) => x.id === id)?.owner_name) || 'The owner'), h('small', {}, 'Owner')), h('span', { class: 'chip' }, 'Owner')),
          ...rows),
        h('p', { class: 'hint' }, 'Everyone writes in the same script: what each person writes comes in for the others within a few seconds, and changes to different lines never overwrite each other. People who can view read it, and export it, but cannot change it.')]);
    };
    const close = modal('Share', body, { wide: true });
    body.append(h('p', { class: 'muted' }, 'Loading…'));
    draw();
  }
  drawSide();
  // the caret where writing goes on: a new script's first empty line (its format's start), else the end
  const sceneOfEl = (eid) => { const i = script.els.findIndex((e) => e.id === eid); let n = null; scenesOf(script.els).forEach((s) => { if (s.i <= i) n = s; }); return n; };
  const initial = (p) => (p.name || p.email || '?').trim()[0].toUpperCase();
  const offPresence = presence(ctx, (list) => {
    people = list;
    herePill.replaceChildren(...list.slice(0, 5).map((p) => { const s = sceneOfEl(p.el_id); return h('button', { type: 'button', class: 'pr-av', title: `${p.name || p.email}${s ? ` · scene ${s.n}` : ''}`, onclick: () => { if (s) goTo(s.id, true); } }, initial(p)); }));
    if (side === 'scenes') drawSide();
  });
  let writers = [];
  listShares(id).then((l) => { writers = [...new Set([currentUser()?.email?.toLowerCase(), ...l.filter((x) => x.role === 'edit').map((x) => x.email)].filter(Boolean))]; }).catch(() => {});
  // once a day, a version of its own (Versions)
  setTimeout(() => { if (editor) autoVersion(ctx); }, 8000);
  const first = script.els.find((e) => !e.x.trim()) || script.els[script.els.length - 1];
  editor.focusEl(first.id, first.x.length);

  const keys = (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 's'){ e.preventDefault(); store.flush(); }
    if (mod && !e.shiftKey && (e.key === '=' || e.key === '+')){ e.preventDefault(); zoom.by(0.1); }
    if (mod && e.key === '-'){ e.preventDefault(); zoom.by(-0.1); }
    if (mod && e.shiftKey && (e.key === ')' || e.code === 'Digit0')){ e.preventDefault(); zoom.reset(); }
    if (mod && e.key === 'p'){ e.preventDefault(); pdf(); }
    if (mod && !e.shiftKey && !e.altKey && (e.key === 'f' || e.key === 'F')){ e.preventDefault(); openFind(); }
    if (mod && e.altKey && e.code === 'KeyF'){ e.preventDefault(); openFind(true); }
    if (mod && e.shiftKey && e.code === 'KeyM'){ e.preventDefault(); addNote(ctx, caretId); }
    if (mod && e.shiftKey && (e.key === 'a' || e.key === 'A')){ e.preventDefault(); toggleAI(); }
  };
  document.addEventListener('keydown', keys);
  const offMenu = window.rwDesktop?.onMenu?.((cmd) => {
    if (cmd === 'pdf') pdf(); else if (cmd === 'fdx') saveAs('fdx'); else if (cmd === 'fountain') saveAs('fountain'); else if (cmd === 'fadein') saveAs('fadein'); else if (cmd === 'title') titlePage(); else if (cmd === 'ai') toggleAI();
    else if (cmd === 'zoom-in') zoom.by(0.1); else if (cmd === 'zoom-out') zoom.by(-0.1); else if (cmd === 'zoom-reset') zoom.reset();
    else if (cmd.startsWith('type:')) editor.setCurrentType(cmd.slice(5));
  });
  leaveEditor = async () => { offPresence(); speech.close(); document.removeEventListener('keydown', keys); offMenu?.(); offKeyboard(); offWatch(); offPref(); voice.stop(); finder.close(); zoom.off(); document.removeEventListener('selectionchange', onSel); sizeWatch.disconnect(); clearPaint(); editor?.destroy(); editor = null; await store.flush(); };

  function typeMenu(){
    const r = typeBtn.getBoundingClientRect();
    const menu = h('div', { class: 'menu', style: `left:${r.left}px;top:${r.bottom + 6}px` }, ...kindsOf(script).map(([k, l, n]) => h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); editor.setCurrentType(k); menu.remove(); } }, h('span', {}, l), h('kbd', {}, (navigator.platform.includes('Mac') ? '⌥' : 'Alt+') + n))),
      h('button', { type: 'button', class: 'menu-sep', onmousedown: (e) => { e.preventDefault(); menu.remove(); const on = editor.toggleDual(); if (on === false) editor.onDualMiss(); else toast(on ? 'Dual dialogue' : 'Dual dialogue off'); } }, h('span', {}, 'Dual dialogue'), h('kbd', {}, (navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+') + 'D')),
      h('p', { class: 'menu-hint' }, 'Enter goes on to what usually comes next. Tab changes the kind.'));
    showMenu(menu);
  }
  function exportMenu(){
    const r = exportBtn.getBoundingClientRect();
    const menu = h('div', { class: 'menu', style: `left:${Math.max(8, r.right - 240)}px;top:${r.bottom + 6}px` },
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); pdf(); } }, h('span', {}, 'PDF'), h('kbd', {}, 'to send or print')),
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); sides(); } }, h('span', {}, 'Sides'), h('kbd', {}, 'chosen scenes, as a PDF')),
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); saveAs('fdx'); } }, h('span', {}, 'Final Draft'), h('kbd', {}, '.fdx')),
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); saveAs('fadein'); } }, h('span', {}, 'Fade In'), h('kbd', {}, '.fadein')),
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
      h('button', { type: 'button', class: 'menu-sep', onmousedown: (e) => { e.preventDefault(); menu.remove(); addNote(ctx, caretId); } }, h('span', {}, 'Add a note on this line'), h('kbd', {}, '⇧' + (navigator.platform.includes('Mac') ? '⌘' : 'Ctrl ') + 'M')),
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
      const seg = h('div', { class: 'seg' }, ...[['scene', 'By scene'], ['el', 'By element'], ['report', 'Report']].map(([k, l]) => h('button', { type: 'button', class: bdView === k ? 'on' : '', onclick: () => { bdView = k; draw(); } }, l)));
      const csv = h('button', { class: 'btn', type: 'button', onclick: () => download(`${(script.title || 'Untitled').replace(/[\\/:*?"<>|]+/g, ' ').trim()} breakdown.csv`, breakdownCSV(script), 'text/csv') }, h('span', { html: I.export }), 'CSV');
      const chip = (cat, name, extra) => h('span', { class: 'bd-chip', style: `--c:${CAT[cat].color}` }, name, extra);
      const tagged = (cat, name) => script.tags.find((t) => t.cat === cat && fold(t.name) === fold(name));
      const hint = h('p', { class: 'bd-empty' }, 'The cast and the locations come from the script. Select a word on the page and right-click it (on a phone: select it and press Tag) to add props, wardrobe, vehicles and the rest.');
      let list;
      // the report: the script in numbers (pages, scenes, INT/EXT, day and night, locations, who speaks how much)
      if (bdView === 'report') list = h('div', { class: 'bd-list' }, paceSection(ctx, draw), reportOf(script));
      else if (bdView === 'scene'){
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
      body.replaceChildren(h('div', { class: 'bd-top' }, seg, h('span', { class: 'spacer' }), h('button', { class: 'btn', type: 'button', onclick: () => { close(); openSchedule(ctx); } }, h('span', { html: I.board }), 'Schedule'), csv), list, bdView === 'report' ? '' : hint);
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
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); share(); } }, h('span', {}, 'Share'), h('kbd', {}, 'write it together')),
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); showBreakdown(); } }, h('span', {}, 'Breakdown'), h('kbd', {}, 'cast, locations, props')),
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); openSchedule(ctx); } }, h('span', {}, 'Shooting schedule'), h('kbd', {}, 'stripboard, day out of days')),
      ...VIEWS.filter(([k]) => k !== view).map(([k, l]) => h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); setView(k); } }, h('span', {}, k === 'page' ? 'Back to the page' : l), h('kbd', {}, { page: 'write', cards: 'the scenes as cards', board: 'storyboard, shot list', beats: 'the story’s beats' }[k]))),
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); speech.start(); } }, h('span', {}, 'Dictate'), h('kbd', {}, 'write by speaking')),
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); openFind(true); } }, h('span', {}, 'Find & replace'), h('kbd', {}, '')),
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); readAloud(); } }, h('span', {}, voice.playing ? 'Stop reading' : 'Read aloud'), h('kbd', {}, 'a table read')),
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); openVersions(ctx); } }, h('span', {}, 'Versions'), h('kbd', {}, 'save, compare, go back')),
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); openSettings(ctx); } }, h('span', {}, 'Settings'), h('kbd', {}, 'format, page, PDF')),
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); pdf(); } }, h('span', {}, 'Export PDF'), h('kbd', {}, 'to send or print')),
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); sides(); } }, h('span', {}, 'Sides'), h('kbd', {}, 'chosen scenes')),
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); saveAs('fdx'); } }, h('span', {}, 'Save as Final Draft'), h('kbd', {}, '.fdx')),
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); saveAs('fadein'); } }, h('span', {}, 'Save as Fade In'), h('kbd', {}, '.fadein')),
      h('button', { type: 'button', onmousedown: (e) => { e.preventDefault(); menu.remove(); saveAs('fountain'); } }, h('span', {}, 'Save as Fountain'), h('kbd', {}, '.fountain')));
    showMenu(menu);
  }
  async function pdf(opts){ try { await exportPDF(script, opts); } catch (e) { toast(e.message || 'The PDF could not be made.'); } }
  function sides(){ sidesDialog(script, (only) => pdf({ only, titlePage: false })); }
  async function saveAs(kind){
    const base = (script.title || 'Untitled').replace(/[\\/:*?"<>|]+/g, ' ').trim();
    const name = `${base}.${kind}`;
    if (kind === 'fadein'){
      const bytes = toFadein(script);
      if (window.rwDesktop?.saveBytes){ const ok = await window.rwDesktop.saveBytes(name, bytes); if (ok) toast('Saved'); }
      else download(name, bytes, 'application/zip');
      return;
    }
    const text = kind === 'fdx' ? toFdx(script) : toFountain(script);
    if (window.rwDesktop?.saveText){ const ok = await window.rwDesktop.saveText(name, text); if (ok) toast('Saved'); }
    else download(name, text, kind === 'fdx' ? 'application/xml' : 'text/plain');
  }
  function setPage(k){
    script.settings.page = k;
    paper.classList.toggle('letter', k === 'letter'); tpPaper.classList.toggle('letter', k === 'letter');
    save(); markPages();
  }
  function setFormat(k){
    script.settings.format = k;
    paper.dataset.fmt = k;
    drawKinds(); editor.caret(); save(); repaint();
    toast(FORMATS[k].label);
  }
  function titlePage(){
    const tp = script.titlePage;
    const f = (k, label, area) => h('label', { class: 'field' }, h('span', {}, label), h(area ? 'textarea' : 'input', { class: 'input', value: tp[k] || '', rows: area ? 3 : undefined, oninput: (e) => { tp[k] = e.target.value; if (k === 'title'){ script.title = e.target.value; titleIn.value = e.target.value; } const on = tpPaper.querySelector(`.tpf[data-k="${k}"]`); if (on) on.textContent = e.target.value; save(); } }));
    const page = h('div', { class: 'seg' }, ...[['a4', 'A4'], ['letter', 'US Letter']].map(([k, l]) => h('button', { type: 'button', class: script.settings.page === k ? 'on' : '', onclick: (e) => { script.settings.page = k; [...page.children].forEach((b) => b.classList.toggle('on', b === e.currentTarget)); paper.classList.toggle('letter', k === 'letter'); tpPaper.classList.toggle('letter', k === 'letter'); save(); } }, l)));
    // the format can change later: the lines keep their kinds, the page is laid out as the new format has it
    const fmt = h('select', { class: 'input', onchange: (e) => setFormat(e.target.value) }, ...FORMAT_LIST.map((k) => h('option', { value: k, selected: fmtOf(script) === k }, FORMATS[k].label)));
    modal('Title page', h('div', { class: 'stack' }, h('label', { class: 'field' }, h('span', {}, 'Format'), fmt), f('title', 'Title'), f('episode', 'Episode'), h('div', { class: 'row2' }, f('credit', 'Credit'), f('author', 'Author')), h('div', { class: 'row2' }, f('copyright', 'Copyright'), f('draftDate', 'Draft / date')), f('contact', 'Contact', true),
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
  let aiMode = 'scene';
  function drawAI(result){
    if (aiMode !== 'scene'){
      aiPanel.replaceChildren(aiHead(), ...(aiMode === 'script' ? scriptPane(ctx) : researchPane(ctx)));
      return;
    }
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
        const r = await askAI({ task, prompt: prompt.value.trim(), title: script.title, lang, format: FORMATS[fmtOf(script)].label,
          characters: charactersOf(script.els).map((c) => c.name).slice(0, 30),
          scene: toFountain({ els: sceneEls }, { titlePage: false }), before: toFountain({ els: before }, { titlePage: false }) });
        showResult(out, task, r.text || '', a, b);
      } catch (e) { out.replaceChildren(h('p', { class: 'msg err' }, e.message || 'The AI did not answer.')); }
      aiBusy = false;
    };
    aiPanel.replaceChildren(
      aiHead(),
      h('p', { class: 'muted small' }, 'Works on the scene with the cursor. Nothing changes until you press Insert or Replace.'),
      h('div', { class: 'ai-quick' },
        h('button', { class: 'btn', onclick: () => run('dialogue', 'Writing dialogue') }, 'Suggest dialogue'),
        h('button', { class: 'btn', onclick: () => run('rewrite', 'Rewriting the scene') }, 'Rewrite scene'),
        h('button', { class: 'btn', onclick: () => run('continue', 'Writing what comes next') }, 'What comes next'),
        h('button', { class: 'btn', onclick: () => run('ideas', 'Thinking') }, 'Ideas & notes'),
        h('button', { class: 'btn', onclick: () => openAlternates(ctx) }, h('span', { html: I.branch }), 'Alternates')),
      prompt,
      h('button', { class: 'btn primary', onclick: () => { if (!prompt.value.trim()) return toast('Write what you want first.'); run('custom', 'Working'); } }, 'Ask'),
      out);
    if (result) out.replaceChildren(result);
  }
  // the AI's top: the three ways it works (the scene, the whole script, the research desk) and Close
  function aiHead(){
    return h('div', { class: 'ai-top' },
      h('div', { class: 'ai-head' }, h('b', { html: I.spark + ' AI' }), h('button', { class: 'ib', title: 'Close', html: I.x, onclick: () => { aiPanel.hidden = true; } })),
      h('div', { class: 'seg ai-seg' }, ...[['scene', 'Scene'], ['script', 'Whole script'], ['research', 'Research']].map(([k, l]) => h('button', { type: 'button', class: aiMode === k ? 'on' : '', onclick: () => { aiMode = k; drawAI(); } }, l))));
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
  const MIN = 0.5, MAX = 2;
  let changed = () => {};
  let z = 1;
  try { z = Math.min(MAX, Math.max(MIN, +localStorage.getItem('rw_zoom') || 1)); } catch {}
  const set = (v, keep = true) => {
    z = Math.round(Math.min(MAX, Math.max(MIN, v)) * 100) / 100;
    desk.style.setProperty('--z', z);
    changed();
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
  // a pinch on a computer's trackpad arrives as the wheel with Ctrl held
  const wheel = (e) => { if (!e.ctrlKey) return; e.preventDefault(); set(z * Math.exp(-e.deltaY / 200)); };
  desk.addEventListener('wheel', wheel, { passive: false });
  return {
    by: (d) => set(z + d),
    reset: () => set(1),
    onChange: (fn) => { changed = fn; },
    label: () => `${Math.round(z * 100)}%`,
    off: () => {},
  };
}

/* The side (scenes, characters, notes) and the AI are as wide as they are dragged by their edge (Alex, 25 Oct),
   kept per device; a double click on the edge puts them back */
function resizer(work, which){
  const key = which === 'l' ? 'side-w' : 'ai-w', [min, max] = which === 'l' ? [170, 520] : [280, 760];
  try { const v = +localStorage.getItem('rw_' + key); if (v) work.style.setProperty('--' + key, v + 'px'); } catch {}
  const grip = h('div', { class: 'rsz ' + which, title: 'Drag to make it wider', 'aria-hidden': 'true' });
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault(); grip.setPointerCapture(e.pointerId); grip.classList.add('on'); document.body.classList.add('rsz-drag');
    let w = 0;
    const move = (ev) => {
      const r = work.getBoundingClientRect();
      w = Math.round(Math.min(max, Math.max(min, which === 'l' ? ev.clientX - r.left : r.right - ev.clientX)));
      work.style.setProperty('--' + key, w + 'px');
    };
    const up = () => {
      grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
      grip.classList.remove('on'); document.body.classList.remove('rsz-drag');
      if (w) try { localStorage.setItem('rw_' + key, String(w)); } catch {}
    };
    grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
  });
  grip.addEventListener('dblclick', () => { work.style.removeProperty('--' + key); try { localStorage.removeItem('rw_' + key); } catch {} });
  return grip;
}

// short names for the kinds on the phone's bar
const SHORT = { 'Scene Heading': 'Scene', Parenthetical: '(Paren)', 'Unformatted Text': 'Plain', 'Stage Direction': 'Direction', 'Panel Description': 'Description', 'Sound (SFX)': 'SFX' };

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
