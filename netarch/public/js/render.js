// ─────────────────────────────────────────────────────────────────────────────
// render.js — Moteur de rendu SVG : zones, liaisons, équipements, pan/zoom.
// Les éléments sont mis en cache et réutilisés (rendu fluide pendant le glisser).
// ─────────────────────────────────────────────────────────────────────────────
import { deviceMeta, MEDIA_MAP } from './devices.js';
import { state, selected } from './state.js';

const SVGNS = 'http://www.w3.org/2000/svg';

const SVG_CSS = `
  .zn-body{stroke-width:1.5;stroke-dasharray:7 5;rx:18}
  .zn-name{font:600 13px ui-sans-serif,system-ui,sans-serif;fill:#e2e8f0;letter-spacing:.4px}
  .zn-meta{font:500 11px ui-monospace,SFMono-Regular,Menlo,monospace;fill:#94a3b8}
  .zone{cursor:move}
  .zone.selected .zn-body{stroke-width:2.5;stroke-dasharray:none}
  .zn-handle{fill:#0b1220;stroke:#64748b;stroke-width:1.5;cursor:nwse-resize}
  .zone.selected .zn-handle{stroke:#22d3ee}

  .lk-hit{stroke:transparent;stroke-width:16;fill:none;cursor:pointer}
  .lk-line{fill:none;stroke-linecap:round;stroke-width:2.2}
  .lk-flow{fill:none;stroke-width:2.6;stroke-linecap:round;stroke-dasharray:3 14;opacity:.95}
  .link.state-down .lk-line{stroke:#ef4444;stroke-dasharray:6 6;opacity:.9}
  .link.selected .lk-line{stroke:#22d3ee;stroke-width:3.2}
  .lk-tag rect{fill:#0b1220;stroke:#334155;rx:5}
  .lk-tag text{font:600 9.5px ui-monospace,Menlo,monospace;fill:#cbd5e1;text-anchor:middle;dominant-baseline:middle}
  .link.selected .lk-tag rect{stroke:#22d3ee}
  @keyframes flowdash{to{stroke-dashoffset:-68}}
  .flows-on .lk-flow{animation:flowdash 1.5s linear infinite}

  .node{cursor:grab}
  .node.dragging{cursor:grabbing}
  .nd-body{fill:#0f172a;stroke:#334155;stroke-width:1.6;rx:14;filter:url(#soft)}
  .node.selected .nd-body{stroke:#22d3ee;stroke-width:2.4}
  .node:hover .nd-body{stroke:#475569}
  .nd-accent{rx:2}
  .nd-name{font:700 12px ui-sans-serif,system-ui,sans-serif;fill:#f1f5f9;text-anchor:middle}
  .nd-sub{font:500 10px ui-monospace,Menlo,monospace;fill:#94a3b8;text-anchor:middle}
  .nd-badge{font:700 8.5px ui-monospace,Menlo,monospace;fill:#0b1220;text-anchor:middle}
  .nd-icon{pointer-events:none}
  .nd-port{fill:#0b1220;stroke:#22d3ee;stroke-width:2;cursor:crosshair;opacity:0;transition:opacity .12s}
  .node:hover .nd-port,.node.selected .nd-port,.linking .nd-port{opacity:1}
  .node.status-down .nd-body{stroke:#ef4444;opacity:.75}
  .node.status-alert .nd-body{stroke:#f59e0b}
  .temp-link{stroke:#22d3ee;stroke-width:2.4;stroke-dasharray:6 5;fill:none;pointer-events:none}
  .marquee{fill:rgba(34,211,238,.10);stroke:#22d3ee;stroke-width:1;stroke-dasharray:4 4}
  .grid-line{stroke:#182438;stroke-width:1}
  .finding-ring{fill:none;stroke:#f59e0b;stroke-width:2.5;stroke-dasharray:5 4;rx:16}
`;

