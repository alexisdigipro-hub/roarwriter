import { blankScript, el, upper } from './model.js?v=6b93529';

/* Fade In (.fadein): a zip with document.xml inside, in the Open Screenplay Format (OSF). Read: every paragraph
   is one element, its kind from its style (basestylename / baseStyleName, as versions differ), its text the
   runs of <text> together; the title page from its bookmarks (Title, Author, Draft, Contact). Written: the same,
   with Fade In's own styles and settings, so it opens there with a double click. A bare OSF .xml reads too.
   No library: the zip is read and written here (stored or deflated in, stored out). */

const STYLE_TO = { 'scene heading': 'scene', action: 'action', character: 'character', parenthetical: 'paren', dialogue: 'dialogue', transition: 'transition', shot: 'shot', general: 'general', 'normal text': 'general', text: 'general' };
const TO_STYLE = { scene: 'Scene Heading', action: 'Action', character: 'Character', paren: 'Parenthetical', dialogue: 'Dialogue', transition: 'Transition', shot: 'Shot', general: 'Normal Text' };

/* ---------- zip ---------- */
async function inflate(bytes){
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function unzip(buf){
  const b = new Uint8Array(buf), v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (v.getUint32(i, true) === 0x06054b50){ end = i; break; }
  if (end < 0) throw new Error('This .fadein file could not be opened (not a zip).');
  const count = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  const files = [];
  for (let n = 0; n < count && v.getUint32(p, true) === 0x02014b50; n++){
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true), nameLen = v.getUint16(p + 28, true);
    const extra = v.getUint16(p + 30, true), comment = v.getUint16(p + 32, true), local = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));
    files.push({ name, method, size, local });
    p += 46 + nameLen + extra + comment;
  }
  const pick = files.find((f) => /(^|\/)document\.xml$/i.test(f.name)) || files.find((f) => /\.xml$/i.test(f.name));
  if (!pick) throw new Error('There is no script inside this .fadein file.');
  const start = pick.local + 30 + v.getUint16(pick.local + 26, true) + v.getUint16(pick.local + 28, true);
  const data = b.subarray(start, start + pick.size);
  if (pick.method === 0) return data;
  if (pick.method === 8) return inflate(data);
  throw new Error('This .fadein file is packed in a way RoarWriter cannot read.');
}
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zipOne(name, data){
  const nm = new TextEncoder().encode(name), crc = crc32(data), size = data.length;
  const out = new Uint8Array(30 + nm.length + size + 46 + nm.length + 22), v = new DataView(out.buffer);
  const head = (at, sig, central) => {
    v.setUint32(at, sig, true); let o = at + 4;
    if (central){ v.setUint16(o, 20, true); o += 2; }
    v.setUint16(o, 20, true); v.setUint16(o + 2, 0x0800, true); v.setUint16(o + 4, 0, true); v.setUint16(o + 6, 0, true); v.setUint16(o + 8, 0x21, true);
    v.setUint32(o + 10, crc, true); v.setUint32(o + 14, size, true); v.setUint32(o + 18, size, true); v.setUint16(o + 22, nm.length, true); v.setUint16(o + 24, 0, true);
    return o + 26;
  };
  let o = head(0, 0x04034b50, false); out.set(nm, o); o += nm.length; out.set(data, o); o += size;
  const cd = o; o = head(cd, 0x02014b50, true);
  v.setUint16(o, 0, true); v.setUint16(o + 2, 0, true); v.setUint16(o + 4, 0, true); v.setUint32(o + 6, 0, true); v.setUint32(o + 10, 0, true); o += 14;
  out.set(nm, o); o += nm.length;
  const cdSize = o - cd;
  v.setUint32(o, 0x06054b50, true); v.setUint16(o + 8, 1, true); v.setUint16(o + 10, 1, true); v.setUint32(o + 12, cdSize, true); v.setUint32(o + 16, cd, true);
  return out;
}

/* ---------- read ---------- */
const local = (n) => (n.localName || n.nodeName).toLowerCase();
const attr = (n, name) => { for (const a of n.attributes || []) if (a.name.toLowerCase() === name) return a.value; return ''; };
const kids = (n, name) => [...n.children].filter((c) => local(c) === name);
const textOf = (para) => kids(para, 'text').map((t) => t.textContent).join('').replace(/\r/g, '');

