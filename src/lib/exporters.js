// Exportations : rendu SVG/PNG de la carte (vectoriel, auto-suffisant),
// CSV des équipements, CSV des vulnérabilités, JSON complet.

import { tileMarkup } from './icons.js';
import { buildVisData } from './graphBuilders.js';
import { paddedHull, smoothClosedPathCommands, bboxOf } from './geometry.js';
import { subnetColor, hexA } from './subnets.js';
import { SEV_LABELS } from './risk.js';

export function download(filename, content, mime = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const timestamp = () =>
  new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');

export const fileName = (ext) => `netmap-${timestamp()}.${ext}`;

// ---------------------------------------------------------------------------
// Rendu SVG de la carte
// ---------------------------------------------------------------------------
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Construit un SVG autonome de la carte à partir des positions courantes.
 * @param hosts hôtes affichés
 * @param positions { id: {x, y} } coordonnées canvas de vis-network
 */
export function buildSvgMap(hosts, positions) {
  const pts = hosts.map((h) => positions[h.id]).filter(Boolean);
  if (!pts.length) throw new Error('Aucune position disponible pour le rendu.');

  const MARGIN = 110;
  const { minX, minY, maxX, maxY } = bboxOf(pts);
  const width = Math.round(maxX - minX + MARGIN * 2);
  const height = Math.round(maxY - minY + MARGIN * 2 + 40);
  const T = (p) => ({ x: p.x - minX + MARGIN, y: p.y - minY + MARGIN });

  const visible = hosts.filter((h) => positions[h.id]);
  const pos = {};
  for (const h of visible) pos[h.id] = T(positions[h.id]);

  const { links } = buildVisData(visible);

  // Groupes de sous-réseaux (enveloppes arrondies en arrière-plan).
  const bySubnet = new Map();
  for (const h of visible) {
    if (!bySubnet.has(h.subnet)) bySubnet.set(h.subnet, []);
    bySubnet.get(h.subnet).push(h);
  }
  const hulls = [];
  const plates = [];
  for (const [subnet, members] of [...bySubnet.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const color = subnetColor(subnet);
    const hullPts = paddedHull(members.map((m) => pos[m.id]), 52);
    hulls.push(
      `<path d="${smoothClosedPathCommands(hullPts)}" fill="${hexA(color, 0.07)}" stroke="${hexA(color, 0.45)}" stroke-width="1.6" stroke-dasharray="7 6"/>`,
    );
    const b = bboxOf(hullPts);
    const label = `${subnet} — ${members.length} hôte${members.length > 1 ? 's' : ''}`;
    const w = label.length * 6.6 + 18;
    plates.push(
      `<g><rect x="${b.minX.toFixed(1)}" y="${(b.minY - 30).toFixed(1)}" width="${w.toFixed(0)}" height="19" rx="6" fill="#0f172a" fill-opacity=".92" stroke="${hexA(color, 0.5)}"/>` +
        `<text x="${(b.minX + 9).toFixed(1)}" y="${(b.minY - 17).toFixed(1)}" fill="${color}" font-size="11.5" font-weight="600">${esc(label)}</text></g>`,
    );
  }

  // Symboles de tuiles par couple catégorie × risque réellement utilisé.
  const combos = [...new Set(visible.map((h) => `${h.category.category}::${h.risk.level}`))];
  const defs = combos
    .map((c) => {
      const [cat, lvl] = c.split('::');
      return `<g id="n-${cat}-${lvl}">${tileMarkup(cat, lvl)}</g>`;
    })
    .join('');

  const edgeEls = links
    .filter((l) => pos[l.from] && pos[l.to])
    .map((l) => {
      const a = pos[l.from];
      const b = pos[l.to];
      const style =
        l.kind === 'core'
          ? `stroke="rgba(148,163,184,0.8)" stroke-width="2.4"`
          : l.kind === 'trace'
            ? `stroke="rgba(71,85,105,0.6)" stroke-width="1.2" stroke-dasharray="5 6"`
            : `stroke="rgba(100,116,139,0.5)" stroke-width="1.5"`;
      return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" ${style}/>`;
    })
    .join('');

  const nodeEls = visible
    .map((h) => {
      const p = pos[h.id];
      const size = 56;
      const name = h.hostnames?.[0]?.name
        ? h.hostnames[0].name.length > 26
          ? `${h.hostnames[0].name.slice(0, 25)}…`
          : h.hostnames[0].name
        : h.ip;
      return (
        `<use href="#n-${h.category.category}-${h.risk.level}" x="${(p.x - size / 2).toFixed(1)}" y="${(p.y - size / 2).toFixed(1)}" width="${size}" height="${size}"/>` +
        `<text x="${p.x.toFixed(1)}" y="${(p.y + size / 2 + 15).toFixed(1)}" text-anchor="middle" fill="#e2e8f0" font-size="12.5" font-weight="600" paint-order="stroke" stroke="#0b1220" stroke-width="4">${esc(name)}</text>` +
        (name !== h.ip
          ? `<text x="${p.x.toFixed(1)}" y="${(p.y + size / 2 + 29).toFixed(1)}" text-anchor="middle" fill="#94a3b8" font-size="11" paint-order="stroke" stroke="#0b1220" stroke-width="4">${esc(h.ip)}</text>`
          : '')
      );
    })
    .join('');

  const stamp = `NetMap Visualizer — export local du ${new Date().toLocaleString('fr-FR')} — ${visible.length} hôte${visible.length > 1 ? 's' : ''}`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="ui-sans-serif, system-ui, 'Segoe UI', sans-serif">` +
    `<defs>${defs}</defs>` +
    `<rect width="${width}" height="${height}" fill="#0b1220"/>` +
    hulls.join('') +
    edgeEls +
    nodeEls +
    plates.join('') +
    `<text x="${width - 14}" y="${height - 14}" text-anchor="end" fill="#475569" font-size="11">${esc(stamp)}</text>` +
    `</svg>`;
  return { svg, width, height };
}

/** Convertit un SVG en data-URL PNG haute définition. */
export async function svgToPngDataUrl(svg, width, height, scale = 3) {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    const loaded = new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error('Impossible de charger le rendu SVG.'));
    });
    img.src = url;
    await loaded;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

export function downloadDataUrl(filename, dataUrl) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---------------------------------------------------------------------------
// CSV / JSON
// ---------------------------------------------------------------------------
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toTable = (headers, rows) =>
  '\uFEFF' + [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');

export function hostsToCsv(hosts) {
  const headers = [
    'IP', "Nom d'hôte", 'MAC', 'Constructeur', 'OS détecté', 'Précision OS (%)',
    'Type', 'Sous-réseau', 'Ports ouverts', 'Services', 'Niveau de risque',
    'Nb vulnérabilités', 'Principales vulnérabilités', 'Fichiers source',
  ];
  const rows = hosts.map((h) => {
    const open = h.ports.filter((p) => p.state === 'open');
    return [
      h.ip || h.id,
      h.hostnames.map((x) => x.name).join(' '),
      h.mac?.addr || '',
      h.mac?.vendor || '',
      h.os?.[0]?.name || '',
      h.os?.[0]?.accuracy ?? '',
      h.category.label,
      h.subnet,
      open.length,
      open
        .map((p) => `${p.port}/${p.protocol} ${p.service?.name || ''} ${p.service?.product || ''} ${p.service?.version || ''}`.trim())
        .join(' | '),
      SEV_LABELS[h.risk.level],
      h.risk.findings.length,
      h.risk.findings
        .slice(0, 5)
        .map((f) => `[${SEV_LABELS[f.severity]}] ${f.title}${f.cves.length ? ` (${f.cves.join(', ')})` : ''}`)
        .join(' | '),
      h.files.join(' '),
    ];
  });
  return toTable(headers, rows);
}

export function findingsToCsv(hosts) {
  const headers = ['IP', "Nom d'hôte", 'Port', 'Sévérité', 'Titre', 'Détail', 'CVE'];
  const rows = [];
  for (const h of hosts) {
    for (const f of h.risk.findings) {
      rows.push([
        h.ip || h.id,
        h.hostnames.map((x) => x.name).join(' '),
        f.port ?? '',
        SEV_LABELS[f.severity],
        f.title,
        f.detail.replace(/\s+/g, ' ').slice(0, 600),
        f.cves.join(' '),
      ]);
    }
  }
  return toTable(headers, rows);
}

export function hostsToJson(hosts, metas, filters) {
  return JSON.stringify(
    {
      outil: 'NetMap Visualizer',
      genereLe: new Date().toISOString(),
      filtres: filters,
      fichiers: metas,
      hotes: hosts,
    },
    null,
    2,
  );
}
