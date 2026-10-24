import { deleteScript, getScript, getStamp, listScripts, saveScript } from './cloud.js';
import { mergeScripts, metaOf, normalize } from './model.js';

/* Local first: every script is kept on this computer at once (so writing never waits and works offline), then
   sent to the account a moment later; what could not be sent is retried when the connection comes back.
   Collaborate (Oct 2026): a script can be written by several people. Each copy remembers the last version it
   had from the account (its base, with the server's time); before sending, a newer version in the account is
   merged with what was written here (model.js mergeScripts), and an open script looks for the others' changes
   every few seconds. */
const k = (uid, rest) => `rw:${uid}:${rest}`;
const read = (key, d) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} };
const newer = (a, b) => !b || (a && Date.parse(a) > Date.parse(b));

export function createStore(uid){
  const index = () => read(k(uid, 'index'), {});
  const setIndex = (i) => write(k(uid, 'index'), i);
  const dirty = () => read(k(uid, 'dirty'), []);
  const setDirty = (d) => write(k(uid, 'dirty'), [...new Set(d)]);
  const local = (id) => read(k(uid, 's:' + id), null);
  const base = (id) => read(k(uid, 'b:' + id), null);
  const setBase = (id, data, updated_at) => write(k(uid, 'b:' + id), { data, updated_at });
  const timers = new Map();
  const pushing = new Map();
  let onState = () => {};
  let onRemote = () => {};

  // the account's newer version and this copy's own changes, together
  function mergeIn(id, remote){
    const row = local(id), b = base(id);
    const data = row ? mergeScripts(b?.data || remote.data, row.data, remote.data) : normalize(remote.data);
    write(k(uid, 's:' + id), { ...(row || {}), id, title: data.title || 'Untitled', meta: metaOf(data), data, updated_at: remote.updated_at, rev: (row?.rev || 0) + 1 });
    setBase(id, remote.data, remote.updated_at);
    return data;
  }

  async function push(id){
    if (pushing.get(id)) return pushing.get(id);
    const run = (async () => {
      let row = local(id);
      if (!row) return;
      try {
        const b = base(id);
        const stamp = await getStamp(id).catch(() => null);
        if (stamp && newer(stamp, b?.updated_at)){
          const remote = await getScript(id);
          if (remote){ const data = mergeIn(id, remote); onRemote(id, data); row = local(id); }
        }
        const sent = row.data, rev = row.rev;
        // the time sent is replaced by the server's own (supabase/roarwriter.sql), which is what the copies compare
        const at = await saveScript({ id, title: row.title, meta: row.meta, data: sent, updated_at: new Date().toISOString() });
        const now = local(id);
        if (at){ setBase(id, sent, at); if (now) write(k(uid, 's:' + id), { ...now, updated_at: now.rev === rev ? at : now.updated_at }); }
        // what was written while it was being sent goes in the next send
        if (!now || now.rev === rev) setDirty(dirty().filter((x) => x !== id));
        else { clearTimeout(timers.get(id)); timers.set(id, setTimeout(() => push(id), 800)); }
        onState('saved');
      } catch { onState('offline'); }
    })();
    pushing.set(id, run);
    try { await run; } finally { pushing.delete(id); }
  }

  return {
    onState: (fn) => { onState = fn; },
    // the list: the account's (with what the person may do with each), merged with what is only here so far
    async list(){
      const idx = index();
      try {
        const rows = await listScripts();
        const seen = new Set();
        for (const r of rows){
          seen.add(r.id);
          const mine = idx[r.id];
          idx[r.id] = { ...(mine || {}), id: r.id, role: r.role || 'owner', owner_name: r.owner_name || '' };
          if (!mine || newer(r.updated_at, mine.updated_at)) Object.assign(idx[r.id], { title: r.title, meta: r.meta || {}, updated_at: r.updated_at });
        }
        // gone from the account (deleted, or no longer shared) and not waiting to be sent: gone here too
        const waiting = new Set(dirty());
        for (const id of Object.keys(idx)) if (!seen.has(id) && !waiting.has(id)) this.forget(id, idx);
        setIndex(idx);
      } catch { /* offline: what is here */ }
      return Object.values(idx).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
    },
    roleOf: (id) => index()[id]?.role || 'owner',
    async open(id){
      const mine = local(id);
      try {
        const r = await getScript(id);
        if (r){
          if (!mine){ write(k(uid, 's:' + id), { id, title: r.title, meta: r.meta || {}, data: r.data, updated_at: r.updated_at, rev: 0 }); setBase(id, r.data, r.updated_at); return normalize(r.data); }
          if (newer(r.updated_at, base(id)?.updated_at)){
            if (!dirty().includes(id)){ write(k(uid, 's:' + id), { ...mine, title: r.title, meta: r.meta || {}, data: r.data, updated_at: r.updated_at }); setBase(id, r.data, r.updated_at); return normalize(r.data); }
            return mergeIn(id, r);
          }
        }
      } catch { /* offline */ }
      return mine ? normalize(mine.data) : null;
    },
    // keep it here now, send it in a second
    save(id, script){
      const updated_at = new Date().toISOString();
      const old = local(id);
      const row = { id, title: script.title || 'Untitled', meta: metaOf(script), data: script, updated_at, rev: (old?.rev || 0) + 1 };
      write(k(uid, 's:' + id), row);
      const idx = index(); idx[id] = { ...(idx[id] || {}), id, title: row.title, meta: row.meta, updated_at }; setIndex(idx);
      setDirty([...dirty(), id]);
      onState('saving');
      clearTimeout(timers.get(id));
      timers.set(id, setTimeout(() => push(id), 1200));
    },
    async flush(){ for (const id of dirty()) await push(id); },
    /* an open script: every few seconds, is there a newer version in the account (someone else's)? It comes in
       (merged with anything written here) and fn gets it. Returns the stop. */
    watch(id, fn){
      onRemote = (rid, data) => { if (rid === id) fn(data); };
      let busy = false;
      const look = async () => {
        if (busy || document.hidden || !navigator.onLine) return;
        busy = true;
        try {
          if (dirty().includes(id)) return; // the send merges it
          const stamp = await getStamp(id);
          if (!newer(stamp, base(id)?.updated_at)) return;
          const r = await getScript(id);
          if (r && !dirty().includes(id)) fn(mergeIn(id, r));
        } catch { /* offline */ } finally { busy = false; }
      };
      const t = setInterval(look, 5000);
      return () => { clearInterval(t); onRemote = () => {}; };
    },
    forget(id, idx){
      const i = idx || index(); delete i[id]; if (!idx) setIndex(i);
      try { localStorage.removeItem(k(uid, 's:' + id)); localStorage.removeItem(k(uid, 'b:' + id)); } catch {}
    },
    async remove(id){
      this.forget(id);
      setDirty(dirty().filter((x) => x !== id));
      await deleteScript(id);
    },
    pending: () => dirty().length,
  };
}
