// ─────────────────────────────────────────────────────────────────────────────
// net.js — Moteur de calcul adressage IPv4 / IPv6 (pur, sans DOM, testable).
// ─────────────────────────────────────────────────────────────────────────────

/** Convertit une IPv4 en entier non signé. Renvoie null si invalide. */
export function ipToInt(ip) {
  if (typeof ip !== 'string') return null;
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const raw of parts) {
    if (!/^\d{1,3}$/.test(raw)) return null;
    const v = Number(raw);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

/** Convertit un entier non signé en IPv4 pointée. */
export function intToIp(n) {
  const v = n >>> 0;
  return `${(v >>> 24) & 255}.${(v >>> 16) & 255}.${(v >>> 8) & 255}.${v & 255}`;
}

export function isValidIPv4(ip) {
  return ipToInt(ip) !== null;
}

/** Masque dotted-quad → préfixe (/24 → 24). Renvoie null si le masque n'est pas contigu. */
export function maskToPrefix(mask) {
  const n = ipToInt(mask);
  if (n === null) return null;
  if (n === 0) return 0;
  const inv = (~n) >>> 0;
  if (((inv + 1) & inv) !== 0) return null; // masque non contigu
  // Masque contigu : le préfixe est le nombre de bits à 1.
  let count = 0;
  let v = n;
  while (v) { count += v & 1; v >>>= 1; }
  return count;
}

/** Préfixe → masque dotted-quad. */
export function prefixToMask(prefix) {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  return intToIp(prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0);
}

/** Accepte "192.168.1.0/24" ou "192.168.1.0 255.255.255.0". */
export function parseCidr(input) {
  if (typeof input !== 'string') return null;
  const clean = input.trim().replace(/\s+/g, '/');
  const [rawIp, rawPrefix] = clean.split('/');
  const int = ipToInt(rawIp);
  if (int === null) return null;
  if (rawPrefix === undefined) return null;
  let prefix;
  if (rawPrefix.includes('.')) {
    prefix = maskToPrefix(rawPrefix);
  } else if (/^\d{1,2}$/.test(rawPrefix)) {
    prefix = Number(rawPrefix);
  } else {
    return null;
  }
  if (prefix === null || prefix < 0 || prefix > 32) return null;
  return { int, prefix };
}

export function isPrivateIPv4(ip) {
  const n = ipToInt(ip);
  if (n === null) return false;
  const a = (n >>> 24) & 255;
  const b = (n >>> 16) & 255;
  if (a === 10) return true;                 // 10.0.0.0/8
  if (a === 127) return true;                // 127.0.0.0/8 boucle locale
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true;   // 192.168.0.0/16
  if (a === 169 && b === 254) return true;   // APIPA
  return false;
}

export function ipClass(prefixFirstOctet) {
  if (prefixFirstOctet < 128) return 'A';
  if (prefixFirstOctet < 192) return 'B';
  if (prefixFirstOctet < 224) return 'C';
  if (prefixFirstOctet < 240) return 'D (multicast)';
  return 'E (réservée)';
}

/**
 * Informations complètes d'un préfixe IPv4.
 * @returns {{valid:boolean, cidr:string, address:string, prefix:number, network:string,
 *   broadcast:string, mask:string, wildcard:string, firstHost:string, lastHost:string,
 *   hostCount:number, usable:number, isPrivate:boolean, isNetworkAddress:boolean,
 *   class:string, range:[number,number]}|{valid:false, error:string}}
 */
export function cidrInfo(input) {
  const parsed = parseCidr(input);
  if (!parsed) return { valid: false, error: 'Préfixe CIDR invalide (ex. 192.168.10.0/24).' };
  const { int, prefix } = parsed;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (int & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = Math.pow(2, 32 - prefix);
  const usable = total >= 4 ? total - 2 : (total === 2 ? 2 : 1);
  const firstHost = total >= 4 ? network + 1 : network;
  const lastHost = total >= 4 ? broadcast - 1 : broadcast;
  const address = intToIp(int);
  return {
    valid: true,
    cidr: `${intToIp(network)}/${prefix}`,
    address,
    prefix,
    network: intToIp(network),
    broadcast: intToIp(broadcast),
    mask: intToIp(mask),
    wildcard: intToIp((~mask) >>> 0),
    firstHost: intToIp(firstHost),
    lastHost: intToIp(lastHost),
    hostCount: total,
    usable,
    isPrivate: isPrivateIPv4(intToIp(network)),
    isNetworkAddress: (int & mask) === int,
    class: ipClass((network >>> 24) & 255),
    range: [network, broadcast],
  };
}

/** Deux préfixes se chevauchent-ils ? */
export function cidrOverlaps(a, b) {
  const A = cidrInfo(a);
  const B = cidrInfo(b);
  if (!A.valid || !B.valid) return false;
  return A.range[0] <= B.range[1] && B.range[0] <= A.range[1];
}

/** Une adresse appartient-elle à un préfixe ? */
export function ipInCidr(ip, cidr) {
  const info = cidrInfo(cidr);
  if (!info.valid) return false;
  const n = ipToInt(ip);
  if (n === null) return false;
  return n >= info.range[0] && n <= info.range[1];
}

/** Découpe un préfixe en `count` sous-réseaux de taille égale (VLSM uniforme). */
export function splitCidr(input, count) {
  const info = cidrInfo(input);
  if (!info.valid) return [];
  const c = Math.max(1, Math.floor(count));
  const bits = Math.ceil(Math.log2(c));
  const newPrefix = Math.min(32, info.prefix + bits);
  const step = Math.pow(2, 32 - newPrefix);
  const out = [];
  for (let i = 0; i < Math.pow(2, newPrefix - info.prefix); i++) {
    const start = info.range[0] + i * step;
    out.push(cidrInfo(`${intToIp(start)}/${newPrefix}`));
  }
  return out;
}

/** Première adresse libre d'un préfixe, compte tenu des IPs déjà utilisées. */
export function firstFreeIp(cidr, used = []) {
  const info = cidrInfo(cidr);
  if (!info.valid) return null;
  const usedSet = new Set(used.map((u) => ipToInt(u)).filter((n) => n !== null));
  const start = ipToInt(info.firstHost);
  const end = ipToInt(info.lastHost);
  if (start === null || end === null) return null;
  for (let n = start; n <= end; n++) {
    if (!usedSet.has(n >>> 0)) return intToIp(n);
  }
  return null;
}

/** Génère une adresse MAC locale (bit local activé, bit multicast à 0). */
export function randomMac(seed = Math.random()) {
  const bytes = [];
  for (let i = 0; i < 6; i++) bytes.push(Math.floor(seed() * 256));
  bytes[0] = (bytes[0] & 0xfe) | 0x02;
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join(':');
}

// ── IPv6 ─────────────────────────────────────────────────────────────────────

/** Développe une IPv6 compressée en 8 groupes de 4 hexadécimales. Renvoie null si invalide. */
export function expandIPv6(addr) {
  if (typeof addr !== 'string') return null;
  let s = addr.trim();
  if (!s || s.length > 45) return null;
  if (!/^[0-9a-fA-F:.]+$/.test(s)) return null;

  // Suffixe IPv4 embarqué (::ffff:192.168.1.1)
  const v4 = s.match(/(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) {
    const n = ipToInt(v4[2]);
    if (n === null) return null;
    s = `${v4[1]}${((n >>> 16) & 0xffff).toString(16)}:${(n & 0xffff).toString(16)}`;
  }

  const doubleColonCount = (s.match(/::/g) || []).length;
  if (doubleColonCount > 1) return null;
  if (s === '::') return new Array(8).fill('0000');

  let head;
  let tail;
  if (doubleColonCount === 1) {
    const [h, t] = s.split('::');
    head = h ? h.split(':') : [];
    tail = t ? t.split(':') : [];
  } else {
    head = s.split(':');
    tail = [];
  }
  const groups = [...head, ...tail];
  if (groups.length > 8) return null;
  if (doubleColonCount === 0 && groups.length !== 8) return null;
  for (const g of groups) {
    if (g.length === 0 || g.length > 4 || !/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
  }
  const missing = 8 - groups.length;
  const full = doubleColonCount === 1
    ? [...head, ...new Array(missing).fill('0'), ...tail]
    : groups;
  if (full.length !== 8) return null;
  return full.map((g) => g.toLowerCase().padStart(4, '0'));
}

export function isValidIPv6(addr) {
  return expandIPv6(addr) !== null;
}

/** Forme comprimée canonique (RFC 5952). */
export function compressIPv6(addr) {
  const groups = expandIPv6(addr);
  if (!groups) return null;
  // Plus longue suite de groupes nuls (≥ 2), sinon aucune compression.
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;
  groups.forEach((g, i) => {
    if (g === '0000') {
      if (curLen === 0) curStart = i;
      curLen++;
      if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
    } else {
      curLen = 0;
    }
  });
  const short = groups.map((g) => g.replace(/^0+/, '') || '0');
  if (bestLen >= 2) {
    const before = short.slice(0, bestStart);
    const after = short.slice(bestStart + bestLen);
    return `${before.join(':')}::${after.join(':')}`.replace(/^:::/, '::').replace(/:::$/, '::');
  }
  return short.join(':');
}

/** Adresse réseau d'un préfixe IPv6 (BigInt). */
export function ipv6PrefixInfo(input) {
  if (typeof input !== 'string') return { valid: false, error: 'Préfixe IPv6 invalide (ex. 2001:db8:ab00::/40).' };
  const [addr, rawPrefix] = input.trim().split('/');
  const groups = expandIPv6(addr);
  if (!groups) return { valid: false, error: 'Adresse IPv6 invalide.' };
  if (!/^\d{1,3}$/.test(rawPrefix || '')) return { valid: false, error: 'Longueur de préfixe manquante.' };
  const prefix = Number(rawPrefix);
  if (prefix < 0 || prefix > 128) return { valid: false, error: 'Préfixe hors plage 0-128.' };

  const full = BigInt('0x' + groups.join(''));
  const shift = BigInt(128 - prefix);
  const mask = prefix === 0 ? 0n : ((1n << 128n) - 1n) >> shift << shift;
  const network = full & mask;

  const toGroups = (value) => {
    const out = [];
    for (let i = 7; i >= 0; i--) {
      out.push(((value >> BigInt(i * 16)) & 0xffffn).toString(16).padStart(4, '0'));
    }
    return out;
  };
  const netGroups = toGroups(network);
  const last = network | ((1n << shift) - 1n);
  const size = prefix === 0 ? '2^128' : `2^${128 - prefix}`;

  return {
    valid: true,
    address: compressIPv6(addr),
    prefix,
    network: compressIPv6(netGroups.join(':')),
    last: compressIPv6(toGroups(last).join(':')),
    size,
    isUniqueLocal: /^f[cd]/i.test(compressIPv6(netGroups.join(':'))),
    isLinkLocal: /^fe80/i.test(compressIPv6(netGroups.join(':'))),
  };
}
