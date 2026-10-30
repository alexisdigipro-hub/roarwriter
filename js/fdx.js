import { blankScript, cleanMarks, el, normalize, segmentsOf, upper } from './model.js?v=6b93529';

/* Final Draft's .fdx (XML): read and written, so a script goes to and from Final Draft with its kinds of
   paragraph and its title page. */

const TO_FDX = { scene: 'Scene Heading', action: 'Action', character: 'Character', paren: 'Parenthetical', dialogue: 'Dialogue', transition: 'Transition', shot: 'Shot', general: 'General', act: 'New Act', endact: 'End of Act', lyric: 'Lyrics', sound: 'Action', music: 'Action', video: 'Action', audio: 'Action', page: 'Shot', panel: 'Shot', caption: 'Action' };
const FROM_FDX = { 'scene heading': 'scene', action: 'action', character: 'character', parenthetical: 'paren', dialogue: 'dialogue', transition: 'transition', shot: 'shot', general: 'general', 'new act': 'act', 'end of act': 'endact', lyrics: 'lyric', lyric: 'lyric' };
const xml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toFdx(script){
  const p = (type, text, align) => `    <Paragraph${align ? ` Alignment="${align}"` : ''} Type="${type}">\n      <Text>${xml(text)}</Text>\n    </Paragraph>`;
  // a line with its styles: one <Text> per piece (Style="Bold+Italic+Underline")
  const styled = (e, t, pad = '    ') => `${pad}<Paragraph Type="${TO_FDX[e.t] || 'Action'}">\n${(e.f?.length ? segmentsOf(t, e.f) : [{ text: t }]).map((g) => { const st = [g.b && 'Bold', g.i && 'Italic', g.u && 'Underline'].filter(Boolean).join('+'); return `${pad}  <Text${st ? ` Style="${st}"` : ''}>${xml(g.text)}</Text>`; }).join('\n')}\n${pad}</Paragraph>`;
  const els = script.els || [];
  const shownOf = (e) => (e.t === 'scene' || e.t === 'character' || e.t === 'transition' || e.t === 'shot' ? upper(e.x) : e.x);
  const SPOKEN = ['dialogue', 'paren', 'lyric'];
  const out = [];
  for (let i = 0; i < els.length; i++){
    const e = els[i];
    // dual dialogue: the two speeches side by side inside one <DualDialogue>
    if (e.t === 'character'){
      let j = i + 1; while (els[j] && SPOKEN.includes(els[j].t)) j++;
      if (els[j]?.t === 'character' && els[j].du){
        let k = j + 1; while (els[k] && SPOKEN.includes(els[k].t)) k++;
        out.push(`    <Paragraph>\n      <DualDialogue>\n${els.slice(i, k).map((x) => styled(x, shownOf(x), '        ')).join('\n')}\n      </DualDialogue>\n    </Paragraph>`);
        i = k - 1; continue;
      }
    }
    out.push(styled(e, shownOf(e)));
  }
  const body = out.join('\n');
  const tp = script.titlePage || {};
  const title = [
    p('Text', upper(tp.title || script.title || ''), 'Center'), ...(tp.episode ? [p('Text', tp.episode, 'Center')] : []), p('Text', '', 'Center'),
    p('Text', tp.credit || 'Written by', 'Center'), p('Text', tp.author || '', 'Center'),
    ...(tp.draftDate ? [p('Text', '', 'Center'), p('Text', tp.draftDate, 'Center')] : []),
    ...(tp.copyright ? [p('Text', tp.copyright, 'Left')] : []),
    ...(tp.contact ? tp.contact.split('\n').map((l) => p('Text', l, 'Left')) : []),
  ].join('\n');
  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
${body}
  </Content>
  <TitlePage>
    <Content>
${title}
    </Content>
  </TitlePage>
</FinalDraft>
`;
}

export function parseFdx(text){
  const doc = new DOMParser().parseFromString(String(text || ''), 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('This is not a Final Draft file.');
  const textOf = (p) => [...p.getElementsByTagName('Text')].map((t) => t.textContent).join('');
  const content = [...doc.documentElement.children].find((c) => c.tagName === 'Content');
  if (!content) throw new Error('This Final Draft file has no script in it.');
  const s = blankScript('');
  // a paragraph with its styles; a <DualDialogue> gives its paragraphs, the second speaker marked as speaking with the first
  const one = (p) => {
    const e = el(FROM_FDX[(p.getAttribute('Type') || 'action').toLowerCase()] || 'action', '');
    const f = [];
    for (const t of p.getElementsByTagName('Text')){
      const st = t.getAttribute('Style') || '', a = e.x.length;
      e.x += t.textContent;
      for (const [k, re] of [['b', /bold/i], ['i', /italic/i], ['u', /underline/i]]) if (re.test(st)) f.push([a, e.x.length, k]);
    }
    const m = cleanMarks(f, e.x.length); if (m.length) e.f = m;
    return e;
  };
  s.els = [...content.children].filter((p) => p.tagName === 'Paragraph').flatMap((p) => {
    const dd = [...p.children].find((c) => c.tagName === 'DualDialogue');
    if (!dd) return [one(p)];
    let n = 0;
    return [...dd.children].filter((c) => c.tagName === 'Paragraph').map((c) => { const e = one(c); if (e.t === 'character' && n++ === 1) e.du = 1; return e; });
  }).filter((e, i, a) => e.x.trim() || (a[i + 1] && a[i + 1].t !== e.t));
  const tpNode = doc.getElementsByTagName('TitlePage')[0];
  if (tpNode){
    const lines = [...tpNode.getElementsByTagName('Paragraph')].map(textOf).map((x) => x.trim()).filter(Boolean);
    const by = lines.findIndex((l) => /^(written by|by|screenplay by|σενάριο)/i.test(l));
    s.titlePage.title = lines[0] || '';
    if (by >= 0){
      s.titlePage.credit = lines[by]; s.titlePage.author = lines[by + 1] || '';
      // what is left: a date or draft line, and the contact
      const rest = lines.slice(by + 2);
      const d = rest.findIndex((l) => /\b\d{1,4}[\/.\-]\d{1,2}|draft|revision|προσχέδιο|\b(19|20)\d\d\b/i.test(l) && !/@|\+?\d{3}[\s-]?\d{3}/.test(l));
      if (d >= 0) s.titlePage.draftDate = rest.splice(d, 1)[0];
      s.titlePage.contact = rest.join('\n');
    }
  }
  s.title = s.titlePage.title || '';
  return normalize(s);
}
