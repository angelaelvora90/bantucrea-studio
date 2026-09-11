// Classification automatique des équipements à partir de l'OS, du constructeur
// MAC, des noms d'hôte et des services exposés.

export const CATEGORIES = {
  server: { label: 'Serveur' },
  router: { label: 'Routeur / Pare-feu' },
  switch: { label: 'Switch' },
  workstation: { label: 'Poste de travail' },
  printer: { label: 'Imprimante' },
  camera: { label: 'Caméra IP' },
  iot: { label: 'Objet connecté (IoT)' },
  unknown: { label: 'Équipement inconnu' },
};

const CAMERA_VENDORS =
  /hikvision|dahua|axis|vivotek|hanwha|avtech|uniview|reolink|amcrest|mobotix|bosch/i;
const NET_VENDORS =
  /cisco|juniper|mikrotik|ubiquiti|netgear|aruba|zyxel|tp-?link|d-?link|huawei|fortinet|palo alto|netgate|sophos|watchguard|brocade|extreme|mellanox|alcatel/i;
const PRINTER_VENDORS =
  /hewlett|hp inc|canon|epson|brother|xerox|kyocera|lexmark|ricoh|konica|oki data|toshiba tec|samsung/i;

const SERVER_DAEMONS =
  /^(mysql|postgresql|ms-sql-s?|oracle|redis|mongodb|elasticsearch|smtp|smtps|pop3|pop3s|imap|imaps|domain| dns|ldap|ldaps|kerberos-sec|nfs|ipp$|submission|bacula|amanda|zfs|iscsi|rsync|pptp|openvpn|upnp$)/i;

const openPorts = (h) => h.ports.filter((p) => p.state === 'open');
const hasPort = (h, ...list) => openPorts(h).some((p) => list.includes(p.port));
const hasService = (h, re) =>
  openPorts(h).some(
    (p) =>
      re.test(p.service?.name || '') ||
      re.test(p.service?.product || '') ||
      re.test(p.service?.extrainfo || ''),
  );

function bestOsClasses(host) {
  const match = host.os?.[0];
  if (!match) return { name: '', classes: [] };
  return { name: match.name || '', classes: match.classes || [] };
}

/**
 * Retourne { category, label, reason } pour un hôte.
 * Les règles sont appliquées de la plus spécifique à la plus générique.
 */
