// Parser d'exports XML Nmap (-oX). Code pur, exécutable dans un Web Worker
// ou sous Node. Produit des objets hôtes enrichis (classification + risques).

import { XMLParser } from 'fast-xml-parser';
import { classifyDevice } from './classify.js';
import { analyzeRisks } from './risk.js';
import { subnetOf, compareIps } from './subnets.js';

const ARRAY_TAGS = new Set([
  'host', 'port', 'address', 'hostname', 'osmatch', 'osclass', 'script',
  'table', 'elem', 'hop', 'extraports', 'cpe', 'hosthint', 'status', 'times',
]);

export const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const at = (obj, key) => (obj == null ? undefined : obj[`@_${key}`]);

function createParser() {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    trimValues: true,
    parseAttributeValue: false,
    parseTagValue: false,
    processEntities: true,
    isArray: (name, _jpath, _isLeaf, isAttr) => !isAttr && ARRAY_TAGS.has(name),
  });
}

// --- Scripts NSE ------------------------------------------------------------
const flattenElems = (elems) =>
  elems.map((e) => ({ key: at(e, 'key') || null, value: e['#text'] != null ? String(e['#text']) : '' }));

function flattenTables(tables, prefix = '') {
  const rows = [];
  for (const t of tables) {
    const key = at(t, 'key') || at(t, 'id') || '';
    const path = prefix ? (key ? `${prefix}.${key}` : prefix) : key;
    const elems = flattenElems(asArray(t.elem));
    if (elems.length)
      rows.push({ key: path || null, values: elems, text: elems.map((e) => `${e.key || ''}=${e.value}`).join(' ') });
    rows.push(...flattenTables(asArray(t.table), path));
  }
  return rows;
}

function parseScriptNode(s) {
  const output = (at(s, 'output') || '').trim();
  const elems = flattenElems(asArray(s.elem));
  const tables = flattenTables(asArray(s.table));
  const flat = [output, ...elems.map((e) => `${e.key || ''} ${e.value}`), ...tables.map((t) => t.text)]
    .filter(Boolean)
    .join('\n');
  return { id: at(s, 'id') || 'script', output, elems, tables, flat };
}

// --- Ports ------------------------------------------------------------------
function parsePort(p) {
  const svc = p.service;
  return {
    port: parseInt(at(p, 'portid'), 10),
    protocol: at(p, 'protocol') || 'tcp',
    state: p.state ? at(p.state, 'state') : 'unknown',
    reason: p.state ? at(p.state, 'reason') : null,
    service: svc
      ? {
          name: at(svc, 'name') || '',
          product: at(svc, 'product') || '',
          version: at(svc, 'version') || '',
          extrainfo: at(svc, 'extrainfo') || '',
          ostype: at(svc, 'ostype') || '',
          tunnel: at(svc, 'tunnel') || '',
          method: at(svc, 'method') || '',
          conf: parseInt(at(svc, 'conf') || '0', 10),
          cpes: asArray(svc.cpe).map((c) => (c && c['#text'] != null ? String(c['#text']) : String(c))),
        }
      : null,
    scripts: asArray(p.script).map(parseScriptNode),
  };
}

// --- Hôtes ------------------------------------------------------------------
function parseHost(h, fileName, index) {
  const addresses = asArray(h.address).map((a) => ({
    addr: at(a, 'addr'),
    type: at(a, 'addrtype'),
    vendor: at(a, 'vendor') || null,
  }));
  const ipv4 = addresses.find((a) => a.type === 'ipv4')?.addr || null;
  const ipv6 = addresses.find((a) => a.type === 'ipv6')?.addr || null;
  const mac = addresses.find((a) => a.type === 'mac') || null;

  const portsNode = asArray(h.ports)[0] || {};
  const ports = asArray(portsNode.port).map(parsePort);
  const extraports = asArray(portsNode.extraports).map((e) => ({
    state: at(e, 'state'),
    count: parseInt(at(e, 'count') || '0', 10),
  }));

  const osNode = asArray(h.os)[0];
  const os = osNode
    ? asArray(osNode.osmatch)
        .map((m) => ({
          name: at(m, 'name') || '',
          accuracy: parseInt(at(m, 'accuracy') || '0', 10),
          classes: asArray(m.osclass).map((c) => ({
            type: at(c, 'type') || '',
            vendor: at(c, 'vendor') || '',
            family: at(c, 'osfamily') || '',
            gen: at(c, 'osgen') || '',
            accuracy: parseInt(at(c, 'accuracy') || '0', 10),
            cpes: asArray(c.cpe).map((c2) => (c2 && c2['#text'] != null ? String(c2['#text']) : String(c2))),
          })),
        }))
        .sort((a, b) => b.accuracy - a.accuracy)
    : [];

  const traceNode = Array.isArray(h.trace) ? h.trace[0] : h.trace;

  return {
    id: ipv4 || ipv6 || mac?.addr || `${fileName}#${index}`,
    ip: ipv4 || ipv6 || null,
    ipv6: ipv4 ? ipv6 : null,
    mac: mac ? { addr: mac.addr, vendor: mac.vendor } : null,
    status: h.status ? { state: at(h.status, 'state'), reason: at(h.status, 'reason') } : { state: 'up' },
    hostnames: asArray(h.hostnames?.hostname)
      .map((hn) => ({ name: at(hn, 'name') || '', type: at(hn, 'type') || '' }))
      .filter((x) => x.name),
    ports,
    extraports,
    os,
    hostScripts: asArray(h.hostscript?.script).map(parseScriptNode),
    distance: h.distance ? parseInt(at(h.distance, 'value') || '0', 10) : null,
    hops: traceNode
      ? asArray(traceNode.hop).map((hp) => ({
          ttl: parseInt(at(hp, 'ttl') || '0', 10),
          ipaddr: at(hp, 'ipaddr') || '',
          host: at(hp, 'host') || '',
          rtt: at(hp, 'rtt') || '',
        }))
      : [],
    uptime: h.uptime
      ? { seconds: parseInt(at(h.uptime, 'seconds') || '0', 10) || 0, lastboot: at(h.uptime, 'lastboot') || null }
      : null,
    files: [fileName],
  };
}

