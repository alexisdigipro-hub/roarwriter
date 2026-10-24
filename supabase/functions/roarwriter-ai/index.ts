// RoarWriter's AI (Edge Function roarwriter-ai, in RoarMe's Supabase project). The app sends the scene with the
// cursor (as Fountain), a little of what comes before it, the characters and what is asked; this asks Claude and
// sends back the answer, as Fountain when it is script. Only a signed-in RoarMe account may ask. The Anthropic API
// key is the function's secret ANTHROPIC_API_KEY (Supabase > Edge Functions > Secrets), never in the app.
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

const TASKS: Record<string, string> = {
  dialogue: 'Suggest dialogue for this scene: continue the exchange from where it stands, a few lines, with the characters already in it. Script only.',
  rewrite: 'Rewrite this scene so it plays better: sharper dialogue, clearer action, same story beats and characters. Give the whole scene, heading included. Script only.',
  continue: 'Write what comes right after this scene: the next beat or scene, consistent with the story so far. Script only.',
  ideas: 'Give notes and ideas on this scene: what works, what could be stronger, three directions it could take. Plain text, short.',
  custom: 'Do what the writer asks below. If it calls for script, answer in Fountain only; if it is a question, answer in plain text.',
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
    const task = TASKS[b.task] ? b.task : 'custom'
    const cut = (s: unknown, n: number) => String(s || '').slice(-n)
    const scene = cut(b.scene, 20000)
    if (!scene.trim() && !String(b.prompt || '').trim()) return reply({ error: 'Write something in the scene first.' }, 400)
    const lang = b.lang === 'el' ? 'Greek' : 'English'
    const user = [
      `Script: ${String(b.title || 'Untitled').slice(0, 200)} (written in ${lang})`,
      b.format ? `Format: ${String(b.format).slice(0, 60)} (write in this format's conventions: a stage play has stage directions and no camera, a sitcom is multi-camera, an AV script pairs VIDEO and AUDIO)` : '',
      Array.isArray(b.characters) && b.characters.length ? `Characters so far: ${b.characters.slice(0, 40).join(', ')}` : '',
      b.before ? `What comes before the scene (for context):\n${cut(b.before, 12000)}` : '',
      `The scene:\n${scene || '(empty)'}`,
      `Task: ${TASKS[task]}`,
      b.prompt ? `The writer asks: ${String(b.prompt).slice(0, 4000)}` : '',
    ].filter(Boolean).join('\n\n')

    const msg = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: user }],
    } as any)
    if (msg.stop_reason === 'refusal') return reply({ error: 'The AI would not write this one. Try asking another way.' }, 422)
    const text = msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n').replace(/^```[a-z]*\n?|```\s*$/gm, '').trim()
    return reply({ text })
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return reply({ error: 'The AI is busy. Try again in a minute.' }, 429)
    if (e instanceof Anthropic.AuthenticationError) return reply({ error: 'The AI is not set up yet (its key is missing).' }, 500)
    if (e instanceof Anthropic.APIError) return reply({ error: `The AI did not answer (${e.status}).` }, 502)
    return reply({ error: 'The AI did not answer. Try again.' }, 500)
  }
})
