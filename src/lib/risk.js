// Analyse de risque : croise les scripts NSE, les versions de services
// et les états de ports pour produire un diagnostic de vulnérabilités.

import { verCmp } from './classify.js';

export const SEV_ORDER = ['info', 'low', 'medium', 'high', 'critical'];
export const SEV_LABELS = {
  critical: 'Critique',
  high: 'Élevé',
  medium: 'Moyen',
  low: 'Faible',
  info: 'Info',
  none: 'Aucun',
};

const rank = (sev) => SEV_ORDER.indexOf(sev);
export const maxSeverity = (findings) =>
  findings.reduce((acc, f) => (rank(f.severity) > rank(acc) ? f.severity : acc), 'info');

const CVE_RE = /CVE-\d{4}-\d{4,7}/gi;
const findCves = (text) => [...new Set((text.match(CVE_RE) || []).map((c) => c.toUpperCase()))];

// ---------------------------------------------------------------------------
// Analyse des scripts NSE
// ---------------------------------------------------------------------------
function analyzeScript(script, port) {
  const out = script.flat || script.output || '';
  const id = script.id || '';
  const blob = `${id}\n${out}`;
  const found = [];

  // « NOT VULNERABLE » ne doit pas déclencher l'alerte.
  const onlyNotVulnerable =
    /NOT\s+VULNERABLE/i.test(out) &&
    !/State:\s*(LIKELY\s+)?VULNERABLE/i.test(out);
  const looksVulnerable = /\bvuln/i.test(id) || /\bVULNERABLE\b/i.test(out);

  if (looksVulnerable && !onlyNotVulnerable) {
    let severity = 'high';
    if (/LIKELY VULNERABLE/i.test(out)) severity = 'medium';
    const cvss = out.match(/CVSS[:\s]+(\d{1,2}\.\d)/i);
    if (cvss) {
      const s = parseFloat(cvss[1]);
      severity = s >= 9 ? 'critical' : s >= 7 ? 'high' : s >= 4 ? 'medium' : 'low';
    }
    if (/(Exploitable|remote code execution|RCE)/i.test(out) && rank(severity) < rank('high'))
      severity = 'high';
    found.push({
      severity,
      title: `Vulnérabilité détectée — ${id}`,
      detail: out.trim() || `Le script NSE « ${id} » signale une vulnérabilité.`,
      port,
      cves: findCves(blob),
      source: 'script',
    });
  }

  if (/brute/i.test(id) && /(Valid credentials|Accounts:|Valid credentials found)/i.test(out)) {
    found.push({
      severity: 'critical',
      title: `Identifiants faibles découverts — ${id}`,
      detail: out.trim(),
      port,
      cves: findCves(blob),
      source: 'script',
    });
  }

  if (/(default-creds|default-accounts|http-default)/i.test(id) || /credentials found/i.test(out)) {
    if (/credentials found|credentials that were discovered|\[\/?[^\]]+\]\s*\S+:\S+/i.test(out)) {
      found.push({
        severity: 'critical',
        title: 'Identifiants par défaut actifs',
        detail:
          out.trim() ||
          'Des identifiants d’usine sont valables sur ce service. Les changer immédiatement.',
        port,
        cves: findCves(blob),
        source: 'script',
      });
    }
  }

  if (id === 'ftp-anon' && /Anonymous FTP login allowed/i.test(out)) {
    found.push({
      severity: 'medium',
      title: 'FTP anonyme autorisé',
      detail: out.trim(),
      port,
      cves: [],
      source: 'script',
    });
  }

  if (/^(smb2?-security-mode|smb-security-mode)$/i.test(id) && /not required|disabled/i.test(out)) {
    found.push({
      severity: 'medium',
      title: 'Signature SMB non requise',
      detail: `${out.trim()}\nRisque d’attaque de l’homme du milieu (relais NTLM).`,
      port,
      cves: [],
      source: 'script',
    });
  }

  if (/ssl/i.test(id) && /(SSLv2|SSLv3|POODLE|DROWN|heartbleed|weak cipher|64-bit)/i.test(out)) {
    found.push({
      severity: 'medium',
      title: `Configuration SSL/TLS vulnérable — ${id}`,
      detail: out.trim(),
      port,
      cves: findCves(blob),
      source: 'script',
    });
  }

  return found;
}

