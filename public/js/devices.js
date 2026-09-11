// ─────────────────────────────────────────────────────────────────────────────
// devices.js — Catalogue des équipements dessinables + icônes SVG (24×24).
// ─────────────────────────────────────────────────────────────────────────────

const I = {
  internet: 'M7 18.5A4.5 4.5 0 0 1 6.3 9.6a6 6 0 0 1 11.5 1.7 4.3 4.3 0 0 1-.5 7.2zM12 12v5M9.8 14.4 12 12l2.2 2.4',
  cloud: 'M7 19a4.5 4.5 0 0 1-.7-8.9 6 6 0 0 1 11.4 1.7A4.3 4.3 0 0 1 17 19zM9.6 13.2h4.8M9.6 16h3.2',
  firewall: 'M12 2.8 19.2 6v6.1c0 4.3-3 7.6-7.2 9.1-4.2-1.5-7.2-4.8-7.2-9.1V6zM9.2 12.2l2 2 3.7-3.9',
  router: 'M12 3.2v17.6M3.2 12h17.6M12 3.2 9.6 5.6M12 3.2l2.4 2.4M12 20.8l-2.4-2.4M12 20.8l2.4-2.4M3.2 12l2.4-2.4M3.2 12l2.4 2.4M20.8 12l-2.4-2.4M20.8 12l-2.4 2.4',
  switch: 'M2.8 7.5h18.4v9H2.8zM6.4 11v2.6M9.8 11v2.6M13.2 11v2.6M16.6 11v2.6M2.8 10.6h18.4',
  switchL3: 'M2.8 6.4h18.4v5.2H2.8zM2.8 14h18.4v5.2H2.8zM6.4 9h.01M9.6 9h.01M6.4 16.6h.01M9.6 16.6h.01M17 9h2.2M17 16.6h2.2',
  lb: 'M4.5 12h4M12 12h.01M15.5 5.5h4M15.5 12h4M15.5 18.5h4M8.5 12c0-4 2-6.5 7-6.5M8.5 12c0 4 2 6.5 7 6.5M17.6 3.4l2 2.1-2 2.1M17.6 16.4l2 2.1-2 2.1',
  server: 'M4 4.4h16v6H4zM4 13.6h16v6H4zM7.2 7.4h.01M7.2 16.6h.01M11 7.4h5M11 16.6h5',
  vm: 'M3.6 4.6h16.8v14.8H3.6zM7.4 8.4h9.2v7.2H7.4zM3.6 4.6l3.8 3.8M20.4 4.6l-3.8 3.8M3.6 19.4l3.8-3.8M20.4 19.4l-3.8-3.8',
  nas: 'M4.2 3.4h15.6v5H4.2zM4.2 9.6h15.6v5H4.2zM4.2 15.8h15.6v5H4.2zM7.4 5.9h.01M7.4 12.1h.01M7.4 18.3h.01',
  db: 'M12 3.4c4 0 7.2 1.1 7.2 2.5v12.2c0 1.4-3.2 2.5-7.2 2.5s-7.2-1.1-7.2-2.5V5.9c0-1.4 3.2-2.5 7.2-2.5zM4.8 5.9c0 1.4 3.2 2.5 7.2 2.5s7.2-1.1 7.2-2.5M4.8 12c0 1.4 3.2 2.5 7.2 2.5s7.2-1.1 7.2-2.5',
  dns: 'M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6zM3.4 12h17.2M12 3.2c2.4 2.4 3.6 5.4 3.6 8.8s-1.2 6.4-3.6 8.8c-2.4-2.4-3.6-5.4-3.6-8.8S9.6 5.6 12 3.2z',
  ad: 'M3.6 4.6h7.4v6.6H3.6zM13 4.6h7.4v6.6H13zM3.6 13h7.4v6.6H3.6zM13 13h7.4v6.6H13z',
  mail: 'M3.4 5.6h17.2v12.8H3.4zM3.4 6.6 12 13l8.6-6.4',
  proxy: 'M3.2 12h6M14.8 12h6M9.2 12a2.8 2.8 0 0 1 5.6 0 2.8 2.8 0 0 1-5.6 0M6.4 9.4 3.2 12l3.2 2.6M17.6 9.4 20.8 12l-3.2 2.6',
  bastion: 'M12 2.8 19.2 6v6.1c0 4.3-3 7.6-7.2 9.1-4.2-1.5-7.2-4.8-7.2-9.1V6zM10.2 11.6h3.6v3.6h-3.6zM10.6 11.6v-1a1.4 1.4 0 0 1 2.8 0v1',
  vpn: 'M4.6 15.4V9.6a7.4 7.4 0 0 1 14.8 0v5.8M4.6 12h2.6M16.8 12h2.6M9.4 18.8a2.6 2.6 0 0 1 5.2 0M12 12v6.2',
  ap: 'M12 16.6h.01M8.2 13a5.4 5.4 0 0 1 7.6 0M5.2 9.8a9.7 9.7 0 0 1 13.6 0M12 18.6v1.6M7 20.2h10',
  desktop: 'M3.2 4.6h17.6v11.2H3.2zM9 19.4h6M12 15.8v3.6',
  laptop: 'M4.6 6h14.8v9H4.6zM2.4 17.8h19.2l-1.4 2.2H3.8z',
  phone: 'M6.2 4.2h3l1.4 3.4-2 1.4a11 11 0 0 0 6.4 6.4l1.4-2 3.4 1.4v3a1.8 1.8 0 0 1-2 1.8A15.6 15.6 0 0 1 4.4 6.2a1.8 1.8 0 0 1 1.8-2zM15.4 4.4a4.6 4.6 0 0 1 4.2 4.2M15.4 8a1 1 0 0 1 .9.9',
  printer: 'M7 8.4V4h10v4.4M5.2 8.4h13.6v7.2H5.2zM7.6 15.6h8.8v4.4H7.6zM17 11h.01',
  camera: 'M3.6 8.4h11.6v7.2H3.6zM15.2 11l5.2-2.8v5.6L15.2 11zM6.6 15.6v3.6M5 19.2h4.6',
  iot: 'M12 3.6 19.2 8v8L12 20.4 4.8 16V8zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  ups: 'M4.2 6.6h13.2v10.8H4.2zM17.4 10.2h2.4v3.6h-2.4M8 9.4 6.6 12.4h3L8.4 15.4',
  site: 'M4.4 20V6.8l7.6-3.2 7.6 3.2V20M2.8 20h18.4M8.4 10h2.4M13.2 10h2.4M8.4 14h2.4M13.2 14h2.4',
  user: 'M12 11.4a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6zM4.8 20.2a7.2 7.2 0 0 1 14.4 0',
  shield: 'M12 2.8 19.2 6v6.1c0 4.3-3 7.6-7.2 9.1-4.2-1.5-7.2-4.8-7.2-9.1V6z',
};

