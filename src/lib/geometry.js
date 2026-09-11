// Géométrie : enveloppes convexes « arrondies » autour des groupes de nœuds,
// partagées entre le dessin canvas (vis-network) et le rendu SVG d'export.

/** Enveloppe convexe (chaîne monotone d'Andrew). */
export function convexHull(points) {
  if (points.length <= 2) return points.slice();
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/**
 * Enveloppe « gonflée » : on remplace chaque point par un anneau de 8 points
 * (rayon = pad) puis on prend l'enveloppe convexe → capsule/arrondi naturel.
 */
export function paddedHull(points, pad = 46) {
  const ring = pad + 14;
  const expanded = [];
  if (points.length === 1) {
    const [p] = points;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      expanded.push({ x: p.x + Math.cos(a) * (ring + 8), y: p.y + Math.sin(a) * (ring + 8) });
    }
  } else {
    for (const p of points) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        expanded.push({ x: p.x + Math.cos(a) * ring, y: p.y + Math.sin(a) * ring });
      }
    }
  }
  return convexHull(expanded);
}

/** Points de contrôle pour une courbe fermée lisse (quadratiques par milieux). */
export function smoothClosedPathCommands(pts) {
  const n = pts.length;
  if (n < 3) {
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    return `${d} Z`;
  }
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const parts = [`M${mid(pts[0], pts[n - 1]).x.toFixed(1)},${mid(pts[0], pts[n - 1]).y.toFixed(1)}`];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const next = pts[(i + 1) % n];
    const m = mid(p, next);
    parts.push(`Q${p.x.toFixed(1)},${p.y.toFixed(1)} ${m.x.toFixed(1)},${m.y.toFixed(1)}`);
  }
  return parts.join(' ') + ' Z';
}

export function bboxOf(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