export async function parseFadein(buf){
  const b = new Uint8Array(buf);
  const xml = new TextDecoder().decode(b[0] === 0x50 && b[1] === 0x4b ? await unzip(buf) : b);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('This Fade In file could not be read.');
  const all = [...doc.getElementsByTagName('*')];
  const s = blankScript('');
  const paras = all.find((n) => local(n) === 'paragraphs') || doc.documentElement;
  s.els = kids(paras, 'para').map((p) => {
    const st = kids(p, 'style')[0];
    const t = STYLE_TO[(st ? attr(st, 'basestylename') || attr(st, 'basestyle') : '').trim().toLowerCase()] || 'action';
    let x = textOf(p);
    if (t === 'paren') x = x.trim();
    return el(t, x);
  }).filter((e, i, list) => e.x.trim() || (e.t === 'scene' && i < list.length - 1) || false);
  if (!s.els.length) s.els = blankScript('').els;
  // the title page, from its bookmarks (and the info line)
  const info = all.find((n) => local(n) === 'info');
  const tp = all.find((n) => local(n) === 'titlepage');
  const marks = {};
  const lines = tp ? kids(tp, 'para').map((p) => ({ m: attr(p, 'bookmark').toLowerCase(), x: textOf(p).trim() })).filter((l) => l.x) : [];
  for (const { m, x } of lines) if (m) marks[m] = marks[m] ? marks[m] + '\n' + x : x;
  // what has no bookmark: a line between the title and the credit is the episode, a © line the copyright
  const ti = lines.findIndex((l) => l.m === 'title'), by = lines.findIndex((l) => /^(written by|by|screenplay by|σενάριο|γράφει)/i.test(l.x));
  if (ti >= 0 && by > ti + 1 && !lines[ti + 1].m) marks.episode = lines[ti + 1].x;
  const cr = lines.find((l) => !l.m && /^(copyright|©|\(c\))/i.test(l.x));
  if (cr) marks.copyright = cr.x;
  if (by >= 0 && !lines[by].m) marks.credit = lines[by].x;
  s.titlePage.title = marks.title || (info && attr(info, 'title')) || '';
  s.titlePage.author = marks.author || (info && attr(info, 'author')) || '';
  s.titlePage.draftDate = marks.draft || marks['draft date'] || '';
  s.titlePage.contact = marks.contact || '';
  s.titlePage.copyright = marks.copyright || '';
  s.titlePage.episode = marks.episode || '';
  if (marks.credit) s.titlePage.credit = marks.credit;
  s.title = s.titlePage.title.split('\n')[0] || '';
  return s;
}

