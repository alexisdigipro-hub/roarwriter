import { LABEL, SCENE_START, TIMES, charactersOf, cleanMarks, el, isGreek, placesOf, segmentsOf, sliceMarks, upper, uid } from './model.js';
import { formatOf, kindsOf, nextOf, tabOf } from './formats.js';
import { pref } from './prefs.js';
import { fountainToEls } from './fountain.js';

/* The page you write on: one editable block holding a <p> per element (data-t = its kind), laid out on the
   page as the industry format puts it. Enter and Tab work as in Final Draft (Enter goes on to what usually
   comes next, Tab turns the element into another kind, Cmd/Ctrl+1..7 picks one), names and places are
   suggested as you type, and undo keeps its own history because the page is rebuilt by hand on Enter. */

const SCENE_PREFIX_EN = ['INT. ', 'EXT. ', 'INT./EXT. ', 'EST. '];
const SCENE_PREFIX_EL = ['ΕΣΩΤ. ', 'ΕΞΩΤ. ', 'ΕΣΩΤ./ΕΞΩΤ. '];

export class Editor {
  constructor(root, script, { onChange = () => {}, onCaret = () => {} } = {}){
    this.root = root;
    this.script = script;
    this.onChange = onChange;
    this.onCaret = onCaret;
    this.undo = [];
    this.redo = [];
    this.box = document.createElement('div');
    this.box.className = 'script';
    this.box.contentEditable = 'true';
    this.box.spellcheck = pref('spell');
    this.box.setAttribute('role', 'textbox');
    this.box.setAttribute('aria-multiline', 'true');
    this.pop = document.createElement('div');
    this.pop.className = 'suggest';
    this.pop.hidden = true;
    root.replaceChildren(this.box, this.pop);
    this.render(script.els);
    this.snapshot(true);
    this.box.addEventListener('keydown', (e) => this.key(e));
    /* a tonos or a dieresis is a dead key: the letter is composed by the keyboard, and the line must not be
       touched until it is (Alex, 25 Oct: in Safari the caret jumped to the line above, the letter with it) */
    this.composing = false;
    this.box.addEventListener('compositionstart', () => { this.composing = true; this.hidePop(); });
    this.box.addEventListener('compositionend', () => { this.composing = false; setTimeout(() => { if (!this.composing) this.changed(); }, 0); });
    this.box.addEventListener('input', (e) => { if (e.isComposing || this.composing) return; this.changed(); });
    // a phone's keyboard may not send Enter as a key (Android): its new paragraph arrives as an input instead
    this.box.addEventListener('beforeinput', (e) => { if (e.inputType === 'insertParagraph'){ e.preventDefault(); const pick = !this.pop.hidden && this.pop.querySelector('.on'); pick ? this.accept(pick.dataset.v) : this.enter(); } });
    this.box.addEventListener('paste', (e) => this.paste(e));
    this.box.addEventListener('focus', () => this.caret());
    this.box.addEventListener('blur', () => setTimeout(() => this.hidePop(), 150));
    this._sel = () => { if (document.activeElement === this.box) this.caret(); };
    document.addEventListener('selectionchange', this._sel);
  }
  destroy(){ document.removeEventListener('selectionchange', this._sel); }

