// Auto-test hors navigateur : parse le scan de démo et vérifie le pipeline
// complet (parsing → classification → risques → fusion → exports).
// Usage : npm run selftest

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseNmapContent, mergeScanResults } from '../src/lib/nmapParser.js';
import { hostMatches, DEFAULT_FILTERS } from '../src/lib/filters.js';
import { buildVisData } from '../src/lib/graphBuilders.js';
import { hostsToCsv, findingsToCsv, buildSvgMap } from '../src/lib/exporters.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const xml = readFileSync(join(root, 'public/demo-scan.xml'), 'utf8');

let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures += 1;
};

const res = parseNmapContent(xml, 'demo-scan.xml');
const { hosts } = res;

console.log(`\n— ${hosts.length} hôtes parsés depuis le scan de démonstration —\n`);

check(`14 hôtes actifs (reçu: ${hosts.length})`, hosts.length === 14);

const byId = Object.fromEntries(hosts.map((h) => [h.id, h]));
check('WEB-SRV01 (10.10.0.12) détecté critique', byId['10.10.0.12']?.risk.level === 'critical');
check(
  'CVE-2021-41773 remontée sur 10.10.0.12',
  byId['10.10.0.12']?.risk.findings.some((f) => f.cves.includes('CVE-2021-41773')),
);
check('FTP-SRV vsftpd 2.3.4 → critique (CVE-2011-2523)', byId['10.10.0.14']?.risk.level === 'critical');
check('PC XP → critique (ms17-010 / EternalBlue)', byId['10.10.0.15']?.risk.level === 'critical');
check(
  'EternalBlue remontée via port 445',
  byId['10.10.0.15']?.risk.findings.some((f) => f.cves.includes('CVE-2017-0143')),
);
check('Caméra Hikvision classée « camera »', byId['10.10.0.31']?.category.category === 'camera');
check('Imprimante HP classée « printer »', byId['10.10.0.30']?.category.category === 'printer');
check('Routeur Cisco classé « router »', byId['10.10.0.1']?.category.category === 'router');
check('pfSense classé « router » (pare-feu)', byId['10.10.5.1']?.category.category === 'router');
check('Serveur de backup Proxmox classé « server »', byId['10.10.5.10']?.category.category === 'server');
check('Poste Windows 10 classé « workstation »', byId['10.10.0.20']?.category.category === 'workstation');
check('Caméra → identifiants par défaut (critique)', byId['10.10.0.31']?.risk.level === 'critical');
check('DC → signature SMB non requise (medium+)', ['medium', 'high', 'critical'].includes(byId['10.10.0.10']?.risk.level));

const subnets = [...new Set(hosts.map((h) => h.subnet))].sort();
check(`2 sous-réseaux détectés (reçu: ${subnets.join(', ')})`, subnets.length === 2);
check('10.10.0.12 ∈ 10.10.0.0/24', byId['10.10.0.12']?.subnet === '10.10.0.0/24');

// Fusion : réimporter le même fichier ne doit créer aucun doublon.
const merged = mergeScanResults([parseNmapContent(xml, 'a.xml'), parseNmapContent(xml, 'b.xml')]);
check(`fusion multi-fichiers sans doublon (${merged.hosts.length} hôtes)`, merged.hosts.length === 14);
check('fichiers sources fusionnés', merged.hosts[0]?.files.length === 2);

// Filtres
check(
  'filtre port ssh → routeur + serveurs SSH',
  hosts.filter((h) => hostMatches(h, { ...DEFAULT_FILTERS, ports: 'ssh' })).length >= 5,
);
check(
  'filtre vulnérables → hôtes critiques uniquement inclus',
  hosts
    .filter((h) => hostMatches(h, { ...DEFAULT_FILTERS, vulnOnly: true }))
    .every((h) => ['medium', 'high', 'critical'].includes(h.risk.level)),
);
check(
  'recherche « 10.10.5 » → 2 hôtes DMZ',
  hosts.filter((h) => hostMatches(h, { ...DEFAULT_FILTERS, q: '10.10.5' })).length === 2,
);
check(
  'filtre risque critical → 5 hôtes',
  hosts.filter((h) => hostMatches(h, { ...DEFAULT_FILTERS, risks: ['critical'] })).length === 5,
);

// Graphe
const vis = buildVisData(hosts);
check(`graphe : 14 nœuds (reçu: ${vis.nodes.length})`, vis.nodes.length === 14);
check('graphe : liens produits', vis.edges.length >= 12);
check('lien LAN 10.10.0.1 ↔ 10.10.0.12', vis.links.some((l) => l.from === '10.10.0.1' && l.to === '10.10.0.12'));

// Exports
check('CSV équipements non vide', hostsToCsv(hosts).split('\n').length === 15);
check('CSV vulnérabilités contient EternalBlue', findingsToCsv(hosts).includes('CVE-2017-0143'));
const positions = {};
hosts.forEach((h, i) => (positions[h.id] = { x: 100 + (i % 5) * 180, y: 100 + Math.floor(i / 5) * 200 }));
const { svg } = buildSvgMap(hosts, positions);
check('export SVG généré', svg.startsWith('<svg') && svg.length > 2000);

console.log(failures === 0 ? '\n✅ Tous les tests passent.\n' : `\n❌ ${failures} test(s) en échec.\n`);
process.exit(failures === 0 ? 0 : 1);
