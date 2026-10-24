// RoarWriter's AI (Edge Function roarwriter-ai, in RoarMe's Supabase project). The app sends what is asked (the scene
// with the cursor, or the whole script for questions, coverage, continuity, pacing, the beats, the budget pass, the
// pitch pack; a batch of lines to translate, dictated words to lay out, a question for the research desk, which
// searches the web); this asks Claude and sends back the answer: Fountain when it is script, JSON when the app
// draws it, plain text otherwise. Only a signed-in RoarMe account may ask. The Anthropic API key is
// the function's secret ANTHROPIC_API_KEY (Supabase > Edge Functions > Secrets), never in the app.
import Anthropic from 'npm:@anthropic-ai/sdk'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

const SYSTEM = `You are RoarWriter's writing partner, inside a screenwriting app used by working film directors and screenwriters.
You help with the scene the writer is on: dialogue, rewrites, what could come next, notes.

Rules:
- When you write script (dialogue, a rewritten scene, the next beat), answer ONLY in Fountain screenplay format, nothing before or after it: scene headings on their own line (INT./EXT. or, in Greek, ΕΣΩΤ./ΕΞΩΤ.), action as plain paragraphs, CHARACTER NAMES in capitals on their own line with their dialogue on the next lines, parentheticals in (brackets) under the name, transitions in capitals ending in TO:. Put a blank line between elements. No markdown, no code fences, no commentary.
- When asked for ideas or notes, answer in short plain paragraphs or a short list, in plain text.
- Write in the language of the script (Greek scripts in natural, modern Greek; English ones in English), keep the characters' names exactly as they are, and match the tone and voice of what is already written.
- Show, don't explain. Keep dialogue speakable and lean; leave room for the actors.`

// the whole-script tasks: a reader's eye on the script as it is. The script comes with its scenes numbered [12].
const READER = `You are a senior script reader and story editor working inside RoarWriter, a screenwriting app. You read the whole script you are given, carefully, and answer only from it. The script's scenes are numbered like [12]; when you refer to a scene, use its number. Answer in the language you are told to.`

const TASKS: Record<string, { system?: string, ask: string, json?: boolean, whole?: boolean }> = {
  dialogue: { ask: 'Suggest dialogue for this scene: continue the exchange from where it stands, a few lines, with the characters already in it. Script only.' },
  rewrite: { ask: 'Rewrite this scene so it plays better: sharper dialogue, clearer action, same story beats and characters. Give the whole scene, heading included. Script only.' },
  continue: { ask: 'Write what comes right after this scene: the next beat or scene, consistent with the story so far. Script only.' },
  ideas: { ask: 'Give notes and ideas on this scene: what works, what could be stronger, three directions it could take. Plain text, short.' },
  custom: { ask: 'Do what the writer asks below. If it calls for script, answer in Fountain only; if it is a question, answer in plain text.' },
  // a question about the whole script
  ask: { system: READER, whole: true, ask: 'Answer the writer\'s question about this script, briefly and precisely, citing the scenes as [12]. If the script does not say, say so. Plain text.' },
  // what does not hold together
  continuity: { system: READER, whole: true, json: true, ask: 'Find continuity problems: a character who knows something before they learn it, a prop or wound that changes or comes back after it is gone, time of day or weather that does not follow (CONTINUOUS after a different time), ages, names spelt two ways, a character in two places at once, threads that are set up and never paid off. Only real problems you can point to. Answer ONLY with JSON: {"issues":[{"scene":12,"kind":"knowledge|props|time|names|place|setup|other","text":"what is wrong, in one or two sentences","also":[3]}]} with at most 30 issues, most important first.' },
  // the reader's report
  coverage: { system: READER, whole: true, json: true, ask: 'Write professional script coverage. Answer ONLY with JSON: {"logline":"","genre":"","tone":"","synopsis":"one paragraph","structure":[{"beat":"inciting incident / act break / midpoint / climax…","scene":12,"note":""}],"characters":[{"name":"","role":"","arc":""}],"strengths":[""],"weaknesses":[""],"notes":[""],"scores":{"premise":7,"structure":6,"characters":7,"dialogue":6,"pacing":6,"originality":7,"marketability":6},"verdict":"PASS|CONSIDER|RECOMMEND","why":"two sentences"}' },
  // the tension of every scene
  pacing: { system: READER, whole: true, json: true, ask: 'Rate the dramatic tension of every scene from 1 (calm) to 10 (highest), with what drives it. Answer ONLY with JSON: {"scenes":[{"scene":1,"tension":4,"note":"a few words"}],"summary":"two or three sentences on the rhythm of the whole, and where it sags"}' },
  // the funding / pitch package
  package: { system: READER, whole: true, json: true, ask: 'Write the material a director needs to pitch this script or apply for funding (a film fund, a co-production market). Answer ONLY with JSON: {"title":"","logline":"","tagline":"","short":"a synopsis of one paragraph","long":"a synopsis of about 500 words","treatment":"a treatment in the present tense, about 1200 words, scene by scene in prose","characters":[{"name":"","bio":"three or four sentences"}],"statement":"a first draft of the director\'s statement in the first person, about 300 words: why this story, why now, how it will be told","themes":[""],"audience":"who it is for","comparables":["two or three films or series it sits beside, with year"]}' },
  // what makes the script expensive to shoot, and how to keep what it gives for less (Alex, 25 Oct)
  budget: { system: READER, whole: true, json: true, ask: 'You are also an experienced line producer of independent films (think a European or Greek indie budget). Find what makes this script expensive to shoot: night exteriors, crowds and extras, rain, snow, fire, water, stunts, vehicles in motion, animals, children, period settings and costumes, many locations used once, VFX, weapons, specific famous places, music rights, big company moves. For each, say why it costs and a cheaper way to get the same story value. Answer ONLY with JSON: {"summary":"three sentences on how big a shoot this is and where the money goes","level":"micro|low|medium|high","items":[{"scene":12,"what":"night exterior on a moving truck","kind":"night|crowd|weather|stunt|vehicle|animal|child|period|location|vfx|weapon|rights|other","cost":"low|mid|high","why":"one sentence","cheaper":"one or two sentences: the alternative and what it keeps"}],"locations":"one sentence on how the locations could be grouped or merged"} with at most 40 items, most expensive first.' },
  // the story's beats: which scene is each one (the beats' names come as the writer's request, split by |)
  beats: { system: READER, whole: true, json: true, ask: 'For each beat named in the writer\'s request (separated by |), find the scene where it happens in this script, or leave it out if the script has no such beat. Answer ONLY with JSON: {"beats":[{"name":"the beat exactly as named","scene":12,"note":"one sentence: what happens there"}]}' },
  // a scene as shots, for the storyboard
  shots: { json: true, ask: 'Break this scene into the shots a director would storyboard. Answer ONLY with JSON: {"shots":[{"size":"WS|MS|MCU|CU|ECU|OTS|INSERT|POV|2S","angle":"eye level|high|low|overhead|dutch","move":"static|pan|tilt|dolly in|dolly out|tracking|handheld|crane|steadicam","desc":"what we see, in one or two sentences"}]} with between 3 and 14 shots.' },
  // words said aloud, laid out as a script
  format: { ask: 'The writer dictated the text below out loud. Lay it out as screenplay elements in Fountain, keeping their words (only fix what speech recognition got wrong, add punctuation, put names in capitals); "scene", "interior", "exterior", "εσωτερικό", "εξωτερικό" start a scene heading, a name followed by what they say is dialogue. Script only.' },
}

