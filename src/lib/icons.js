// Icônes SVG des équipements. Chaque icône est une « tuile » 64×64 :
// fond ardoise, anneau coloré par le niveau de risque, glyphe blanc.
// Réutilisées à la fois comme data-URI (vis-network) et comme <symbol> (export SVG).

export const RISK_COLORS = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#eab308',
  none: '#34d399',
};

export const RISK_LABELS = {
  critical: 'Critique',
  high: 'Élevé',
  medium: 'Moyen',
  low: 'Faible',
  none: 'Aucun risque détecté',
};

const G = (inner) =>
  `<g transform="translate(17 17)" stroke="#e8eef7" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;

const GLYPHS = {
  // Cartes/serveurs à racks
  server: G(
    `<rect x="2" y="2.5" width="26" height="8" rx="1.8"/><rect x="2" y="13.5" width="26" height="8" rx="1.8"/>` +
      `<circle cx="6.4" cy="6.5" r="1.05" fill="#e8eef7" stroke="none"/><circle cx="6.4" cy="17.5" r="1.05" fill="#e8eef7" stroke="none"/>` +
      `<path d="M11 6.5h8M11 17.5h8"/>`,
  ),
  // Écran + pied
  workstation: G(
    `<rect x="3" y="4" width="24" height="16" rx="2"/><path d="M10.5 26h9M15 20v6"/>`,
  ),
  // Cercle avec deux flèches opposées
  router: G(
    `<circle cx="15" cy="15" r="12.5"/><path d="M8.5 11.5h10M16 8.5l2.8 3-2.8 3M21.5 18.5h-10M14 15.5l-2.8 3 2.8 3"/>`,
  ),
  // Boîtier avec ports et double flèche
  switch: G(
    `<rect x="2" y="8.5" width="26" height="13" rx="2.2"/><rect x="5.5" y="13" width="3" height="4" rx=".8"/>` +
      `<rect x="10.5" y="13" width="3" height="4" rx=".8"/><path d="M23 13.4h-4M21 11.6l2.2 1.8-2.2 1.8M18 16.8h4M20 15l-2.2 1.8 2.2 1.8"/>`,
  ),
  // Imprimante
  printer: G(
    `<rect x="7" y="2.5" width="16" height="7" rx="1.2"/><rect x="2.5" y="9.5" width="25" height="10" rx="2"/>` +
      `<rect x="7.5" y="16" width="15" height="9" rx="1"/><circle cx="22.5" cy="13.2" r=".9" fill="#e8eef7" stroke="none"/>`,
  ),
  // Caméra dôme/vidéo
  camera: G(
    `<rect x="2.5" y="6.5" width="17" height="15" rx="2.5"/><path d="M19.5 12.5l8-4.5v14l-8-4.5"/>` +
      `<circle cx="9" cy="14" r="3"/>`,
  ),
  // Puce IoT
  iot: G(
    `<rect x="7.5" y="7.5" width="15" height="15" rx="2"/><rect x="12" y="12" width="6" height="6" rx="1"/>` +
      `<path d="M11.5 7.5V3.5M18.5 7.5V3.5M11.5 26.5v-4M18.5 26.5v-4M7.5 11.5h-4M7.5 18.5h-4M26.5 11.5h-4M26.5 18.5h-4"/>`,
  ),
  // Point d'interrogation
  unknown: G(
    `<circle cx="15" cy="15" r="12.5"/><path d="M11.6 11.2a3.6 3.6 0 1 1 5.2 3.3c-1.2.6-1.8 1.4-1.8 2.7v.4"/>` +
      `<circle cx="15" cy="22.4" r=".9" fill="#e8eef7" stroke="none"/>`,
  ),
};

const BADGE = (color) =>
  `<circle cx="48" cy="16" r="9" fill="${color}" stroke="#0b1220" stroke-width="2.5"/>` +
  `<rect x="46.6" y="10.4" width="2.8" height="6.2" rx="1.4" fill="#0b1220"/>` +
  `<circle cx="48" cy="19" r="1.7" fill="#0b1220"/>`;

/**
 * Contenu <g> d'une tuile 64×64 (utilisable dans un <symbol> ou un document).
 */
export function tileMarkup(category, riskLevel) {
  const color = RISK_COLORS[riskLevel] || RISK_COLORS.none;
  const width = riskLevel === 'critical' ? 3.6 : 2.6;
  const glyph = GLYPHS[category] || GLYPHS.unknown;
  const badge = riskLevel === 'critical' || riskLevel === 'high' ? BADGE(color) : '';
  return (
    `<rect x="7" y="7" width="50" height="50" rx="15" fill="#111c2e"/>` +
    `<rect x="7" y="7" width="50" height="50" rx="15" fill="none" stroke="${color}" stroke-width="${width}"/>` +
    glyph +
    badge
  );
}

export function buildNodeSvg(category, riskLevel) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">` +
    tileMarkup(category, riskLevel) +
    `</svg>`
  );
}

const cache = new Map();
/** data-URI prête pour vis-network (mise en cache). */
export function iconDataUri(category, riskLevel) {
  const key = `${category}:${riskLevel}`;
  if (!cache.has(key))
    cache.set(key, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildNodeSvg(category, riskLevel))}`);
  return cache.get(key);
}
