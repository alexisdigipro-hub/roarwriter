/* RoarMe's Supabase (RoarWriter signs in with RoarMe accounts, like Roardino), spoken to with plain fetch so the
   app needs no library: Auth for the account, the roarwriter_scripts table for the scripts (row-level security:
   the owner and the people it is shared with, roarwriter_shares), and the Edge Function roarwriter-ai. The publishable key is public by design. */
export const SB_URL = 'https://bzmjhbnwhdwmncxkqkdl.supabase.co';
export const SB_KEY = 'sb_publishable_7mQ3e0NH5lCmdoIKx2-FUA_EgCoXx9X';
const KEY = 'roarwriter-auth';

let session = (() => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } })();
const listeners = new Set();
export const onAuth = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
function setSession(s){
  session = s && s.access_token ? { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600), user: s.user || session?.user || null } : null;
  try { session ? localStorage.setItem(KEY, JSON.stringify(session)) : localStorage.removeItem(KEY); } catch {}
  listeners.forEach((fn) => fn(session));
}
export const currentUser = () => session?.user || null;

async function call(path, { method = 'GET', body, token, headers = {} } = {}){
  const res = await fetch(SB_URL + path, {
    method,
    headers: { apikey: SB_KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok){
    const msg = (data && (data.msg || data.message || data.error_description || data.error)) || `Error ${res.status}`;
    const e = new Error(msg); e.status = res.status; throw e;
  }
  return data;
}

const AUTH_ERRORS = [
  [/invalid login credentials/i, 'Wrong email or password.'],
  [/email not confirmed/i, 'Confirm your email first: open the link we sent you.'],
  [/already registered|already exists/i, 'There is already an account with this email. Sign in instead.'],
  [/password should be at least/i, 'The password needs at least 6 characters.'],
  [/rate limit|too many/i, 'Too many tries. Wait a minute and try again.'],
];
export const authMessage = (e) => { const m = e?.message || ''; for (const [re, t] of AUTH_ERRORS) if (re.test(m)) return t; return /fetch|network/i.test(m) ? 'No connection. Check the internet and try again.' : m || 'Something went wrong.'; };

export async function signIn(email, password){ setSession(await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } })); return session; }
export async function signUp(email, password, name){
  const d = await call('/auth/v1/signup', { method: 'POST', body: { email, password, data: { name } } });
  if (d?.access_token) setSession(d);
  return d;
}
export const recover = (email) => call('/auth/v1/recover', { method: 'POST', body: { email } });
export async function signOut(){ try { if (session) await call('/auth/v1/logout', { method: 'POST', token: session.access_token }); } catch {} setSession(null); }

let refreshing = null;
export async function token(){
  if (!session) return null;
  if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
  refreshing ||= call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } })
    .then((s) => { setSession(s); return session.access_token; })
    .catch((e) => { if (e.status === 400 || e.status === 401) setSession(null); throw e; })
    .finally(() => { refreshing = null; });
  return refreshing;
}

const rest = async (path, opts = {}) => call('/rest/v1/' + path, { ...opts, token: await token() });

// the scripts: the list without their text (with who owns each and what the person may do), one in full, how
// new it is, a save (insert or update; the server gives the time), a delete
const q = (v) => encodeURIComponent(v);
export async function listScripts(){
  try { return await rest('rpc/roarwriter_list', { method: 'POST', body: {} }); }
  catch (e) { if (e.status !== 404) throw e; } // before supabase/roarwriter.sql's Collaborate part is run
  return (await rest('roarwriter_scripts?select=id,title,meta,updated_at&order=updated_at.desc')).map((r) => ({ ...r, role: 'owner', owner_name: '' }));
}
export const getScript = async (id) => (await rest(`roarwriter_scripts?id=eq.${q(id)}&select=id,title,meta,data,updated_at`))[0] || null;
export const getStamp = async (id) => (await rest(`roarwriter_scripts?id=eq.${q(id)}&select=updated_at`))[0]?.updated_at || null;
export const saveScript = async (row) => (await rest('roarwriter_scripts?on_conflict=id&select=updated_at', { method: 'POST', body: row, headers: { Prefer: 'resolution=merge-duplicates,return=representation' } }))?.[0]?.updated_at || null;
export const deleteScript = (id) => rest(`roarwriter_scripts?id=eq.${q(id)}`, { method: 'DELETE' });

// Collaborate: who a script is shared with (the owner sees everyone, the others only themselves)
export async function myRole(id){ try { const r = await rest('rpc/roarwriter_role', { method: 'POST', body: { p_script: id } }); return ['owner', 'edit', 'view'].includes(r) ? r : 'owner'; } catch { return 'owner'; } }
export const listShares = (id) => rest(`roarwriter_shares?script_id=eq.${q(id)}&select=email,role,created_at&order=created_at`);
export const addShare = (id, email, role) => rest('roarwriter_shares?on_conflict=script_id,email', { method: 'POST', body: { script_id: id, email: email.trim().toLowerCase(), role }, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
export const setShareRole = (id, email, role) => rest(`roarwriter_shares?script_id=eq.${q(id)}&email=eq.${q(email)}`, { method: 'PATCH', body: { role }, headers: { Prefer: 'return=minimal' } });
export const removeShare = (id, email) => rest(`roarwriter_shares?script_id=eq.${q(id)}&email=eq.${q(email)}`, { method: 'DELETE' });

// the AI, through the Edge Function (the API key lives there, never in the app)
export async function askAI(payload){
  const t = await token();
  if (!t) throw new Error('Sign in to use the AI.');
  return call('/functions/v1/roarwriter-ai', { method: 'POST', body: payload, token: t });
}

/* Versions (Oct 2026): named copies of a script kept in the account (roarwriter_versions), for everyone it is
   shared with; before supabase/roarwriter.sql's Versions part is run the app keeps them on this device instead */
export const listVersions = (id) => rest(`roarwriter_versions?script_id=eq.${q(id)}&select=id,name,meta,by_name,created_at&order=created_at.desc&limit=200`);
export const getVersion = async (vid) => (await rest(`roarwriter_versions?id=eq.${q(vid)}&select=id,name,data,meta,by_name,created_at`))[0] || null;
export const addVersion = async (row) => (await rest('roarwriter_versions?select=id,created_at', { method: 'POST', body: row, headers: { Prefer: 'return=representation' } }))?.[0] || null;
export const deleteVersion = (vid) => rest(`roarwriter_versions?id=eq.${q(vid)}`, { method: 'DELETE' });

/* Storyboard pictures (bucket roarwriter-boards, a folder per script): sent with the account's token and read
   back the same way, so only the people the script is shared with see them */
export async function putBoardImage(path, blob){
  const res = await fetch(`${SB_URL}/storage/v1/object/roarwriter-boards/${path}`, { method: 'POST', headers: { apikey: SB_KEY, Authorization: `Bearer ${await token()}`, 'Content-Type': blob.type || 'image/jpeg', 'x-upsert': 'true' }, body: blob });
  if (!res.ok){ const e = new Error(`Error ${res.status}`); e.status = res.status; throw e; }
}
export async function getBoardImage(path){
  const res = await fetch(`${SB_URL}/storage/v1/object/authenticated/roarwriter-boards/${path}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${await token()}` } });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.blob();
}
export async function removeBoardImage(path){
  try { await fetch(`${SB_URL}/storage/v1/object/roarwriter-boards`, { method: 'DELETE', headers: { apikey: SB_KEY, Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [path] }) }); } catch {}
}
