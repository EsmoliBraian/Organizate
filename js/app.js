import * as store from './store.js?v=4';

const $ = (sel, el = document) => el.querySelector(sel);

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const COLORS = ['gris', 'amarillo', 'naranja', 'rosa', 'violeta', 'celeste', 'verde'];
const STATUSES = [['todo', 'Por hacer'], ['doing', 'En proceso'], ['done', 'Hecha']];
const STATUS_LABEL = Object.fromEntries(STATUSES);
const SYNC = {
  local: 'Solo este dispositivo',
  offline: 'Sin iniciar sesión',
  syncing: 'Sincronizando…',
  ok: 'Sincronizado',
  error: 'Sin conexión (reintenta solo)',
};
const HOUR_PX = 64;            // alto de una hora en la vista Detallada
const PPM = HOUR_PX / 60;      // píxeles por minuto

const svg = d => `<svg viewBox="0 0 24 24">${d}</svg>`;
const ICON = {
  check: svg('<path d="M5 12.5l4.2 4.2L19 7"/>'),
  note: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  left: svg('<path d="M15 6l-6 6 6 6"/>'),
  right: svg('<path d="M9 6l6 6-6 6"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  cal: svg('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  columns: svg('<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>'),
  grid: svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
  list: svg('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'),
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
const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const pref = {
  get(k, d) { try { return localStorage.getItem('organizate.' + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('organizate.' + k, v); } catch {} },
};

const phone = () => matchMedia('(max-width: 760px)').matches;

const state = {
  page: 'calendar',
  view: ['month', 'week', 'detail', 'day'].includes(pref.get('view')) ? pref.get('view') : 'month',
  cursor: new Date(),
  selected: todayKey(),
  miniCursor: new Date(),
  editing: null,
  query: '',
  fit: 3,                 // cuántos renglones entran en un día de la vista Mes
  detailFrom: 8,          // primera hora visible en la vista Detallada
  board: {
    mode: pref.get('boardMode', 'columns'),
    status: 'all',
    period: 'all',
  },
};

// ---- datos ----

const statusOf = it => it.status || (it.done ? 'done' : 'todo');
const createdOf = it => ymd(new Date(it.createdAt || it.updatedAt || Date.now()));

function visible() {
  const q = norm(state.query);
  const list = store.all();
  return q ? list.filter(i => norm(i.title + ' ' + i.notes).includes(q)) : list;
}

const byOrder = (a, b) => (!!a.done - !!b.done) || (a.start || '').localeCompare(b.start || '') || a.title.localeCompare(b.title);

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

function cls(it) {
  return `c-${it.color || 'gris'} ${it.type} s-${it.type === 'task' ? statusOf(it) : 'note'}${it.done ? ' done' : ''}${isLate(it) ? ' late' : ''}${it.id === state.editing ? ' active' : ''}`;
}

function chip(it) {
  return `<div class="chip ${cls(it)}" data-id="${it.id}" data-drag title="${esc(it.title)}">${lead(it)}<span class="t">${esc(it.title)}</span>${it.start ? `<span class="tm">${it.start}</span>` : ''}</div>`;
}

function row(it, withDate = false, withStatus = false) {
  const time = it.start ? it.start + (it.end ? ' – ' + it.end : '') : '';
  const meta = [withDate && it.date ? shortDate(it.date) : '', time, it.type === 'note' ? 'Nota' : '', isLate(it) ? 'Atrasada' : ''].filter(Boolean).join(' · ');
  const badge = withStatus && it.type === 'task' ? `<span class="st-badge st-${statusOf(it)}">${STATUS_LABEL[statusOf(it)]}</span>` : '';
  return `<div class="row ${cls(it)}" data-id="${it.id}">${lead(it)}<div class="rb"><div class="rt">${esc(it.title)}</div>${meta ? `<div class="rm">${meta}</div>` : ''}${it.notes ? `<div class="rn">${esc(it.notes)}</div>` : ''}</div>${badge}</div>`;
}

function card(it) {
  const st = statusOf(it);
  const due = it.date ? shortDate(it.date) + (it.start ? ' · ' + it.start : '') : 'Sin fecha';
  const letter = esc(it.title.trim()[0]?.toUpperCase() || '·');
  return `<article class="card ${cls(it)}" data-id="${it.id}" data-drag>
    <div class="card-top">
      <span class="card-ico">${letter}</span>
      <div class="card-head"><h4>${esc(it.title)}</h4><span class="st-badge st-${st}">${STATUS_LABEL[st]}</span></div>
      ${lead(it)}
    </div>
    ${it.notes ? `<p class="card-n">${esc(it.notes)}</p>` : ''}
    <div class="card-foot">
      <span class="${isLate(it) ? 'is-late' : ''}" title="Fecha">${ICON.cal}${due}</span>
      <span title="Creada">${ICON.clock}Creada ${shortDate(createdOf(it))}</span>
    </div>
  </article>`;
}

// ---- render ----

function render() {
  renderHeader();
  renderNav();
  renderSync();
  const page = $('#page');
  page.className = `page page-${state.page}${state.page === 'calendar' ? ' view-' + state.view : ''}`;
  page.innerHTML = { calendar: calendarHTML, tasks: tasksHTML, notes: notesHTML, settings: settingsHTML }[state.page]();
  renderMini();
  afterRender();
}

function afterRender() {
  // Vista Mes: mostrar tantos renglones por día como entren, sin cortar nada.
  if (state.page === 'calendar' && state.view === 'month' && !phone()) {
    const cell = $('.cell');
    if (cell) {
      const n = Math.max(1, Math.floor((cell.clientHeight - 36) / 28));
      if (n !== state.fit) { state.fit = n; render(); }
    }
  }
}

function renderHeader() {
  const h = new Date().getHours();
  $('#hello').textContent = h >= 5 && h < 12 ? 'Buenos días ☀️' : h >= 12 && h < 20 ? 'Buenas tardes 🌤️' : 'Buenas noches 🌙';
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
  $('#sync').innerHTML = `<span class="pill sync-${st}"><i></i>${SYNC[st]}</span>`;
}

// ---- calendario ----

function periodTitle() {
  const c = state.cursor;
  if (state.view === 'month') return `${cap(MONTHS[c.getMonth()])} ${c.getFullYear()}`;
  if (state.view === 'day' || (state.view === 'detail' && phone())) return longDate(state.view === 'day' ? ymd(c) : state.selected);
  const s = startOfWeek(c), e = addDays(s, 6);
  const m = d => MONTHS[d.getMonth()].slice(0, 3);
  return s.getMonth() === e.getMonth()
    ? `${s.getDate()} – ${e.getDate()} ${m(e)} ${e.getFullYear()}`
    : `${s.getDate()} ${m(s)} – ${e.getDate()} ${m(e)} ${e.getFullYear()}`;
}

function calendarHTML() {
  const views = [['month', 'Mes'], ['week', 'Semana'], ['detail', 'Detallada'], ['day', 'Día']];
  const bar = `<div class="toolbar">
    <div class="period">
      <button class="icon-btn" data-nav="-1" aria-label="Anterior">${ICON.left}</button>
      <button class="icon-btn" data-nav="1" aria-label="Siguiente">${ICON.right}</button>
      <h2>${periodTitle()}</h2>
      <button class="btn ghost sm" data-nav="0">Hoy</button>
    </div>
    <div class="seg views">${views.map(([v, l]) => `<button data-view="${v}" class="${state.view === v ? 'on' : ''}">${l}</button>`).join('')}</div>
  </div>`;
  const body = { month: monthHTML, week: weekHTML, detail: detailHTML, day: dayHTML }[state.view]();
  const legend = `<div class="legend">
    <span><i class="dot todo"></i>Por hacer</span><span><i class="dot doing"></i>En proceso</span><span><i class="dot ok"></i>Hecho</span><span><i class="dot late"></i>Atrasado</span>
    <span class="hint">Arrastrá para cambiar de día${state.view === 'detail' ? ' u horario' : ''}</span></div>`;
  return bar + body + legend;
}

function monthHTML() {
  const map = itemsByDate();
  const c = state.cursor;
  const first = new Date(c.getFullYear(), c.getMonth(), 1);
  const start = startOfWeek(first);
  const days = new Date(c.getFullYear(), c.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil(((first.getDay() + 6) % 7 + days) / 7);
  const max = phone() ? 3 : state.fit;
  const t = todayKey();
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i), k = ymd(d), list = map.get(k) || [];
    const cl = ['cell', d.getMonth() !== c.getMonth() && 'out', k === t && 'today', k === state.selected && 'sel'].filter(Boolean).join(' ');
    const shown = list.length > max ? list.slice(0, max - 1) : list;
    const more = list.length - shown.length;
    cells += `<div class="${cl}" data-date="${k}" data-drop="date"><span class="num">${d.getDate()}</span><div class="list">${shown.map(chip).join('')}${more ? `<button class="more" data-day="${k}">+${more} más</button>` : ''}</div></div>`;
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
    cols += `<div class="wcol${k === t ? ' today' : ''}${k === state.selected ? ' sel' : ''}" data-date="${k}" data-drop="date">
      <div class="whead"><span>${DAYS_SHORT[i]}</span><b>${d.getDate()}</b></div>
      <div class="list">${list.map(chip).join('')}</div>
    </div>`;
  }
  return `<div class="week">${cols}</div>`;
}

function dayHTML() {
  const k = ymd(state.cursor);
  const list = itemsByDate().get(k) || [];
  return `<div class="dayview" data-date="${k}" data-drop="date">${list.length ? list.map(it => row(it)).join('') : '<p class="empty">Nada para este día. Tocá acá para agregar algo.</p>'}</div>`;
}

// Reparte en carriles los eventos que se superponen en el mismo día.
function layoutDay(list) {
  const ev = list.filter(i => i.start).map(it => {
    const s = toMin(it.start);
    let e = it.end ? toMin(it.end) : s + 60;
    if (e <= s) e = s + 30;
    return { it, s, e };
  }).sort((a, b) => a.s - b.s || b.e - a.e);
  const out = [];
  let cluster = [], clusterEnd = -1;
  const close = () => {
    const lanes = [];
    for (const x of cluster) {
      let l = lanes.findIndex(end => end <= x.s);
      if (l < 0) { l = lanes.length; lanes.push(0); }
      lanes[l] = x.e;
      x.lane = l;
    }
    for (const x of cluster) x.lanes = lanes.length;
    out.push(...cluster);
    cluster = [];
  };
  for (const x of ev) {
    if (cluster.length && x.s >= clusterEnd) { close(); clusterEnd = -1; }
    cluster.push(x);
    clusterEnd = Math.max(clusterEnd, x.e);
  }
  if (cluster.length) close();
  return out;
}

function detailHTML() {
  const days = phone() ? [parse(state.selected)] : [...Array(7)].map((_, i) => addDays(startOfWeek(state.cursor), i));
  const map = itemsByDate();
  const t = todayKey();
  let from = 8, to = 20;
  for (const d of days) for (const it of map.get(ymd(d)) || []) {
    if (!it.start) continue;
    from = Math.min(from, Math.floor(toMin(it.start) / 60));
    to = Math.max(to, Math.ceil((it.end ? toMin(it.end) : toMin(it.start) + 60) / 60));
  }
  to = Math.min(24, to);
  state.detailFrom = from;
  const height = (to - from) * HOUR_PX;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = days.some(d => ymd(d) === t) && nowMin >= from * 60 && nowMin <= to * 60;
  const nowTop = (nowMin - from * 60) * PPM;

  let heads = '', allday = '', cols = '';
  for (const d of days) {
    const k = ymd(d), list = map.get(k) || [];
    heads += `<button class="dt-dh${k === t ? ' today' : ''}${k === state.selected ? ' sel' : ''}" data-pick="${k}"><span>${DAYS_LONG[d.getDay()]}</span><b>${pad(d.getDate())}/${pad(d.getMonth() + 1)}</b></button>`;
    allday += `<div class="dt-allday" data-date="${k}" data-drop="allday">${list.filter(i => !i.start).map(chip).join('')}</div>`;
    const evs = layoutDay(list).map(x => {
      const it = x.it;
      const h = Math.max(30, (x.e - x.s) * PPM - 4);
      return `<div class="ev ${cls(it)}${h < 56 ? ' short' : ''}" data-id="${it.id}" data-drag
        style="top:${(x.s - from * 60) * PPM + 2}px;height:${h}px;left:${3 + x.lane * 22}px;right:3px;z-index:${1 + x.lane}">
        <div class="ev-top">${lead(it)}<span class="ev-t">${esc(it.title)}</span></div>
        <div class="ev-tm">${it.start}${it.end ? ' – ' + it.end : ''}</div>
        ${it.notes ? `<div class="ev-n">${esc(it.notes)}</div>` : ''}
      </div>`;
    }).join('');
    const line = showNow ? `<div class="now${k === t ? ' is-today' : ''}" style="top:${nowTop}px">${k === t ? `<span>${fromMin(nowMin)}</span>` : ''}</div>` : '';
    cols += `<div class="dt-col${k === t ? ' today' : ''}" data-date="${k}" data-drop="slot" style="height:${height}px">${evs}${line}</div>`;
  }
  const hours = [...Array(to - from)].map((_, i) => `<span style="top:${i * HOUR_PX}px">${pad(from + i)}:00</span>`).join('');
  return `<div class="detail" style="--days:${days.length};--hour:${HOUR_PX}px">
    <div class="dt-scroll">
      <div class="dt-grid">
        <div class="dt-corner"></div>${heads}
        <div class="dt-label">Todo el día</div>${allday}
        <div class="dt-times" style="height:${height}px">${hours}</div>${cols}
      </div>
    </div>
  </div>`;
}

// ---- tareas (tablero) ----

function inPeriod(it, period) {
  if (period === 'all') return true;
  if (period === 'nodate') return !it.date;
  if (!it.date) return false;
  const t = new Date();
  if (period === 'today') return it.date === ymd(t);
  if (period === 'week') { const s = startOfWeek(t); return it.date >= ymd(s) && it.date <= ymd(addDays(s, 6)); }
  if (period === 'month') return it.date.slice(0, 7) === ymd(t).slice(0, 7);
  return true;
}

function tasksHTML() {
  const b = state.board;
  let list = visible().filter(i => i.type === 'task' && inPeriod(i, b.period));
  if (b.mode !== 'columns' && b.status !== 'all') list = list.filter(i => statusOf(i) === b.status);
  list.sort((a, c) => (a.date || '9999').localeCompare(c.date || '9999') || byOrder(a, c));

  const periods = [['all', 'Todas las fechas'], ['today', 'Hoy'], ['week', 'Esta semana'], ['month', 'Este mes'], ['nodate', 'Sin fecha']];
  const modes = [['columns', 'Columnas', ICON.columns], ['mosaic', 'Mosaico', ICON.grid], ['list', 'Lista', ICON.list]];
  const statusSeg = b.mode === 'columns' ? '' : `<div class="seg">${[['all', 'Todas'], ...STATUSES].map(([v, l]) => `<button data-filter="${v}" class="${b.status === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;

  const bar = `<div class="toolbar">
    <h2 class="ttl">Tareas <span class="count">${list.length}</span></h2>
    <div class="tb-right">
      <label class="select">${ICON.cal}<select id="period" aria-label="Filtrar por fecha">${periods.map(([v, l]) => `<option value="${v}"${b.period === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      ${statusSeg}
      <div class="seg modes">${modes.map(([v, l, ic]) => `<button data-mode="${v}" class="${b.mode === v ? 'on' : ''}" title="${l}">${ic}<span>${l}</span></button>`).join('')}</div>
    </div>
  </div>`;

  let body;
  if (b.mode === 'columns') {
    body = `<div class="board">${STATUSES.map(([s, l]) => {
      const col = list.filter(i => statusOf(i) === s);
      return `<section class="col" data-status="${s}" data-drop="status">
        <header class="col-h"><span class="col-t">${l}</span><span class="n st-${s}">${col.length}</span>
          <button class="icon-btn sm" data-act="new" data-type="task" data-st="${s}" aria-label="Agregar en ${l}">${ICON.plus}</button></header>
        <div class="col-list">${col.map(card).join('') || '<p class="col-empty">Arrastrá tareas acá</p>'}</div>
      </section>`;
    }).join('')}</div>`;
  } else if (!list.length) {
    body = '<p class="empty">No hay tareas con este filtro.</p>';
  } else if (b.mode === 'mosaic') {
    body = `<div class="mosaic">${list.map(card).join('')}</div>`;
  } else {
    body = `<div class="tlist">${list.map(it => row(it, true, true)).join('')}</div>`;
  }
  return bar + body;
}

function notesHTML() {
  const list = visible().filter(i => i.type === 'note').sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return `<div class="toolbar">
      <h2 class="ttl">Notas <span class="count">${list.length}</span></h2>
      <button class="btn primary sm" data-act="new" data-type="note">${ICON.plus}<span>Nueva nota</span></button>
    </div>
    <div class="notes">${list.length
      ? list.map(n => `<article class="note-card c-${n.color || 'gris'}" data-id="${n.id}"><h4>${esc(n.title)}</h4>${n.notes ? `<p>${esc(n.notes)}</p>` : ''}<time>${n.date ? shortDate(n.date) + ' · ' : ''}Creada ${shortDate(createdOf(n))}</time></article>`).join('')
      : '<p class="empty">Sin notas todavía.</p>'}</div>`;
}

function settingsHTML() {
  return `<div class="settings">
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
      <p class="muted">Ahora todo se guarda <b>solo en este dispositivo</b>. Para ver lo mismo en el celu y en la compu hay que conectar la base de datos (ver README).</p>`;
  }
  if (!u) {
    return `<h3>Sincronizar</h3>
      <p class="muted">Entrá con tu mail y te mandamos un link. Así ves lo mismo en todos tus dispositivos.</p>
      <form id="login" class="inline"><input class="input" type="email" name="email" required placeholder="tu@mail.com"><button class="btn primary">Enviar link</button></form>
      <p class="muted" id="login-msg"></p>`;
  }
  return `<h3>Sincronizar</h3>
    <p class="muted">Conectado como <b>${esc(u.email)}</b> · ${SYNC[store.getStatus()]}</p>
    <div class="btns"><button class="btn ghost" data-act="sync">Sincronizar ahora</button><button class="btn ghost" data-act="logout">Cerrar sesión</button></div>`;
}

function renderMini() {
  const c = state.miniCursor;
  const first = new Date(c.getFullYear(), c.getMonth(), 1);
  const start = startOfWeek(first);
  const days = new Date(c.getFullYear(), c.getMonth() + 1, 0).getDate();
  const total = Math.ceil(((first.getDay() + 6) % 7 + days) / 7) * 7;
  const map = itemsByDate();
  const t = todayKey();
  let cells = '';
  for (let i = 0; i < total; i++) {
    const d = addDays(start, i), k = ymd(d);
    const cl = ['md', d.getMonth() !== c.getMonth() && 'out', k === t && 'today', k === state.selected && 'sel', map.has(k) && 'has'].filter(Boolean).join(' ');
    cells += `<button class="${cl}" data-goto="${k}">${d.getDate()}</button>`;
  }
  $('#mini').innerHTML = `<div class="mini-head"><b>${cap(MONTHS[c.getMonth()])} ${c.getFullYear()}</b>
      <div><button class="icon-btn sm" data-mini="-1" aria-label="Mes anterior">${ICON.left}</button><button class="icon-btn sm" data-mini="1" aria-label="Mes siguiente">${ICON.right}</button></div></div>
    <div class="mini-grid">${DAYS_SHORT.map(d => `<span class="h">${d[0]}</span>`).join('')}${cells}</div>`;
}

// ---- editor ----

function formHTML(it) {
  return `<form id="form" class="form" autocomplete="off" novalidate>
    <div class="form-head">
      <div><h3>${it ? 'Editar' : 'Nuevo'}</h3>${it ? `<p class="created">Creada el ${longDate(createdOf(it)).toLowerCase()}</p>` : ''}</div>
      <button type="button" class="icon-btn close" data-act="close" aria-label="Cerrar">${ICON.x}</button>
    </div>
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
    <div class="field only-task"><span>Estado</span><div class="seg seg-full">${STATUSES.map(([v, l]) => `<label><input type="radio" name="status" value="${v}"><span>${l}</span></label>`).join('')}</div></div>
    <div class="field"><span>Color para destacar</span><div class="swatches">${COLORS.map(c => `<label class="sw c-${c}" title="${c === 'gris' ? 'Sin color' : cap(c)}"><input type="radio" name="color" value="${c}"><i></i></label>`).join('')}</div></div>
    <div class="actions">
      ${it ? '<button type="button" class="btn danger" data-act="delete">Eliminar</button>' : ''}
      <button type="submit" class="btn primary">${it ? 'Guardar' : 'Agregar'}</button>
    </div>
  </form>`;
}

function openEditor(id, opts = {}) {
  const it = id ? store.all().find(x => x.id === id) : null;
  if (id && !it) return;
  state.editing = it ? it.id : null;
  const type = opts.type || 'task';
  const d = it || {
    type, title: '', notes: '', color: 'gris',
    start: opts.start || '', end: opts.end || '',
    status: opts.status || 'todo',
    date: opts.date ?? (type === 'note' || state.page === 'tasks' ? '' : state.selected),
  };
  $('#editor').innerHTML = formHTML(it);
  const f = $('#form'), F = f.elements;
  F.type.value = d.type;
  F.title.value = d.title;
  F.notes.value = d.notes || '';
  F.date.value = d.date || '';
  F.start.value = d.start || '';
  F.end.value = d.end || '';
  F.status.value = statusOf(d);
  F.color.value = COLORS.includes(d.color) ? d.color : 'gris';
  f.dataset.type = d.type;
  for (const el of document.querySelectorAll('#page .active')) el.classList.remove('active');
  if (it) for (const el of document.querySelectorAll(`#page [data-id="${it.id}"]`)) el.classList.add('active');
  if (opts.silent) return;
  document.body.classList.add('sheet-open');
  if (!it && !phone()) setTimeout(() => F.title.focus(), 50);
}

function closeEditor() {
  document.body.classList.remove('sheet-open');
  for (const el of document.querySelectorAll('#page .active')) el.classList.remove('active');
  state.editing = null;
}

function submitForm(f) {
  const F = f.elements;
  const title = F.title.value.trim();
  if (!title) { F.title.classList.add('err'); F.title.focus(); return; }
  const prev = state.editing ? store.all().find(x => x.id === state.editing) : null;
  const type = F.type.value;
  const status = type === 'task' ? F.status.value || 'todo' : 'todo';
  const item = {
    ...(prev || {}),
    id: prev?.id || store.uid(),
    type, title, status,
    notes: F.notes.value.trim(),
    date: F.date.value,
    start: F.start.value,
    end: F.end.value,
    color: F.color.value || 'gris',
    done: type === 'task' && status === 'done',
    createdAt: prev?.createdAt || new Date().toISOString(),
  };
  if (item.date && state.page === 'calendar') {
    state.selected = item.date;
    state.cursor = parse(item.date);
    state.miniCursor = parse(item.date);
  }
  closeEditor();
  store.save(item);
  toast(prev ? 'Guardado' : type === 'note' ? 'Nota agregada' : 'Tarea agregada');
}

function setStatus(id, status) {
  const it = store.all().find(x => x.id === id);
  if (!it || statusOf(it) === status) return;
  store.save({ ...it, status, done: status === 'done' });
  if (state.editing === id) $('#form').elements.status.value = status;
  if (status === 'done') toast('¡Hecho! ✓');
}

function toggle(id) {
  const it = store.all().find(x => x.id === id);
  if (it) setStatus(id, it.done ? 'todo' : 'done');
}

function deleteEditing() {
  const it = store.all().find(x => x.id === state.editing);
  if (!it || !confirm(`¿Eliminar "${it.title}"?`)) return;
  closeEditor();
  store.remove(it.id);
  toast('Eliminado');
}

function select(k, jump = false) {
  state.selected = k;
  if (jump) { state.cursor = parse(k); state.miniCursor = parse(k); }
  render();
}

function navigate(dir) {
  const c = state.cursor;
  const step = state.view === 'week' || (state.view === 'detail' && !phone()) ? 7 : 1;
  if (dir === 0) { state.cursor = new Date(); state.selected = todayKey(); }
  else if (state.view === 'month') state.cursor = new Date(c.getFullYear(), c.getMonth() + dir, 1);
  else state.cursor = addDays(c, dir * step);
  if (state.view === 'day' || (state.view === 'detail' && phone())) state.selected = ymd(state.cursor);
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
// Destinos: data-drop="date" (día), "allday" (día sin horario), "slot" (día + hora) y "status" (columna del tablero).

let drag = null;
let suppressClickUntil = 0;

document.addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-drag]');
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
document.addEventListener('contextmenu', e => { if (e.target.closest('[data-drag]')) e.preventDefault(); });

function startDrag(x, y) {
  if (!drag) return;
  drag.on = true;
  const r = drag.el.getBoundingClientRect();
  drag.dx = x - r.left;
  drag.dy = y - r.top;
  drag.ghost = drag.el.cloneNode(true);
  drag.ghost.classList.add('drag-ghost');
  drag.ghost.style.cssText = `width:${r.width}px;height:${r.height}px`;
  document.body.append(drag.ghost);
  drag.el.classList.add('dragging');
  document.body.classList.add('is-dragging');
  navigator.vibrate?.(15);
  moveDrag(x, y);
}

function slotMinutes(target, y) {
  const top = y - drag.dy - target.getBoundingClientRect().top;
  return state.detailFrom * 60 + Math.round(top / PPM / 15) * 15;
}

function moveDrag(x, y) {
  drag.x = x; drag.y = y;
  drag.ghost.style.transform = `translate(${x - drag.dx}px, ${y - drag.dy}px)`;
  const target = document.elementFromPoint(x, y)?.closest('#page [data-drop]') ?? null;
  if (target !== drag.target) {
    drag.target?.classList.remove('drop');
    target?.classList.add('drop');
    drag.target = target;
  }
  if (target?.dataset.drop === 'slot') drag.ghost.dataset.time = fromMin(Math.max(0, Math.min(slotMinutes(target, y), 23 * 60 + 45)));
  else delete drag.ghost.dataset.time;
}

function dropDrag() {
  suppressClickUntil = Date.now() + 300;
  const t = drag.target;
  const it = store.all().find(x => x.id === drag.id);
  if (!t || !it) return;
  const kind = t.dataset.drop;
  let patch = null;

  if (kind === 'status') {
    if (it.type === 'task') return setStatus(it.id, t.dataset.status);
    return;
  }
  if (kind === 'date' && it.date !== t.dataset.date) patch = { date: t.dataset.date };
  if (kind === 'allday') patch = { date: t.dataset.date, start: '', end: '' };
  if (kind === 'slot') {
    const dur = it.start ? (it.end ? toMin(it.end) : toMin(it.start) + 60) - toMin(it.start) : 60;
    const m = Math.max(0, Math.min(slotMinutes(t, drag.y), 24 * 60 - Math.max(15, dur)));
    patch = { date: t.dataset.date, start: fromMin(m), end: fromMin(Math.min(m + Math.max(15, dur), 23 * 60 + 59)) };
  }
  if (!patch) return;
  state.selected = patch.date;
  store.save({ ...it, ...patch });
  if (state.editing === it.id) {
    const F = $('#form').elements;
    F.date.value = patch.date;
    if ('start' in patch) { F.start.value = patch.start; F.end.value = patch.end; }
  }
  toast(`Movido al ${shortDate(patch.date)}${patch.start ? ' a las ' + patch.start : ''}`);
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
    if (a === 'new') {
      const type = el.dataset.type || (state.page === 'notes' ? 'note' : 'task');
      return openEditor(null, { type, status: el.dataset.st });
    }
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
  if ((el = on('[data-mode]'))) { state.board.mode = el.dataset.mode; pref.set('boardMode', el.dataset.mode); return render(); }
  if ((el = on('[data-filter]'))) { state.board.status = el.dataset.filter; return render(); }
  if ((el = on('[data-day]'))) {
    state.selected = el.dataset.day;
    state.cursor = parse(state.selected);
    state.view = 'day';
    return render();
  }
  if ((el = on('[data-mini]'))) {
    const c = state.miniCursor;
    state.miniCursor = new Date(c.getFullYear(), c.getMonth() + Number(el.dataset.mini), 1);
    return renderMini();
  }
  if ((el = on('[data-goto]'))) { state.page = 'calendar'; return select(el.dataset.goto, true); }
  if ((el = on('[data-pick]'))) return select(el.dataset.pick);
  if ((el = on('#page [data-id]'))) return openEditor(el.dataset.id);
  if ((el = on('#page .dt-col'))) {
    // Tocar un hueco de la vista Detallada agrega algo a esa hora.
    const top = e.clientY - el.getBoundingClientRect().top;
    const m = Math.min(23 * 60, state.detailFrom * 60 + Math.floor(top / PPM / 30) * 30);
    state.selected = el.dataset.date;
    return openEditor(null, { date: el.dataset.date, start: fromMin(m), end: fromMin(Math.min(m + 60, 23 * 60 + 59)) });
  }
  if ((el = on('#page [data-date]'))) {
    const k = el.dataset.date;
    const again = k === state.selected;
    select(k);
    // El primer toque elige el día; el segundo agrega algo.
    if (again) openEditor(null, { date: k });
  }
});

document.addEventListener('dblclick', e => {
  const el = e.target.closest('#page .cell, #page .wcol');
  if (el && !e.target.closest('[data-id]')) openEditor(null, { date: el.dataset.date });
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
  if (t.id === 'period') { state.board.period = t.value; render(); }
  if (t.id === 's-import' && t.files[0]) { importData(t.files[0]); t.value = ''; }
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'search') { state.query = t.value; if (state.page === 'settings') state.page = 'calendar'; render(); }
  if (t.name === 'title') t.classList.remove('err');
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.body.classList.contains('sheet-open')) closeEditor();
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (state.page === 'calendar') render(); }, 150);
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
store.init();