export const CATEGORIES = [
  { id: 'edge', label: 'Bordure & externe' },
  { id: 'security', label: 'Sécurité' },
  { id: 'network', label: 'Réseau & distribution' },
  { id: 'server', label: 'Serveurs & données' },
  { id: 'wireless', label: 'Sans-fil' },
  { id: 'endpoint', label: 'Postes & objets' },
  { id: 'site', label: 'Sites & énergie' },
];

/** @type {Array<{type:string,label:string,category:string,color:string,w:number,h:number,icon:string,defaults:object,hint:string}>} */
export const DEVICES = [
  { type: 'internet', label: 'Internet / WAN', category: 'edge', color: '#38bdf8', w: 132, h: 96, icon: I.internet, hint: 'Opérateur, lien WAN', defaults: { ip: '', cidr: '', vlan: '' } },
  { type: 'cloud', label: 'Cloud / SaaS', category: 'edge', color: '#7dd3fc', w: 128, h: 92, icon: I.cloud, hint: 'Azure, AWS, Microsoft 365', defaults: { ip: '', cidr: '', vlan: '' } },
  { type: 'site', label: 'Site distant', category: 'site', color: '#a5b4fc', w: 132, h: 96, icon: I.site, hint: 'Agence, filiale, datacenter', defaults: { ip: '', cidr: '', vlan: '' } },

  { type: 'firewall', label: 'Pare-feu', category: 'security', color: '#f43f5e', w: 132, h: 96, icon: I.firewall, hint: 'Filtrage bordure / inter-zones', defaults: { ip: '10.0.0.1', cidr: '', vlan: '', rules: [] } },
  { type: 'proxy', label: 'Proxy / Reverse', category: 'security', color: '#93c5fd', w: 128, h: 92, icon: I.proxy, hint: 'Proxy web, reverse proxy', defaults: { ip: '10.0.1.10', cidr: '', vlan: '' } },
  { type: 'bastion', label: 'Bastion', category: 'security', color: '#fb7185', w: 124, h: 92, icon: I.bastion, hint: 'Hôte de rebond d’administration', defaults: { ip: '10.0.9.5', cidr: '', vlan: '' } },
  { type: 'vpn', label: 'Passerelle VPN', category: 'security', color: '#c084fc', w: 128, h: 92, icon: I.vpn, hint: 'IPsec / SSL, accès nomades', defaults: { ip: '10.0.8.1', cidr: '', vlan: '' } },

  { type: 'router', label: 'Routeur', category: 'network', color: '#f59e0b', w: 128, h: 92, icon: I.router, hint: 'Passerelle par défaut, routage', defaults: { ip: '10.0.0.2', cidr: '', vlan: '' } },
  { type: 'switchL3', label: 'Switch cœur L3', category: 'network', color: '#10b981', w: 132, h: 96, icon: I.switchL3, hint: 'Cœur de réseau, inter-VLAN', defaults: { ip: '10.0.0.3', cidr: '', vlan: '' } },
  { type: 'switch', label: 'Switch accès', category: 'network', color: '#22c55e', w: 128, h: 92, icon: I.switch, hint: 'Switch d’étage / d’accès', defaults: { ip: '10.0.0.20', cidr: '', vlan: '' } },
  { type: 'lb', label: 'Répartiteur de charge', category: 'network', color: '#a78bfa', w: 132, h: 92, icon: I.lb, hint: 'Load balancer applicatif', defaults: { ip: '10.0.2.10', cidr: '', vlan: '' } },
  { type: 'ups', label: 'Onduleur', category: 'site', color: '#facc15', w: 118, h: 88, icon: I.ups, hint: 'Alimentation secourue', defaults: { ip: '', cidr: '', vlan: '' } },

  { type: 'server', label: 'Serveur', category: 'server', color: '#60a5fa', w: 128, h: 92, icon: I.server, hint: 'Serveur physique applicatif', defaults: { ip: '10.0.2.20', cidr: '', vlan: '', os: 'Linux' } },
  { type: 'vm', label: 'Machine virtuelle', category: 'server', color: '#818cf8', w: 128, h: 92, icon: I.vm, hint: 'VM sur hyperviseur', defaults: { ip: '10.0.2.21', cidr: '', vlan: '', os: 'Linux' } },
  { type: 'nas', label: 'Stockage / NAS', category: 'server', color: '#14b8a6', w: 124, h: 92, icon: I.nas, hint: 'Baie, NAS, sauvegarde', defaults: { ip: '10.0.2.30', cidr: '', vlan: '' } },
  { type: 'db', label: 'Base de données', category: 'server', color: '#34d399', w: 128, h: 92, icon: I.db, hint: 'SGBD, entrepôt de données', defaults: { ip: '10.0.2.40', cidr: '', vlan: '' } },
  { type: 'dns', label: 'Serveur DNS', category: 'server', color: '#6ee7b7', w: 124, h: 92, icon: I.dns, hint: 'Résolution interne / split-horizon', defaults: { ip: '10.0.2.53', cidr: '', vlan: '' } },
  { type: 'ad', label: 'Contrôleur AD', category: 'server', color: '#fbbf24', w: 128, h: 92, icon: I.ad, hint: 'Annuaire, GPO, Kerberos', defaults: { ip: '10.0.2.10', cidr: '', vlan: '' } },
  { type: 'mail', label: 'Serveur mail', category: 'server', color: '#fda4af', w: 128, h: 92, icon: I.mail, hint: 'SMTP / messagerie', defaults: { ip: '10.0.3.25', cidr: '', vlan: '' } },

  { type: 'ap', label: 'Point d’accès Wi-Fi', category: 'wireless', color: '#f472b6', w: 128, h: 92, icon: I.ap, hint: 'Borne Wi-Fi, contrôleur', defaults: { ip: '10.0.6.10', cidr: '', vlan: '60' } },

  { type: 'desktop', label: 'Poste fixe', category: 'endpoint', color: '#94a3b8', w: 124, h: 88, icon: I.desktop, hint: 'Poste de travail bureautique', defaults: { ip: '', cidr: '', vlan: '10' } },
  { type: 'laptop', label: 'Portable', category: 'endpoint', color: '#cbd5e1', w: 124, h: 88, icon: I.laptop, hint: 'Portable, nomade', defaults: { ip: '', cidr: '', vlan: '10' } },
  { type: 'phone', label: 'Téléphone IP', category: 'endpoint', color: '#a3e635', w: 118, h: 88, icon: I.phone, hint: 'ToIP / VoIP', defaults: { ip: '', cidr: '', vlan: '50' } },
  { type: 'printer', label: 'Imprimante', category: 'endpoint', color: '#e2e8f0', w: 118, h: 88, icon: I.printer, hint: 'MFP réseau', defaults: { ip: '', cidr: '', vlan: '10' } },
  { type: 'camera', label: 'Caméra IP', category: 'endpoint', color: '#fb923c', w: 118, h: 88, icon: I.camera, hint: 'Vidéosurveillance', defaults: { ip: '', cidr: '', vlan: '70' } },
  { type: 'iot', label: 'Objet IoT', category: 'endpoint', color: '#fcd34d', w: 118, h: 88, icon: I.iot, hint: 'Capteur, GTB, badgeuse', defaults: { ip: '', cidr: '', vlan: '70' } },
];

