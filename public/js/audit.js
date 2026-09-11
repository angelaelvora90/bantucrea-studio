// ─────────────────────────────────────────────────────────────────────────────
// audit.js — Analyse de l'architecture : adressage, segmentation, résilience,
// exposition et règles de pare-feu. Fonctions pures (testables hors navigateur).
// ─────────────────────────────────────────────────────────────────────────────
import { cidrInfo, ipInCidr, ipToInt, cidrOverlaps, isValidIPv4, isValidIPv6 } from './net.js';

export const SEVERITY = {
  critical: { label: 'Critique', weight: 100 },
  high: { label: 'Élevée', weight: 40 },
  medium: { label: 'Moyenne', weight: 12 },
  low: { label: 'Faible', weight: 3 },
  info: { label: 'Info', weight: 0 },
};

const NODES_BY_CATEGORY = {
  security: ['firewall', 'bastion', 'proxy'],
  edge: ['internet', 'cloud', 'vpn', 'site'],
  network: ['router', 'switch', 'switchL3', 'lb', 'ap', 'ups'],
  server: ['server', 'vm', 'nas', 'db', 'dns', 'ad', 'mail'],
  endpoint: ['desktop', 'laptop', 'printer', 'camera', 'phone', 'iot'],
};

export function categoryOf(type) {
  for (const [cat, list] of Object.entries(NODES_BY_CATEGORY)) {
    if (list.includes(type)) return cat;
  }
  return 'other';
}

/** Construit l'index du projet : voisinages, zone de chaque nœud, etc. */
export function indexProject(project) {
  const nodes = project.nodes || [];
  const links = project.links || [];
  const zones = project.zones || [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adjacency = new Map(nodes.map((n) => [n.id, []]));

  for (const l of links) {
    if (!byId.has(l.a) || !byId.has(l.b) || l.a === l.b) continue;
    adjacency.get(l.a).push({ to: l.b, link: l });
    adjacency.get(l.b).push({ to: l.a, link: l });
  }

  const zoneOfNode = new Map();
  for (const n of nodes) zoneOfNode.set(n.id, zoneOf(n, zones)?.name || null);

  return { nodes, links, zones, byId, adjacency, zoneOfNode };
}

/** Zone (rectangle) contenant le centre d'un nœud — la plus petite surface gagne. */
export function zoneOf(node, zones) {
  const cx = node.x + (node.w || 128) / 2;
  const cy = node.y + (node.h || 92) / 2;
  let best = null;
  let bestArea = Infinity;
  for (const z of zones) {
    if (cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h) {
      const area = z.w * z.h;
      if (area < bestArea) { bestArea = area; best = z; }
    }
  }
  return best;
}

/** Composantes connexes : Map id → indice de composante. */
export function connectedComponents(index) {
  const comp = new Map();
  let current = 0;
  for (const n of index.nodes) {
    if (comp.has(n.id)) continue;
    const stack = [n.id];
    comp.set(n.id, current);
    while (stack.length) {
      const id = stack.pop();
      for (const edge of index.adjacency.get(id) || []) {
        if (!comp.has(edge.to)) { comp.set(edge.to, current); stack.push(edge.to); }
      }
    }
    current++;
  }
  return comp;
}

/**
 * Arêtes critiques (ponts) au sens de Tarjan : les supprimer déconnecte le réseau.
 * Renvoie une liste de liens.
 */
export function findBridges(index) {
  const disc = new Map();
  const low = new Map();
  const bridges = [];
  let time = 0;

  const visit = (start) => {
    const stack = [{ id: start, iter: 0, via: null }];
    disc.set(start, time); low.set(start, time); time++;
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const edges = index.adjacency.get(frame.id) || [];
      if (frame.iter < edges.length) {
        const { to, link } = edges[frame.iter++];
        // On ne remonte jamais par l'arête d'où l'on vient (identité de l'arête,
        // et non du sommet : deux liaisons parallèles restent distinctes).
        if (link === frame.via) continue;
        if (!disc.has(to)) {
          disc.set(to, time); low.set(to, time); time++;
          stack.push({ id: to, iter: 0, via: link });
        } else {
          low.set(frame.id, Math.min(low.get(frame.id), disc.get(to)));
        }
      } else {
        stack.pop();
        if (stack.length) {
          const p = stack[stack.length - 1];
          if (low.get(frame.id) > disc.get(p.id) && frame.via) bridges.push(frame.via);
          low.set(p.id, Math.min(low.get(p.id), low.get(frame.id)));
        }
      }
    }
  };

  for (const n of index.nodes) if (!disc.has(n.id)) visit(n.id);
  return bridges;
}

