// ─────────────────────────────────────────────────────────────────────────────
// export.js — Export PNG, SVG, JSON et rapport Markdown.
// ─────────────────────────────────────────────────────────────────────────────
import { state } from './state.js';
import { contentBounds, svgElement, escapeHtml } from './render.js';
import { auditProject, zoneOf } from './audit.js';
import { deviceMeta, MEDIA_MAP } from './devices.js';
import { cidrInfo } from './net.js';

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function slug(text) {
  return String(text || 'architecture').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'architecture';
}

/** Construit un SVG autonome cadré sur le contenu du schéma. */
export function buildSvgString({ padding = 40, background = '#0b1220', grid = false } = {}) {
  const src = svgElement();
  const clone = src.cloneNode(true);
  const b = contentBounds();
  const w = b.w + padding * 2;
  const h = b.h + padding * 2;

  clone.setAttribute('width', Math.round(w));
  clone.setAttribute('height', Math.round(h));
  clone.setAttribute('viewBox', `0 0 ${Math.round(w)} ${Math.round(h)}`);
  clone.removeAttribute('class');
  clone.removeAttribute('id');

  const world = clone.querySelector('#world');
  world.setAttribute('transform', `translate(${-b.x + padding},${-b.y + padding}) scale(1)`);

  clone.querySelectorAll('.temp-link, .marquee, .finding-ring, .nd-port').forEach((n) => n.remove());
  clone.querySelector('.grid-line')?.setAttribute('stroke', grid ? '#182438' : 'transparent');

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', '0');
  bg.setAttribute('y', '0');
  bg.setAttribute('width', Math.round(w));
  bg.setAttribute('height', Math.round(h));
  bg.setAttribute('fill', background);
  clone.insertBefore(bg, clone.firstChild.nextSibling);

  const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  title.setAttribute('x', padding);
  title.setAttribute('y', Math.round(h) - 14);
  title.setAttribute('fill', '#475569');
  title.setAttribute('font-family', 'ui-sans-serif, system-ui, sans-serif');
  title.setAttribute('font-size', '11');
  title.textContent = `${state.project.name}${state.project.company ? ` — ${state.project.company}` : ''} · BantuCrea Studio`;
  world.appendChild(title);

  return new XMLSerializer().serializeToString(clone);
}

export function exportSVG() {
  download(new Blob([buildSvgString()], { type: 'image/svg+xml;charset=utf-8' }), `${slug(state.project.name)}.svg`);
}

export async function exportPNG(scale = 2) {
  const svgText = buildSvgString();
  const b = contentBounds();
  const w = Math.round((b.w + 80) * scale);
  const h = Math.round((b.h + 80) * scale);
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Rasterisation du SVG impossible.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const out = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    download(out, `${slug(state.project.name)}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function exportJSON() {
  const payload = {
    format: 'bantucrea-netarch',
    version: 1,
    exportedAt: new Date().toISOString(),
    project: state.project,
  };
  download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${slug(state.project.name)}.json`);
}

/** Rapport Markdown : inventaire, adressage, filtrage, audit. */
export function buildMarkdown() {
  const p = state.project;
  const audit = auditProject(p);
  const now = new Date().toLocaleString('fr-FR');
  const lines = [];

  lines.push(`# ${p.name || 'Architecture réseau'}`);
  if (p.company) lines.push(`\n**Entreprise / client :** ${p.company}`);
  if (p.author) lines.push(`**Auteur :** ${p.author}`);
  lines.push(`**Généré le :** ${now} · BantuCrea Studio — NetArch`);

  lines.push('\n## 1. Vue d’ensemble\n');
  lines.push('| Zone | Préfixe | VLAN | Équipements | Adresses utiles |');
  lines.push('|---|---|---|---|---|');
  for (const z of p.zones) {
    const info = z.cidr ? cidrInfo(z.cidr) : null;
    const count = p.nodes.filter((n) => zoneOf(n, p.zones)?.id === z.id).length;
    lines.push(`| ${z.name} | ${z.cidr || '—'} | ${z.vlan || '—'} | ${count} | ${info?.valid ? info.usable : '—'} |`);
  }
  const loose = p.nodes.filter((n) => !zoneOf(n, p.zones));
  lines.push(`| _Hors zone_ | — | — | ${loose.length} | — |`);

  lines.push('\n## 2. Inventaire des équipements\n');
  lines.push('| Équipement | Type | Zone | Adresse IP | VLAN | Statut | Ports exposés |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const n of p.nodes) {
    lines.push(`| ${n.name} | ${deviceMeta(n.type).label} | ${zoneOf(n, p.zones)?.name || '—'} | ${n.ip || '—'} | ${n.vlan || '—'} | ${n.status || 'up'} | ${n.exposedPorts || '—'} |`);
  }

  lines.push('\n## 3. Liaisons\n');
  lines.push('| De | Vers | Support | Débit | VLAN | État |');
  lines.push('|---|---|---|---|---|---|');
  for (const l of p.links) {
    const a = p.nodes.find((n) => n.id === l.a)?.name || '?';
    const b = p.nodes.find((n) => n.id === l.b)?.name || '?';
    lines.push(`| ${a} | ${b} | ${MEDIA_MAP[l.media]?.label || l.media} | ${l.speed || '—'} | ${l.vlan || '—'} | ${l.state || 'up'} |`);
  }

  const firewalls = p.nodes.filter((n) => n.type === 'firewall');
  if (firewalls.length) {
    lines.push('\n## 4. Politique de filtrage\n');
    for (const fw of firewalls) {
      lines.push(`\n### ${fw.name}\n`);
      if (!(fw.rules || []).length) { lines.push('_Aucune règle : refus par défaut sur tous les flux._'); continue; }
      lines.push('| # | Règle | Source | Destination | Service | Action |');
      lines.push('|---|---|---|---|---|---|');
      (fw.rules || []).forEach((r, i) => {
        lines.push(`| ${i + 1} | ${r.name || '—'} | ${r.src || 'any'} | ${r.dst || 'any'} | ${r.service || 'any'} | ${r.action === 'deny' ? 'REFUSER' : 'AUTORISER'}${r.enabled === false ? ' (désactivée)' : ''} |`);
      });
      lines.push('\n_Traite de refus par défaut appliqué en fin de politique._');
    }
  }

  lines.push(`\n## 5. Audit de conformité — score ${audit.score}/100\n`);
  if (!audit.findings.length) lines.push('Aucune anomalie détectée.');
  else {
    lines.push('| Gravité | Constat | Recommandation |');
    lines.push('|---|---|---|');
    for (const f of audit.findings) {
      lines.push(`| ${f.severity} | ${f.title} | ${f.detail.replace(/\|/g, '/')} |`);
    }
  }
  lines.push('\n---\n_Document généré automatiquement par BantuCrea Studio — NetArch._');
  return lines.join('\n');
}

export function exportMarkdown() {
  download(new Blob([buildMarkdown()], { type: 'text/markdown;charset=utf-8' }), `${slug(state.project.name)}-rapport.md`);
}

export { escapeHtml };
