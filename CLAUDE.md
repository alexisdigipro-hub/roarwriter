# RoarWriter · instructions for Claude Code

RoarWriter is the screenwriting app of The Mad Lions Lab (Alex Konstantinidis, film director, Athens; not a developer).
Talk to him in Greek, friendly and concrete, no em dashes; the app's own text is English. Scripts can be English or Greek.

- **One code, two places**: `app/` is the whole app (plain HTML, CSS and ES modules, no build step, no dependencies). The
  web version is `app/` itself on GitHub Pages (gh-pages branch, https://alexisdigipro-hub.github.io/roarwriter/); the
  Mac/Windows app (Electron, `electron/`) carries `app/` inside it and serves it as `app://rw/` (works offline).
- **Accounts and data**: RoarMe's Supabase project (bzmjhbnwhdwmncxkqkdl), RoarMe accounts (as Roardino). Only the
  table `roarwriter_scripts` (supabase/roarwriter.sql, owner-only RLS) and the Edge Function `roarwriter-ai`; never
  touch RoarMe's `roar_*` tables. Collaborate (24 Oct): roarwriter_shares (by email, edit/view), roarwriter_role(),
  roarwriter_list(); store.js keeps a base copy per script and merges (model.js mergeScripts) before sending and when polling. Every database change goes in supabase/roarwriter.sql, safe to run again.
  `app/js/cloud.js` talks to Supabase with plain fetch (no library). Local first: `app/js/store.js` keeps every script
  in localStorage at once and sends it a second later; offline edits wait and are sent when back online.
- **The script**: `{ title, titlePage, settings: { page: 'a4'|'letter' }, els: [{ id, t, x }] }`, t one of scene, action,
  character, paren, dialogue, transition, shot (app/js/model.js). Editor: app/js/editor.js (Enter/Tab as Final Draft,
  Cmd/Ctrl+1..7, suggestions, own undo). Fountain: fountain.js; Final Draft .fdx: fdx.js; PDF: print.js (pages laid out
  and measured in the page; Electron printToPDF, a browser prints).
- **AI**: Edge Function `supabase/functions/roarwriter-ai` (Claude, model claude-opus-5-5, server-side fallbacks). The key is the
  function's secret ANTHROPIC_API_KEY, set by Alex in Supabase > Edge Functions > Secrets; never in the repo or the app.
- **Look**: RoarMe's dark glass, round glass buttons, pill fields, soft tiles, orange accent (#ff6b2c), the page white
  in Cousine (a Courier with Greek, so both languages have the same weight; Courier Prime had no Greek).
- **Releases**: pushing to main updates the web version (.github/workflows/web.yml, which also checks the code).
  The desktop installers come from a tag `vX.Y.Z` (.github/workflows/desktop.yml): bump `version` in package.json, tag,
  push; the release's files are the download links and what the app's updater (electron/updater.js) looks at.
- Work on a branch, open a PR, wait for the green check, merge it yourself (Alex's rule for every Roar repository).
- Phones and tablets (Alex, 24 Oct): the web version under 860px (styles.css, last two blocks) has the fluid page, the kinds bar on the
  keyboard (main.js followKeyboard, visualViewport), the side and the AI over the screen; under 600px one bar with the ⋯ menu. Desktop untouched.