async function ask(system: string, user: string, effort = 'medium'){
  const msg = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    output_config: { effort },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    messages: [{ role: 'user', content: user }],
  } as any)
  if (msg.stop_reason === 'refusal') throw Object.assign(new Error('refusal'), { refusal: true })
  return msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n').trim()
}

// a batch of lines in another language, kind by kind
function translate(b: any){
  const items = Array.isArray(b.items) ? b.items.slice(0, 400) : []
  const to = b.to === 'el' ? 'Greek (natural, modern, as Greek actors speak)' : 'English (natural, as English-speaking actors speak)'
  return ask(`You translate screenplays for co-productions and funding applications. Keep the meaning, the subtext and each character's voice; scene headings and transitions as the industry writes them in the target language (INT./EXT. or ΕΣΩΤ./ΕΞΩΤ., DAY/NIGHT or ΜΕΡΑ/ΝΥΧΤΑ); character names transliterated the same way every time; parentheticals stay in brackets.`,
    `${b.glossary ? `Write these names exactly like this every time: ${String(b.glossary).slice(0, 4000)}\n\n` : ''}Translate every "x" into ${to}. Answer ONLY with a JSON array of strings, one for each item, in the same order, exactly ${items.length} of them.\n\n${JSON.stringify(items.map((e: any) => ({ t: String(e.t), x: String(e.x).slice(0, 4000) })))}`, 'low')
}

// a question for the research desk: answered from the web, with its sources (Alex, 25 Oct)
async function research(b: any){
  const lang = b.answer === 'el' ? 'Greek' : 'English'
  const messages: any[] = [{ role: 'user', content: [
    b.title ? `I am writing the script "${String(b.title).slice(0, 200)}".` : '',
    b.scene ? `The scene I am on:\n${String(b.scene).slice(-6000)}` : '',
    `My question: ${String(b.prompt || '').slice(0, 4000)}`,
    `Answer in ${lang}: precise and practical for a screenwriter (what is true, what details would make the scene authentic, what to avoid), a few short paragraphs. Search the web for it.`,
  ].filter(Boolean).join('\n\n') }]
  let text = '', sources: { title: string, url: string }[] = []
  // the search may pause a long turn: it goes on from where it stopped, a few times at most
  for (let k = 0; k < 4; k++){
    const msg: any = await client.beta.messages.create({
      model: 'claude-opus-5-5', max_tokens: 16000, output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      system: 'You are the research desk of RoarWriter, a screenwriting app. You find facts for writers (law, medicine, police procedure, history, places, technology, how people really talk in a job) and say clearly what you could not confirm.',
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
      messages,
    } as any)
    if (msg.stop_reason === 'refusal') throw Object.assign(new Error('refusal'), { refusal: true })
    for (const c of msg.content){
      if (c.type === 'text'){ text += c.text; for (const cit of c.citations || []) if (cit.url && !sources.some((x) => x.url === cit.url)) sources.push({ title: cit.title || cit.url, url: cit.url }) }
    }
    if (msg.stop_reason !== 'pause_turn') break
    messages.push({ role: 'assistant', content: msg.content })
  }
  return { text: text.trim(), sources: sources.slice(0, 12) }
}