/** Plus court chemin (BFS) entre deux nœuds, en ignorant les liens marqués "down". */
export function shortestPath(index, fromId, toId) {
  if (!index.byId.has(fromId) || !index.byId.has(toId)) return null;
  if (fromId === toId) return [fromId];
  const prev = new Map([[fromId, null]]);
  const queue = [fromId];
  while (queue.length) {
    const id = queue.shift();
    for (const edge of index.adjacency.get(id) || []) {
      if (edge.link.state === 'down') continue;
      if (prev.has(edge.to)) continue;
      prev.set(edge.to, { from: id, link: edge.link });
      if (edge.to === toId) {
        const path = [];
        let cur = toId;
        while (cur !== null && cur !== undefined) {
          path.unshift(cur);
          const p = prev.get(cur);
          cur = p ? p.from : null;
        }
        return path;
      }
      queue.push(edge.to);
    }
  }
  return null;
}

/**
 * Évalue une liste de règles de pare-feu (ordre = priorité, défaut = deny).
 * @returns {{decision:'allow'|'deny', rule:object|null, defaultDeny:boolean}}
 */
export function evaluateRules(rules = [], srcZone, dstZone, service) {
  for (const rule of rules) {
    if (rule.enabled === false) continue;
    const srcOk = rule.src === 'any' || !rule.src || rule.src === srcZone;
    const dstOk = rule.dst === 'any' || !rule.dst || rule.dst === dstZone;
    const svcOk = !rule.service || rule.service === 'any'
      || String(rule.service).toLowerCase() === String(service || '').toLowerCase();
    if (srcOk && dstOk && svcOk) {
      return { decision: rule.action === 'deny' ? 'deny' : 'allow', rule, defaultDeny: false };
    }
  }
  return { decision: 'deny', rule: null, defaultDeny: true };
}

/**
 * Analyse de traversée : que se passe-t-il entre deux nœuds pour un service donné ?
 * Chaque pare-feu rencontré applique ses règles selon les zones d'origine et de
 * destination du flux (telles qu'elles sont décrites dans la politique).
 */
export function analyzeReachability(project, fromId, toId, service = 'any') {
  const index = indexProject(project);
  const path = shortestPath(index, fromId, toId);
  if (!path) {
    return {
      reachable: false,
      verdict: 'unreachable',
      hops: [],
      message: 'Aucun chemin actif entre ces deux équipements.',
    };
  }

  const srcNode = index.byId.get(fromId);
  const dstNode = index.byId.get(toId);
  const srcZone = index.zoneOfNode.get(fromId) || 'hors zone';
  const dstZone = index.zoneOfNode.get(toId) || 'hors zone';

  const hops = [];
  let blocked = null;
  for (const id of path) {
    const node = index.byId.get(id);
    const zone = index.zoneOfNode.get(id) || 'hors zone';
    const hop = { node, zone, decision: 'allow', rule: null, defaultDeny: false, srcZone, dstZone };

    if (node.type === 'firewall' && path.length > 1) {
      const res = evaluateRules(node.rules || [], srcZone, dstZone, service);
      hop.decision = res.decision;
      hop.rule = res.rule;
      hop.defaultDeny = res.defaultDeny;
      if (res.decision === 'deny' && !blocked) {
        blocked = { node, rule: res.rule, defaultDeny: res.defaultDeny, srcZone, dstZone };
      }
    }
    hops.push(hop);
  }

  return {
    reachable: !blocked,
    verdict: blocked ? 'denied' : 'allowed',
    hops,
    blocked,
    srcZone,
    dstZone,
    message: blocked
      ? `Bloqué par « ${blocked.node.name} »`
        + (blocked.rule ? ` (règle ${blocked.rule.name})` : ' — aucune règle ne correspond, le refus par défaut s’applique')
        + ` pour ${blocked.srcZone} → ${blocked.dstZone}.`
      : (srcNode && dstNode)
        ? `Trajet ${srcZone} → ${dstZone} autorisé de bout en bout.`
        : 'Trajet autorisé de bout en bout.',
  };
}

