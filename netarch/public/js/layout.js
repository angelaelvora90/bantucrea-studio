// ─────────────────────────────────────────────────────────────────────────────
// layout.js — Réorganisation automatique du schéma.
// ─────────────────────────────────────────────────────────────────────────────
import { state, pushHistory, emit, markDirty } from './state.js';
import { zoneOf } from './audit.js';
import { render, fitToContent } from './render.js';

const GAP = 44;

/** Dispose les équipements en grille à l'intérieur de leur zone, puis range les zones. */
export function arrangeByZones() {
  pushHistory('Disposition par zones');
  const { nodes, zones } = state.project;
  const grouped = new Map(zones.map((z) => [z.id, []]));
  const loose = [];
  for (const n of nodes) {
    const z = zoneOf(n, zones);
    if (z) grouped.get(z.id).push(n);
    else loose.push(n);
  }

  let cursorX = 60;
  let rowHeight = 0;
  const maxWidth = 1500;

  for (const zone of zones) {
    const members = grouped.get(zone.id);
    const cols = Math.max(1, Math.ceil(Math.sqrt(members.length)));
    const cellW = Math.max(...members.map((m) => m.w), 130) + GAP;
    const cellH = Math.max(...members.map((m) => m.h), 96) + GAP;
    const innerW = Math.max(240, cols * cellW + GAP);
    const innerH = Math.max(180, Math.ceil(members.length / cols) * cellH + GAP + 40);

    members.forEach((m, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      m.x = cursorX + GAP + col * cellW;
      m.y = 60 + 56 + row * cellH;
    });

    zone.x = cursorX;
    zone.y = 60;
    zone.w = innerW;
    zone.h = innerH;

    cursorX += innerW + GAP * 1.5;
    rowHeight = Math.max(rowHeight, innerH);
    if (cursorX > maxWidth) { cursorX = 60; }
  }

  // Équipements hors zone : rangée au-dessus
  loose.forEach((n, i) => {
    n.x = 60 + i * (n.w + GAP);
    n.y = -120;
  });

  markDirty();
  render();
  fitToContent();
  emit('update');
}

/** Dispose en arborescence (couches) à partir du nœud le plus « bordure ». */
export function arrangeTree() {
  pushHistory('Disposition hiérarchique');
  const { nodes, links } = state.project;
  if (!nodes.length) return;

  const adjacency = new Map(nodes.map((n) => [n.id, []]));
  for (const l of links) {
    if (!adjacency.has(l.a) || !adjacency.has(l.b)) continue;
    adjacency.get(l.a).push(l.b);
    adjacency.get(l.b).push(l.a);
  }

  const order = ['internet', 'cloud', 'firewall', 'vpn', 'router', 'switchL3', 'switch'];
  const root = [...nodes].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))[0] || nodes[0];

  const depth = new Map([[root.id, 0]]);
  const queue = [root.id];
  while (queue.length) {
    const id = queue.shift();
    for (const next of adjacency.get(id) || []) {
      if (depth.has(next)) continue;
      depth.set(next, depth.get(id) + 1);
      queue.push(next);
    }
  }
  for (const n of nodes) if (!depth.has(n.id)) depth.set(n.id, 99);

  const byDepth = new Map();
  for (const n of nodes) {
    const d = depth.get(n.id);
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d).push(n);
  }

  let y = 40;
  for (const d of [...byDepth.keys()].sort((a, b) => a - b)) {
    const row = byDepth.get(d);
    const totalW = row.reduce((s, n) => s + n.w, 0) + GAP * (row.length - 1);
    let x = Math.max(60, (1200 - totalW) / 2);
    for (const n of row) { n.x = Math.round(x); n.y = y; x += n.w + GAP; }
    y += Math.max(...row.map((n) => n.h)) + GAP * 2.2;
  }

  markDirty();
  render();
  fitToContent();
  emit('update');
}

/** Remet toutes les zones à une taille cohérente autour de leurs équipements. */
export function tidyZones() {
  pushHistory('Ajustement des zones');
  for (const zone of state.project.zones) {
    const members = state.project.nodes.filter((n) => zoneOf(n, state.project.zones)?.id === zone.id);
    if (!members.length) continue;
    const pad = 46;
    const x = Math.min(...members.map((m) => m.x)) - pad;
    const y = Math.min(...members.map((m) => m.y)) - pad - 24;
    zone.x = x;
    zone.y = y;
    zone.w = Math.max(...members.map((m) => m.x + m.w)) - x + pad;
    zone.h = Math.max(...members.map((m) => m.y + m.h)) - y + pad;
  }
  markDirty();
  render();
  emit('update');
}
