# RoarWriter

Screenwriting in the industry format, in English or Greek. The Mad Lions Lab.

- **Web**: https://alexisdigipro-hub.github.io/roarwriter/
- **Mac and Windows**: the latest release, [Mac (Apple Silicon)](https://github.com/alexisdigipro-hub/roarwriter/releases/latest/download/RoarWriter-Mac-arm64.dmg) · [Mac (Intel)](https://github.com/alexisdigipro-hub/roarwriter/releases/latest/download/RoarWriter-Mac-x64.dmg) · [Windows](https://github.com/alexisdigipro-hub/roarwriter/releases/latest/download/RoarWriter-Windows-Setup.exe). First open on a Mac: right-click > Open, once.

## What it does
- **Sign in with a RoarMe account** (the same one as RoarMe and Roardino). Scripts are kept on the computer at once and in the account a second later, so they follow you to every device; writing offline works and is sent when the connection is back.
- **The page as the industry lays it out**: Scene Heading, Action, Character, Parenthetical, Dialogue, Transition, Shot, in Courier 12 with the standard margins, on A4 or US Letter.
- **Keys as in Final Draft**: Enter goes on to what usually comes next (heading > action, character > dialogue, dialogue > character), Enter on an empty line goes back to action, Tab / Shift+Tab change the kind, Cmd+1..7 pick one in the Mac/Windows app (Ctrl+1..7 in a browser, which keeps Cmd+1..9 for its tabs), 0 Unformatted Text, Shift+Enter a new line in the same element. Typing INT. / EXT. / ΕΣΩΤ. / ΕΞΩΤ. makes a scene heading by itself, and CUT TO: a transition.
- **Suggestions while you type**: the characters' names, INT./EXT. (ΕΣΩΤ./ΕΞΩΤ. in a Greek script), the places already used and the time of day (DAY, NIGHT, ΜΕΡΑ, ΝΥΧΤΑ…). Up/Down to choose, Enter or Tab to take one.
- **Scenes and characters** at the side: the scenes numbered (click to go there; the one you are in is lit), the characters with how many times they speak and in how many scenes.
- **Zoom**: on a computer − 100% + in the bar, Cmd/Ctrl + and −, Cmd/Ctrl+Shift+0 for actual size, or a pinch on the trackpad; on a phone a pinch or ⋯ > Zoom.
- **Pages as they will print**: the script shows the edge between two sheets where each page starts, with its number, as the PDF lays them out (a heading never left at the foot of a page).
- **Title page** on the page itself, as Final Draft lays it out: the title and the episode underlined, Written by and the author, and at the foot the copyright, the draft and the contact (click and type; empty lines do not print). The Title page window also sets the page size.
- **Breakdown**: select a word or phrase and right-click it (on a phone: select, then Tag) to tag it as Cast, Extras, Props, Locations, Wardrobe, Makeup & Hair, Vehicles, Animals, Special Effects, Stunts, Sound & Music or Set Dressing; every place it appears is lit in its colour. The Breakdown button shows it by scene (INT/EXT, location, time, who and what) or by element (with its scenes), and saves it as CSV. Cast and locations come from the script by themselves.
- **Export**: PDF ready to send (title page, numbered pages from 2, no scene heading or name left alone at the foot of a page), **Final Draft** (.fdx) and **Fountain**. **Import** .fdx and .fountain from the library. Pasting a screenplay as text turns it into elements.
- **AI** (the AI button, Cmd/Ctrl+Shift+A): on the scene with the cursor, Suggest dialogue, Rewrite scene, What comes next, Ideas & notes, or ask anything. The answer is shown first; nothing changes until Insert (after the cursor) or Replace scene.
- **Collaborate** (Share): invite people by email (their RoarMe account) to edit or only to view; the owner changes a role or removes someone, anyone shared with can leave. Several people write in the same script: the others' changes come in within a few seconds, and changes to different lines never overwrite each other. Shared scripts show who owns them in the list.
- **On a phone or tablet** (the web version): the page fills the screen in letters big enough to write in (the PDF keeps the real page), a bar on the keyboard with the seven kinds and Undo / Redo (there is no Tab there), Scenes and characters and the AI over the whole screen, one menu (⋯) for the zoom, the title page and the exports; two fingers on the page zoom it (the lines wrap again), the scripts as a list. Add it to the home screen (Share > Add to Home Screen) and it opens like an app.
- **The Mac/Windows app** adds a real menu (File: Title Page, Export PDF, Save as Final Draft / Fountain; Format: the seven kinds with their shortcuts), Greek and English spelling, and updates itself from new releases.

## Set up (once)
1. Supabase (RoarMe's project) > SQL Editor: run `supabase/roarwriter.sql`.
2. Supabase > Edge Functions: deploy `supabase/functions/roarwriter-ai`; in Edge Functions > Secrets add `ANTHROPIC_API_KEY`.
