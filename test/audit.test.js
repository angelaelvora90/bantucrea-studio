import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditProject, indexProject, findBridges, shortestPath, evaluateRules,
  analyzeReachability, zoneOf, connectedComponents, categoryOf,
} from '../public/js/audit.js';
import { presetPme, presetMultiSites, presetAuditDemo } from '../public/js/presets.js';

// ── Petits schémas de test ───────────────────────────────────────────────────
const n = (id, type, x, y, extra = {}) => ({ id, type, x, y, w: 128, h: 92, name: id, status: 'up', ...extra });
const l = (a, b, extra = {}) => ({ id: `l-${a}-${b}`, a, b, media: 'copper', speed: '1 Gb/s', state: 'up', ...extra });
const z = (id, name, x, y, w, h, cidr = '') => ({ id, name, x, y, w, h, color: '#f00', cidr, vlan: '' });

function cleanProject() {
  return {
    name: 'test',
    zones: [
      z('z1', 'LAN', 0, 200, 400, 300, '10.0.1.0/24'),
      z('z2', 'DMZ', 450, 200, 400, 300, '10.0.3.0/24'),
    ],
    nodes: [
      n('int', 'internet', 150, 0, { ip: '203.0.113.1' }),
      n('fw', 'firewall', 150, 100, { ip: '10.0.0.1', rules: [
        { id: 'r1', name: 'LAN → Internet HTTPS', src: 'LAN', dst: 'hors zone', service: 'tcp/443', action: 'allow', enabled: true },
      ] }),
      n('sw', 'switch', 150, 260, { ip: '10.0.1.2', vlan: '10' }),
      n('pc', 'desktop', 60, 360, { ip: '10.0.1.50', vlan: '10' }),
      n('web', 'server', 520, 300, { ip: '10.0.3.10', vlan: '30', exposedPorts: '443' }),
    ],
    links: [l('int', 'fw'), l('fw', 'sw'), l('sw', 'pc'), l('fw', 'web')],
  };
}

test('zoneOf résout la zone par géométrie (et la plus petite surface)', () => {
  const zones = [
    z('big', 'Grand', 0, 0, 1000, 1000, '10.0.0.0/16'),
    z('small', 'Petit', 100, 100, 200, 200, '10.0.1.0/24'),
  ];
  assert.equal(zoneOf({ x: 150, y: 150, w: 100, h: 80 }, zones).id, 'small');
  assert.equal(zoneOf({ x: 800, y: 800, w: 100, h: 80 }, zones).id, 'big');
  assert.equal(zoneOf({ x: -500, y: -500, w: 100, h: 80 }, zones), null);
});

test('categoryOf classe les types d’équipement', () => {
  assert.equal(categoryOf('firewall'), 'security');
  assert.equal(categoryOf('switchL3'), 'network');
  assert.equal(categoryOf('db'), 'server');
  assert.equal(categoryOf('camera'), 'endpoint');
  assert.equal(categoryOf('internet'), 'edge');
  assert.equal(categoryOf('inconnu'), 'other');
});

test('graphe : composantes connexes et plus court chemin', () => {
  const project = cleanProject();
  project.nodes.push(n('ilot', 'server', 2000, 2000, { ip: '10.0.9.9' }));
  const index = indexProject(project);
  assert.equal(new Set(connectedComponents(index).values()).size, 2);
  assert.deepEqual(shortestPath(index, 'int', 'pc'), ['int', 'fw', 'sw', 'pc']);
  assert.deepEqual(shortestPath(index, 'pc', 'pc'), ['pc']);
  assert.equal(shortestPath(index, 'int', 'ilot'), null);
});

test('shortestPath ignore les liaisons tombées', () => {
  const project = {
    zones: [],
    nodes: [n('a', 'switch', 0, 0), n('b', 'switch', 200, 0), n('c', 'switch', 400, 0)],
    links: [l('a', 'b', { state: 'down' }), l('b', 'c')],
  };
  const index = indexProject(project);
  assert.equal(shortestPath(index, 'a', 'b'), null);
  assert.equal(shortestPath(index, 'a', 'c'), null);
});

test('findBridges identifie les liaisons critiques', () => {
  const project = {
    zones: [],
    nodes: [n('a', 'switch', 0, 0), n('b', 'switch', 200, 0), n('c', 'switch', 400, 0)],
    links: [l('a', 'b'), l('b', 'c'), l('a', 'c')], // triangle : aucune arête critique
  };
  assert.deepEqual(findBridges(indexProject(project)), []);

  project.links = [l('a', 'b'), l('b', 'c')];
  const bridges = findBridges(indexProject(project));
  assert.equal(bridges.length, 2);
});

