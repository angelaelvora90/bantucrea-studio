// ─────────────────────────────────────────────────────────────────────────────
// presets.js — Architectures d'exemple prêtes à explorer.
// ─────────────────────────────────────────────────────────────────────────────

let n = 0;
const nid = () => `p${++n}`;

function node(id, type, x, y, extra = {}) {
  return { id, type, x, y, ...extra };
}
function zone(id, name, x, y, w, h, color, cidr = '', vlan = '') {
  return { id, name, x, y, w, h, color, cidr, vlan };
}
function link(a, b, media = 'copper', speed = '1 Gb/s', vlan = '', state = 'up', note = '') {
  return { id: `l${a}-${b}`, a, b, media, speed, vlan, state, note };
}

/** PME — siège unique, 40 postes, DMZ filtrée, segmentation Wi-Fi/IoT. */
export function presetPme() {
  return {
    name: 'PME — Siège 40 postes',
    company: 'Exemple PME',
    author: 'BantuCrea Studio',
    zones: [
      zone('z-dmz', 'DMZ', 40, 470, 360, 260, '#ef4444', '10.0.3.0/24', '30'),
      zone('z-srv', 'Serveurs', 430, 470, 570, 260, '#3b82f6', '10.0.2.0/24', '20'),
      zone('z-lan', 'LAN Bureaux', 1030, 470, 370, 260, '#22c55e', '10.0.1.0/24', '10'),
      zone('z-guest', 'Wi-Fi Invités', 40, 770, 360, 210, '#eab308', '10.0.6.0/24', '60'),
      zone('z-iot', 'IoT / Vidéo', 430, 770, 570, 210, '#a855f7', '10.0.7.0/24', '70'),
    ],
    nodes: [
      node('n-int', 'internet', 640, 40, { name: 'INTERNET', ip: '203.0.113.9', status: 'up', notes: 'Liaison opérateur 1 Gb/s' }),
      node('n-vpn', 'vpn', 980, 40, { name: 'VPN-NOMADES', ip: '203.0.113.20', notes: 'IPsec site-à-site + SSL' }),
      node('n-fw', 'firewall', 640, 200, {
        name: 'FW-BORDURE',
        ip: '10.0.0.1',
        model: 'HA pair',
        notes: 'Politique explicite, refus par défaut, journaux activés',
        rules: [
          { id: 'r1', name: 'WAN → DMZ : HTTPS', src: 'hors zone', dst: 'DMZ', service: 'tcp/443', action: 'allow', enabled: true },
          { id: 'r2', name: 'WAN → DMZ : SMTP', src: 'hors zone', dst: 'DMZ', service: 'tcp/25', action: 'allow', enabled: true },
          { id: 'r3', name: 'LAN → Serveurs : AD/DNS', src: 'LAN Bureaux', dst: 'Serveurs', service: 'tcp/445', action: 'allow', enabled: true },
          { id: 'r4', name: 'LAN → Serveurs : DNS', src: 'LAN Bureaux', dst: 'Serveurs', service: 'udp/53', action: 'allow', enabled: true },
          { id: 'r5', name: 'LAN → Internet : HTTPS', src: 'LAN Bureaux', dst: 'hors zone', service: 'tcp/443', action: 'allow', enabled: true },
          { id: 'r6', name: 'Invités → Internet : HTTPS', src: 'Wi-Fi Invités', dst: 'hors zone', service: 'tcp/443', action: 'allow', enabled: true },
          { id: 'r7', name: 'Interdire Invités → LAN', src: 'Wi-Fi Invités', dst: 'LAN Bureaux', service: 'any', action: 'deny', enabled: true },
          { id: 'r8', name: 'Interdire IoT → Serveurs', src: 'IoT / Vidéo', dst: 'Serveurs', service: 'any', action: 'deny', enabled: true },
          { id: 'r9', name: 'VPN → LAN : RDP bastion', src: 'hors zone', dst: 'LAN Bureaux', service: 'tcp/3389', action: 'allow', enabled: true },
        ],
      }),
      node('n-core', 'switchL3', 640, 360, { name: 'SW-COEUR', ip: '10.0.0.3', model: 'Stack 2×', notes: 'Routage inter-VLAN' }),
      node('n-sw-dmz', 'switch', 80, 520, { name: 'SW-DMZ', ip: '10.0.3.2', vlan: '30' }),
      node('n-web', 'server', 220, 520, { name: 'WEB-01', ip: '10.0.3.10', vlan: '30', os: 'Linux', exposedPorts: '443', notes: 'Site public derrière reverse proxy' }),
      node('n-mail', 'mail', 220, 630, { name: 'MAIL-01', ip: '10.0.3.25', vlan: '30', os: 'Linux', exposedPorts: '25,443' }),
      node('n-proxy', 'proxy', 80, 630, { name: 'PROXY-01', ip: '10.0.3.5', vlan: '30', notes: 'Reverse proxy TLS' }),

      node('n-ad', 'ad', 470, 520, { name: 'AD-01', ip: '10.0.2.10', vlan: '20', os: 'Windows Server 2022' }),
      node('n-dns', 'dns', 620, 520, { name: 'DNS-01', ip: '10.0.2.53', vlan: '20' }),
      node('n-app', 'server', 770, 520, { name: 'SRV-APP', ip: '10.0.2.20', vlan: '20', exposedPorts: '8443' }),
      node('n-db', 'db', 470, 630, { name: 'DB-01', ip: '10.0.2.40', vlan: '20', notes: 'Non exposé sur Internet' }),
      node('n-nas', 'nas', 620, 630, { name: 'NAS-01', ip: '10.0.2.30', vlan: '20' }),
      node('n-bastion', 'bastion', 770, 630, { name: 'BASTION-01', ip: '10.0.2.5', vlan: '20' }),

      node('n-sw1', 'switch', 1070, 520, { name: 'SW-ACC-1', ip: '10.0.1.2', vlan: '10' }),
      node('n-sw2', 'switch', 1230, 520, { name: 'SW-ACC-2', ip: '10.0.1.3', vlan: '10' }),
      node('n-pc1', 'desktop', 1070, 630, { name: 'POSTE-COMPTA', ip: '10.0.1.101', vlan: '10' }),
      node('n-pc2', 'desktop', 1230, 630, { name: 'POSTE-RH', ip: '10.0.1.102', vlan: '10' }),

      node('n-ap-guest', 'ap', 150, 830, { name: 'AP-INVITES', ip: '10.0.6.10', vlan: '60' }),
      node('n-cam', 'camera', 520, 830, { name: 'CAM-01', ip: '10.0.7.21', vlan: '70' }),
      node('n-iot', 'iot', 700, 830, { name: 'IOT-GTB', ip: '10.0.7.31', vlan: '70' }),
    ],
    links: [
      link('n-int', 'n-fw', 'fiber', '1 Gb/s'),
      link('n-vpn', 'n-fw', 'vpn', '200 Mb/s'),
      link('n-fw', 'n-core', 'fiber', '10 Gb/s', 'trunk'),
      link('n-core', 'n-sw-dmz', 'trunk', '10 Gb/s', '30'),
      link('n-sw-dmz', 'n-proxy'),
      link('n-sw-dmz', 'n-web'),
      link('n-sw-dmz', 'n-mail'),
      link('n-core', 'n-ad', 'trunk', '10 Gb/s', '20'),
      link('n-core', 'n-dns'),
      link('n-core', 'n-app'),
      link('n-core', 'n-db'),
      link('n-core', 'n-nas'),
      link('n-core', 'n-bastion'),
      link('n-core', 'n-sw1', 'trunk', '10 Gb/s', '10'),
      link('n-core', 'n-sw2', 'trunk', '10 Gb/s', '10'),
      link('n-sw1', 'n-pc1'),
      link('n-sw2', 'n-pc2'),
      link('n-core', 'n-ap-guest', 'trunk', '2.5 Gb/s', '60'),
      link('n-core', 'n-cam', 'trunk', '1 Gb/s', '70'),
      link('n-core', 'n-iot', 'trunk', '1 Gb/s', '70'),
    ],
  };
}

