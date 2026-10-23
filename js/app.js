import * as store from './store.js';

const $ = (sel, el = document) => el.querySelector(sel);

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const COLORS = ['violeta', 'rosa', 'naranja', 'amarillo', 'celeste', 'turquesa'];
const STATUS = {
  local: 'Solo este dispositivo',
  offline: 'Sin iniciar sesión',
  syncing: 'Sincronizando…',
  ok: 'Sincronizado',
  error: 'Sin conexión (reintenta solo)',
};

const svg = d => `<svg viewBox="0 0 24 24">${d}</svg>`;
const ICON = {
  check: svg('<path d="M5 12.5l4.2 4.2L19 7"/>'),
  note: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  left: svg('<path d="M15 6l-6 6 6 6"/>'),
  right: svg('<path d="M9 6l6 6-6 6"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
};

// ---- utilidades ----

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = d => addDays(d, -((d.getDay() + 6) % 7)); // semana de lunes a domingo
const todayKey = () => ymd(new Date());
const cap = s => s[0].toUpperCase() + s.slice(1);
const longDate = s => { const d = parse(s); return `${cap(DAYS_LONG[d.getDay()])} ${d.getDate()} de ${MONTHS[d.getMonth()]}`; };
const shortDate = s => { const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const pref = {
  get(k, d) { try { return localStorage.getItem('organizate.' + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('organizate.' + k, v); } catch {} },
};

const sheetMode = () => matchMedia('(max-width: 1199px)').matches;
const phone = () => matchMedia('(max-width: 760px)').matches;

const state = {
  page: 'calendar',
  view: pref.get('view', 'month'),
  cursor: new Date(),
  selected: todayKey(),
  miniCursor: new Date(),
  editing: null,
  query: '',
  taskFilter: 'pending',
};

// ---- datos ----

function visible() {
  const q = norm(state.query);
  const list = store.all();
  return q ? list.filter(i => norm(i.title + ' ' + i.notes).includes(q)) : list;
}

const byOrder = (a, b) => (a.done - b.done) || (a.start || '').localeCompare(b.start || '') || a.title.localeCompare(b.title);

function itemsByDate() {
  const map = new Map();
  for (const it of visible()) {
    if (!it.date) continue;
    if (!map.has(it.date)) map.set(it.date, []);
    map.get(it.date).push(it);
  }
  for (const list of map.values()) list.sort(byOrder);
  return map;
}

const isLate = it => it.type === 'task' && !it.done && it.date && it.date < todayKey();

// ---- piezas ----

function lead(it) {
  return it.type === 'task'
    ? `<button class="chk" data-act="toggle" aria-label="${it.done ? 'Marcar pendiente' : 'Marcar hecha'}">${ICON.check}</button>`
    : `<span class="ico">${ICON.note}</span>`;
}

function stateClasses(it) {
  return `c-${it.color || 'violeta'} ${it.type}${it.done ? ' done' : ''}${isLate(it) ? ' late' : ''}${it.id === state.editing ? ' active' : ''}`;
}

function chip(it) {
  return `<div class="chip ${stateClasses(it)}" data-id="${it.id}" title="${esc(it.title)}">${lead(it)}<span class="t">${esc(it.title)}</span>${it.start ? `<span class="tm">${it.start}</span>` : ''}</div>`;
}

function row(it, withDate = false) {
  const time = it.start ? it.start + (it.end ? ' – ' + it.end : '') : '';
  const meta = [withDate && it.date ? shortDate(it.date) : '', time, it.type === 'note' ? 'Nota' : '', isLate(it) ? 'Atrasada' : ''].filter(Boolean).join(' · ');
  return `<div class="row ${stateClasses(it)}" data-id="${it.id}">${lead(it)}<div class="rb"><div class="rt">${esc(it.title)}</div>${meta ? `<div class="rm">${meta}</div>` : ''}${it.notes ? `<div class="rn">${esc(it.notes)}</div>` : ''}</div></div>`;
}

// ---- render ----

function render() {
  renderHeader();
  renderNav();
  renderSync();
  const page = $('#page');
  page.className = 'page page-' + state.page;
  page.innerHTML = { calendar: calendarHTML, tasks: tasksHTML, notes: notesHTML, settings: settingsHTML }[state.page]();
  renderMini();
}

function renderHeader() {
  const name = pref.get('name', '');
  $('#hello').textContent = `Hola${name ? ', ' + name : ''} 👋`;
  const t = todayKey();
  const all = store.all();
  const today = all.filter(i => i.type === 'task' && !i.done && i.date === t).length;
  const late = all.filter(isLate).length;
  const lateTxt = late ? plural(late, 'atrasada', 'atrasadas') : '';
  $('#subtitle').textContent = today
    ? `Tenés ${plural(today, 'tarea', 'tareas')} para hoy${late ? ` y ${lateTxt}` : ''}.`
    : late ? `Nada para hoy, pero tenés ${lateTxt}.` : 'Nada pendiente para hoy. ¡Disfrutá el día!';
}

function renderNav() {
  for (const b of document.querySelectorAll('#nav [data-page]')) b.classList.toggle('on', b.dataset.page === state.page);
}

function renderSync() {
  const st = store.getStatus();
  $('#sync').innerHTML = `<span class="pill s-${st}"><i></i>${STATUS[st]}</span>`;
}

function periodTitle() {
  const c = state.cursor;
  if (state.view === 'month') return `${cap(MONTHS[c.getMonth()])} ${c.getFullYear()}`;
  if (state.view === 'day') return longDate(ymd(c));
  const s = startOfWeek(c), e = addDays(s, 6);
  const m = d => MONTHS[d.getMonth()].slice(0, 3);
  return s.getMonth() === e.getMonth()
    ? `${s.getDate()} – ${e.getDate()} ${m(e)} ${e.getFullYear()}`
    : `${s.getDate()} ${m(s)} – ${e.getDate()} ${m(e)} ${e.getFullYear()}`;
}

function calendarHTML() {
  const views = [['month', 'Mes'], ['week', 'Semana'], ['day', 'Día']];
  const bar = `<div class="toolbar">
    <div class="seg views">${views.map(([v, l]) => `<button data-view="${v}" class="${state.view === v ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="period">
      <button class="icon-btn" data-nav="-1" aria-label="Anterior">${ICON.left}</button>
      <h2>${periodTitle()}</h2>
      <button class="icon-btn" data-nav="1" aria-label="Siguiente">${ICON.right}</button>
      <button class="btn ghost sm" data-nav="0">Hoy</button>
    </div>
    <button class="btn primary add" data-act="new">${ICON.plus}<span>Agregar</span></button>
  </div>`;
  const legend = `<div class="legend"><span><i class="dot todo"></i>Por hacer</span><span><i class="dot ok"></i>Hecho</span><span><i class="dot late"></i>Atrasado</span><span class="hint">Arrastrá para cambiar de día</span></div>`;
  const body = state.view === 'month' ? monthHTML() : state.view === 'week' ? weekHTML() : dayHTML();
  return bar + body + legend;
}

function monthHTML() {
  const map = itemsByDate();
  const c = state.cursor;
  const first = new Date(c.getFullYear(), c.getMonth(), 1);
  const start = startOfWeek(first);
  const days = new Date(c.getFullYear(), c.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil(((first.getDay() + 6) % 7 + days) / 7);
  const max = 3;
  const t = todayKey();
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i), k = ymd(d), list = map.get(k) || [];
    const cls = ['cell', d.getMonth() !== c.getMonth() && 'out', k === t && 'today', k === state.selected && 'sel'].filter(Boolean).join(' ');
    const shown = list.length > max ? list.slice(0, max - 1) : list;
    const more = list.length - shown.length;
    cells += `<div class="${cls}" data-date="${k}"><span class="num">${d.getDate()}</span><div class="list">${shown.map(chip).join('')}${more ? `<button class="more" data-day="${k}">+${more} más</button>` : ''}</div></div>`;
  }
  const sel = map.get(state.selected) || [];
  return `<div class="month" style="--weeks:${weeks}">
      <div class="dow">${DAYS_SHORT.map(d => `<span>${d}</span>`).join('')}</div>
      <div class="grid">${cells}</div>
    </div>
    <section class="agenda">
      <div class="agenda-head"><h3>${longDate(state.selected)}</h3><button class="btn ghost sm" data-act="new">${ICON.plus}Agregar</button></div>
      ${sel.length ? sel.map(it => row(it)).join('') : '<p class="empty">Nada para este día.</p>'}
    </section>`;
}

function weekHTML() {
  const map = itemsByDate();
  const s = startOfWeek(state.cursor);
  const t = todayKey();
  let cols = '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(s, i), k = ymd(d), list = map.get(k) || [];
    cols += `<div class="wcol${k === t ? ' today' : ''}${k === state.selected ? ' sel' : ''}" data-date="${k}">
      <div class="whead"><span>${DAYS_SHORT[i]}</span><b>${d.getDate()}</b></div>
      <div class="list">${list.map(chip).join('')}</div>
    </div>`;
  }
  return `<div class="week">${cols}</div>`;
}

function dayHTML() {
  const k = ymd(state.cursor);
  const list = itemsByDate().get(k) || [];
  return `<div class="dayview" data-date="${k}">${list.length ? list.map(it => row(it)).join('') : '<p class="empty">Nada para este día. Tocá acá para agregar algo.</p>'}</div>`;
}

function tasksHTML() {
  const f = state.taskFilter;
  const t = todayKey(), tm = ymd(addDays(new Date(), 1));
  let list = visible().filter(i => i.type === 'task');
  if (f === 'pending') list = list.filter(i => !i.done);
  if (f === 'done') list = list.filter(i => i.done);
  list.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || byOrder(a, b));
  const groups = new Map();
  for (const it of list) {
    const g = !it.date ? 'Sin fecha' : isLate(it) ? 'Atrasadas' : it.date === t ? 'Hoy' : it.date === tm ? 'Mañana' : longDate(it.date);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(it);
  }
  const tabs = [['pending', 'Pendientes'], ['done', 'Hechas'], ['all', 'Todas']];
  const empty = f === 'done' ? 'Todavía no marcaste nada como hecho.' : '¡No hay tareas pendientes! 🎉';
  return `<div class="toolbar">
      <div class="seg">${tabs.map(([v, l]) => `<button data-filter="${v}" class="${f === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <button class="btn primary add" data-act="new" data-type="task">${ICON.plus}<span>Nueva tarea</span></button>
    </div>
    <div class="lists">${groups.size
      ? [...groups].map(([g, l]) => `<section class="group"><h3>${g}<span>${l.length}</span></h3>${l.map(it => row(it, true)).join('')}</section>`).join('')
      : `<p class="empty">${empty}</p>`}</div>`;
}

function notesHTML() {
  const list = visible().filter(i => i.type === 'note').sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return `<div class="toolbar">
      <h2 class="ttl">Notas</h2>
      <button class="btn primary add" data-act="new" data-type="note">${ICON.plus}<span>Nueva nota</span></button>
    </div>
    <div class="notes">${list.length
      ? list.map(n => `<article class="note-card c-${n.color || 'amarillo'}" data-id="${n.id}"><h4>${esc(n.title)}</h4>${n.notes ? `<p>${esc(n.notes)}</p>` : ''}${n.date ? `<time>${shortDate(n.date)}</time>` : ''}</article>`).join('')
      : '<p class="empty">Sin notas todavía.</p>'}</div>`;
}

function settingsHTML() {
  return `<div class="settings">
    <section class="card-s">
      <h3>Tu nombre</h3>
      <input id="s-name" class="input" value="${esc(pref.get('name', ''))}" placeholder="¿Cómo te llamás?" maxlength="40">
    </section>
    <section class="card-s" id="cloud">${cloudHTML()}</section>
    <section class="card-s">
      <h3>Respaldo</h3>
      <p class="muted">Descargá una copia de todo o restaurala desde un archivo.</p>
      <div class="btns">
        <button class="btn ghost" data-act="export">Exportar</button>
        <label class="btn ghost">Importar<input type="file" id="s-import" accept="application/json,.json" hidden></label>
      </div>
    </section>
  </div>`;
}

function cloudHTML() {
  const u = store.getUser();
  if (!store.cloudEnabled) {
    return `<h3>Sincronizar celular y compu</h3>
      <p class="muted">Ahora todo se guarda <b>solo en este dispositivo</b>. Para ver lo mismo en el celu y en la compu hay que conectar la base de datos (Supabase, gratis). Los pasos están en el README del proyecto.</p>`;
  }
  if (!u) {
    return `<h3>Sincronizar</h3>
      <p class="muted">Entrá con tu mail y te mandamos un link. Así ves lo mismo en todos tus dispositivos.</p>
      <form id="login" class="inline"><input class="input" type="email" name="email" required placeholder="tu@mail.com"><button class="btn primary">Enviar link</button></form>
      <p class="muted" id="login-msg"></p>`;
  }
  return `<h3>Sincronizar</h3>
    <p class="muted">Conectado como <b>${esc(u.email)}</b> · ${STATUS[store.getStatus()]}</p>
    <div class="btns"><button class="btn ghost" data-act="sync">Sincronizar ahora</button><button class="btn ghost" data-act="logout">Cerrar sesión</button></div>`;
}

function renderMini() {
  const c = state.miniCursor;
  const start = startOfWeek(new Date(c.getFullYear(), c.getMonth(), 1));
  const map = itemsByDate();
  const t = todayKey();
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i), k = ymd(d);
    const cls = ['md', d.getMonth() !== c.getMonth() && 'out', k === t && 'today', k === state.selected && 'sel', map.has(k) && 'has'].filter(Boolean).join(' ');
    cells += `<button class="${cls}" data-goto="${k}">${d.getDate()}</button>`;
  }
  $('#mini').innerHTML = `<div class="mini-head"><b>${cap(MONTHS[c.getMonth()])} ${c.getFullYear()}</b>
      <div><button class="icon-btn sm" data-mini="-1" aria-label="Mes anterior">${ICON.left}</button><button class="icon-btn sm" data-mini="1" aria-label="Mes siguiente">${ICON.right}</button></div></div>
    <div class="mini-grid">${DAYS_SHORT.map(d => `<span class="h">${d[0]}</span>`).join('')}${cells}</div>`;
}

// ---- editor ----

function formHTML(editing) {
  return `<form id="form" class="form" autocomplete="off" novalidate>
    <div class="form-head"><h3>${editing ? 'Editar' : 'Nuevo'}</h3><button type="button" class="icon-btn close" data-act="close" aria-label="Cerrar">${ICON.x}</button></div>
    <div class="seg seg-full">
      <label><input type="radio" name="type" value="task"><span>${ICON.check}Tarea</span></label>
      <label><input type="radio" name="type" value="note"><span>${ICON.note}Nota</span></label>
    </div>
    <label class="field"><span>Título</span><input name="title" maxlength="140" placeholder="¿Qué hay que hacer?"></label>
    <label class="field"><span>Detalle</span><textarea name="notes" rows="3" placeholder="Notas, links, lo que quieras…"></textarea></label>
    <label class="field"><span>Fecha</span><input type="date" name="date"></label>
    <div class="two">
      <label class="field"><span>Desde</span><input type="time" name="start"></label>
      <label class="field"><span>Hasta</span><input type="time" name="end"></label>
    </div>
    <div class="field"><span>Color</span><div class="swatches">${COLORS.map(c => `<label class="sw c-${c}" title="${cap(c)}"><input type="radio" name="color" value="${c}"><i></i></label>`).join('')}</div></div>
    <label class="done-toggle only-task"><input type="checkbox" name="done"><span class="box">${ICON.check}</span><span>Marcar como hecha</span></label>
    <div class="actions">
      ${editing ? '<button type="button" class="btn danger" data-act="delete">Eliminar</button>' : ''}
      <button type="submit" class="btn primary">${editing ? 'Guardar' : 'Agregar'}</button>
    </div>
  </form>`;
}

function openEditor(id, opts = {}) {
  const it = id ? store.all().find(x => x.id === id) : null;
  if (id && !it) return;
  state.editing = it ? it.id : null;
  const type = opts.type || 'task';
  const d = it || {
    type, title: '', notes: '', start: '', end: '', done: false,
    date: opts.date ?? (type === 'note' ? '' : state.selected),
    color: type === 'note' ? 'amarillo' : 'violeta',
  };
  $('#editor').innerHTML = formHTML(!!it);
  const f = $('#form'), F = f.elements;
  F.type.value = d.type;
  F.title.value = d.title;
  F.notes.value = d.notes || '';
  F.date.value = d.date || '';
  F.start.value = d.start || '';
  F.end.value = d.end || '';
  F.color.value = d.color || 'violeta';
  F.done.checked = !!d.done;
  f.dataset.type = d.type;
  for (const el of document.querySelectorAll('.chip.active,.row.active')) el.classList.remove('active');
  if (it) for (const el of document.querySelectorAll(`[data-id="${it.id}"]`)) el.classList.add('active');
  if (opts.silent) return;
  if (sheetMode()) document.body.classList.add('sheet-open');
  if (!it && !phone()) F.title.focus();
}

function closeEditor() {
  document.body.classList.remove('sheet-open');
  openEditor(null, { silent: true });
}

function submitForm(f) {
  const F = f.elements;
  const title = F.title.value.trim();
  if (!title) { F.title.classList.add('err'); F.title.focus(); return; }
  const prev = state.editing ? store.all().find(x => x.id === state.editing) : null;
  const type = F.type.value;
  const item = {
    ...(prev || {}),
    id: prev?.id || store.uid(),
    type, title,
    notes: F.notes.value.trim(),
    date: F.date.value,
    start: F.start.value,
    end: F.end.value,
    color: F.color.value || 'violeta',
    done: type === 'task' && F.done.checked,
    createdAt: prev?.createdAt || new Date().toISOString(),
  };
  if (item.date) {
    state.selected = item.date;
    state.cursor = parse(item.date);
    state.miniCursor = parse(item.date);
  }
  store.save(item);
  toast(prev ? 'Guardado' : type === 'note' ? 'Nota agregada' : 'Tarea agregada');
  if (sheetMode()) closeEditor();
  else openEditor(null, { date: item.date || state.selected, type: state.page === 'notes' ? 'note' : 'task' });
}

function toggle(id) {
  const it = store.all().find(x => x.id === id);
  if (!it) return;
  store.save({ ...it, done: !it.done });
  if (state.editing === id) $('#form').elements.done.checked = !it.done;
  if (!it.done) toast('¡Hecho! ✓');
}

function deleteEditing() {
  const it = store.all().find(x => x.id === state.editing);
  if (!it || !confirm(`¿Eliminar "${it.title}"?`)) return;
  store.remove(it.id);
  toast('Eliminado');
  closeEditor();
}

function select(k, jump = false) {
  state.selected = k;
  if (jump) { state.cursor = parse(k); state.miniCursor = parse(k); }
  render();
}

function navigate(dir) {
  const c = state.cursor;
  if (dir === 0) { state.cursor = new Date(); state.selected = todayKey(); }
  else if (state.view === 'month') state.cursor = new Date(c.getFullYear(), c.getMonth() + dir, 1);
  else state.cursor = addDays(c, dir * (state.view === 'week' ? 7 : 1));
  if (state.view === 'day') state.selected = ymd(state.cursor);
  state.miniCursor = new Date(state.cursor);
  render();
}

// ---- respaldo ----

function exportData() {
  const blob = new Blob([JSON.stringify({ app: 'organizate', exportedAt: new Date().toISOString(), items: store.all() }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `organizate-${todayKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    const n = store.importItems(Array.isArray(data) ? data : data.items || []);
    toast(n ? `Importados ${n} ítems` : 'El archivo no tenía datos');
  } catch {
    toast('No se pudo leer el archivo');
  }
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ---- drag & drop (mouse y touch: en touch se mantiene apretado) ----

let drag = null;
let suppressClickUntil = 0;

document.addEventListener('pointerdown', e => {
  const el = e.target.closest('.chip[data-id]');
  if (!el || e.button !== 0 || e.target.closest('[data-act]')) return;
  drag = { id: el.dataset.id, el, x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse', on: false };
  if (drag.touch) drag.timer = setTimeout(() => startDrag(drag.x, drag.y), 320);
});

window.addEventListener('pointermove', e => {
  if (!drag) return;
  if (!drag.on) {
    const dist = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    if (drag.touch) { if (dist > 10) endDrag(); return; } // se está scrolleando
    if (dist < 6) return;
    startDrag(e.clientX, e.clientY);
  }
  moveDrag(e.clientX, e.clientY);
});

window.addEventListener('pointerup', () => { if (drag?.on) dropDrag(); endDrag(); });
window.addEventListener('pointercancel', endDrag);
document.addEventListener('touchmove', e => { if (drag?.on) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', e => { if (e.target.closest('.chip')) e.preventDefault(); });

function startDrag(x, y) {
  if (!drag) return;
  drag.on = true;
  const r = drag.el.getBoundingClientRect();
  drag.dx = x - r.left;
  drag.dy = y - r.top;
  drag.ghost = drag.el.cloneNode(true);
  drag.ghost.classList.add('drag-ghost');
  drag.ghost.style.width = r.width + 'px';
  document.body.append(drag.ghost);
  drag.el.classList.add('dragging');
  document.body.classList.add('is-dragging');
  navigator.vibrate?.(15);
  moveDrag(x, y);
}

function moveDrag(x, y) {
  drag.ghost.style.transform = `translate(${x - drag.dx}px, ${y - drag.dy}px)`;
  const target = document.elementFromPoint(x, y)?.closest('#page [data-date]') ?? null;
  if (target !== drag.target) {
    drag.target?.classList.remove('drop');
    target?.classList.add('drop');
    drag.target = target;
  }
}

function dropDrag() {
  suppressClickUntil = Date.now() + 300;
  const k = drag.target?.dataset.date;
  const it = store.all().find(x => x.id === drag.id);
  if (!k || !it || it.date === k) return;
  state.selected = k;
  store.save({ ...it, date: k });
  if (state.editing === it.id) $('#form').elements.date.value = k;
  toast(`Movido al ${shortDate(k)}`);
}

function endDrag() {
  if (!drag) return;
  clearTimeout(drag.timer);
  drag.ghost?.remove();
  drag.el.classList.remove('dragging');
  drag.target?.classList.remove('drop');
  document.body.classList.remove('is-dragging');
  drag = null;
}

// ---- eventos ----

document.addEventListener('click', e => {
  if (Date.now() < suppressClickUntil) return;
  const t = e.target;
  const on = sel => t.closest(sel);
  let el;

  if ((el = on('[data-act]'))) {
    const a = el.dataset.act;
    if (a === 'toggle') return toggle(el.closest('[data-id]').dataset.id);
    if (a === 'new') return openEditor(null, { type: el.dataset.type || (state.page === 'notes' ? 'note' : 'task') });
    if (a === 'close') return closeEditor();
    if (a === 'delete') return deleteEditing();
    if (a === 'export') return exportData();
    if (a === 'sync') return store.sync();
    if (a === 'logout') return store.logout();
    return;
  }
  if ((el = on('[data-page]'))) {
    state.page = el.dataset.page;
    closeEditor();
    render();
    $('.main').scrollTop = 0;
    window.scrollTo(0, 0);
    return;
  }
  if ((el = on('[data-view]'))) {
    state.view = el.dataset.view;
    pref.set('view', state.view);
    state.cursor = parse(state.selected);
    return render();
  }
  if ((el = on('[data-nav]'))) return navigate(+el.dataset.nav);
  if ((el = on('[data-filter]'))) { state.taskFilter = el.dataset.filter; return render(); }
  if ((el = on('[data-day]'))) {
    state.selected = el.dataset.day;
    state.cursor = parse(state.selected);
    state.view = 'day';
    pref.set('view', 'day');
    return render();
  }
  if ((el = on('[data-mini]'))) {
    const c = state.miniCursor;
    state.miniCursor = new Date(c.getFullYear(), c.getMonth() + Number(el.dataset.mini), 1);
    return renderMini();
  }
  if ((el = on('[data-goto]'))) {
    if (state.page !== 'calendar') state.page = 'calendar';
    return select(el.dataset.goto, true);
  }
  if ((el = on('#page [data-id]'))) return openEditor(el.dataset.id);
  if ((el = on('#page [data-date]'))) {
    const k = el.dataset.date;
    const again = k === state.selected;
    select(k);
    // En el celu, en vista mes, el primer toque elige el día (y muestra la agenda); el segundo agrega.
    if (sheetMode() && state.view === 'month' && !again) return;
    const f = $('#form');
    if (!sheetMode() && f && !state.editing) { f.elements.date.value = k; f.elements.title.focus(); return; }
    openEditor(null, { date: k });
  }
});

document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'form') return submitForm(f);
  if (f.id === 'login') {
    const msg = $('#login-msg');
    const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      await store.login(f.elements.email.value.trim());
      msg.textContent = 'Listo: revisá tu mail y abrí el link en este mismo dispositivo.';
    } catch (err) {
      msg.textContent = 'No se pudo enviar: ' + err.message;
    }
    btn.disabled = false;
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.name === 'type' && t.form?.id === 'form') t.form.dataset.type = t.value;
  if (t.id === 's-import' && t.files[0]) { importData(t.files[0]); t.value = ''; }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'search') { state.query = t.value; if (state.page === 'settings') state.page = 'calendar'; render(); }
  if (t.id === 's-name') { pref.set('name', t.value.trim()); renderHeader(); }
  if (t.name === 'title') t.classList.remove('err');
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.body.classList.contains('sheet-open')) closeEditor();
});

matchMedia('(max-width: 1199px)').addEventListener('change', () => {
  document.body.classList.remove('sheet-open');
  render();
});
matchMedia('(max-width: 760px)').addEventListener('change', render);

store.onChange(() => {
  if (state.page === 'settings') {
    const c = $('#cloud');
    if (c) c.innerHTML = cloudHTML();
    renderSync();
    renderHeader();
  } else {
    render();
  }
});

render();
openEditor(null, { silent: true });
store.init();