  /* ---------- the page and the data ---------- */
  node(e){
    const p = document.createElement('p');
    p.className = 'e';
    p.dataset.t = e.t;
    p.dataset.id = e.id;
    if (e.rv) p.dataset.rv = e.rv;
    if (e.du) p.dataset.du = '1';
    this.fill(p, e.x, e.f);
    return p;
  }
  // a line's words, with their bold, italic and underline
  fill(p, x, f){
    p.replaceChildren();
    if (!x){ p.appendChild(document.createElement('br')); return; }
    if (!f?.length){ p.textContent = x; return; }
    for (const g of segmentsOf(x, f)){
      let n = document.createTextNode(g.text);
      for (const [on, tag] of [[g.u, 'u'], [g.i, 'i'], [g.b, 'b']]) if (on){ const w = document.createElement(tag); w.appendChild(n); n = w; }
      p.appendChild(n);
    }
  }
  // where a line is bold, italic or underlined, counted in its text
  marksOf(p){
    if (!p.querySelector('b,strong,i,em,u,span[style]')) return [];
    const out = [];
    let pos = 0;
    const walk = (n, st) => {
      if (n.nodeType === 3){ const len = n.data.length; if (len) for (const k of st) out.push([pos, pos + len, k]); pos += len; return; }
      if (n.nodeName === 'BR'){ pos += 1; return; }
      const tag = n.nodeName, css = n.style || {}, next = new Set(st);
      if (tag === 'B' || tag === 'STRONG' || /^(bold|[6-9]00)$/.test(css.fontWeight || '')) next.add('b');
      if (tag === 'I' || tag === 'EM' || css.fontStyle === 'italic') next.add('i');
      if (tag === 'U' || /underline/.test(css.textDecoration || css.textDecorationLine || '')) next.add('u');
      for (const c of n.childNodes) walk(c, next);
    };
    for (const c of p.childNodes) walk(c, new Set());
    return cleanMarks(out, this.textOf(p).length);
  }
  // Cmd/Ctrl+B, I, U or the bar's buttons: the selection gets (or loses) the style
  format(st){
    try { document.execCommand('styleWithCSS', false, false); } catch {}
    document.execCommand({ b: 'bold', i: 'italic', u: 'underline' }[st]);
    this.commit(true);
  }
  render(els){ this.box.replaceChildren(...els.map((e) => this.node(e))); }
  textOf(p){ return (p.innerText || '').replace(/ /g, ' ').replace(/\n$/, ''); }
  read(){ return [...this.box.children].map((p) => { const f = this.marksOf(p); return { id: p.dataset.id || uid(), t: p.dataset.t || 'action', x: this.textOf(p), ...(p.dataset.rv ? { rv: p.dataset.rv } : {}), ...(p.dataset.du ? { du: 1 } : {}), ...(f.length ? { f } : {}) }; }); }
  /* Revision mode: a line written or changed while it is on carries the revision's colour (an asterisk in the
     margin, as a production draft has them) */
  markRevision(els, before){
    const col = this.script.revision?.on ? this.script.revision.color : '';
    if (!col) return els;
    const prev = new Map(before.map((e) => [e.id, e]));
    for (const e of els){
      const p = prev.get(e.id);
      if ((!p || p.t !== e.t || p.x !== e.x || JSON.stringify(p.f || []) !== JSON.stringify(e.f || [])) && e.x.trim()){ e.rv = col; const n = this.box.querySelector(`p[data-id="${CSS.escape(e.id)}"]`); if (n) n.dataset.rv = col; }
    }
    return els;
  }
  // what a browser leaves behind after typing over several elements or pasting: put right
  /* Safari can leave the caret just outside an empty line, so a letter typed lands in the page itself, not in a
     line (Alex, 24 Oct: every letter of a dialogue became a line of its own). Such text goes back into the line
     it came out of (the one before it, else the one after), and the caret goes with it. */
  tidy(){
    const sel = getSelection();
    const has = (n) => sel.rangeCount > 0 && (sel.anchorNode === n || !!n.contains?.(sel.anchorNode));
    const offIn = (n) => { if (n.nodeType === 3) return sel.anchorNode === n ? sel.anchorOffset : n.length; const r = document.createRange(); r.selectNodeContents(n); r.setEnd(sel.anchorNode, sel.anchorOffset); return r.toString().length; };
    let back = null;
    // a style put on several lines at once can wrap the lines themselves: they come out of it
    for (const n of [...this.box.children]) if (n.nodeName !== 'P' && n.querySelector?.('p')) n.replaceWith(...n.childNodes);
    for (const n of [...this.box.childNodes]){
      if (n.nodeName === 'P'){
        if (!n.dataset.t) n.dataset.t = 'action';
        if (!n.dataset.id || this.box.querySelectorAll(`p[data-id="${CSS.escape(n.dataset.id)}"]`).length > 1) n.dataset.id = uid();
        n.className = 'e';
        if (!n.textContent && !n.querySelector('br')) n.appendChild(document.createElement('br'));
        continue;
      }
      const text = n.nodeType === 3 ? n.data : (n.innerText ?? n.textContent ?? '');
      const caret = has(n), at = caret ? offIn(n) : 0;
      // a whole line the browser made (Enter it handled itself): a line of its own
      if (n.nodeName === 'DIV'){ const p = this.node(el('action', text)); n.replaceWith(p); if (caret) back = [p, at]; continue; }
      // the line it belongs to: an empty one next to it (the line just begun), else the one before, else after
      const empty = (x) => x?.nodeName === 'P' && !!x.querySelector(':scope > br:only-child');
      const before = n.previousSibling?.nodeName === 'P' ? n.previousSibling : null, after = n.nextSibling?.nodeName === 'P' ? n.nextSibling : null;
      const host = empty(after) ? after : empty(before) ? before : before || after;
      const prev = host && host === before ? host : null;
      n.remove();
      if (!text) continue;
      if (host){
        const old = host.querySelector(':scope > br:only-child') ? '' : this.textOf(host);
        host.textContent = prev ? old + text : text + old;
        if (caret) back = [host, (prev ? old.length : 0) + at];
      } else {
        const p = this.node(el('action', text));
        this.box.appendChild(p);
        if (caret) back = [p, at];
      }
    }
    if (!this.box.children.length) this.box.appendChild(this.node(el('action', '')));
    if (back) this.place(back[0], back[1]);
  }
  commit(structural = false){
    this.script.els = this.markRevision(this.read(), this.script.els || []);
    this.snapshot(structural);
    this.onChange(this.script);
  }
  changed(){
    this.tidy();
    const p = this.current();
    // INT. / EXT. / ΕΣΩΤ. typed at the start of an action makes it a scene heading; "CUT TO:" a transition; in a
    // play ACT / ΠΡΑΞΗ and SCENE / ΣΚΗΝΗ, in a comic PAGE / ΣΕΛΙΔΑ and PANEL / ΚΑΡΕ do the same for theirs
    const f = formatOf(this.script), has = (k) => f.kinds.includes(k);
    if (p && p.dataset.t === f.base && f.base === 'action'){
      const t = this.textOf(p), one = !t.includes('\n');
      if (one && has('act') && /^(ACT|ΠΡΑΞΗ)\s+\S/i.test(t) && !has('page') && (f.kinds[0] === 'act')) this.setType(p, 'act', false);
      else if (one && has('scene') && f.kinds[0] === 'act' && /^(SCENE|ΣΚΗΝΗ)\s+\S/i.test(t)) this.setType(p, 'scene', false);
      else if (one && has('page') && /^(PAGE|ΣΕΛΙΔΑ)\s+\S/i.test(t)) this.setType(p, 'page', false);
      else if (one && has('panel') && /^(PANEL|ΚΑΡΕ)\s+\S/i.test(t)) this.setType(p, 'panel', false);
      else if (one && has('scene') && f.kinds[0] !== 'act' && SCENE_START.test(t)) this.setType(p, 'scene', false);
      else if (has('transition') && (/^[A-ZΑ-Ω ]+TO:$/.test(t.trim()) || /^ΚΟΒΕΙ ΣΕ:$/.test(t.trim()))) this.setType(p, 'transition', false);
    }
    this.commit(false);
    this.suggest();
  }