/** Ajoute classification, sous-réseau, ports ouverts et diagnostic de risque. */
export function enrichHost(host) {
  const category = classifyDevice(host);
  const risk = analyzeRisks(host);
  const openPorts = host.ports.filter((p) => p.state === 'open');
  return {
    ...host,
    category,
    risk,
    subnet: subnetOf(host.ip),
    openPortCount: openPorts.length,
    sortKey: host.ip || host.id,
  };
}

// --- Fichier complet ---------------------------------------------------------
export function parseNmapContent(xmlText, fileName = 'scan.xml') {
  const warnings = [];
  let doc;
  try {
    doc = createParser().parse(xmlText);
  } catch (err) {
    throw new Error(`« ${fileName} » : XML illisible (${err.message})`);
  }
  if (!doc || !doc.nmaprun)
    throw new Error(`« ${fileName} » n'est pas un export Nmap -oX (balise <nmaprun> introuvable).`);

  const nr = doc.nmaprun;
  const hosts = asArray(nr.host)
    .map((h, i) => parseHost(h, fileName, i))
    .filter((h) => h.status.state !== 'down')
    .map(enrichHost);

  if (!hosts.length) warnings.push(`« ${fileName} » ne contient aucun hôte actif.`);

  const runstats = nr.runstats || {};
  const meta = {
    name: fileName,
    scanner: at(nr, 'scanner') || 'nmap',
    version: at(nr, 'version') || '',
    args: at(nr, 'args') || '',
    start: at(nr, 'startstr') || '',
    xmlVersion: at(nr, 'xmloutputversion') || '',
    summary: at(runstats.finished, 'summary') || '',
    stats: runstats.hosts
      ? {
          up: parseInt(at(runstats.hosts, 'up') || '0', 10),
          down: parseInt(at(runstats.hosts, 'down') || '0', 10),
          total: parseInt(at(runstats.hosts, 'total') || '0', 10),
        }
      : null,
  };
  return { hosts, meta, warnings };
}

// --- Fusion multi-fichiers -----------------------------------------------------
const portRichness = (p) =>
  (p.service?.product ? 2 : 0) +
  (p.service?.version ? 2 : 0) +
  (p.scripts?.length ? 2 : 0) +
  (p.service?.name ? 1 : 0) +
  (p.service?.extrainfo ? 1 : 0);

function mergeHost(a, b) {
  const ports = new Map();
  for (const p of [...a.ports, ...b.ports]) {
    const key = `${p.protocol}/${p.port}`;
    const prev = ports.get(key);
    if (!prev || portRichness(p) > portRichness(prev)) ports.set(key, p);
    else if (prev && p.scripts?.length) {
      const ids = new Set(prev.scripts.map((s) => s.id));
      prev.scripts.push(...p.scripts.filter((s) => !ids.has(s.id)));
    }
  }
  const hostnames = [...a.hostnames];
  for (const hn of b.hostnames) if (!hostnames.some((x) => x.name === hn.name)) hostnames.push(hn);
  const osMap = new Map();
  for (const m of [...a.os, ...b.os]) if (!osMap.has(m.name)) osMap.set(m.name, m);
  const scripts = [...a.hostScripts];
  for (const s of b.hostScripts) {
    const prev = scripts.find((x) => x.id === s.id);
    if (!prev) scripts.push(s);
    else if ((s.output || '').length > (prev.output || '').length) Object.assign(prev, s);
  }
  return enrichHost({
    ...a,
    mac: a.mac?.vendor ? a.mac : b.mac || a.mac,
    ipv6: a.ipv6 || b.ipv6,
    status: a.status.state === 'up' ? a.status : b.status,
    hostnames,
    ports: [...ports.values()].sort((x, y) => x.port - y.port),
    os: [...osMap.values()].sort((x, y) => y.accuracy - x.accuracy).slice(0, 3),
    hostScripts: scripts,
    distance: [a.distance, b.distance].filter((v) => v != null).sort((x, y) => x - y)[0] ?? null,
    hops: b.hops.length > a.hops.length ? b.hops : a.hops,
    uptime: a.uptime || b.uptime,
    files: [...new Set([...a.files, ...b.files])],
  });
}

/** Fusionne les résultats de plusieurs fichiers en un seul jeu d'hôtes. */
export function mergeScanResults(results) {
  const byId = new Map();
  const metas = [];
  const warnings = [];
  for (const res of results) {
    if (!res) continue;
    metas.push(res.meta);
    warnings.push(...(res.warnings || []));
    for (const h of res.hosts) {
      const prev = byId.get(h.id);
      byId.set(h.id, prev ? mergeHost(prev, h) : h);
    }
  }
  const hosts = [...byId.values()].sort((a, b) => compareIps(a.sortKey, b.sortKey));
  return { hosts, metas, warnings };
}
