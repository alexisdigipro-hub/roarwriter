/* The formats a script can be written in (Alex, 24 Oct: "all the formats there are"). Each one is its own page:
   which kinds of line it has (and their shortcuts), what Enter and Tab go on to, where each kind sits on the page
   (in % of the text's width, so the same rule serves the page on a computer, the fluid page on a phone and the
   PDF), what starts a new page, and how a new script begins. The script keeps settings.format; film is the
   default and what every older script is. */

// every kind of line any format uses: [key, label]
export const KINDS = {
  scene: 'Scene Heading', action: 'Action', character: 'Character', paren: 'Parenthetical', dialogue: 'Dialogue',
  transition: 'Transition', shot: 'Shot', general: 'Unformatted Text',
  act: 'Act', endact: 'End of Act', lyric: 'Lyrics', sound: 'Sound (SFX)', music: 'Music', video: 'Video', audio: 'Audio',
  page: 'Page', panel: 'Panel', caption: 'Caption',
};

const FILM_NEXT = { scene: 'action', action: 'action', character: 'dialogue', paren: 'dialogue', dialogue: 'character', transition: 'scene', shot: 'action', general: 'general', act: 'scene', endact: 'act' };
const FILM_TAB = ['action', 'character', 'transition', 'scene', 'shot'];

/* css: per kind, the rules on the page (margins in % of the text width, as 6" of text: 1" = 16.67%) */
export const FORMATS = {
  film: {
    label: 'Feature Film', note: 'The screenplay as the film industry reads it: Courier 12, scene headings, action, dialogue.',
    kinds: ['scene', 'action', 'character', 'paren', 'dialogue', 'transition', 'shot'],
    next: FILM_NEXT, tab: FILM_TAB, base: 'action',
    start: [['scene', '']],
  },
  tv: {
    label: 'TV Drama (one hour)', note: 'A film page in acts: TEASER, ACT ONE… each act on a new page, END OF ACT at its foot.',
    kinds: ['scene', 'action', 'character', 'paren', 'dialogue', 'transition', 'shot', 'act', 'endact'],
    next: FILM_NEXT, tab: FILM_TAB, base: 'action', breakBefore: ['act'],
    start: [['act', 'TEASER'], ['scene', '']],
  },
  tv30: {
    label: 'TV Half-Hour (single camera)', note: 'Comedy on film: a COLD OPEN and acts, laid out like a feature.',
    kinds: ['scene', 'action', 'character', 'paren', 'dialogue', 'transition', 'shot', 'act', 'endact'],
    next: FILM_NEXT, tab: FILM_TAB, base: 'action', breakBefore: ['act'],
    start: [['act', 'COLD OPEN'], ['scene', '']],
  },
  multicam: {
    label: 'Sitcom (multi-camera)', note: 'Studio comedy: action in capitals, dialogue double-spaced, every scene on a new page, scenes lettered.',
    kinds: ['scene', 'action', 'character', 'paren', 'dialogue', 'transition', 'act', 'endact'],
    next: FILM_NEXT, tab: FILM_TAB, base: 'action', breakBefore: ['act', 'scene'],
    start: [['act', 'ACT ONE'], ['scene', '']],
    css: {
      scene: 'text-decoration:underline',
      action: 'text-transform:uppercase',
      dialogue: 'line-height:2',
      paren: 'margin-left:26.67%',
    },
  },
  stage: {
    label: 'Stage Play', note: 'Theatre: ACT and SCENE centred, names centred, dialogue the whole width, stage directions indented in italics.',
    kinds: ['act', 'scene', 'action', 'character', 'paren', 'dialogue', 'transition'],
    labels: { scene: 'Scene', action: 'Stage Direction' },
    next: { act: 'scene', scene: 'action', action: 'character', character: 'dialogue', paren: 'dialogue', dialogue: 'character', transition: 'scene', general: 'general', endact: 'act' },
    tab: ['character', 'action', 'transition'], base: 'action', breakBefore: ['act'],
    start: [['act', 'ACT ONE'], ['scene', 'SCENE 1'], ['action', '']],
    css: {
      act: 'text-align:center;text-decoration:underline',
      scene: 'text-align:center;margin-top:24pt',
      action: 'margin-left:33.33%;font-style:italic',
      character: 'margin-left:0;text-align:center',
      paren: 'margin-left:16.67%;width:auto;font-style:italic',
      dialogue: 'margin-left:0;width:auto',
      transition: 'text-align:right',
    },
  },
  musical: {
    label: 'Musical', note: 'A stage play with songs: lyrics in capitals, indented, line by line.',
    kinds: ['act', 'scene', 'action', 'character', 'paren', 'dialogue', 'lyric', 'transition'],
    labels: { scene: 'Scene', action: 'Stage Direction' },
    next: { act: 'scene', scene: 'action', action: 'character', character: 'dialogue', paren: 'dialogue', dialogue: 'character', lyric: 'lyric', transition: 'scene', general: 'general', endact: 'act' },
    tab: ['character', 'action', 'transition'], tabDialogue: 'lyric', base: 'action', breakBefore: ['act'],
    start: [['act', 'ACT ONE'], ['scene', 'SCENE 1'], ['action', '']],
    css: {
      act: 'text-align:center;text-decoration:underline',
      scene: 'text-align:center;margin-top:24pt',
      action: 'margin-left:33.33%;font-style:italic',
      character: 'margin-left:0;text-align:center',
      paren: 'margin-left:16.67%;width:auto;font-style:italic',
      dialogue: 'margin-left:0;width:auto',
      lyric: 'margin:0 0 0 16.67%;text-transform:uppercase',
      transition: 'text-align:right',
    },
  },
  audio: {
    label: 'Audio Drama / Podcast', note: 'For the ear: names at the left, sound effects and music as their own lines, underlined.',
    kinds: ['scene', 'action', 'character', 'paren', 'dialogue', 'sound', 'music', 'transition'],
    labels: { action: 'Description' },
    next: { scene: 'action', action: 'character', character: 'dialogue', paren: 'dialogue', dialogue: 'character', sound: 'character', music: 'character', transition: 'scene', general: 'general' },
    tab: ['character', 'sound', 'music', 'action'], base: 'action',
    start: [['scene', '']],
    css: {
      character: 'margin-left:0',
      paren: 'margin-left:25%;width:auto',
      dialogue: 'margin-left:25%;width:auto',
      sound: 'text-transform:uppercase;text-decoration:underline',
      music: 'text-transform:uppercase;text-decoration:underline',
    },
  },
  av: {
    label: 'AV Two-Column', note: 'Commercials, music videos, documentaries: VIDEO on the left, AUDIO on the right, row by row.',
    kinds: ['scene', 'video', 'audio'],
    labels: { scene: 'Section' },
    next: { scene: 'video', video: 'audio', audio: 'video', general: 'general' },
    tab: ['video', 'audio'], base: 'video', twoCol: true,
    start: [['scene', ''], ['video', ''], ['audio', '']],
    css: {
      scene: 'grid-column:1 / -1;text-decoration:underline',
      video: 'grid-column:1;margin-top:12pt',
      audio: 'grid-column:2;margin-top:12pt',
      general: 'grid-column:1 / -1',
    },
  },
  comic: {
    label: 'Comic / Graphic Novel', note: 'PAGE and PANEL, what each panel shows, then who speaks, captions and sound effects.',
    kinds: ['page', 'panel', 'action', 'character', 'dialogue', 'caption', 'sound'],
    labels: { action: 'Panel Description', sound: 'SFX' },
    next: { page: 'panel', panel: 'action', action: 'character', character: 'dialogue', dialogue: 'character', caption: 'character', sound: 'character', general: 'general', paren: 'dialogue' },
    tab: ['character', 'caption', 'sound', 'action', 'panel'], base: 'action', breakBefore: ['page'],
    start: [['page', 'PAGE ONE'], ['panel', 'PANEL 1'], ['action', '']],
    css: {
      character: 'margin-left:16.67%',
      dialogue: 'margin-left:33.33%;width:auto',
      caption: 'margin-left:16.67%;text-transform:uppercase',
      sound: 'margin-left:16.67%;text-transform:uppercase',
    },
  },
};
export const FORMAT_LIST = Object.keys(FORMATS);