// the JSON in an answer, whatever is around it
function json(text: string){
  const t = text.replace(/^```[a-z]*\n?|```\s*$/gm, '').trim()
  const a = Math.min(...['{', '['].map((c) => { const i = t.indexOf(c); return i < 0 ? Infinity : i }))
  const z = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'))
  return JSON.parse(a === Infinity ? t : t.slice(a, z + 1))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405)
  try {
    // a signed-in RoarMe account, checked with Supabase Auth
    const auth = req.headers.get('Authorization') || ''
    const who = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, { headers: { Authorization: auth, apikey: Deno.env.get('SUPABASE_ANON_KEY') || '' } })
    if (!who.ok) return reply({ error: 'Sign in again to use the AI.' }, 401)

    const b = await req.json().catch(() => ({}))
    if (b.task === 'translate'){
      try { const out = json(await translate(b)); return reply({ items: Array.isArray(out) ? out : [] }) }
      catch (e) { if ((e as any)?.refusal) throw e; return reply({ error: 'The translation came back in a way RoarWriter could not read. Try again.' }, 502) }
    }
    if (b.task === 'research'){
      if (!String(b.prompt || '').trim()) return reply({ error: 'Write the question first.' }, 400)
      return reply(await research(b))
    }
    const task = TASKS[b.task] ? b.task : 'custom'
    const T = TASKS[task]
    const cut = (s: unknown, n: number) => String(s || '').slice(-n)
    const lang = b.lang === 'el' ? 'Greek' : 'English'
    const answerIn = b.answer === 'el' ? 'Greek' : b.answer === 'en' ? 'English' : lang
    let user: string
    if (T.whole){
      const script = String(b.script || '').slice(0, 600000)
      if (!script.trim()) return reply({ error: 'Write something first.' }, 400)
      user = [
        `Script: ${String(b.title || 'Untitled').slice(0, 200)} (written in ${lang}${b.format ? `, ${String(b.format).slice(0, 60)}` : ''})`,
        `Answer in ${answerIn}.`,
        `The script:\n${script}`,
        `Task: ${T.ask}`,
        b.prompt ? `The writer asks: ${String(b.prompt).slice(0, 4000)}` : '',
      ].filter(Boolean).join('\n\n')
    } else {
      const scene = cut(b.scene, 20000)
      if (!scene.trim() && !String(b.prompt || '').trim()) return reply({ error: 'Write something in the scene first.' }, 400)
      user = [
        `Script: ${String(b.title || 'Untitled').slice(0, 200)} (written in ${lang})`,
        b.format ? `Format: ${String(b.format).slice(0, 60)} (write in this format's conventions: a stage play has stage directions and no camera, a sitcom is multi-camera, an AV script pairs VIDEO and AUDIO)` : '',
        Array.isArray(b.characters) && b.characters.length ? `Characters so far: ${b.characters.slice(0, 40).join(', ')}` : '',
        b.before ? `What comes before the scene (for context):\n${cut(b.before, 12000)}` : '',
        task === 'format' ? `What was dictated:\n${scene}` : `The scene:\n${scene || '(empty)'}`,
        `Task: ${T.ask}`,
        b.prompt ? `The writer asks: ${String(b.prompt).slice(0, 4000)}` : '',
      ].filter(Boolean).join('\n\n')
    }
    const text = (await ask(T.system || SYSTEM, user)).replace(/^```[a-z]*\n?|```\s*$/gm, '').trim()
    if (T.json){
      try { return reply({ data: json(text) }) } catch { return reply({ error: 'The AI answered in a way RoarWriter could not read. Try again.' }, 502) }
    }
    return reply({ text })
  } catch (e) {
    if ((e as any)?.refusal) return reply({ error: 'The AI would not write this one. Try asking another way.' }, 422)
    if (e instanceof Anthropic.RateLimitError) return reply({ error: 'The AI is busy. Try again in a minute.' }, 429)
    if (e instanceof Anthropic.AuthenticationError) return reply({ error: 'The AI is not set up yet (its key is missing).' }, 500)
    if (e instanceof Anthropic.APIError) return reply({ error: `The AI did not answer (${e.status}).` }, 502)
    return reply({ error: 'The AI did not answer. Try again.' }, 500)
  }
})
