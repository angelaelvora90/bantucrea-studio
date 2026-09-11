// Moteur de filtres : recherche textuelle, ports/services, niveau de risque.

import { isVulnerable } from './risk.js';

export const DEFAULT_FILTERS = { q: '', ports: '', risks: [], vulnOnly: false };

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

// Alias de services → ports usuels
const ALIASES = {
  ssh: [22], telnet: [23], smtp: [25, 587, 465], dns: [53], domain: [53],
  http: [80, 8080, 8000, 8008, 8081], https: [443, 8443], ftp: [21],
  tftp: [69], kerberos: [88], pop3: [110], imap: [143], snmp: [161, 162],
  ldap: [389, 636], smb: [445, 139], netbios: [137, 138, 139], rdp: [3389],
  mysql: [3306], mssql: [1433], postgres: [5432], postgresql: [5432],
  oracle: [1521], vnc: [5900, 5901], rtsp: [554], ipp: [631], jetdirect: [9100],
  print: [9100, 515, 631], mqtt: [1883, 8883], docker: [2375, 2376],
  redis: [6379], mongo: [27017], mongodb: [27017], elastic: [9200, 9300],
  elasticsearch: [9200, 9300], nfs: [2049], proxmox: [8006], winrm: [5985, 5986],
};

export function parsePortTokens(text) {
  return norm(text)
    .split(/[\s,;/|]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function portTokenMatches(host, token) {
  const open = host.ports.filter((p) => p.state === 'open');
  const numeric = /^\d{1,5}$/.test(token);
  if (numeric) {
    const n = parseInt(token, 10);
    return open.some((p) => p.port === n);
  }
  if (ALIASES[token]) return open.some((p) => ALIASES[token].includes(p.port));
  return open.some(
    (p) =>
      norm(p.service?.name).includes(token) ||
      norm(p.service?.product).includes(token),
  );
}

function textMatches(host, q) {
  const hay = [
    host.ip,
    host.mac?.addr,
    host.mac?.vendor,
    ...host.hostnames.map((h) => h.name),
    ...host.os.map((o) => o.name),
    host.category?.label,
    host.category?.category,
    host.subnet,
    ...host.ports
      .filter((p) => p.state === 'open')
      .map((p) => `${p.port} ${p.service?.name} ${p.service?.product} ${p.service?.version}`),
    ...host.risk.findings.map((f) => `${f.title} ${f.cves.join(' ')}`),
  ]
    .map(norm)
    .join('\n');
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every((tok) => hay.includes(tok));
}

/** Retourne true si l'hôte passe tous les filtres actifs. */
export function hostMatches(host, filters) {
  if (filters.vulnOnly && !isVulnerable(host)) return false;
  if (filters.risks?.length && !filters.risks.includes(host.risk.level)) return false;
  if (filters.q && !textMatches(host, norm(filters.q))) return false;
  const tokens = parsePortTokens(filters.ports);
  if (tokens.length && !tokens.some((t) => portTokenMatches(host, t))) return false;
  return true;
}

export function isFilterActive(f) {
  return Boolean(f.q || f.ports || f.risks?.length || f.vulnOnly);
}