// the rules every format shares for the kinds that are not the film's own
const COMMON = {
  act: 'text-align:center;text-transform:uppercase;text-decoration:underline;margin-top:0',
  endact: 'text-align:center;text-transform:uppercase;text-decoration:underline;margin-top:24pt',
  lyric: 'margin:0 0 0 16.67%;text-transform:uppercase',
  sound: 'text-transform:uppercase',
  music: 'text-transform:uppercase',
  video: '',
  audio: '',
  page: 'text-transform:uppercase;font-weight:700;text-decoration:underline;margin-top:0',
  panel: 'text-transform:uppercase;font-weight:700;margin-top:24pt',
  caption: 'text-transform:uppercase',
};

export const fmtOf = (script) => FORMATS[script?.settings?.format] ? script.settings.format : 'film';
export const formatOf = (script) => FORMATS[fmtOf(script)];
// the kinds of a format with their labels and shortcuts (1, 2, … in order; 0 is always Unformatted Text)
export function kindsOf(script){
  const f = formatOf(script);
  return [...f.kinds.map((k, i) => [k, f.labels?.[k] || KINDS[k], String(i + 1)]), ['general', KINDS.general, '0']];
}
export const labelOf = (script, t) => formatOf(script).labels?.[t] || KINDS[t] || 'Action';
export const nextOf = (script, t) => formatOf(script).next[t] || formatOf(script).base;
export function tabOf(script, t, back = false){
  const f = formatOf(script);
  if (t === 'dialogue') return back ? 'character' : (f.tabDialogue || (f.kinds.includes('paren') ? 'paren' : 'character'));
  if (t === 'lyric') return back ? 'dialogue' : 'paren';
  if (t === 'paren') return 'dialogue';
  const c = f.tab, i = c.indexOf(t);
  return c[(i + (back ? c.length - 1 : 1)) % c.length] || f.base;
}
// the kinds a new page starts at (a TV act, a sitcom's every scene, a comic's page)
export const breaksBefore = (script) => formatOf(script).breakBefore || [];

/* The page's rules as CSS, for the editor (scope '.paper', lines p[data-t=…]) and for the PDF (scope '.rwprint',
   lines .p.…). Film needs none: its rules are the base ones in styles.css and print.js. */
export function formatCSS(scope, line){
  let css = '';
  for (const [k, f] of Object.entries(FORMATS)){
    const rules = { ...COMMON, ...(f.css || {}) };
    for (const [t, r] of Object.entries(rules)) if (r) css += `${scope}[data-fmt=${k}] ${line(t)}{${r}}\n`;
  }
  // AV: the text in two columns
  css += `${scope}[data-fmt=av] .script,${scope}[data-fmt=av] .body{display:grid;grid-template-columns:1fr 1fr;column-gap:.35in;align-content:start}\n`;
  css += `${scope}[data-fmt=av] ${line('video')},${scope}[data-fmt=av] ${line('audio')}{width:auto!important;margin-left:0!important}\n`;
  return css;
}

// how a new script in this format begins
export const startOf = (fmt) => (FORMATS[fmt] || FORMATS.film).start;
