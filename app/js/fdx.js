import { blankScript, el, normalize, upper } from './model.js';

/* Final Draft's .fdx (XML): read and written, so a script goes to and from Final Draft with its kinds of
   paragraph and its title page. */

const TO_FDX = { scene: 'Scene Heading', action: 'Action', character: 'Character', paren: 'Parenthetical', dialogue: 'Dialogue', transition: 'Transition', shot: 'Shot' };
const FROM_FDX = { 'scene heading': 'scene', action: 'action', character: 'character', parenthetical: 'paren', dialogue: 'dialogue', transition: 'transition', shot: 'shot', general: 'action', 'new act': 'scene', 'end of act': 'transition' };
const xml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toFdx(script){
  const p = (type, text, align) => `    <Paragraph${align ? ` Alignment="${align}"` : ''} Type="${type}">\n      <Text>${xml(text)}</Text>\n    </Paragraph>`;
  const body = (script.els || []).map((e) => {
    const t = e.t === 'scene' || e.t === 'character' || e.t === 'transition' || e.t === 'shot' ? upper(e.x) : e.x;
    return p(TO_FDX[e.t] || 'Action', t);
  }).join('\n');
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
  s.els = [...content.getElementsByTagName('Paragraph')]
    .filter((p) => p.parentNode === content)
    .map((p) => el(FROM_FDX[(p.getAttribute('Type') || 'action').toLowerCase()] || 'action', textOf(p)))
    .filter((e, i, a) => e.x.trim() || (a[i + 1] && a[i + 1].t !== e.t));
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