/* ---------- write ---------- */
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const para = (style, text, attrs = {}, styleAttrs = {}) => {
  const a = Object.entries(attrs).filter(([, v]) => v).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  const sa = Object.entries(styleAttrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  return `\t\t<para${a}>\n\t\t\t<style baseStyleName="${style}"${sa}/>\n\t\t\t<text>${esc(text)}</text>\n\t\t</para>\n`;
};
const STYLES = `\t<styles>
\t\t<style name="Normal Text" builtin="1" builtInIndex="0" label="Normal Text" font="Courier Screenplay" size="12"/>
\t\t<style name="Scene Heading" builtin="1" builtInIndex="1" label="Scene Heading" baseStyleName="Normal Text" styleEnter="Action" font="Courier Screenplay" size="12" spaceBefore="2" keepWithNext="1" allCaps="1"/>
\t\t<style name="Action" builtin="1" builtInIndex="2" label="Action" baseStyleName="Normal Text" styleTabBefore="Character" styleTabAfter="Character" font="Courier Screenplay" size="12" spaceBefore="1"/>
\t\t<style name="Character" builtin="1" builtInIndex="3" label="Character" baseStyleName="Normal Text" styleEnter="Dialogue" styleTabBefore="Action" styleTabAfter="Action" font="Courier Screenplay" size="12" spaceBefore="1" keepWithNext="1" leftIndent="635" allCaps="1"/>
\t\t<style name="Parenthetical" builtin="1" builtInIndex="4" label="Parenthetical" baseStyleName="Normal Text" styleEnter="Dialogue" styleTabBefore="Dialogue" styleTabAfter="Dialogue" font="Courier Screenplay" size="12" keepWithNext="1" leftIndent="508" rightIndent="508"/>
\t\t<style name="Dialogue" builtin="1" builtInIndex="5" label="Dialogue" baseStyleName="Normal Text" styleEnter="Action" styleTabBefore="Parenthetical" styleTabAfter="Parenthetical" font="Courier Screenplay" size="12" leftIndent="330" rightIndent="254"/>
\t\t<style name="Transition" builtin="1" builtInIndex="6" label="Transition" baseStyleName="Normal Text" styleEnter="Scene Heading" font="Courier Screenplay" size="12" spaceBefore="1" align="right" leftIndent="1016" rightIndent="127" allCaps="1"/>
\t\t<style name="Shot" builtin="1" builtInIndex="7" label="Shot" baseStyleName="Normal Text" styleEnter="Action" font="Courier Screenplay" size="12" spaceBefore="1" keepWithNext="1" allCaps="1"/>
\t</styles>
`;
const SETTINGS = (letter) => `\t<settings pageWidth="${letter ? 2159 : 2100}" pageHeight="${letter ? 2794 : 2970}" marginTop="317" marginBottom="220" marginLeft="317" marginRight="317" normalLinesPerInch="6.0" breakOnSentences="true" dialogueContinues="true" contText="(cont'd)" moreText="(MORE)" scenesContinue="true" continuedText="CONTINUED" autoOmitScenes="true" omittedText="OMITTED" sceneTimeSeparator=" - " pageNumbering="true" pagesLocked="false" pageNumberFormat="#." pageNumberStart="1" pageNumberFirst="false" pageFooter="" revision="0" showRevisions="false" showAllRevisions="false" sceneNumbering="false" sceneNumberStart="1" scenesLocked="false" dialogueNumbering="false" dialogueNumberStart="1" dialogueNumberFormat="()"/>\n`;

export function toFadein(script){
  const tp = script.titlePage || {};
  const out = ['<?xml version="1.0" encoding="utf-8"?>\n', '<document type="Open Screenplay Format document" version="21">\n',
    `\t<info uuid="${(crypto.randomUUID?.() || '').toUpperCase()}" title="${esc(tp.title || script.title)}" author="${esc(tp.author)}"/>\n`,
    SETTINGS(script.settings?.page === 'letter'), STYLES, '\t<paragraphs>\n'];
  const chars = new Set(), locs = new Set();
  for (const e of script.els){
    const x = String(e.x || '');
    if (e.t === 'scene'){ const h = upper(x); out.push(para('Scene Heading', h)); const place = h.replace(/^[^.]*\.\s*/, '').split(/\s+[-–—]\s+/)[0].trim(); if (place) locs.add(place); }
    else if (e.t === 'character'){ const n = upper(x).trim(); out.push(para('Character', n)); const base = n.replace(/\s*\(.*$/, ''); if (base) chars.add(base); }
    else if (e.t === 'paren') out.push(para('Parenthetical', /^\(.*\)$/.test(x.trim()) ? x.trim() : `(${x.trim()})`));
    else if (e.t === 'action') x.split('\n').forEach((line) => out.push(para('Action', line)));
    else out.push(para(TO_STYLE[e.t] || 'Action', e.t === 'transition' || e.t === 'shot' ? upper(x) : x));
  }
  out.push('\t</paragraphs>\n\t<titlePage>\n');
  const c = { align: 'center' };
  for (let i = 0; i < 18; i++) out.push(para('Normal Text', ''));
  out.push(para('Normal Text', tp.title || script.title || '', { bookmark: 'Title' }, c));
  if (tp.episode) out.push(para('Normal Text', tp.episode, {}, c));
  out.push(para('Normal Text', '', {}, c), para('Normal Text', '', {}, c));
  if (tp.author){ out.push(para('Normal Text', tp.credit || 'Written by', {}, c), para('Normal Text', '', {}, c), para('Normal Text', tp.author, { bookmark: 'Author' }, c)); }
  for (let i = 0; i < 20; i++) out.push(para('Normal Text', ''));
  if (tp.copyright) out.push(para('Normal Text', tp.copyright));
  if (tp.draftDate) out.push(para('Normal Text', tp.draftDate, { bookmark: 'Draft' }));
  if (tp.contact) tp.contact.split('\n').forEach((l, i) => out.push(para('Normal Text', l, i ? {} : { bookmark: 'Contact' })));
  out.push('\t</titlePage>\n\t<lists>\n\t\t<characters>\n', ...[...chars].map((n) => `\t\t\t<character name="${esc(n)}"/>\n`), '\t\t</characters>\n\t\t<locations>\n', ...[...locs].map((n) => `\t\t\t<location name="${esc(n)}"/>\n`), '\t\t</locations>\n');
  out.push('\t\t<sceneIntros>\n', ...['INT.', 'EXT.', 'INT./EXT.', 'ΕΣΩΤ.', 'ΕΞΩΤ.', 'ΕΣΩΤ./ΕΞΩΤ.'].map((n) => `\t\t\t<sceneIntro name="${n}"/>\n`), '\t\t</sceneIntros>\n');
  out.push('\t\t<sceneTimes>\n', ...['DAY', 'NIGHT', 'MORNING', 'EVENING', 'LATER', 'CONTINUOUS', 'ΜΕΡΑ', 'ΝΥΧΤΑ', 'ΠΡΩΙ', 'ΒΡΑΔΥ', 'ΑΡΓΟΤΕΡΑ', 'ΣΥΝΕΧΕΙΑ'].map((n) => `\t\t\t<sceneTime name="${n}"/>\n`), '\t\t</sceneTimes>\n');
  out.push('\t\t<extensions>\n', ...['(V.O.)', '(O.S.)', '(O.C.)', "(CONT'D)"].map((n) => `\t\t\t<extension name="${n}"/>\n`), '\t\t</extensions>\n');
  out.push('\t\t<transitions>\n', ...['CUT TO:', 'FADE IN:', 'FADE OUT', 'FADE TO:', 'DISSOLVE TO:', 'BACK TO:', 'MATCH CUT TO:', 'JUMP CUT TO:', 'FADE TO BLACK'].map((n) => `\t\t\t<transition name="${esc(n)}"/>\n`), '\t\t</transitions>\n');
  out.push('\t</lists>\n</document>\n');
  return zipOne('document.xml', new TextEncoder().encode(out.join('')));
}
