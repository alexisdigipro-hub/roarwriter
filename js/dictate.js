import { askAI } from './cloud.js?v=6b93529';
import { fountainToEls } from './fountain.js?v=6b93529';
import { FORMATS, fmtOf } from './formats.js?v=6b93529';
import { el } from './model.js?v=6b93529';
import { langOf } from './studio.js?v=6b93529';
import { I, h, toast } from './ui.js?v=6b93529';

/* Writing by speaking (Alex, 25 Oct): the words said aloud appear as they are heard, in Greek or English; then
   they go in as they are (as action), or the AI lays them out as script (names, speeches, a scene heading). Speech
   recognition is the browser's own: Chrome, Edge and Safari have it; the Mac and Windows app does not (macOS has
   its own Dictation, the Fn key twice, which types into any app, RoarWriter too). */
export function dictation(ctx){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const pill = h('div', { class: 'dictate', hidden: true });
  document.body.append(pill);
  let rec = null, on = false, heard = '', live = '', lang = 'el';
  const text = () => (heard + ' ' + live).trim();
  const draw = () => {
    pill.hidden = false;
    pill.replaceChildren(
      h('div', { class: 'dc-top' },
        h('span', { class: 'dc-dot' + (on ? ' on' : '') }),
        h('b', {}, on ? 'Listening…' : 'Paused'),
        h('div', { class: 'seg' }, ...[['el', 'ΕΛ'], ['en', 'EN']].map(([k, l]) => h('button', { type: 'button', class: lang === k ? 'on' : '', onclick: () => { lang = k; if (on){ stopRec(); startRec(); } draw(); } }, l))),
        h('span', { class: 'spacer' }),
        h('button', { class: 'ib', type: 'button', title: on ? 'Pause' : 'Go on', 'aria-label': on ? 'Pause' : 'Go on', html: on ? I.pause : I.mic, onclick: () => { if (on) stopRec(); else startRec(); draw(); } }),
        h('button', { class: 'ib', type: 'button', title: 'Close', 'aria-label': 'Close', html: I.x, onclick: () => close() })),
      h('div', { class: 'dc-text' }, heard ? heard + ' ' : '', h('i', {}, live), !heard && !live ? h('span', { class: 'muted' }, lang === 'el' ? 'Μίλα: «Εσωτερικό κουζίνα νύχτα. Η Μαρία μπαίνει. Μαρία: δεν θα ξαναγυρίσω.»' : 'Speak: “Interior kitchen, night. Maria comes in. Maria: I am not coming back.”') : ''),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', disabled: !text(), onclick: () => insert(false) }, 'Insert as it is'),
        h('button', { class: 'btn primary', type: 'button', disabled: !text(), onclick: () => insert(true) }, h('span', { html: I.spark }), 'Lay it out as script'),
        h('button', { class: 'linkish', type: 'button', disabled: !text(), onclick: () => { heard = ''; live = ''; draw(); } }, 'Clear')));
  };
  function startRec(){
    rec = new SR();
    rec.lang = lang === 'el' ? 'el-GR' : 'en-US';
    rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e) => {
      live = '';
      for (let i = e.resultIndex; i < e.results.length; i++){ const r = e.results[i]; if (r.isFinal) heard = (heard + ' ' + r[0].transcript).trim(); else live += r[0].transcript; }
      draw();
    };
    rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Allow the microphone for RoarWriter to dictate.'); else if (e.error === 'network') toast('Dictation needs the internet in this browser.'); };
    // the browser stops listening after a pause: it starts again while it is on
    rec.onend = () => { if (on) try { rec.start(); } catch { on = false; draw(); } };
    on = true;
    try { rec.start(); } catch { on = false; }
  }
  function stopRec(){ on = false; try { rec?.stop(); } catch {} }
  async function insert(layout){
    const words = text(); if (!words) return;
    if (ctx.readOnly()) return toast('This script is view only.');
    stopRec(); draw();
    let els = [el('action', words)];
    if (layout){
      pill.querySelector('.btn.primary').textContent = 'Laying it out…';
      try {
        const r = await askAI({ task: 'format', title: ctx.script.title, lang: lang || langOf(ctx.script), format: FORMATS[fmtOf(ctx.script)].label, scene: words });
        const got = fountainToEls(r.text || '');
        if (got.length) els = got.map((e) => ({ ...e, id: crypto.randomUUID().slice(0, 8) }));
      } catch (e) { toast(e.message || 'The AI did not answer: it goes in as it is.'); }
    }
    // where the cursor was when dictation began
    const at = ctx.caretId(); if (at) ctx.editor().focusEl(at, 1e9);
    ctx.editor().insertEls(els);
    heard = ''; live = ''; close(); toast(layout ? 'Laid out as script' : 'Inserted');
  }
  function close(){ stopRec(); pill.hidden = true; }
  return {
    start(){
      if (!SR) return toast(window.rwDesktop ? 'Dictation is in the web version (Chrome, Edge, Safari). In the app, use the Mac’s own Dictation: press Fn twice.' : 'This browser cannot dictate. Chrome, Edge and Safari can.');
      if (pill.hidden){ lang = langOf(ctx.script); heard = ''; live = ''; startRec(); }
      draw();
    },
    close,
  };
}
