// Datos: siempre se guardan en localStorage (funciona sin internet).
// Si config.js tiene Supabase, además se sincronizan con la nube.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const K_ITEMS = 'organizate.items';
const K_QUEUE = 'organizate.queue';
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let items = read(K_ITEMS, []);
let queue = read(K_QUEUE, []); // cambios pendientes de subir
let sb = null;
let user = null;
let status = cloudEnabled ? 'offline' : 'local'; // local | offline | syncing | ok | error
const listeners = new Set();

export const onChange = fn => listeners.add(fn);
const notify = () => listeners.forEach(fn => fn());
const setStatus = s => { status = s; notify(); };
export const getStatus = () => status;
export const getUser = () => user;
export const all = () => items;

export const uid = () => crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);

function commit() { write(K_ITEMS, items); notify(); }

export function save(item) {
  item = { ...item, updatedAt: new Date().toISOString() };
  const i = items.findIndex(x => x.id === item.id);
  if (i >= 0) items[i] = item; else items.push(item);
  commit();
  enqueue({ op: 'upsert', item });
  return item;
}

export function remove(id) {
  items = items.filter(x => x.id !== id);
  commit();
  enqueue({ op: 'delete', id });
}

export function importItems(list) {
  let n = 0;
  for (const it of list) if (it && it.id && typeof it.title === 'string') { save(it); n++; }
  return n;
}

// ---- nube ----

const opId = op => op.item?.id ?? op.id;

function enqueue(op) {
  if (!cloudEnabled) return;
  queue = queue.filter(q => opId(q) !== opId(op)); // solo importa el último cambio de cada ítem
  queue.push(op);
  write(K_QUEUE, queue);
  flush();
}

// Si la tabla todavía no tiene las columnas status/created_at (ver supabase.sql), se sube sin ellas.
let legacySchema = false;
const toRow = it => {
  const row = {
    id: it.id, user_id: user.id, type: it.type, title: it.title, notes: it.notes || '',
    date: it.date || null, start_time: it.start || null, end_time: it.end || null,
    color: it.color, done: !!it.done, updated_at: it.updatedAt,
  };
  if (!legacySchema) { row.status = it.status || (it.done ? 'done' : 'todo'); row.created_at = it.createdAt || it.updatedAt; }
  return row;
};
const fromRow = r => ({
  id: r.id, type: r.type, title: r.title, notes: r.notes || '', date: r.date || '',
  start: r.start_time || '', end: r.end_time || '', color: r.color, done: r.done,
  status: r.status || (r.done ? 'done' : 'todo'),
  createdAt: r.created_at || r.updated_at, updatedAt: r.updated_at,
});
const missingColumn = e => e && (e.code === 'PGRST204' || e.code === '42703');

async function upsertRow(item) {
  let { error } = await sb.from('items').upsert(toRow(item));
  if (missingColumn(error) && !legacySchema) {
    legacySchema = true;
    ({ error } = await sb.from('items').upsert(toRow(item)));
  }
  return { error };
}

let flushing = null;
function flush() {
  if (!sb || !user) return Promise.resolve();
  if (flushing) return flushing;
  flushing = (async () => {
    setStatus('syncing');
    try {
      while (queue.length) {
        const op = queue[0];
        const { error } = op.op === 'upsert'
          ? await upsertRow(op.item)
          : await sb.from('items').delete().eq('id', op.id);
        if (error) throw error;
        queue = queue.filter(q => q !== op);
        write(K_QUEUE, queue);
      }
      setStatus('ok');
    } catch (e) {
      console.warn('Organizate: no se pudo sincronizar', e);
      setStatus('error');
    }
  })().finally(() => { flushing = null; });
  return flushing;
}

export async function sync() {
  if (!sb || !user) return;
  // Primera vez que esta cuenta entra en este dispositivo: subir lo que ya había guardado.
  const migrated = 'organizate.migrated.' + user.id;
  if (!read(migrated, false)) {
    for (const it of items) if (!queue.some(q => opId(q) === it.id)) queue.push({ op: 'upsert', item: it });
    write(K_QUEUE, queue);
    write(migrated, true);
  }
  await flush();
  if (queue.length) return;
  setStatus('syncing');
  const { data, error } = await sb.from('items').select('*');
  if (error) { console.warn(error); return setStatus('error'); }
  if (queue.length) return flush(); // hubo cambios mientras bajaba
  items = data.map(fromRow);
  write(K_ITEMS, items);
  setStatus('ok');
}

export async function init() {
  if (!cloudEnabled) return;
  try {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    sb.auth.onAuthStateChange((_event, session) => {
      const prev = user?.id;
      user = session?.user ?? null;
      if (!user) return setStatus('offline');
      if (user.id !== prev) setTimeout(sync); // fuera del callback de auth
      else notify();
    });
  } catch (e) {
    console.warn(e);
    setStatus('error');
  }
  window.addEventListener('online', sync);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
}

export async function login(email) {
  if (!sb) throw new Error('La nube no está disponible');
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw error;
}

export async function logout() {
  await sb?.auth.signOut();
  items = []; queue = [];
  write(K_QUEUE, queue);
  commit();
}