let svg;
let defs;
let gridRect;
let zonesG;
let linksG;
let nodesG;
let overlayG;
const zoneEls = new Map();
const linkEls = new Map();
const nodeEls = new Map();

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function mount(svgElement) {
  svg = svgElement;
  svg.innerHTML = '';
  // Pas de setAttribute('xmlns') : XMLSerializer déclare déjà l'espace de noms,
  // et un attribut explicite produirait un doublon (XML invalide).

  defs = document.createElementNS(SVGNS, 'defs');

  // Les éléments du <defs> sont créés via createElementNS : la casse des noms
  // (feDropShadow) est ainsi garantie, quel que soit l'analyseur.
  const style = document.createElementNS(SVGNS, 'style');
  style.textContent = SVG_CSS;
  defs.appendChild(style);

  const pattern = el('pattern', { id: 'grid', width: 28, height: 28, patternUnits: 'userSpaceOnUse' });
  pattern.appendChild(el('path', { class: 'grid-line', d: 'M28 0H0V28', fill: 'none' }));
  defs.appendChild(pattern);

  const filter = el('filter', { id: 'soft', x: '-30%', y: '-30%', width: '160%', height: '160%' });
  filter.appendChild(el('feDropShadow', {
    dx: 0, dy: 3, stdDeviation: 4, 'flood-color': '#020617', 'flood-opacity': '0.55',
  }));
  defs.appendChild(filter);

  const marker = el('marker', {
    id: 'arrow', viewBox: '0 0 10 10', refX: 9, refY: 5,
    markerWidth: 6, markerHeight: 6, orient: 'auto',
  });
  marker.appendChild(el('path', { d: 'M0 0L10 5L0 10z', fill: '#22d3ee' }));
  defs.appendChild(marker);

  svg.appendChild(defs);

  const world = document.createElementNS(SVGNS, 'g');
  world.id = 'world';
  gridRect = document.createElementNS(SVGNS, 'rect');
  gridRect.setAttribute('x', '-60000');
  gridRect.setAttribute('y', '-60000');
  gridRect.setAttribute('width', '120000');
  gridRect.setAttribute('height', '120000');
  gridRect.setAttribute('fill', 'url(#grid)');
  world.appendChild(gridRect);

  zonesG = document.createElementNS(SVGNS, 'g');
  linksG = document.createElementNS(SVGNS, 'g');
  nodesG = document.createElementNS(SVGNS, 'g');
  overlayG = document.createElementNS(SVGNS, 'g');
  overlayG.setAttribute('pointer-events', 'none');
  world.append(zonesG, linksG, nodesG, overlayG);
  svg.appendChild(world);
  return svg;
}

// ── Vue (pan / zoom) ─────────────────────────────────────────────────────────
export function applyView() {
  const { tx, ty, zoom } = state.ui;
  const world = svg?.querySelector('#world');
  if (world) world.setAttribute('transform', `translate(${tx},${ty}) scale(${zoom})`);
}

export function setZoom(zoom, pivot) {
  const k = Math.min(2.5, Math.max(0.25, zoom));
  const rect = svg.getBoundingClientRect();
  const px = pivot?.x ?? rect.width / 2;
  const py = pivot?.y ?? rect.height / 2;
  const { tx, ty } = state.ui;
  const factor = k / state.ui.zoom;
  state.ui.tx = px - (px - tx) * factor;
  state.ui.ty = py - (py - ty) * factor;
  state.ui.zoom = k;
  applyView();
}

export function screenToWorld(clientX, clientY) {
  const rect = svg.getBoundingClientRect();
  const { tx, ty, zoom } = state.ui;
  return {
    x: (clientX - rect.left - tx) / zoom,
    y: (clientY - rect.top - ty) / zoom,
  };
}

