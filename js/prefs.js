/* What each person sets for themselves on this device (Settings > Writing and Look), kept in localStorage; what
   belongs to a script (its format, page, scene numbers, PDF) is in the script's own settings and travels with it. */

const KEY = 'rw_prefs';
const DEFAULTS = {
  page: 'white',        // the page: white, sepia, midnight (white letters on a dark page)
  typewriter: false,    // the line being written stays in the middle of the window
  focus: false,         // every scene but the one being written is faded
  suggest: true,        // names, places and times suggested while typing
  spell: true,          // spelling
  breaks: true,         // the edge between the pages
  readAction: true,     // reading aloud reads the action too, not only the dialogue
  readRate: 1,          // how fast it reads
  format: 'film',       // the format a new script is offered first
  pageSize: 'a4',       // a new script's page, its title page's author, credit and contact, and its scene numbers
  author: '', credit: '', contact: '', sceneNumbers: 'off',
};

let prefs = (() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; } })();
const listeners = new Set();

export const pref = (k) => prefs[k];
export function setPref(k, v){
  prefs = { ...prefs, [k]: v };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {}
  apply();
  listeners.forEach((fn) => fn(k, v));
}
export const onPref = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

// what shows on the whole document
export function apply(){
  const d = document.documentElement.dataset;
  d.pageTheme = prefs.page;
  d.typewriter = prefs.typewriter ? '1' : '';
  d.focus = prefs.focus ? '1' : '';
  d.breaks = prefs.breaks ? '1' : '0';
}
apply();