  /* ---------- the caret ---------- */
  current(){
    const s = getSelection();
    if (!s.rangeCount) return null;
    let n = s.anchorNode;
    while (n && n !== this.box && !(n.nodeName === 'P' && n.parentNode === this.box)) n = n.parentNode;
    return n && n !== this.box ? n : null;
  }
  offset(p){
    const s = getSelection();
    if (!s.rangeCount) return 0;
    const r = s.getRangeAt(0).cloneRange();
    r.selectNodeContents(p);
    r.setEnd(s.anchorNode, s.anchorOffset);
    return r.toString().length;
  }
  place(p, at = 0){
    const r = document.createRange();
    const walk = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let n, left = at;
    while ((n = walk.nextNode())){
      if (left <= n.length){ r.setStart(n, left); r.collapse(true); return this.select(r); }
      left -= n.length;
    }
    // an empty line: the caret inside it, before its <br> (after it, Safari puts it outside the line)
    if (p.firstChild?.nodeName === 'BR'){ r.setStart(p, 0); r.collapse(true); return this.select(r); }
    r.selectNodeContents(p); r.collapse(false); this.select(r);
  }
  select(r){ const s = getSelection(); s.removeAllRanges(); s.addRange(r); this.box.focus({ preventScroll: true }); this.caret(); }
  caret(){
    const p = this.current();
    if (!p) return;
    const i = [...this.box.children].indexOf(p);
    this.onCaret({ type: p.dataset.t, index: i, id: p.dataset.id });
  }
  focusEl(id, at = 0){
    const p = this.box.querySelector(`p[data-id="${CSS.escape(id)}"]`);
    if (!p) return;
    p.scrollIntoView({ block: 'center', behavior: 'smooth' });
    this.place(p, at);
  }