// ---------------------------------------------------------------------------
// Signatures de services obsolètes / vulnérables (version détectée par -sV)
// ---------------------------------------------------------------------------
function analyzeService(p) {
  const s = p.service || {};
  const name = (s.name || '').toLowerCase();
  const product = (s.product || '').toLowerCase();
  const version = s.version || '';
  const blob = `${name} ${product}`.trim();
  const port = p.port;
  const out = [];
  const push = (severity, title, detail, cves = []) =>
    out.push({ severity, title, detail, port, cves, source: 'service' });

  if (product === 'vsftpd' && version === '2.3.4')
    push(
      'critical',
      'vsftpd 2.3.4 — porte dérobée',
      'Cette version embarque une porte dérobée (backdoor) distribuée en 2011. Mise à jour immédiate requise.',
      ['CVE-2011-2523'],
    );
  else if (product === 'vsftpd' && version && verCmp(version, '2.3.5') < 0)
    push('medium', `vsftpd ${version} obsolète`, 'Version de vsftpd ancienne, à mettre à jour.');

  if (product === 'proftpd' && version === '1.3.3c')
    push(
      'critical',
      'ProFTPD 1.3.3c — porte dérobée',
      'Version compromise contenant une porte dérobée. Réinstaller depuis une source saine.',
    );

  if (/apache httpd?/.test(blob) || product === 'apache') {
    if (version === '2.4.49')
      push(
        'critical',
        'Apache 2.4.49 — traversée de répertoire / Exécution de code',
        'CVE-2021-41773 : path traversal (lecture de fichiers arbitraires, RCE si mod_cgi actif). Corriger en 2.4.51+.',
        ['CVE-2021-41773'],
      );
    else if (version === '2.4.50')
      push(
        'high',
        'Apache 2.4.50 — correctif incomplet (CVE-2021-42013)',
        'La correction de CVE-2021-41773 était insuffisante. Mettre à jour en 2.4.51+.',
        ['CVE-2021-42013'],
      );
    else if (version && /^2\.[0-2]\./.test(version))
      push('medium', `Apache ${version} obsolète`, 'Branche Apache ancienne, de nombreuses CVE corrigées depuis.');
  }

  if (/openssh/.test(blob) && version) {
    if (verCmp(version, '7.4') < 0)
      push(
        'medium',
        `OpenSSH ${version} obsolète`,
        'Nombreuses failles corrigées depuis la 7.4 (énumération d’utilisateurs, algorithmes faibles…). Mettre à jour.',
      );
  }

  if (/openssh/.test(blob) && /protocol 1/i.test(s.extrainfo || ''))
    push('high', 'SSH protocole v1 activé', 'Le protocole SSHv1 est cryptographiquement cassé.');

  if (/(samba|smbd)/.test(blob) && version) {
    if (verCmp(version, '4.6.5') < 0)
      push(
        'high',
        `Samba ${version} vulnérable (SambaCry)`,
        'Les versions ≤ 4.6.4 permettent l’exécution de code à distance via une bibliothèque partagée (CVE-2017-7494).',
        ['CVE-2017-7494'],
      );
    else if (/^3\./.test(version))
      push('medium', `Samba ${version} obsolète (branche 3.x)`, 'Branche Samba en fin de vie.');
  }

  if (/microsoft iis/.test(blob)) {
    if (/^5\.|^6\./.test(version))
      push('high', `IIS ${version} — serveur web en fin de vie`, 'IIS 5/6 (Windows 2000/2003) ne reçoit plus de correctifs.');
    else if (/^7\.[05]/.test(version))
      push('medium', `IIS ${version} obsolète`, 'Version IIS ancienne, fin de support dépassée.');
  }

  if (/^mysql$/.test(name) && version && verCmp(version, '5.6') < 0)
    push('medium', `MySQL ${version} en fin de vie`, 'Version MySQL sans support ni correctifs de sécurité.');
  if (/postgresql/.test(blob) && version && verCmp(version, '12') < 0)
    push('medium', `PostgreSQL ${version} en fin de vie`, 'Version PostgreSQL hors support.');
  if (/microsoft sql server/.test(blob) && /(2005|2008)\b/.test(version))
    push('high', `MS SQL Server ${version} en fin de vie`, 'Version SQL Server sans support étendu.');

  if (/nginx/.test(blob) && version && verCmp(version, '1.10') < 0)
    push('low', `nginx ${version} ancien`, 'Version nginx ancienne, vérifier les CVE applicables.');

  return out;
}

