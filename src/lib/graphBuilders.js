// Construction des nœuds et des liens pour vis-network + infobulles HTML.
// Les liens sont « topologiques » : hôte → passerelle de son sous-réseau,
// passerelles interconnectées, et chaînage traceroute quand Nmap l'a capturé.

import { iconDataUri } from './icons.js';
import { lastOctet, compareIps } from './subnets.js';
import { SEV_LABELS } from './risk.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const shortName = (host) => {
  const name = host.hostnames?.[0]?.name;
  if (!name) return host.ip || host.id;
  return name.length > 26 ? `${name.slice(0, 25)}…` : name;
};

export function tooltipFor(host) {
  const os = host.os?.[0];
  const badge = `<span style="display:inline-block;padding:1px 8px;border-radius:999px;font-size:10px;font-weight:700;
    background:${host.risk.level === 'critical' ? '#7f1d1d' : host.risk.level === 'high' ? '#7c2d12' : host.risk.level === 'medium' ? '#713f12' : '#14532d'};color:#fff">
    ${SEV_LABELS[host.risk.level] || 'Aucun'}</span>`;
  const svc = host.ports
    .filter((p) => p.state === 'open')
    .slice(0, 8)
    .map((p) => `${p.port}/${p.protocol} ${esc(p.service?.name || '')}`)
    .join(' · ');
  return `<div style="font-family:ui-sans-serif,system-ui;min-width:190px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <b style="font-size:13px">${esc(shortName(host))}</b> ${badge}
    </div>
    <div style="color:#94a3b8;font-family:ui-monospace,monospace;font-size:11px">${esc(host.ip || '')}</div>
    <div style="margin-top:5px;font-size:11px;color:#cbd5e1">${esc(host.category?.label || '')}${host.mac?.vendor ? ` — ${esc(host.mac.vendor)}` : ''}</div>
    ${os ? `<div style="font-size:11px;color:#94a3b8">${esc(os.name)} (${os.accuracy}%)</div>` : ''}
    ${svc ? `<div style="margin-top:5px;font-size:11px;color:#7dd3fc">${svc}</div>` : ''}
    <div style="margin-top:6px;font-size:10px;color:#64748b">Cliquer pour ouvrir l'inspecteur</div>
  </div>`;
}

/** Choisit la passerelle d'un sous-réseau : routeur (1/254 d'abord), sinon switch. */
function pickGateway(members) {
  const score = (h) => {
    let s = 0;
    if (h.category.category === 'router') s += 100;
    else if (h.category.category === 'switch') s += 50;
    const oct = lastOctet(h.ip);
    if (oct === 1) s += 20;
    if (oct === 254) s += 15;
    return s;
  };
  const candidates = members
    .filter((h) => h.category.category === 'router' || h.category.category === 'switch')
    .sort((a, b) => score(b) - score(a) || compareIps(a.ip, b.ip));
  return candidates[0] || null;
}

/**
 * Retourne { nodes, edges, links } pour vis-network.
 * links: [{from, to, kind}] réutilisé par l'export SVG/PNG.
 */
export function buildVisData(hosts) {
  const nodes = [];
  const linksMap = new Map();
  const addLink = (from, to, kind) => {
    if (!from || !to || from === to) return;
    const key = from < to ? `${from}|${to}` : `${to}|${from}`;
    const prev = linksMap.get(key);
    if (!prev || (prev.kind === 'trace' && kind !== 'trace')) linksMap.set(key, { from, to, kind });
  };

  // 1) Regroupement par sous-réseau + passerelles
  const bySubnet = new Map();
  for (const h of hosts) {
    if (!bySubnet.has(h.subnet)) bySubnet.set(h.subnet, []);
    bySubnet.get(h.subnet).push(h);
  }
  const gateways = [];
  for (const [subnet, members] of bySubnet) {
    const gw = pickGateway(members);
    if (!gw) continue;
    gateways.push({ subnet, host: gw, size: members.length });
    for (const h of members) if (h !== gw) addLink(gw.id, h.id, 'lan');
  }
  // Passerelles interconnectées : cœur = passerelle du plus grand sous-réseau.
  gateways.sort((a, b) => b.size - a.size);
  if (gateways.length > 1) {
    const core = gateways[0].host;
    for (const g of gateways.slice(1)) addLink(core.id, g.host.id, 'core');
  }

  // 2) Liens traceroute (uniquement entre IPs effectivement scannées)
  const idSet = new Set(hosts.map((h) => h.id));
  for (const h of hosts) {
    const chain = h.hops.map((hp) => hp.ipaddr).filter((ip) => idSet.has(ip));
    chain.push(h.id);
    for (let i = 0; i + 1 < chain.length; i++) addLink(chain[i], chain[i + 1], 'trace');
  }

  // 3) Nœuds
  for (const h of hosts) {
    const isGw = gateways.some((g) => g.host === h);
    const name = shortName(h);
    const label = hostLabel(h);
    nodes.push({
      id: h.id,
      label,
      shape: 'image',
      image: iconDataUri(h.category.category, h.risk.level),
      size: isGw ? 30 : h.openPortCount >= 8 ? 28 : 24,
      title: tooltipFor(h),
      font: {
        color: '#cbd5e1',
        size: 13,
        face: 'ui-sans-serif, system-ui, sans-serif',
        strokeWidth: 4,
        strokeColor: '#0b1220',
        multi: 'html',
      },
      margin: 10,
      subnet: h.subnet,
    });
  }

  const edgeStyle = {
    lan: { color: 'rgba(100,116,139,0.5)', width: 1.6, dashes: false },
    core: { color: 'rgba(148,163,184,0.85)', width: 2.6, dashes: false },
    trace: { color: 'rgba(71,85,105,0.55)', width: 1.2, dashes: [5, 6] },
  };
  const edges = [...linksMap.entries()].map(([key, l]) => ({
    id: key,
    from: l.from,
    to: l.to,
    smooth: { enabled: true, type: 'continuous', roundness: 0.12 },
    ...edgeStyle[l.kind],
  }));

  return { nodes, edges, links: [...linksMap.values()] };
}

function hostLabel(h) {
  const name = shortName(h);
  if (name === h.ip) return `<b>${esc(name)}</b>`;
  return `<b>${esc(name)}</b>\n<i>${esc(h.ip || '')}</i>`;
}
