// ─────────────────────────────────────────────────────────────────────────────
// state.js — État du projet, historique (undo/redo), persistance locale.
// ─────────────────────────────────────────────────────────────────────────────
import { deviceMeta } from './devices.js';

const STORAGE_KEY = 'bantucrea.netarch.project.v1';
const HISTORY_LIMIT = 60;

let seq = 0;
export function uid(prefix = 'id') {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export const state = {
  project: emptyProject(),
  selection: { kind: null, id: null }, // kind: node | link | zone
  history: { past: [], future: [] },
  ui: {
    zoom: 1,
    tx: 60,
    ty: 40,
    activeTab: 'props',
    flows: true,
    snap: true,
    dirty: false,
    lastSaved: null,
    placing: null, // type d'équipement en cours de placement
    paletteQuery: '',
  },
  listeners: new Set(),
};

export function emptyProject() {
  return {
    name: 'Nouvelle architecture',
    company: '',
    author: '',
    createdAt: new Date().toISOString(),
    zones: [],
    nodes: [],
    links: [],
  };
}

// ── Pub / sub ────────────────────────────────────────────────────────────────
export function onChange(fn) {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

export function emit(reason = 'change') {
  for (const fn of state.listeners) fn(state, reason);
}

// ── Sélections ───────────────────────────────────────────────────────────────
export function select(kind, id) {
  state.selection = { kind, id };
  emit('selection');
}

export function clearSelection() {
  select(null, null);
}

export function selected() {
  const { kind, id } = state.selection;
  if (kind === 'node') return state.project.nodes.find((n) => n.id === id) || null;
  if (kind === 'link') return state.project.links.find((l) => l.id === id) || null;
  if (kind === 'zone') return state.project.zones.find((z) => z.id === id) || null;
  return null;
}

// ── Historique ───────────────────────────────────────────────────────────────
export function snapshot() {
  return JSON.stringify({
    project: state.project,
    selection: state.selection,
  });
}

export function pushHistory(label = '') {
  state.history.past.push({ at: Date.now(), label, data: snapshot() });
  if (state.history.past.length > HISTORY_LIMIT) state.history.past.shift();
  state.history.future.length = 0;
}

export function restore(data) {
  const parsed = JSON.parse(data);
  state.project = parsed.project;
  state.selection = parsed.selection || { kind: null, id: null };
}

/** Pousse un instantané déjà capturé (utile pour les glisser-déposer). */
export function pushRaw(data, label = '') {
  state.history.past.push({ at: Date.now(), label, data });
  if (state.history.past.length > HISTORY_LIMIT) state.history.past.shift();
  state.history.future.length = 0;
}

export function undo() {
  if (!state.history.past.length) return false;
  state.history.future.push({ data: snapshot() });
  const entry = state.history.past.pop();
  restore(entry.data);
  emit('history');
  return true;
}

export function redo() {
  if (!state.history.future.length) return false;
  state.history.past.push({ data: snapshot() });
  const entry = state.history.future.pop();
  restore(entry.data);
  emit('history');
  return true;
}

// ── Fabriques ────────────────────────────────────────────────────────────────
export function makeNode(type, x, y, overrides = {}) {
  const meta = deviceMeta(type);
  const base = {
    id: uid('n'),
    type,
    x: Math.round(x),
    y: Math.round(y),
    w: meta.w,
    h: meta.h,
    name: uniqueName(meta.label),
    ip: '',
    cidr: '',
    vlan: '',
    status: 'up',
    os: '',
    model: '',
    notes: '',
    exposedPorts: '',
  };
  Object.assign(base, meta.defaults || {}, overrides);
  if (type === 'firewall' && !Array.isArray(base.rules)) base.rules = [];
  return base;
}

export function uniqueName(label) {
  const root = label.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, '').trim();
  const short = root.split(' ')[0].toUpperCase().slice(0, 8) || 'NOEUD';
  let i = 1;
  const taken = new Set(state.project.nodes.map((n) => n.name));
  while (taken.has(`${short}-${String(i).padStart(2, '0')}`)) i++;
  return `${short}-${String(i).padStart(2, '0')}`;
}

export function makeLink(a, b, overrides = {}) {
  return {
    id: uid('l'),
    a,
    b,
    media: 'copper',
    speed: '1 Gb/s',
    vlan: '',
    state: 'up',
    note: '',
    ...overrides,
  };
}

export function makeZone(x, y, w, h, overrides = {}) {
  const palette = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
  const color = palette[state.project.zones.length % palette.length];
  return {
    id: uid('z'),
    name: `Zone ${state.project.zones.length + 1}`,
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
    color,
    cidr: '',
    vlan: '',
    note: '',
    ...overrides,
  };
}

// ── Mutations ────────────────────────────────────────────────────────────────
export function addNode(node) {
  pushHistory('Ajout équipement');
  state.project.nodes.push(node);
  select('node', node.id);
  return node;
}

export function addLink(link) {
  const exists = state.project.links.some(
    (l) => (l.a === link.a && l.b === link.b) || (l.a === link.b && l.b === link.a),
  );
  if (exists || link.a === link.b) return null;
  pushHistory('Ajout liaison');
  state.project.links.push(link);
  select('link', link.id);
  return link;
}

export function addZone(zone) {
  pushHistory('Ajout zone');
  state.project.zones.push(zone);
  select('zone', zone.id);
  return zone;
}

export function patch(target, changes, historyLabel = 'Modification') {
  if (!target) return;
  const before = JSON.stringify(target);
  // L'instantané doit être capturé AVANT la modification pour que l'annulation fonctionne.
  const pre = snapshot();
  Object.assign(target, changes);
  if (JSON.stringify(target) === before) return;
  const now = Date.now();
  const top = state.history.past[state.history.past.length - 1];
  // Regroupement des frappes successives : une seule entrée d'historique.
  const coalesce = top && top.label === historyLabel && now - top.at < 800;
  if (coalesce) {
    top.at = now; // on garde l'état « avant » le plus ancien
  } else {
    pushRaw(pre, historyLabel);
  }
  emit('update');
}

export function patchSelected(changes, historyLabel) {
  patch(selected(), changes, historyLabel);
}

export function removeSelected() {
  const { kind, id } = state.selection;
  if (!id) return false;
  pushHistory('Suppression');
  if (kind === 'node') {
    state.project.nodes = state.project.nodes.filter((n) => n.id !== id);
    state.project.links = state.project.links.filter((l) => l.a !== id && l.b !== id);
  } else if (kind === 'link') {
    state.project.links = state.project.links.filter((l) => l.id !== id);
  } else if (kind === 'zone') {
    state.project.zones = state.project.zones.filter((z) => z.id !== id);
  }
  clearSelection();
  return true;
}

export function duplicateSelected() {
  const sel = selected();
  if (!sel || state.selection.kind !== 'node') return null;
  pushHistory('Duplication');
  const copy = { ...JSON.parse(JSON.stringify(sel)), id: uid('n'), x: sel.x + 32, y: sel.y + 32 };
  copy.name = uniqueName(sel.name.replace(/-\d+$/, ''));
  state.project.nodes.push(copy);
  select('node', copy.id);
  return copy;
}

export function loadProject(project, { resetHistory = true } = {}) {
  state.project = normalizeProject(project);
  state.selection = { kind: null, id: null };
  if (resetHistory) state.history = { past: [], future: [] };
  state.ui.dirty = false;
  emit('project');
}

/** Complète un projet importé avec les champs manquants. */
export function normalizeProject(raw) {
  const base = emptyProject();
  const p = { ...base, ...(raw || {}) };
  p.zones = (p.zones || []).map((z) => ({ ...makeZone(0, 0, 200, 160), ...z }));
  p.nodes = (p.nodes || []).map((n) => {
    const meta = deviceMeta(n.type);
    return {
      w: meta.w,
      h: meta.h,
      status: 'up',
      ip: '',
      cidr: '',
      vlan: '',
      notes: '',
      exposedPorts: '',
      ...n,
      rules: n.type === 'firewall' ? (n.rules || []) : undefined,
    };
  });
  const ids = new Set(p.nodes.map((n) => n.id));
  p.links = (p.links || []).filter((l) => ids.has(l.a) && ids.has(l.b) && l.a !== l.b)
    .map((l) => ({ ...makeLink(l.a, l.b), ...l }));
  return p;
}

// ── Persistance locale ───────────────────────────────────────────────────────
export function saveLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.project));
    state.ui.lastSaved = new Date();
    state.ui.dirty = false;
    emit('saved');
    return true;
  } catch {
    return false;
  }
}

export function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.nodes)) return false;
    loadProject(parsed, { resetHistory: true });
    state.ui.lastSaved = new Date();
    return true;
  } catch {
    return false;
  }
}

export function markDirty() {
  state.ui.dirty = true;
}