/** Multi-sites — siège + agence reliés par VPN, sauvegarde dans le cloud. */
export function presetMultiSites() {
  return {
    name: 'Multi-sites — Siège + Agence (VPN)',
    company: 'Exemple multi-sites',
    author: 'BantuCrea Studio',
    zones: [
      zone('z-siege', 'Siège — Douala', 40, 300, 700, 400, '#3b82f6', '10.10.0.0/24', '10'),
      zone('z-agence', 'Agence — Yaoundé', 800, 300, 600, 400, '#22c55e', '10.20.0.0/24', '10'),
    ],
    nodes: [
      node('n-int', 'internet', 700, 40, { name: 'INTERNET', ip: '198.51.100.5' }),
      node('n-cloud', 'cloud', 1080, 40, { name: 'SAUVEGARDE-CLOUD', notes: 'Coffres chiffrés, réplication' }),
      node('n-vpn', 'vpn', 700, 180, { name: 'VPN-HUB', ip: '198.51.100.9', notes: 'IPsec IKEv2 entre sites' }),

      node('n-fw1', 'firewall', 300, 360, {
        name: 'FW-SIEGE', ip: '10.10.0.1',
        rules: [
          { id: 'r1', name: 'Siège → Agence : applicatif', src: 'Siège — Douala', dst: 'Agence — Yaoundé', service: 'tcp/8443', action: 'allow', enabled: true },
          { id: 'r2', name: 'Siège → Internet : HTTPS', src: 'Siège — Douala', dst: 'hors zone', service: 'tcp/443', action: 'allow', enabled: true },
          { id: 'r3', name: 'Bloquer Agence → Siège : SMB', src: 'Agence — Yaoundé', dst: 'Siège — Douala', service: 'tcp/445', action: 'deny', enabled: true },
        ],
      }),
      node('n-core1', 'switchL3', 300, 500, { name: 'SW-SIEGE', ip: '10.10.0.2', vlan: '10' }),
      node('n-app', 'server', 100, 620, { name: 'ERP-01', ip: '10.10.0.20', vlan: '10', os: 'Linux' }),
      node('n-ad', 'ad', 300, 620, { name: 'AD-SIEGE', ip: '10.10.0.10', vlan: '10' }),
      node('n-nas', 'nas', 500, 620, { name: 'NAS-SIEGE', ip: '10.10.0.30', vlan: '10' }),

      node('n-fw2', 'firewall', 1000, 360, {
        name: 'FW-AGENCE', ip: '10.20.0.1',
        rules: [
          { id: 'r1', name: 'Agence → Siège : ERP', src: 'Agence — Yaoundé', dst: 'Siège — Douala', service: 'tcp/8443', action: 'allow', enabled: true },
          { id: 'r2', name: 'Agence → Internet : HTTPS', src: 'Agence — Yaoundé', dst: 'hors zone', service: 'tcp/443', action: 'allow', enabled: true },
        ],
      }),
      node('n-sw2', 'switch', 1000, 500, { name: 'SW-AGENCE', ip: '10.20.0.2', vlan: '10' }),
      node('n-pc', 'desktop', 850, 620, { name: 'POSTE-AG1', ip: '10.20.0.51', vlan: '10' }),
      node('n-pc2', 'laptop', 1010, 620, { name: 'PORTABLE-AG', ip: '10.20.0.61', vlan: '10' }),
      node('n-ap', 'ap', 1180, 620, { name: 'AP-AGENCE', ip: '10.20.0.5', vlan: '60' }),
    ],
    links: [
      link('n-int', 'n-vpn', 'fiber', '1 Gb/s'),
      link('n-vpn', 'n-fw1', 'vpn', '300 Mb/s'),
      link('n-vpn', 'n-fw2', 'vpn', '100 Mb/s'),
      link('n-vpn', 'n-cloud', 'vpn', '200 Mb/s'),
      link('n-fw1', 'n-core1', 'fiber', '10 Gb/s'),
      link('n-core1', 'n-app'),
      link('n-core1', 'n-ad'),
      link('n-core1', 'n-nas'),
      link('n-fw2', 'n-sw2', 'fiber', '1 Gb/s'),
      link('n-sw2', 'n-pc'),
      link('n-sw2', 'n-pc2'),
      link('n-sw2', 'n-ap', 'trunk', '1 Gb/s', '60'),
    ],
  };
}