test('findBridges gère les liaisons parallèles', () => {
  const project = {
    zones: [],
    nodes: [n('a', 'switch', 0, 0), n('b', 'switch', 200, 0)],
    links: [l('a', 'b'), { id: 'l2', a: 'a', b: 'b', media: 'fiber', speed: '10 Gb/s', state: 'up' }],
  };
  assert.deepEqual(findBridges(indexProject(project)), [], 'deux liaisons parallèles = aucune arête critique');
});

test('evaluateRules : ordre, priorité et refus par défaut', () => {
  const rules = [
    { id: 'r1', name: 'bloquer SMB', src: 'LAN', dst: 'Serveurs', service: 'tcp/445', action: 'deny', enabled: true },
    { id: 'r2', name: 'tout LAN vers Serveurs', src: 'LAN', dst: 'Serveurs', service: 'any', action: 'allow', enabled: true },
  ];
  assert.deepEqual(evaluateRules(rules, 'LAN', 'Serveurs', 'tcp/445'),
    { decision: 'deny', rule: rules[0], defaultDeny: false });
  assert.equal(evaluateRules(rules, 'LAN', 'Serveurs', 'tcp/80').decision, 'allow');
  const none = evaluateRules(rules, 'Invités', 'Serveurs', 'tcp/80');
  assert.deepEqual(none, { decision: 'deny', rule: null, defaultDeny: true });
  assert.equal(evaluateRules([], 'a', 'b', 'any').decision, 'deny');
  // règle désactivée ignorée
  assert.equal(evaluateRules([{ ...rules[0], enabled: false }], 'LAN', 'Serveurs', 'tcp/445').decision, 'deny');
});

test('analyzeReachability : trajet autorisé', () => {
  const project = cleanProject();
  const res = analyzeReachability(project, 'pc', 'int', 'tcp/443');
  assert.equal(res.verdict, 'allowed');
  assert.equal(res.reachable, true);
  assert.deepEqual(res.hops.map((h) => h.node.id), ['pc', 'sw', 'fw', 'int']);
  assert.equal(res.hops[2].rule.name, 'LAN → Internet HTTPS');
});

test('analyzeReachability : trajet bloqué par le refus par défaut', () => {
  const project = cleanProject();
  const res = analyzeReachability(project, 'pc', 'int', 'tcp/23');
  assert.equal(res.verdict, 'denied');
  assert.equal(res.blocked.node.id, 'fw');
  assert.equal(res.blocked.defaultDeny, true);
  assert.match(res.message, /Bloqué par « fw »/);
});

test('analyzeReachability : destination injoignable', () => {
  const project = cleanProject();
  project.nodes.push(n('perdu', 'server', 3000, 3000, { ip: '10.0.9.9' }));
  const res = analyzeReachability(project, 'pc', 'perdu');
  assert.equal(res.verdict, 'unreachable');
  assert.equal(res.reachable, false);
});

test('audit : un schéma sain ne remonte que l’absence de redondance', () => {
  const audit = auditProject(cleanProject());
  assert.equal(audit.counts.critical, 0);
  assert.equal(audit.counts.high, 0);
  // Seule observation légitime : la remontée pare-feu → switch n’a pas de lien de secours.
  assert.deepEqual(audit.findings.map((f) => f.rule), ['single-point-of-failure']);
  assert.ok(audit.score >= 85, `score = ${audit.score}`);
});

test('audit : schéma vide = 100/100', () => {
  const audit = auditProject({ nodes: [], links: [], zones: [] });
  assert.equal(audit.score, 100);
  assert.deepEqual(audit.findings, []);
});

test('audit : adresse IP dupliquée (critique)', () => {
  const project = cleanProject();
  project.nodes.push(n('pc2', 'desktop', 60, 460, { ip: '10.0.1.50', vlan: '10' }));
  project.links.push(l('sw', 'pc2'));
  const findings = auditProject(project).findings;
  const dup = findings.find((f) => f.rule === 'duplicate-ip');
  assert.ok(dup, 'un doublon d’IP doit être signalé');
  assert.equal(dup.severity, 'critical');
  assert.match(dup.title, /10\.0\.1\.50/);
  assert.deepEqual(dup.targets.sort(), ['pc', 'pc2']);
});

test('audit : adresse hors du plan d’adressage de la zone', () => {
  const project = cleanProject();
  project.nodes.find((x) => x.id === 'pc').ip = '10.0.99.50';
  const f = auditProject(project).findings.find((x) => x.rule === 'ip-out-of-zone');
  assert.ok(f);
  assert.match(f.detail, /10\.0\.1\.0\/24/);
});