// ── Audit complet ────────────────────────────────────────────────────────────

const RISKY_SERVICES = [
  { ports: ['22'], name: 'SSH' },
  { ports: ['3389'], name: 'RDP' },
  { ports: ['3306', '5432', '1433'], name: 'base de données' },
  { ports: ['135', '139', '445'], name: 'SMB/RPC Windows' },
  { ports: ['23'], name: 'Telnet (clair)' },
  { ports: ['21'], name: 'FTP (clair)' },
];

/**
 * Lance l'audit complet du schéma.
 * @returns {{score:number, maxScore:number, findings:Array, counts:object}}
 */
export function auditProject(project) {
  const index = indexProject(project);
  const { nodes, links, zones } = index;
  const findings = [];
  const add = (f) => findings.push({ id: cryptoId(), ...f });

  if (!nodes.length) {
    return { score: 100, maxScore: 100, findings: [], counts: { nodes: 0, links: 0, zones: 0 } };
  }

  // 1. Équipements isolés
  for (const n of nodes) {
    const degree = (index.adjacency.get(n.id) || []).length;
    if (degree === 0 && n.type !== 'internet' && n.type !== 'cloud') {
      add({
        severity: 'medium',
        title: `« ${n.name} » n’est raccordé à rien`,
        detail: 'Un équipement sans liaison physique est inexploitable : vérifiez le câblage ou le plan.',
        targets: [n.id],
        rule: 'orphan',
      });
    }
  }

  // 2. Adresses IP dupliquées
  const seenIp = new Map();
  for (const n of nodes) {
    const ip = (n.ip || '').trim();
    if (!ip) continue;
    if (!seenIp.has(ip)) seenIp.set(ip, []);
    seenIp.get(ip).push(n);
  }
  for (const [ip, list] of seenIp) {
    if (list.length > 1) {
      add({
        severity: 'critical',
        title: `Adresse IP dupliquée : ${ip}`,
        detail: `${list.map((n) => n.name).join(', ')} utilisent la même adresse → conflit ARP et coupures aléatoires.`,
        targets: list.map((n) => n.id),
        rule: 'duplicate-ip',
      });
    }
  }

  // 3. Adresses invalides / hors plage de la zone
  for (const n of nodes) {
    const ip = (n.ip || '').trim();
    if (!ip) continue;
    if (!isValidIPv4(ip) && !isValidIPv6(ip)) {
      add({
        severity: 'high',
        title: `Adresse invalide sur « ${n.name} »`,
        detail: `« ${ip} » n’est ni une IPv4 ni une IPv6 valide.`,
        targets: [n.id],
        rule: 'invalid-ip',
      });
      continue;
    }
    const zone = zoneOf(n, zones);
    if (zone?.cidr && isValidIPv4(ip) && !ipInCidr(ip, zone.cidr)) {
      const info = cidrInfo(zone.cidr);
      add({
        severity: 'high',
        title: `« ${n.name} » sort du plan d’adressage de sa zone`,
        detail: `${ip} n’appartient pas à ${info.valid ? info.cidr : zone.cidr} (zone ${zone.name}).`,
        targets: [n.id],
        rule: 'ip-out-of-zone',
      });
    }
    // Adresse réseau ou de diffusion attribuée à un hôte
    if (zone?.cidr && isValidIPv4(ip)) {
      const info = cidrInfo(zone.cidr);
      if (info.valid && (ip === info.network || ip === info.broadcast)) {
        add({
          severity: 'high',
          title: `Adresse réservée attribuée à « ${n.name} »`,
          detail: `${ip} est l’adresse ${ip === info.network ? 'réseau' : 'de diffusion'} du préfixe ${info.cidr}.`,
          targets: [n.id],
          rule: 'reserved-ip',
        });
      }
    }
  }

  // 4. Zones : préfixes valides et non chevauchants
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (!z.cidr) continue;
    const info = cidrInfo(z.cidr);
    if (!info.valid) {
      add({
        severity: 'medium',
        title: `Zone « ${z.name} » : préfixe invalide`,
        detail: `« ${z.cidr} » n’est pas un préfixe CIDR valide.`,
        targets: [],
        rule: 'zone-cidr',
        zone: z.id,
      });
      continue;
    }
    for (let j = i + 1; j < zones.length; j++) {
      const other = zones[j];
      if (!other.cidr) continue;
      if (cidrOverlaps(z.cidr, other.cidr)) {
        add({
          severity: 'high',
          title: `Chevauchement d’adressage : ${z.name} ↔ ${other.name}`,
          detail: `${z.cidr} et ${other.cidr} se recouvrent : le routage entre ces zones sera ambigu.`,
          targets: [],
          rule: 'zone-overlap',
          zone: z.id,
        });
      }
    }
  }

  const firewalls = nodes.filter((n) => n.type === 'firewall');
  const hasInternet = nodes.some((n) => n.type === 'internet' || n.type === 'cloud');

  // 5. Présence d'un pare-feu en bordure
  if (hasInternet && firewalls.length === 0) {
    add({
      severity: 'critical',
      title: 'Aucun pare-feu entre le réseau et l’extérieur',
      detail: 'Toute liaison vers Internet traverse un équipement de filtrage : ajoutez un pare-feu en bordure.',
      targets: nodes.filter((n) => n.type === 'internet').map((n) => n.id),
      rule: 'no-firewall',
    });
  }

  // 6. Règles de pare-feu
  for (const fw of firewalls) {
    const rules = fw.rules || [];
    if (!rules.length) {
      add({
        severity: 'medium',
        title: `« ${fw.name} » n’a aucune règle définie`,
        detail: 'Le refus par défaut s’appliquera à tout : documentez au minimum les flux autorisés.',
        targets: [fw.id],
        rule: 'fw-empty',
      });
      continue;
    }
    for (const r of rules) {
      if (r.enabled === false) continue;
      const wide = (r.src === 'any' || !r.src) && (r.dst === 'any' || !r.dst)
        && (!r.service || r.service === 'any') && r.action === 'allow';
      if (wide) {
        add({
          severity: 'high',
          title: `Règle trop permissive sur « ${fw.name} »`,
          detail: `« ${r.name} » autorise tout, de partout vers partout, sur tous les services.`,
          targets: [fw.id],
          rule: 'fw-any-any',
        });
      }
    }
  }

  // 7. Exposition directe de serveurs depuis Internet
  for (const n of nodes) {
    if (categoryOf(n.type) !== 'server') continue;
    const exposed = (n.exposedPorts || '').split(/[\s,;]+/).filter(Boolean);
    if (!exposed.length) continue;
    const risky = exposed.filter((p) => RISKY_SERVICES.some((s) => s.ports.includes(p)));
    if (!risky.length) continue;
    const path = hasInternet
      ? shortestPath(index, nodes.find((x) => x.type === 'internet')?.id, n.id)
      : null;
    const crossesFw = (path || []).some((id) => index.byId.get(id).type === 'firewall');
    if (!crossesFw) {
      const names = risky.map((p) => RISKY_SERVICES.find((s) => s.ports.includes(p)).name);
      add({
        severity: 'critical',
        title: `« ${n.name} » expose ${names.join(', ')} sans filtrage`,
        detail: `Ports ${risky.join(', ')} joignables depuis l’extérieur sans pare-feu sur le trajet. Placez l’équipement en DMZ filtrée.`,
        targets: [n.id],
        rule: 'exposed-service',
      });
    }
  }

  // 8. Segmentation Wi-Fi / IoT
  const aps = nodes.filter((n) => n.type === 'ap');
  const iot = nodes.filter((n) => n.type === 'iot' || n.type === 'camera');
  const serverVlans = new Set(
    nodes.filter((n) => categoryOf(n.type) === 'server' && n.vlan).map((n) => String(n.vlan)),
  );
  for (const ap of aps) {
    if (!ap.vlan) {
      add({
        severity: 'medium',
        title: `Point d’accès « ${ap.name} » sans VLAN dédié`,
        detail: 'Le sans-fil doit être isolé dans son propre VLAN (invités / utilisateurs) pour limiter la propagation.',
        targets: [ap.id],
        rule: 'ap-vlan',
      });
    } else if (serverVlans.has(String(ap.vlan))) {
      add({
        severity: 'high',
        title: `Le Wi-Fi « ${ap.name} » partage le VLAN des serveurs`,
        detail: `VLAN ${ap.vlan} utilisé à la fois par le sans-fil et les serveurs : cloisonnez.`,
        targets: [ap.id],
        rule: 'ap-server-vlan',
      });
    }
  }
  if (iot.length) {
    const unsegmented = iot.filter((n) => !n.vlan || serverVlans.has(String(n.vlan)));
    if (unsegmented.length) {
      add({
        severity: 'medium',
        title: `${unsegmented.length} équipement(s) IoT/caméra non segmenté(s)`,
        detail: `${unsegmented.map((n) => n.name).join(', ')} : les objets connectés doivent vivre dans un VLAN isolé.`,
        targets: unsegmented.map((n) => n.id),
        rule: 'iot-vlan',
      });
    }
  }

  // 9. Résilience : liaisons d'infrastructure sans redondance
  const INFRA = ['router', 'switch', 'switchL3', 'firewall', 'lb'];
  const bridges = findBridges(index);
  const criticalBridges = bridges.filter((l) => {
    const a = index.byId.get(l.a);
    const b = index.byId.get(l.b);
    return INFRA.includes(a?.type) && INFRA.includes(b?.type);
  });
  if (criticalBridges.length) {
    add({
      severity: 'medium',
      title: `${criticalBridges.length} liaison(s) sans redondance`,
      detail: `La rupture de ${criticalBridges.map((l) => `« ${index.byId.get(l.a).name} ↔ ${index.byId.get(l.b).name} »`).join(', ')} isole une partie du réseau.`,
      targets: [],
      rule: 'single-point-of-failure',
      links: criticalBridges.map((l) => l.id),
    });
  }

  const components = connectedComponents(index);
  const componentIds = new Set(components.values());
  const connected = nodes.filter((n) => (index.adjacency.get(n.id) || []).length > 0);
  if (connected.length && componentIds.size > 1) {
    add({
      severity: 'medium',
      title: `Le schéma comporte ${componentIds.size} îlots séparés`,
      detail: 'Plusieurs groupes d’équipements ne communiquent pas entre eux (volontaire ? à documenter sinon).',
      targets: [],
      rule: 'islands',
    });
  }

  // 10. Sortie Internet
  const routers = nodes.filter((n) => n.type === 'router');
  if (hasInternet && !routers.length && !firewalls.length) {
    add({
      severity: 'low',
      title: 'Aucun routeur de passerelle',
      detail: 'Sans passerelle par défaut, les hôtes locaux ne pourront pas joindre l’extérieur.',
      targets: [],
      rule: 'no-router',
    });
  }

  // 11. Documentation minimale : une adresse est attendue sur le réseau et les serveurs
  const undocumented = nodes.filter(
    (n) => ['server', 'network'].includes(categoryOf(n.type)) && !n.ip,
  );
  if (undocumented.length) {
    add({
      severity: 'low',
      title: `${undocumented.length} équipement(s) sans adresse renseignée`,
      detail: `${undocumented.slice(0, 5).map((n) => n.name).join(', ')}${undocumented.length > 5 ? '…' : ''} : le plan d’adressage reste incomplet.`,
      targets: undocumented.map((n) => n.id),
      rule: 'undocumented',
    });
  }

  // 12. Deux zones câblées en direct, sans équipement de filtrage entre elles
  for (const l of links) {
    const a = index.byId.get(l.a);
    const b = index.byId.get(l.b);
    if (!a || !b) continue;
    const za = zoneOf(a, zones);
    const zb = zoneOf(b, zones);
    if (!za || !zb || za.id === zb.id) continue;
    if (a.type === 'firewall' || b.type === 'firewall') continue;
    add({
      severity: 'high',
      title: `Liaison directe non filtrée : ${za.name} ↔ ${zb.name}`,
      detail: `« ${a.name} » et « ${b.name} » relient deux zones sans passer par un pare-feu : le trafic ne serait pas inspecté.`,
      targets: [a.id, b.id],
      rule: 'unfiltered-zone-link',
      links: [l.id],
    });
  }

  // Score
  const penalty = findings.reduce((s, f) => s + (SEVERITY[f.severity]?.weight || 0), 0);
  const score = Math.max(0, Math.round(100 - penalty));
  const counts = {
    nodes: nodes.length,
    links: links.length,
    zones: zones.length,
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    low: findings.filter((f) => f.severity === 'low').length,
  };

  const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return { score, maxScore: 100, findings, counts };
}

let counter = 0;
function cryptoId() {
  counter += 1;
  return `f${counter}-${Math.random().toString(36).slice(2, 7)}`;
}