  /* ---------- kinds ---------- */
  setType(p, t, commit = true){
    if (!p || !LABEL[t]) return;
    const was = p.dataset.t;
    p.dataset.t = t;
    // a parenthetical starts as ( ) with the caret inside
    if (t === 'paren' && !this.textOf(p).trim()){ p.textContent = '()'; this.place(p, 1); }
    else if (was === 'paren' && /^\(\)$/.test(this.textOf(p))){ p.replaceChildren(document.createElement('br')); this.place(p, 0); }
    if (commit) this.commit(true);
    this.caret();
    this.suggest();
  }
  setCurrentType(t){ const p = this.current() || this.box.lastElementChild; this.setType(p, t); }
  /* Dual dialogue: the character with the caret (or the one whose speech it is in) speaks at the same time as the
     one before; again, and it speaks on its own */
  toggleDual(){
    let p = this.current();
    while (p && ['dialogue', 'paren', 'lyric'].includes(p.dataset.t)) p = p.previousElementSibling;
    if (!p || p.dataset.t !== 'character') return false;
    if (p.dataset.du) delete p.dataset.du; else p.dataset.du = '1';
    this.commit(true);
    return !!p.dataset.du;
  }

  /* ---------- keys ---------- */
  key(e){
    // keys pressed while a letter is being composed (a dead key) belong to the keyboard
    if (e.isComposing || this.composing || e.keyCode === 229) return;
    const mod = e.metaKey || e.ctrlKey;
    if (!this.pop.hidden){
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){ e.preventDefault(); this.movePop(e.key === 'ArrowDown' ? 1 : -1); return; }
      if (e.key === 'Enter' || e.key === 'Tab'){ const pick = this.pop.querySelector('.on'); if (pick){ e.preventDefault(); this.accept(pick.dataset.v); return; } }
      if (e.key === 'Escape'){ e.preventDefault(); this.hidePop(); return; }
    }
    // Cmd or Ctrl and a number picks the kind, as in Final Draft (by the key's place, so a Greek keyboard works too);
    // a browser keeps Cmd+1..9 for its tabs, so there Ctrl+1..7 does it
    const digit = (e.code || '').match(/^(?:Digit|Numpad)([0-9])$/)?.[1] ?? (/^[0-9]$/.test(e.key) ? e.key : null);
    // Option (Alt) and a number everywhere (Alex, 25 Oct: a browser on a Mac keeps Cmd+1 for its tabs, and the Mac
    // Ctrl+1 for its desktops); Cmd/Ctrl and a number too, where it gets through (the Mac and Windows app)
    if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && digit != null){ const k = kindsOf(this.script).find((x) => x[2] === digit); if (k){ e.preventDefault(); this.setCurrentType(k[0]); return; } }
    if (mod && !e.altKey && !e.shiftKey && digit != null){ const k = kindsOf(this.script).find((x) => x[2] === digit); if (k){ e.preventDefault(); this.setCurrentType(k[0]); return; } }
    if (mod && !e.shiftKey && !e.altKey && ['KeyB', 'KeyI', 'KeyU'].includes(e.code)){ e.preventDefault(); this.format(e.code.slice(3).toLowerCase()); return; }
    if (mod && (e.key === 'z' || e.key === 'Z')){ e.preventDefault(); e.shiftKey ? this.doRedo() : this.doUndo(); return; }
    if (mod && e.key === 'y'){ e.preventDefault(); this.doRedo(); return; }
    if (mod && !e.shiftKey && (e.code === 'KeyD' || e.key === 'd')){ e.preventDefault(); if (this.toggleDual() === false) this.onDualMiss?.(); return; }
    if (e.key === 'Tab'){ e.preventDefault(); const p = this.current(); if (p) this.setType(p, tabOf(this.script, p.dataset.t, e.shiftKey)); return; }
    if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); this.enter(); return; }
    if (e.key === 'Enter' && e.shiftKey){ e.preventDefault(); document.execCommand('insertLineBreak'); return; }
  }
  enter(){
    const s = getSelection();
    if (s.rangeCount && !s.isCollapsed) s.deleteFromDocument();
    this.tidy();
    const p = this.current();
    if (!p) return;
    const t = p.dataset.t;
    const text = this.textOf(p);
    const at = this.offset(p);
    // Enter on an empty character, dialogue or parenthetical goes back to action (the format's base), as Final Draft does
    const base = formatOf(this.script).base;
    if (!text.trim() && t !== base && ['character', 'dialogue', 'paren', 'transition', 'shot', 'lyric', 'sound', 'music', 'caption', 'endact'].includes(t)){ this.setType(p, base); return; }
    // inside the parentheses of a parenthetical: out of them, on to the dialogue
    const before = text.slice(0, at), after = text.slice(at);
    let next;
    if (!after || (t === 'paren' && after === ')')){
      next = this.node(el(nextOf(this.script, t), ''));
      p.after(next);
      this.place(next, 0);
    } else {
      const f = this.marksOf(p);
      this.fill(p, before, sliceMarks(f, 0, before.length));
      next = this.node({ ...el(t, after), f: sliceMarks(f, at, text.length) });
      p.after(next);
      this.place(next, 0);
    }
    next.scrollIntoView({ block: 'nearest' });
    this.commit(true);
    this.suggest();
  }

  /* ---------- paste: a screenplay pasted as text comes in as elements ---------- */
  paste(e){
    const text = e.clipboardData?.getData('text/plain');
    if (text == null) return;
    e.preventDefault();
    if (!text.includes('\n')){ document.execCommand('insertText', false, text); return; }
    this.insertEls(fountainToEls(text));
  }
  // elements after the one with the caret (or in its place, when it is empty)
  insertEls(els, { replaceFrom = -1, replaceTo = -1 } = {}){
    if (!els.length) return;
    const list = this.read();
    const p = this.current();
    let i = p ? [...this.box.children].indexOf(p) : list.length - 1;
    if (replaceFrom >= 0){ list.splice(replaceFrom, replaceTo - replaceFrom, ...els); i = replaceFrom + els.length - 1; }
    else if (p && !this.textOf(p).trim()){ list.splice(i, 1, ...els); i += els.length - 1; }
    else { list.splice(i + 1, 0, ...els); i += els.length; }
    this.render(list);
    const last = this.box.children[Math.max(0, i)];
    if (last){ this.place(last, this.textOf(last).length); last.scrollIntoView({ block: 'center' }); }
    this.commit(true);
  }

  /* ---------- undo ---------- */
  snapshot(structural){
    const state = JSON.stringify(this.read());
    const top = this.undo[this.undo.length - 1];
    if (top && top.state === state) return;
    const now = Date.now();
    // typing is gathered into one step per pause
    if (!structural && top && now - top.at < 700 && !top.structural) top.state = state, top.at = now;
    else this.undo.push({ state, at: now, structural });
    if (this.undo.length > 300) this.undo.shift();
    this.redo = [];
  }
  restore(state){
    const els = JSON.parse(state);
    const p = this.current();
    const id = p?.dataset.id;
    this.render(els);
    this.script.els = els;
    this.onChange(this.script);
    const back = id && this.box.querySelector(`p[data-id="${CSS.escape(id)}"]`);
    if (back) this.place(back, this.textOf(back).length);
  }
  // the script as someone else changed it (Collaborate): the page is redrawn and the caret stays where it was
  setEls(els, { mark = false } = {}){
    const p = this.current(), id = p?.dataset.id, at = p ? this.offset(p) : 0, had = document.activeElement === this.box;
    if (mark) els = this.markRevision(els.map((e) => ({ ...e })), this.script.els || []);
    this.render(els);
    this.script.els = els;
    this.snapshot(true);
    const back = had && id && this.box.querySelector(`p[data-id="${CSS.escape(id)}"]`);
    if (back) this.place(back, Math.min(at, this.textOf(back).length));
  }
  readOnly(on){ this.box.contentEditable = on ? 'false' : 'true'; }
  doUndo(){ if (this.undo.length < 2) return; this.redo.push(this.undo.pop()); this.restore(this.undo[this.undo.length - 1].state); }
  doRedo(){ const s = this.redo.pop(); if (!s) return; this.undo.push(s); this.restore(s.state); }

  /* ---------- suggestions: names on a character, INT./EXT., places and times on a scene heading ---------- */
  suggest(){
    const p = this.current();
    if (!p || document.activeElement !== this.box || !pref('suggest')){ this.hidePop(); return; }
    const t = p.dataset.t;
    const text = this.textOf(p);
    const at = this.offset(p);
    if (at !== text.length){ this.hidePop(); return; }
    const up = upper(text);
    let list = [];
    if (t === 'character' && up.trim()){
      list = charactersOf(this.read().filter((e) => e.id !== p.dataset.id)).map((c) => c.name).filter((n) => n.startsWith(up.trim()) && n !== up.trim());
    } else if (t === 'scene'){
      const greek = isGreek(this.read().map((e) => e.x).join(' '));
      if (!SCENE_START.test(up)) list = (greek ? [...SCENE_PREFIX_EL, ...SCENE_PREFIX_EN] : [...SCENE_PREFIX_EN, ...SCENE_PREFIX_EL]).filter((x) => x.startsWith(up) && x !== up);
      else if (/\s[-–—]\s*([^\s]*)$/.test(up)){ const w = up.match(/\s[-–—]\s*([^\s]*)$/)[1]; list = TIMES.filter((x) => x.startsWith(w) && x !== w).map((x) => up.replace(/([-–—]\s*)[^\s]*$/, `$1${x}`)); }
      else { const head = up.match(SCENE_START)[0]; const rest = up.slice(head.length).trimStart(); if (rest) list = placesOf(this.read().filter((e) => e.id !== p.dataset.id)).filter((x) => x.startsWith(rest) && x !== rest).map((x) => head.trimEnd() + ' ' + x + ' - '); }
    }
    list = list.slice(0, 6);
    if (!list.length){ this.hidePop(); return; }
    this.pop.replaceChildren(...list.map((v, i) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.v = v; b.textContent = v.trim(); if (!i) b.className = 'on'; b.onmousedown = (ev) => { ev.preventDefault(); this.accept(v); }; return b; }));
    const r = p.getBoundingClientRect(), base = this.root.getBoundingClientRect();
    this.pop.style.left = `${r.left - base.left + (t === 'character' ? 0 : 0)}px`;
    this.pop.style.top = `${r.bottom - base.top + 4 + this.root.scrollTop}px`;
    this.pop.hidden = false;
  }
  movePop(d){ const b = [...this.pop.children]; const i = b.findIndex((x) => x.classList.contains('on')); b.forEach((x) => x.classList.remove('on')); b[(i + d + b.length) % b.length].classList.add('on'); }
  accept(v){
    const p = this.current();
    if (!p) return;
    p.textContent = p.dataset.t === 'character' ? v.trim() : v;
    this.place(p, p.textContent.length);
    this.hidePop();
    this.commit(true);
    if (!/\s$/.test(v) || p.dataset.t === 'character') return;
    this.suggest();
  }
  hidePop(){ this.pop.hidden = true; }
}