/** Schéma volontairement imparfait : sert à démontrer l'audit de sécurité. */
export function presetAuditDemo() {
  return {
    name: 'Démo audit — schéma à corriger',
    company: 'Exemple volontairement non conforme',
    author: 'BantuCrea Studio',
    zones: [
      zone('z-lan', 'LAN', 40, 320, 640, 300, '#22c55e', '192.168.1.0/24', '10'),
      zone('z-srv', 'Serveurs', 720, 320, 620, 300, '#3b82f6', '192.168.1.0/24', '20'),
    ],
    nodes: [
      node('n-int', 'internet', 620, 60, { name: 'INTERNET', ip: '198.51.100.44' }),
      node('n-sw', 'switch', 620, 200, { name: 'SW-PRINCIPAL', ip: '192.168.1.2', vlan: '10' }),
      node('n-pc1', 'desktop', 100, 400, { name: 'POSTE-01', ip: '192.168.1.51', vlan: '10' }),
      node('n-pc2', 'desktop', 100, 520, { name: 'POSTE-02', ip: '192.168.1.51', vlan: '10' }),
      node('n-ap', 'ap', 300, 400, { name: 'AP-BUREAU', ip: '192.168.1.7', vlan: '' }),
      node('n-cam', 'camera', 300, 520, { name: 'CAM-ACCUEIL', ip: '192.168.1.90', vlan: '20' }),
      node('n-print', 'printer', 480, 520, { name: 'MFP-01', ip: '', vlan: '10' }),
      node('n-srv', 'server', 780, 400, { name: 'SRV-FICHIERS', ip: '192.168.1.20', vlan: '20', exposedPorts: '445,3389,22' }),
      node('n-db', 'db', 960, 400, { name: 'DB-PROD', ip: '192.168.1.0', vlan: '20', exposedPorts: '3306' }),
      node('n-orph', 'server', 1160, 520, { name: 'SRV-TEST', ip: '192.168.1.200', vlan: '20' }),
    ],
    links: [
      link('n-int', 'n-sw', 'copper', '1 Gb/s'),
      link('n-sw', 'n-pc1'),
      link('n-sw', 'n-pc2'),
      link('n-sw', 'n-ap'),
      link('n-sw', 'n-cam'),
      link('n-sw', 'n-print'),
      link('n-sw', 'n-srv', 'trunk', '1 Gb/s', '20'),
      link('n-srv', 'n-db'),
      link('n-sw', 'n-db', 'copper', '1 Gb/s', '20', 'down', 'Liaison directe de secours (tombée)'),
    ],
  };
}

export const PRESETS = [
  { id: 'pme', label: 'PME — siège 40 postes', description: 'DMZ filtrée, VLAN serveurs/bureaux/invités/IoT, VPN nomades.', build: presetPme },
  { id: 'multi', label: 'Multi-sites + VPN', description: 'Siège et agence interconnectés en IPsec, sauvegarde cloud.', build: presetMultiSites },
  { id: 'audit', label: 'Démo audit (à corriger)', description: 'Schéma volontairement non conforme pour tester l’audit.', build: presetAuditDemo },
];