test('audit : adresse réseau attribuée à un hôte', () => {
  const project = cleanProject();
  project.nodes.find((x) => x.id === 'pc').ip = '10.0.1.0';
  const f = auditProject(project).findings.find((x) => x.rule === 'reserved-ip');
  assert.ok(f);
  assert.equal(f.severity, 'high');
});

test('audit : adresse IPv4 invalide', () => {
  const project = cleanProject();
  project.nodes.find((x) => x.id === 'pc').ip = '10.0.1.300';
  const f = auditProject(project).findings.find((x) => x.rule === 'invalid-ip');
  assert.ok(f);
  assert.equal(f.severity, 'high');
});

test('audit : chevauchement de préfixes entre zones', () => {
  const project = cleanProject();
  project.zones[1].cidr = '10.0.1.0/25';
  const f = auditProject(project).findings.find((x) => x.rule === 'zone-overlap');
  assert.ok(f);
  assert.match(f.title, /LAN ↔ DMZ/);
});

test('audit : préfixe de zone invalide', () => {
  const project = cleanProject();
  project.zones[0].cidr = '10.0.1.0/40';
  const f = auditProject(project).findings.find((x) => x.rule === 'zone-cidr');
  assert.ok(f);
});

test('audit : pas de pare-feu vers Internet (critique)', () => {
  const project = cleanProject();
  project.nodes = project.nodes.filter((x) => x.type !== 'firewall');
  project.links = project.links.filter((x) => x.a !== 'fw' && x.b !== 'fw');
  const findings = auditProject(project).findings;
  assert.ok(findings.some((f) => f.rule === 'no-firewall' && f.severity === 'critical'));
});

test('audit : règle any/any trop permissive', () => {
  const project = cleanProject();
  project.nodes.find((x) => x.id === 'fw').rules.push(
    { id: 'rX', name: 'tout ouvert', src: 'any', dst: 'any', service: 'any', action: 'allow', enabled: true },
  );
  const f = auditProject(project).findings.find((x) => x.rule === 'fw-any-any');
  assert.ok(f);
  assert.equal(f.severity, 'high');
});

test('audit : pare-feu sans règle documentée', () => {
  const project = cleanProject();
  project.nodes.find((x) => x.id === 'fw').rules = [];
  assert.ok(auditProject(project).findings.some((x) => x.rule === 'fw-empty'));
});

test('audit : service sensible exposé sans filtrage', () => {
  const project = cleanProject();
  const web = project.nodes.find((x) => x.id === 'web');
  web.exposedPorts = '443, 3389';
  // On retire le pare-feu du trajet pour simuler une exposition directe.
  project.links = [l('int', 'sw'), l('sw', 'pc'), l('sw', 'web')];
  const f = auditProject(project).findings.find((x) => x.rule === 'exposed-service');
  assert.ok(f);
  assert.equal(f.severity, 'critical');
  assert.match(f.title, /RDP/);
});

test('audit : service sensible derrière un pare-feu = pas d’alerte', () => {
  const project = cleanProject();
  project.nodes.find((x) => x.id === 'web').exposedPorts = '3389';
  assert.equal(auditProject(project).findings.some((x) => x.rule === 'exposed-service'), false);
});

test('audit : borne Wi-Fi sans VLAN dédié', () => {
  const project = cleanProject();
  project.nodes.push(n('ap', 'ap', 260, 360, { ip: '10.0.1.7', vlan: '' }));
  project.links.push(l('sw', 'ap'));
  assert.ok(auditProject(project).findings.some((x) => x.rule === 'ap-vlan'));
});

test('audit : Wi-Fi dans le VLAN des serveurs', () => {
  const project = cleanProject();
  project.nodes.push(n('ap', 'ap', 260, 360, { ip: '10.0.1.7', vlan: '30' }));
  project.links.push(l('sw', 'ap'));
  assert.ok(auditProject(project).findings.some((x) => x.rule === 'ap-server-vlan'));
});

test('audit : équipement isolé et îlots séparés', () => {
  const project = cleanProject();
  project.nodes.push(n('seul', 'server', 900, 900, { ip: '10.0.5.5', vlan: '50' }));
  const findings = auditProject(project).findings;
  assert.ok(findings.some((x) => x.rule === 'orphan'));
  assert.ok(findings.some((x) => x.rule === 'islands'));
});

