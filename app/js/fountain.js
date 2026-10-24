import { cleanMarks, segmentsOf, SCENE_START, blankScript, el, normalize, upper } from './model.js';

/* Fountain (fountain.io), the plain-text screenplay format: what RoarWriter reads and writes as .fountain, and
   what the AI answers in. Greek scene headings and names are written with Fountain's forcing marks (. and @)
   when the usual rules would not recognise them. */

const isUpperLine = (s) => s === upper(s) && /[A-ZΑ-ΩΆ-Ώ]/.test(s);
const TRANS = /^(?:[A-ZΑ-Ω\s'’.]+TO:|FADE OUT\.|FADE IN:|CUT TO BLACK\.|ΚΟΒΕΙ ΣΕ:|ΣΒΗΝΕΙ\.?)$/;

export function parseFountain(text){
  const s = blankScript('');
  const src = String(text || '').replace(/\r\n?/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\[\[[\s\S]*?\]\]/g, '');
  let lines = src.split('\n');
  // title page: Key: value lines at the very top, up to the first blank line
  if (/^(title|episode|credit|author|authors|source|draft date|date|contact|copyright|notes|format)\s*:/i.test(lines[0] || '')){
    let i = 0, key = '';
    const tp = {};
    for (; i < lines.length && lines[i].trim() !== ''; i++){
      const m = lines[i].match(/^([A-Za-z ]+):\s*(.*)$/);
      if (m){ key = m[1].trim().toLowerCase(); tp[key] = m[2].trim(); }
      else if (key) tp[key] = (tp[key] ? tp[key] + '\n' : '') + lines[i].trim();
    }
    s.titlePage = { title: tp.title || '', episode: tp.episode || '', credit: tp.credit || 'Written by', author: tp.author || tp.authors || '', copyright: tp.copyright || '', contact: tp.contact || '', draftDate: tp['draft date'] || '' };
    s.title = s.titlePage.title.split('\n')[0] || '';
    if (tp.format) s.settings.format = tp.format.trim().toLowerCase();
    lines = lines.slice(i + 1);
  }
  const els = [];
  let i = 0;
  const blankAt = (k) => k < 0 || k >= lines.length || lines[k].trim() === '';
  while (i < lines.length){
    const raw = lines[i];
    const line = raw.trim();
    if (!line){ i++; continue; }
    if (/^={3,}$/.test(line) || /^#/.test(line) || /^=/.test(line)){ i++; continue; } // page breaks, sections, synopses
    // forced scene heading or a recognised one, standing on its own
    if ((/^\.[^.]/.test(line) || SCENE_START.test(line)) && blankAt(i - 1)){
      els.push(el('scene', line.replace(/^\./, '').replace(/\s*#[^#]+#$/, '')));
      i++; continue;
    }
    // centred: an act (ACT ONE, TEASER, COLD OPEN), its end, or centred action
    if (/^>.*<$/.test(line)){ const c = line.slice(1, -1).trim(); els.push(el(/^(END OF|ΤΕΛΟΣ)\b/i.test(c) ? 'endact' : /^(ACT|TEASER|COLD OPEN|PROLOGUE|EPILOGUE|ΠΡΑΞΗ|ΠΡΟΛΟΓΟΣ|ΕΠΙΛΟΓΟΣ)\b/i.test(c) ? 'act' : 'action', c)); i++; continue; }
    if (/^~/.test(line)){ els.push(el('lyric', line.slice(1).trim())); i++; continue; }
    if (/^>/.test(line) || (TRANS.test(line) && blankAt(i - 1) && blankAt(i + 1))){ els.push(el('transition', line.replace(/^>\s*/, ''))); i++; continue; }
    // forced action, or the kinds other formats write that way (a comic's PAGE and PANEL, sound, music, AV)
    if (/^!/.test(line)){ const x = line.slice(1); const k = /^(PAGE|ΣΕΛΙΔΑ)\s+\S/i.test(x) ? 'page' : /^(PANEL|ΚΑΡΕ)\s+\S/i.test(x) ? 'panel' : /^(SFX|SOUND|ΗΧΟΣ)\b/i.test(x) ? 'sound' : /^(MUSIC|ΜΟΥΣΙΚΗ)\b/i.test(x) ? 'music' : /^CAPTION\b/i.test(x) ? 'caption' : /^VIDEO:/i.test(x) ? 'video' : /^AUDIO:/i.test(x) ? 'audio' : 'action'; els.push(el(k, k === 'video' || k === 'audio' ? x.replace(/^\w+:\s*/, '') : x)); i++; continue; }
    // a character: @forced, or an all-capital line with something under it
    if ((/^@/.test(line) || (isUpperLine(line.replace(/\(.*?\)/g, '')) && !/^[\d\p{P}\p{S}\s]+$/u.test(line))) && blankAt(i - 1) && !blankAt(i + 1)){
      els.push({ ...el('character', line.replace(/^@/, '').replace(/\s*\^$/, '')), ...(/\^$/.test(line) ? { du: 1 } : {}) });
      i++;
      while (i < lines.length && lines[i].trim() !== ''){
        const d = lines[i].trim();
        if (/^\(.*\)$/.test(d)) els.push(el('paren', d));
        else if (/^~/.test(d)) els.push(el('lyric', d.slice(1).trim()));
        else {
          const last = els[els.length - 1];
          if (last.t === 'dialogue') last.x += '\n' + d; else els.push(el('dialogue', d));
        }
        i++;
      }
      continue;
    }
    // action: the paragraph as it is, its lines kept
    const para = [];
    while (i < lines.length && lines[i].trim() !== ''){ para.push(lines[i].replace(/^!/, '').trimEnd()); i++; }
    els.push(el('action', para.join('\n')));
  }
  s.els = (els.length ? els : blankScript().els).map(emphasis);
  return normalize(s);
}

/* Fountain's emphasis: ***bold italic***, **bold**, *italic*, _underline_ become the line's marks */
function emphasis(e){
  if (['scene', 'character', 'transition'].includes(e.t) || !/[*_]/.test(e.x)) return e;
  const f = [];
  let x = e.x;
  for (const [re, st] of [[/\*\*\*(\S(?:[^*\n]*?\S)?)\*\*\*/, ['b', 'i']], [/\*\*(\S(?:[^*\n]*?\S)?)\*\*/, ['b']], [/\*(\S(?:[^*\n]*?\S)?)\*/, ['i']], [/(?<![\p{L}\p{N}])_(\S(?:[^_\n]*?\S)?)_(?![\p{L}\p{N}])/u, ['u']]]){
    for (let m = x.match(re); m; m = x.match(re)){
      const a = m.index, inner = m[1], cut = m[0].length - inner.length, lead = m[0].indexOf(inner);
      // what comes after moves back by the markers taken out
      for (const r of f){ if (r[0] > a) r[0] -= r[0] >= a + lead + inner.length ? cut : lead; if (r[1] > a) r[1] -= r[1] >= a + lead + inner.length ? cut : lead; }
      x = x.slice(0, a) + inner + x.slice(a + m[0].length);
      for (const st2 of st) f.push([a, a + inner.length, st2]);
    }
  }
  return f.length ? { ...e, x, f: cleanMarks(f, x.length) } : e;
}
const emph = (e, x) => (e.f?.length ? segmentsOf(x, e.f).map((g) => { let t = g.text; if (!t.trim()) return t; if (g.b && g.i) t = `***${t}***`; else if (g.b) t = `**${t}**`; else if (g.i) t = `*${t}*`; if (g.u) t = `_${t}_`; return t; }).join('') : x);

// just the elements, for pasting and for the AI's answers
export const fountainToEls = (text) => parseFountain(String(text || '').replace(/^```[a-z]*\n?|```\s*$/gm, '')).els.filter((e) => e.x.trim());

export function toFountain(script, { titlePage = true } = {}){
  const out = [];
  const tp = script.titlePage || {};
  if (titlePage && (tp.title || tp.author)){
    if (tp.title) out.push(`Title: ${tp.title}`);
    if (tp.episode) out.push(`Episode: ${tp.episode}`);
    if (tp.credit) out.push(`Credit: ${tp.credit}`);
    if (tp.author) out.push(`Author: ${tp.author}`);
    if (tp.copyright) out.push(`Copyright: ${tp.copyright}`);
    if (tp.draftDate) out.push(`Draft date: ${tp.draftDate}`);
    if (tp.contact) out.push(`Contact:\n${tp.contact.split('\n').map((l) => '    ' + l).join('\n')}`);
    if (script.settings?.format && script.settings.format !== 'film') out.push(`Format: ${script.settings.format}`);
    out.push('');
  }
  const els = script.els || [];
  els.forEach((e, i) => {
    const x = e.x || '';
    const prev = els[i - 1];
    const tight = ['dialogue', 'paren', 'lyric'].includes(e.t) && prev && ['character', 'dialogue', 'paren', 'lyric'].includes(prev.t);
    if (i && !tight) out.push('');
    if (e.t === 'scene') out.push(SCENE_START.test(upper(x)) && !/[Ͱ-Ͽ]/.test(x) ? upper(x) : '.' + upper(x));
    else if (e.t === 'character') out.push((/^[A-Z0-9 ().'’-]+$/.test(upper(x)) && /[A-Z]/.test(upper(x)) ? upper(x) : '@' + upper(x)) + (e.du ? ' ^' : ''));
    else if (e.t === 'transition') out.push(/TO:$/.test(upper(x)) && !/[Ͱ-Ͽ]/.test(x) ? upper(x) : '> ' + upper(x));
    else if (e.t === 'paren') out.push(/^\(.*\)$/.test(x.trim()) ? x.trim() : `(${x.trim()})`);
    else if (e.t === 'shot') out.push('!' + upper(x));
    else if (e.t === 'act'){ if (i) out.push('===', ''); out.push(`>${upper(x)}<`); }
    else if (e.t === 'endact') out.push(`>${upper(x)}<`);
    else if (e.t === 'lyric') out.push(...x.split('\n').map((l) => '~' + l));
    else if (['sound', 'music', 'page', 'panel', 'caption'].includes(e.t)) out.push('!' + upper(x));
    else if (e.t === 'video' || e.t === 'audio') out.push(`!${e.t.toUpperCase()}: ${x}`);
    else if (e.t === 'action' && (isUpperLine(x) || SCENE_START.test(x))) out.push('!' + emph(e, x));
    else out.push(emph(e, x));
  });
  return out.join('\n') + '\n';
}