export const DEVICE_MAP = Object.fromEntries(DEVICES.map((d) => [d.type, d]));

export function deviceMeta(type) {
  return DEVICE_MAP[type] || {
    type,
    label: type,
    category: 'other',
    color: '#94a3b8',
    w: 124,
    h: 88,
    icon: I.user,
    defaults: {},
    hint: '',
  };
}

export function iconMarkup(type, size = 30) {
  const meta = deviceMeta(type);
  const scale = size / 24;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none"
    stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true"><path d="${meta.icon}"/></svg>`;
}

export const MEDIA = [
  { id: 'fiber', label: 'Fibre optique', color: '#22d3ee', dash: '' },
  { id: 'copper', label: 'Cuivre (RJ45)', color: '#94a3b8', dash: '' },
  { id: 'trunk', label: 'Trunk 802.1Q', color: '#a78bfa', dash: '' },
  { id: 'wifi', label: 'Sans-fil', color: '#f472b6', dash: '7 6' },
  { id: 'vpn', label: 'Tunnel VPN', color: '#c084fc', dash: '2 6' },
  { id: 'serial', label: 'Liaison spécialisée', color: '#f59e0b', dash: '10 4 2 4' },
];

export const MEDIA_MAP = Object.fromEntries(MEDIA.map((m) => [m.id, m]));

export const ZONE_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];