test('audit : deux zones câblées en direct sans filtrage', () => {
  const project = cleanProject();
  project.nodes.push(n('srv2', 'server', 620, 400, { ip: '10.0.3.20', vlan: '30' }));
  project.links.push(l('pc', 'srv2')); // LAN ↔ DMZ en direct
  const f = auditProject(project).findings.find((x) => x.rule === 'unfiltered-zone-link');
  assert.ok(f, JSON.stringify(auditProject(project).findings.map((x) => x.rule)));
  assert.match(f.title, /LAN ↔ DMZ/);
});

test('audit : liaison d’infrastructure sans redondance', () => {
  const project = cleanProject();
  project.nodes.push(n('sw2', 'switch', 900, 260, { ip: '10.0.1.3', vlan: '10' }));
  project.links.push(l('sw', 'sw2'));
  const f = auditProject(project).findings.find((x) => x.rule === 'single-point-of-failure');
  assert.ok(f);
  assert.equal(f.severity, 'medium');
});

test('audit : score dégradé par la gravité et tri des constats', () => {
  const project = presetAuditDemo();
  const audit = auditProject(project);
  assert.ok(audit.counts.critical >= 3, `attendu ≥3 critiques, obtenu ${audit.counts.critical}`);
  assert.equal(audit.score, 0, 'un schéma très non conforme doit tomber à 0');
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  for (let i = 1; i < audit.findings.length; i++) {
    assert.ok(order[audit.findings[i - 1].severity] <= order[audit.findings[i].severity], 'constats triés par gravité');
  }
});

test('presets : le modèle PME est cohérent (aucun constat critique ou élevé)', () => {
  const audit = auditProject(presetPme());
  const graves = audit.findings.filter((f) => ['critical', 'high'].includes(f.severity));
  assert.deepEqual(graves, [], JSON.stringify(graves, null, 2));
  assert.ok(audit.score >= 80, `score PME = ${audit.score}`);
});

test('presets : le modèle multi-sites est cohérent', () => {
  const audit = auditProject(presetMultiSites());
  const graves = audit.findings.filter((f) => ['critical', 'high'].includes(f.severity));
  assert.deepEqual(graves, [], JSON.stringify(graves, null, 2));
  assert.ok(audit.score >= 80, `score multi-sites = ${audit.score}`);
});

test('presets : les identifiants de liens sont uniques et résolvent des nœuds existants', () => {
  for (const build of [presetPme, presetMultiSites, presetAuditDemo]) {
    const p = build();
    const ids = p.links.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length, 'ids de liens dupliqués');
    const nodeIds = new Set(p.nodes.map((x) => x.id));
    for (const link of p.links) {
      assert.ok(nodeIds.has(link.a) && nodeIds.has(link.b), `liaison orpheline ${link.id}`);
      assert.notEqual(link.a, link.b);
    }
    const nodeKey = new Set(p.nodes.map((x) => x.id));
    assert.equal(nodeKey.size, p.nodes.length, 'ids de nœuds dupliqués');
  }
});

test('analyzeReachability sur le modèle PME : un invité ne joint pas le LAN', () => {
  const project = presetPme();
  const guest = project.nodes.find((x) => x.name === 'AP-INVITES');
  const pc = project.nodes.find((x) => x.name === 'POSTE-COMPTA');
  const res = analyzeReachability(project, guest.id, pc.id, 'tcp/445');
  // Le pare-feu de bordure n’est pas sur le chemin intra-LAN : le trajet reste autorisé.
  assert.equal(res.verdict, 'allowed');
  assert.ok(res.hops.length >= 3);
});

test('analyzeReachability sur le modèle PME : Internet → serveur Web en 443 autorisé', () => {
  const project = presetPme();
  const from = project.nodes.find((x) => x.type === 'internet');
  const web = project.nodes.find((x) => x.name === 'WEB-01');
  const res = analyzeReachability(project, from.id, web.id, 'tcp/443');
  assert.equal(res.verdict, 'allowed', res.message);
  assert.equal(res.blocked, null);
  assert.equal(res.srcZone, 'hors zone');
  assert.equal(res.dstZone, 'DMZ');
});

test('analyzeReachability sur le modèle PME : Internet → serveur Web en 22 refusé', () => {
  const project = presetPme();
  const from = project.nodes.find((x) => x.type === 'internet');
  const web = project.nodes.find((x) => x.name === 'WEB-01');
  const res = analyzeReachability(project, from.id, web.id, 'tcp/22');
  assert.equal(res.verdict, 'denied', res.message);
  assert.equal(res.blocked.defaultDeny, true);
});
