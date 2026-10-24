# RoarWriter

Screenwriting in the industry format, in English or Greek. The Mad Lions Lab.

- **Web**: https://alexisdigipro-hub.github.io/roarwriter/
- **Mac and Windows**: the latest release, [Mac (Apple Silicon)](https://github.com/alexisdigipro-hub/roarwriter/releases/latest/download/RoarWriter-Mac-arm64.dmg) · [Mac (Intel)](https://github.com/alexisdigipro-hub/roarwriter/releases/latest/download/RoarWriter-Mac-x64.dmg) · [Windows](https://github.com/alexisdigipro-hub/roarwriter/releases/latest/download/RoarWriter-Windows-Setup.exe). First open on a Mac: right-click > Open, once.

## What it does
- **Sign in with a RoarMe account** (the same one as RoarMe and Roardino). Scripts are kept on the computer at once and in the account a second later, so they follow you to every device; writing offline works and is sent when the connection is back.
- **The page as the industry lays it out**: Scene Heading, Action, Character, Parenthetical, Dialogue, Transition, Shot, in Courier 12 with the standard margins, on A4 or US Letter.
- **Keys as in Final Draft**: Enter goes on to what usually comes next (heading > action, character > dialogue, dialogue > character), Enter on an empty line goes back to action, Tab / Shift+Tab change the kind, Cmd/Ctrl+1..7 pick one, Shift+Enter a new line in the same element. Typing INT. / EXT. / ΕΣΩΤ. / ΕΞΩΤ. makes a scene heading by itself, and CUT TO: a transition.
- **Suggestions while you type**: the characters' names, INT./EXT. (ΕΣΩΤ./ΕΞΩΤ. in a Greek script), the places already used and the time of day (DAY, NIGHT, ΜΕΡΑ, ΝΥΧΤΑ…). Up/Down to choose, Enter or Tab to take one.
- **Scenes and characters** at the side: the scenes numbered (click to go there; the one you are in is lit), the characters with how many times they speak and in how many scenes.
- **Title page** (title, credit, author, draft/date, contact) and the page size.
- **Export**: PDF ready to send (title page, numbered pages from 2, no scene heading or name left alone at the foot of a page), **Final Draft** (.fdx) and **Fountain**. **Import** .fdx and .fountain from the library. Pasting a screenplay as text turns it into elements.
- **AI** (the AI button, Cmd/Ctrl+Shift+A): on the scene with the cursor, Suggest dialogue, Rewrite scene, What comes next, Ideas & notes, or ask anything. The answer is shown first; nothing changes until Insert (after the cursor) or Replace scene.
- **On a phone or tablet** (the web version): the page fills the screen in letters big enough to write in (the PDF keeps the real page), a bar on the keyboard with the seven kinds and Undo / Redo (there is no Tab there), Scenes and characters and the AI over the whole screen, one menu (⋯) for the title page and the exports, the scripts as a list. Add it to the home screen (Share > Add to Home Screen) and it opens like an app.
- **The Mac/Windows app** adds a real menu (File: Title Page, Export PDF, Save as Final Draft / Fountain; Format: the seven kinds with their shortcuts), Greek and English spelling, and updates itself from new releases.

## Set up (once)
1. Supabase (RoarMe's project) > SQL Editor: run `supabase/roarwriter.sql`.
2. Supabase > Edge Functions: deploy `supabase/functions/roarwriter-ai`; in Edge Functions > Secrets add `ANTHROPIC_API_KEY`.
