import { SCENE_START, blankScript, el, normalize, upper } from './model.js';

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
  if (/^(title|credit|author|authors|source|draft date|date|contact|copyright|notes)\s*:/i.test(lines[0] || '')){
    let i = 0, key = '';
    const tp = {};
    for (; i < lines.length && lines[i].trim() !== ''; i++){
      const m = lines[i].match(/^([A-Za-z ]+):\s*(.*)$/);
      if (m){ key = m[1].trim().toLowerCase(); tp[key] = m[2].trim(); }
      else if (key) tp[key] = (tp[key] ? tp[key] + '\n' : '') + lines[i].trim();
    }
    s.titlePage = { title: tp.title || '', credit: tp.credit || 'Written by', author: tp.author || tp.authors || '', contact: tp.contact || '', draftDate: tp['draft date'] || '' };
    s.title = s.titlePage.title.split('\n')[0] || '';
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
    if (/^>.*<$/.test(line)){ els.push(el('action', line.slice(1, -1).trim())); i++; continue; } // centred
    if (/^>/.test(line) || (TRANS.test(line) && blankAt(i - 1) && blankAt(i + 1))){ els.push(el('transition', line.replace(/^>\s*/, ''))); i++; continue; }
    if (/^!/.test(line)){ els.push(el('action', line.slice(1))); i++; continue; }
    // a character: @forced, or an all-capital line with something under it
    if ((/^@/.test(line) || (isUpperLine(line.replace(/\(.*?\)/g, '')) && !/^[\d\p{P}\p{S}\s]+$/u.test(line))) && blankAt(i - 1) && !blankAt(i + 1)){
      els.push(el('character', line.replace(/^@/, '').replace(/\s*\^$/, '')));
      i++;
      while (i < lines.length && lines[i].trim() !== ''){
        const d = lines[i].trim();
        if (/^\(.*\)$/.test(d)) els.push(el('paren', d));
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
  s.els = els.length ? els : blankScript().els;
  return normalize(s);
}

// just the elements, for pasting and for the AI's answers
export const fountainToEls = (text) => parseFountain(String(text || '').replace(/^```[a-z]*\n?|```\s*$/gm, '')).els.filter((e) => e.x.trim());

export function toFountain(script, { titlePage = true } = {}){
  const out = [];
  const tp = script.titlePage || {};
  if (titlePage && (tp.title || tp.author)){
    if (tp.title) out.push(`Title: ${tp.title}`);
    if (tp.credit) out.push(`Credit: ${tp.credit}`);
    if (tp.author) out.push(`Author: ${tp.author}`);
    if (tp.draftDate) out.push(`Draft date: ${tp.draftDate}`);
    if (tp.contact) out.push(`Contact:\n${tp.contact.split('\n').map((l) => '    ' + l).join('\n')}`);
    out.push('');
  }
  const els = script.els || [];
  els.forEach((e, i) => {
    const x = e.x || '';
    const prev = els[i - 1];
    const tight = (e.t === 'dialogue' || e.t === 'paren') && prev && (prev.t === 'character' || prev.t === 'dialogue' || prev.t === 'paren');
    if (i && !tight) out.push('');
    if (e.t === 'scene') out.push(SCENE_START.test(upper(x)) && !/[Ͱ-Ͽ]/.test(x) ? upper(x) : '.' + upper(x));
    else if (e.t === 'character') out.push(/^[A-Z0-9 ().'’-]+$/.test(upper(x)) && /[A-Z]/.test(upper(x)) ? upper(x) : '@' + upper(x));
    else if (e.t === 'transition') out.push(/TO:$/.test(upper(x)) && !/[Ͱ-Ͽ]/.test(x) ? upper(x) : '> ' + upper(x));
    else if (e.t === 'paren') out.push(/^\(.*\)$/.test(x.trim()) ? x.trim() : `(${x.trim()})`);
    else if (e.t === 'shot') out.push('!' + upper(x));
    else if (e.t === 'action' && (isUpperLine(x) || SCENE_START.test(x))) out.push('!' + x);
    else out.push(x);
  });
  return out.join('\n') + '\n';
}
