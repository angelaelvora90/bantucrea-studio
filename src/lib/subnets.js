// Utilitaires réseau : regroupement par sous-réseau, tri d'adresses IP, couleurs.

/** Retourne le sous-réseau affiché pour une IP (CIDR /24 en IPv4, /64 en IPv6). */
export function subnetOf(ip) {
  if (!ip) return 'Indéterminé';
  if (ip.includes('.')) {
    const p = ip.split('.');
    if (p.length === 4) return `${p[0]}.${p[1]}.${p[2]}.0/24`;
  }
  if (ip.includes(':')) {
    const h = ip.split(':');
    return `${h.slice(0, 4).join(':')}::/64`;
  }
  return 'Indéterminé';
}

export function subnetBase(subnet) {
  return subnet.split('/')[0];
}

export function lastOctet(ip) {
  if (!ip) return 999;
  const p = ip.split('.');
  return p.length === 4 ? parseInt(p[3], 10) : 999;
}

/** Tri numérique des adresses IPv4 (les autres à la fin, ordre alphabétique). */
export function compareIps(a, b) {
  const pa = (a || '').split('.').map((n) => parseInt(n, 10));
  const pb = (b || '').split('.').map((n) => parseInt(n, 10));
  const va = pa.length === 4 && pa.every((n) => !Number.isNaN(n));
  const vb = pb.length === 4 && pb.every((n) => !Number.isNaN(n));
  if (va && vb) {
    for (let i = 0; i < 4; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
    return 0;
  }
  if (va) return -1;
  if (vb) return 1;
  return String(a).localeCompare(String(b));
}

// Palette déterministe par sous-réseau (hachage de chaîne → couleur stable).
export const SUBNET_COLORS = [
  '#38bdf8', // sky
  '#a78bfa', // violet
  '#f472b6', // pink
  '#4ade80', // green
  '#facc15', // yellow
  '#fb923c', // orange
  '#2dd4bf', // teal
  '#e879f9', // fuchsia
  '#94a3b8', // slate
  '#f87171', // red
];

export function subnetColor(subnet) {
  let h = 0;
  for (let i = 0; i < subnet.length; i++) h = (h * 31 + subnet.charCodeAt(i)) >>> 0;
  return SUBNET_COLORS[h % SUBNET_COLORS.length];
}

/** Convertit une couleur hexadécimale #rrggbb en rgba(). */
export function hexA(hex, alpha) {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
