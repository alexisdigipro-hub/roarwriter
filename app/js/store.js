import { deleteScript, getScript, listScripts, saveScript } from './cloud.js';
import { metaOf, normalize } from './model.js';

/* Local first: every script is kept on this computer at once (so writing never waits and works offline), then
   sent to the account a moment later; what could not be sent is retried when the connection comes back.
   On opening, the newer of the two copies wins. */
const k = (uid, rest) => `rw:${uid}:${rest}`;
const read = (key, d) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} };

export function createStore(uid){
  const index = () => read(k(uid, 'index'), {});
  const setIndex = (i) => write(k(uid, 'index'), i);
  const dirty = () => read(k(uid, 'dirty'), []);
  const setDirty = (d) => write(k(uid, 'dirty'), [...new Set(d)]);
  const local = (id) => read(k(uid, 's:' + id), null);
  const timers = new Map();
  let onState = () => {};

  async function push(id){
    const row = local(id);
    if (!row) return;
    try {
      await saveScript({ id, title: row.title, meta: row.meta, data: row.data, updated_at: row.updated_at });
      setDirty(dirty().filter((x) => x !== id));
      onState('saved');
    } catch { onState('offline'); }
  }

  return {
    onState: (fn) => { onState = fn; },
    // the list: the account's, merged with what is only here so far
    async list(){
      const idx = index();
      try {
        const rows = await listScripts();
        const seen = new Set();
        for (const r of rows){
          seen.add(r.id);
          const mine = idx[r.id];
          if (!mine || Date.parse(r.updated_at) > Date.parse(mine.updated_at)) idx[r.id] = { id: r.id, title: r.title, meta: r.meta || {}, updated_at: r.updated_at };
        }
        // gone from the account (deleted elsewhere) and not waiting to be sent: gone here too
        const waiting = new Set(dirty());
        for (const id of Object.keys(idx)) if (!seen.has(id) && !waiting.has(id)){ delete idx[id]; try { localStorage.removeItem(k(uid, 's:' + id)); } catch {} }
        setIndex(idx);
      } catch { /* offline: what is here */ }
      return Object.values(idx).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
    },
    async open(id){
      const mine = local(id);
      try {
        const r = await getScript(id);
        if (r && (!mine || Date.parse(r.updated_at) > Date.parse(mine.updated_at))){
          const row = { id, title: r.title, meta: r.meta || {}, data: r.data, updated_at: r.updated_at };
          write(k(uid, 's:' + id), row);
          return normalize(r.data);
        }
      } catch { /* offline */ }
      return mine ? normalize(mine.data) : null;
    },
    // keep it here now, send it in a second
    save(id, script){
      const updated_at = new Date().toISOString();
      const row = { id, title: script.title || 'Untitled', meta: metaOf(script), data: script, updated_at };
      write(k(uid, 's:' + id), row);
      const idx = index(); idx[id] = { id, title: row.title, meta: row.meta, updated_at }; setIndex(idx);
      setDirty([...dirty(), id]);
      onState('saving');
      clearTimeout(timers.get(id));
      timers.set(id, setTimeout(() => push(id), 1200));
    },
    async flush(){ for (const id of dirty()) await push(id); },
    async remove(id){
      const idx = index(); delete idx[id]; setIndex(idx);
      setDirty(dirty().filter((x) => x !== id));
      try { localStorage.removeItem(k(uid, 's:' + id)); } catch {}
      await deleteScript(id);
    },
    pending: () => dirty().length,
  };
}