export function classifyDevice(host) {
  const vendor = host.mac?.vendor || '';
  const hostname = (host.hostnames?.[0]?.name || '').toLowerCase();
  const { name: osName, classes } = bestOsClasses(host);
  const osTypes = classes.map((c) => (c.type || '').toLowerCase());
  const osBlob = `${osName} ${classes.map((c) => `${c.vendor || ''} ${c.family || ''}`).join(' ')}`;
  const open = openPorts(host);
  const done = (category, reason) => ({ category, label: CATEGORIES[category].label, reason });

  // --- Caméras / vidéosurveillance ------------------------------------
  if (osTypes.some((t) => t.includes('webcam') || t.includes('camera')))
    return done('camera', "Type d'OS « webcam » détecté");
  if (CAMERA_VENDORS.test(vendor)) return done('camera', `Constructeur vidéosurveillance (${vendor})`);
  if (hasService(host, /rtsp/i) || (hasPort(host, 554) && CAMERA_VENDORS.test(vendor + hostname)))
    return done('camera', 'Flux RTSP (port 554) exposé');
  if (/(^|[-_.])(cam|cctv|ipc)/i.test(hostname)) return done('camera', 'Nom d’hôte évoquant une caméra');

  // --- Imprimantes -----------------------------------------------------
  if (osTypes.some((t) => t.includes('printer'))) return done('printer', "Type d'OS « printer » détecté");
  if (hasPort(host, 9100) || (PRINTER_VENDORS.test(vendor) && hasPort(host, 515, 631)))
    return done('printer', 'Ports d’impression (9100/515/631) ouverts');
  if (/(^|[-_.])(prn|imp|print|printer|laserjet|officejet)/i.test(hostname))
    return done('printer', 'Nom d’hôte évoquant une imprimante');
  if (hasService(host, /(jetdirect|printer|laserjet|ipp)/i) && !hasService(host, /cups-browsed/i))
    return done('printer', 'Service d’impression détecté');

  // --- Équipements réseau (routeurs, pare-feux, switchs) ----------------
  const looksSwitchByName = /(^|[-_.])(sw|swi|switch)(\d|[-_.]|$)/i.test(hostname);
  const looksRouterByName = /(^|[-_.])(rtr|rt|gw|gateway|router|fw|firewall|pfsense|wrt)(\d|[-_.]|$)/i.test(
    hostname,
  );
  if (looksRouterByName) return done('router', 'Nom d’hôte évoquant une passerelle');
  if (looksSwitchByName) return done('switch', 'Nom d’hôte évoquant un switch');
  if (/(routeros|dd-wrt|openwrt|pfsense|vyos|edgeos|cisco ios|ios xe|fortigate|fortios)/i.test(osBlob))
    return done('router', `OS réseau détecté (${osName})`);
  if (osTypes.some((t) => t.includes('switch') || t.includes('hub')))
    return done('switch', "Type d'OS « switch » détecté");
  if (
    osTypes.some(
      (t) =>
        t.includes('router') ||
        t.includes('firewall') ||
        t.includes('load balancer') ||
        t.includes('wap') ||
        t.includes('broadband'),
    )
  )
    return done('router', `Type d'OS « ${classes.find((c) => c.type)?.type} » détecté`);
  if (NET_VENDORS.test(vendor)) {
    if (hasPort(host, 23, 179, 161, 520) || (hasPort(host, 22) && open.length <= 6))
      return done('router', `Constructeur réseau (${vendor})`);
    return done('switch', `Constructeur réseau (${vendor})`);
  }

  // --- Serveurs ---------------------------------------------------------
  if (
    /(^|[-_.])(srv|server|dc\d?|ad\d?|db|sql|web|mail|mx\d?|ns\d|dns|app|api|backup|bkup|veeam|proxy|prd|prod|nas|files?|share|jenkins|git|k8s|node|vm|esxi|vcenter|proxmox|pve|docker|host)(\d|[-_.]|$)/i.test(
      hostname,
    )
  )
    return done('server', 'Nom d’hôte évoquant un serveur');
  if (/windows (server|2003|2008|2012|2016|2019|2022|2025)/i.test(osBlob))
    return done('server', `OS serveur détecté (${osName})`);
  if (osTypes.some((t) => t.includes('storage'))) return done('server', 'Baie de stockage / NAS');
  if (hasService(host, /(proxmox|vmware|esxi|vcenter|hyper-v)/i))
    return done('server', 'Hyperviseur / console de virtualisation détectée');
  if (hasService(host, SERVER_DAEMONS)) return done('server', 'Démon serveur détecté (BDD, messagerie, DNS…)');

  // --- IoT --------------------------------------------------------------
  if (osTypes.some((t) => ['media device', 'game console', 'phone', 'pbx', 'voip', 'specialized', 'terminal'].includes(t)))
    return done('iot', 'Type d’équipement spécialisé');
  if (hasPort(host, 1883, 5683, 8883)) return done('iot', 'Protocole IoT (MQTT/CoAP) exposé');

  // --- Postes de travail -------------------------------------------------
  if (
    /(^|[-_.])(pc|wks|desktop|laptop|poste|workstation|win10|win11|portable|macbook|imac)/i.test(hostname)
  )
    return done('workstation', 'Nom d’hôte évoquant un poste client');
  if (/windows (7|8|8\.1|10|11|xp|vista)/i.test(osBlob) && !/server/i.test(osBlob))
    return done('workstation', `OS client détecté (${osName})`);
  if ((hasPort(host, 135, 139, 445) || hasPort(host, 3389)) && open.length <= 5)
    return done('workstation', 'Empreinte Windows (NetBIOS/SMB/RDP) avec peu de services');

  // --- Heuristiques finales ---------------------------------------------
  if (hasPort(host, 80, 443, 8080, 8443) || open.length >= 4)
    return done('server', 'Services multiples exposés (web/applicatifs)');
  if (open.length > 0) return done('unknown', 'Empreinte insuffisante pour classifier');
  return done('unknown', 'Aucun port ouvert détecté');
}

/** Petit numéro de version → comparaison chaîne "a.b.c" (renvoie -1/0/1). */
export function verCmp(a, b) {
  const pa = String(a || '').split(/[._-]/).map((x) => parseInt(x.replace(/\D.*/, ''), 10) || 0);
  const pb = String(b || '').split(/[._-]/).map((x) => parseInt(x.replace(/\D.*/, ''), 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}