// ---------------------------------------------------------------------------
// Exposition de ports sensibles
// ---------------------------------------------------------------------------
function analyzeExposure(p) {
  const out = [];
  const push = (severity, title, detail) =>
    out.push({ severity, title, detail, port: p.port, cves: [], source: 'port' });

  switch (p.port) {
    case 23:
      push('medium', 'Telnet — trafic en clair', 'Identifiants et données transmis sans chiffrement. Remplacer par SSH.');
      break;
    case 21:
      push('low', 'FTP — trafic en clair', 'Protocole non chiffré, privilégier SFTP/FTPS.');
      break;
    case 3389:
      push('low', 'RDP exposé', 'Bureau à distance accessible : restreindre par ACL/VPN et activer NLA.');
      break;
    case 5900:
    case 5901:
      push('low', 'VNC exposé', 'VNC est souvent faiblement protégé. Tunnelliser via SSH/VPN.');
      break;
    case 2375:
      push('medium', 'API Docker sans TLS', 'Le démon Docker est pilotable à distance sans chiffrement ni authentification.');
      break;
    case 6379:
      push('low', 'Redis exposé', 'Vérifier que Redis exige une authentification et n’écoute que localement.');
      break;
    case 27017:
      push('low', 'MongoDB exposé', 'Vérifier l’activation de l’authentification MongoDB.');
      break;
    case 9200:
      push('low', 'Elasticsearch exposé', 'Vérifier que le cluster n’est pas accessible sans authentification.');
      break;
    default:
      break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Systèmes d'exploitation en fin de vie
// ---------------------------------------------------------------------------
function analyzeOs(host) {
  const out = [];
  const osName = host.os?.[0]?.name || '';
  const push = (severity, title, detail, cves = []) =>
    out.push({ severity, title, detail, port: null, cves, source: 'os' });

  if (/windows (xp|2000|2003|vista)/i.test(osName))
    push(
      'high',
      'Système en fin de vie',
      `${osName} ne reçoit plus aucun correctif de sécurité. Isoler ou migrer ce système.`,
    );
  else if (/windows (7|2008)\b/i.test(osName))
    push('high', 'Système en fin de vie', `${osName} est hors support étendu (2020/2023).`);
  else if (/windows (8|2012)\b/i.test(osName))
    push('medium', 'Système proche de la fin de support', `${osName} : planifier la migration.`);
  else if (/linux (2\.[46]|3\.[0-9])\./i.test(osName))
    push('medium', 'Noyau Linux ancien', `${osName} : noyau potentiellement non maintenu.`);
  return out;
}

// ---------------------------------------------------------------------------
// Point d'entrée : produit host.risk = { level, score, findings }
// ---------------------------------------------------------------------------
export function analyzeRisks(host) {
  const findings = [];

  for (const p of host.ports) {
    if (p.state !== 'open') continue;
    findings.push(...analyzeService(p));
    findings.push(...analyzeExposure(p));
    for (const sc of p.scripts || []) findings.push(...analyzeScript(sc, p.port));
  }
  for (const sc of host.hostScripts || []) findings.push(...analyzeScript(sc, null));
  findings.push(...analyzeOs(host));

  const openCount = host.ports.filter((p) => p.state === 'open').length;
  if (openCount >= 15)
    findings.push({
      severity: 'info',
      title: `Surface exposée importante (${openCount} ports ouverts)`,
      detail: 'Un grand nombre de services ouverts augmente la surface d’attaque. Vérifier leur nécessité.',
      port: null,
      cves: [],
      source: 'meta',
    });

  // Déduplique (même titre + même port).
  const seen = new Set();
  const unique = findings.filter((f) => {
    const key = `${f.title}|${f.port ?? '-'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => rank(b.severity) - rank(a.severity));

  // Déduplique par CVE : si une même CVE est déjà couverte par un constat plus
  // sévère (ex. script NSE « vuln » + signature de version), on n'en garde qu'un.
  const seenCves = new Set();
  const final = unique.filter((f) => {
    if (!f.cves.length) return true;
    const fresh = f.cves.filter((c) => !seenCves.has(c));
    if (!fresh.length) return false;
    fresh.forEach((c) => seenCves.add(c));
    f.cves = fresh;
    return true;
  });
  unique.length = 0;
  unique.push(...final);
  const level = unique.length ? maxSeverity(unique) : 'none';
  return { level, findings };
}

/** Un hôte est « vulnérable » si sa pire sévérité est au moins « medium ». */
export function isVulnerable(host) {
  return rank(host.risk?.level === 'none' ? 'info' : host.risk?.level) >= rank('medium');
}