export function contentBounds() {
  const { nodes, zones } = state.project;
  const items = [
    ...nodes.map((n) => ({ x: n.x, y: n.y, w: n.w, h: n.h })),
    ...zones.map((z) => ({ x: z.x, y: z.y, w: z.w, h: z.h })),
  ];
  if (!items.length) return { x: 0, y: 0, w: 900, h: 600 };
  const minX = Math.min(...items.map((i) => i.x));
  const minY = Math.min(...items.map((i) => i.y));
  const maxX = Math.max(...items.map((i) => i.x + i.w));
  const maxY = Math.max(...items.map((i) => i.y + i.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function fitToContent(padding = 70) {
  const b = contentBounds();
  const rect = svg.getBoundingClientRect();
  const zoom = Math.min(2.5, Math.max(0.25, Math.min(
    (rect.width - padding * 2) / Math.max(1, b.w),
    (rect.height - padding * 2) / Math.max(1, b.h),
  )));
  state.ui.zoom = zoom;
  state.ui.tx = (rect.width - b.w * zoom) / 2 - b.x * zoom;
  state.ui.ty = (rect.height - b.h * zoom) / 2 - b.y * zoom;
  applyView();
}

// ── Aides ────────────────────────────────────────────────────────────────────
export function centerOf(node) {
  return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
}

export function nodeById(id) {
  return state.project.nodes.find((n) => n.id === id);
}

function truncate(text, max = 15) {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function el(tag, attrs = {}) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// ── Rendu ────────────────────────────────────────────────────────────────────
export function render() {
  if (!svg) return;
  svg.classList.toggle('flows-on', state.ui.flows);
  const sel = state.selection;
  const { zones, links, nodes } = state.project;

  // Zones
  const zoneIds = new Set(zones.map((z) => z.id));
  for (const [id, elm] of zoneEls) {
    if (!zoneIds.has(id)) { elm.remove(); zoneEls.delete(id); }
  }
  for (const z of zones) {
    let g = zoneEls.get(z.id);
    const sig = JSON.stringify(z) + (sel.kind === 'zone' && sel.id === z.id ? 'S' : '');
    if (!g) {
      g = el('g', { class: 'zone', 'data-id': z.id, 'data-kind': 'zone' });
      zonesG.appendChild(g);
      zoneEls.set(z.id, g);
    }
    if (g.__sig !== sig) {
      g.__sig = sig;
      g.classList.toggle('selected', sel.kind === 'zone' && sel.id === z.id);
      g.innerHTML = `
        <rect class="zn-body" x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}"
          fill="${z.color}14" stroke="${z.color}"/>
        <text class="zn-name" x="${z.x + 14}" y="${z.y + 22}">${escapeHtml(z.name.toUpperCase())}</text>
        <text class="zn-meta" x="${z.x + 14}" y="${z.y + 38}">${escapeHtml(
          [z.cidr, z.vlan ? `VLAN ${z.vlan}` : ''].filter(Boolean).join('  ·  ') || 'zone libre',
        )}</text>
        <rect class="zn-handle" data-resize="zone" x="${z.x + z.w - 9}" y="${z.y + z.h - 9}" width="14" height="14" rx="3"/>`;
    }
  }

  // Liaisons
  const linkIds = new Set(links.map((l) => l.id));
  for (const [id, elm] of linkEls) {
    if (!linkIds.has(id)) { elm.remove(); linkEls.delete(id); }
  }
  for (const l of links) {
    const a = nodeById(l.a);
    const b = nodeById(l.b);
    if (!a || !b) continue;
    let g = linkEls.get(l.id);
    const media = MEDIA_MAP[l.media] || MEDIA_MAP.copper;
    const isSel = sel.kind === 'link' && sel.id === l.id;
    const showTag = isSel || (state.ui.zoom >= 0.55 && (l.vlan || l.media !== 'copper' || l.state === 'down'));
    const sig = [a.x, a.y, b.x, b.y, l.media, l.speed, l.vlan, l.state, isSel, showTag].join('|');
    if (!g) {
      g = el('g', { class: 'link', 'data-id': l.id, 'data-kind': 'link' });
      linksG.appendChild(g);
      linkEls.set(l.id, g);
    }
    if (g.__sig !== sig) {
      g.__sig = sig;
      g.setAttribute('class', `link state-${l.state || 'up'}${isSel ? ' selected' : ''}`);
      const pa = centerOf(a);
      const pb = centerOf(b);
      const d = `M${pa.x},${pa.y}L${pb.x},${pb.y}`;
      const mx = (pa.x + pb.x) / 2;
      const my = (pa.y + pb.y) / 2;
      const tagText = [l.vlan ? `V${l.vlan}` : '', l.speed].filter(Boolean).join(' ');
      g.innerHTML = `
        <path class="lk-hit" d="${d}"/>
        <path class="lk-line" d="${d}" stroke="${l.state === 'down' ? '#ef4444' : media.color}"
          stroke-dasharray="${media.dash || 'none'}"/>
        <path class="lk-flow" d="${d}" stroke="${media.color}"/>
        ${showTag ? `<g class="lk-tag" transform="translate(${mx},${my})">
            <rect x="${-tagText.length * 3.4 - 7}" y="-8" width="${tagText.length * 6.8 + 14}" height="16"/>
            <text x="0" y="0">${escapeHtml(tagText)}</text>
          </g>` : ''}`;
    }
  }

  // Équipements
  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const [id, elm] of nodeEls) {
    if (!nodeIds.has(id)) { elm.remove(); nodeEls.delete(id); }
  }
  for (const n of nodes) {
    let g = nodeEls.get(n.id);
    const meta = deviceMeta(n.type);
    const isSel = sel.kind === 'node' && sel.id === n.id;
    const sub = [n.ip, n.vlan ? `V${n.vlan}` : ''].filter(Boolean).join(' · ');
    const sig = [n.name, n.ip, n.vlan, n.status, n.type, n.w, n.h, isSel].join('|');
    if (!g) {
      g = el('g', { class: 'node', 'data-id': n.id, 'data-kind': 'node' });
      nodesG.appendChild(g);
      nodeEls.set(n.id, g);
    }
    if (g.__sig !== sig) {
      g.__sig = sig;
      g.setAttribute('class', `node status-${n.status || 'up'}${isSel ? ' selected' : ''}`);
      g.innerHTML = `
        <rect class="nd-body" width="${n.w}" height="${n.h}"/>
        <rect class="nd-accent" x="0" y="0" width="4" height="${n.h}" fill="${meta.color}" rx="2"/>
        <g class="nd-icon" transform="translate(${n.w / 2 - 15}, 12)" color="${meta.color}">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor"
            stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${meta.icon}"/></svg>
        </g>
        <text class="nd-name" x="${n.w / 2}" y="${n.h - 26}">${escapeHtml(truncate(n.name, 16))}</text>
        <text class="nd-sub" x="${n.w / 2}" y="${n.h - 12}">${escapeHtml(truncate(sub || meta.label, 22))}</text>
        <circle class="nd-status" cx="${n.w - 13}" cy="13" r="4.5"
          fill="${n.status === 'down' ? '#ef4444' : n.status === 'alert' ? '#f59e0b' : '#22c55e'}"/>
        <circle class="nd-port" data-port="1" cx="${n.w / 2}" cy="${n.h}" r="7"/>`;
    }
    g.setAttribute('transform', `translate(${n.x},${n.y})`);
  }

  drawFindingMarkers();
  applyView();
}

/** Anneaux orange sur les équipements concernés par une anomalie (si audit ouvert). */
function drawFindingMarkers() {
  overlayG.innerHTML = '';
  if (state.ui.activeTab !== 'audit' || !state.ui.auditTargets?.size) return;
  for (const n of state.project.nodes) {
    if (!state.ui.auditTargets.has(n.id)) continue;
    overlayG.appendChild(el('rect', {
      class: 'finding-ring',
      x: n.x - 6,
      y: n.y - 6,
      width: n.w + 12,
      height: n.h + 12,
    }));
  }
}

// ── Surcharges temporaires (liaison en cours, sélection multiple) ────────────
export function setTempLink(from, to) {
  const existing = overlayG.querySelector('.temp-link');
  if (existing) existing.remove();
  if (!from || !to) return;
  const path = el('path', { class: 'temp-link', d: `M${from.x},${from.y}L${to.x},${to.y}` });
  overlayG.appendChild(path);
}

export function setMarquee(a, b) {
  const existing = overlayG.querySelector('.marquee');
  if (existing) existing.remove();
  if (!a || !b) return;
  overlayG.appendChild(el('rect', {
    class: 'marquee',
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  }));
}

export function clearOverlays() {
  setTempLink(null);
  setMarquee(null);
}

export function svgElement() {
  return svg;
}

export function selectionInfo() {
  return selected();
}
