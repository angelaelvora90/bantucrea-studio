import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ipToInt, intToIp, maskToPrefix, prefixToMask, parseCidr, cidrInfo,
  cidrOverlaps, ipInCidr, splitCidr, isPrivateIPv4, firstFreeIp,
  expandIPv6, compressIPv6, ipv6PrefixInfo,
} from '../public/js/net.js';

test('conversion IPv4 aller-retour', () => {
  assert.equal(ipToInt('0.0.0.0'), 0);
  assert.equal(ipToInt('255.255.255.255'), 4294967295);
  assert.equal(ipToInt('192.168.1.1'), 3232235777);
  assert.equal(intToIp(3232235777), '192.168.1.1');
  assert.equal(intToIp(0), '0.0.0.0');
});

test('adresses IPv4 invalides rejetées', () => {
  for (const bad of ['256.1.1.1', '10.0.0', 'abc', '10.0.0.1.2', '', null, '10.0.0.-1']) {
    assert.equal(ipToInt(bad), null, `${bad} doit être refusé`);
  }
});

test('masque <-> préfixe', () => {
  assert.equal(maskToPrefix('255.255.255.0'), 24);
  assert.equal(maskToPrefix('255.255.0.0'), 16);
  assert.equal(maskToPrefix('255.255.255.252'), 30);
  assert.equal(maskToPrefix('0.0.0.0'), 0);
  assert.equal(maskToPrefix('255.0.255.0'), null, 'masque non contigu');
  assert.equal(prefixToMask(24), '255.255.255.0');
  assert.equal(prefixToMask(0), '0.0.0.0');
  assert.equal(prefixToMask(32), '255.255.255.255');
});

test('parseCidr accepte /n et masque décimal', () => {
  assert.deepEqual(parseCidr('192.168.1.0/24'), { int: 3232235776, prefix: 24 });
  assert.deepEqual(parseCidr('192.168.1.0/255.255.255.0'), { int: 3232235776, prefix: 24 });
  assert.equal(parseCidr('192.168.1.0'), null);
  assert.equal(parseCidr('192.168.1.0/33'), null);
});

test('cidrInfo /24 complet', () => {
  const info = cidrInfo('192.168.1.130/24');
  assert.equal(info.valid, true);
  assert.equal(info.network, '192.168.1.0');
  assert.equal(info.broadcast, '192.168.1.255');
  assert.equal(info.mask, '255.255.255.0');
  assert.equal(info.wildcard, '0.0.0.255');
  assert.equal(info.firstHost, '192.168.1.1');
  assert.equal(info.lastHost, '192.168.1.254');
  assert.equal(info.hostCount, 256);
  assert.equal(info.usable, 254);
  assert.equal(info.cidr, '192.168.1.0/24');
  assert.equal(info.isPrivate, true);
  assert.equal(info.isNetworkAddress, false);
  assert.equal(info.class, 'C');
});

test('cidrInfo cas limites /31, /32, /0', () => {
  assert.equal(cidrInfo('10.0.0.0/31').usable, 2);
  assert.equal(cidrInfo('10.0.0.1/32').usable, 1);
  assert.equal(cidrInfo('10.0.0.1/32').hostCount, 1);
  const zero = cidrInfo('0.0.0.0/0');
  assert.equal(zero.hostCount, 4294967296);
  assert.equal(zero.mask, '0.0.0.0');
  assert.equal(zero.broadcast, '255.255.255.255');
});

test('cidrInfo signale une entrée invalide', () => {
  const bad = cidrInfo('pas-un-reseau');
  assert.equal(bad.valid, false);
  assert.match(bad.error, /invalide/);
});

test('détection RFC 1918', () => {
  for (const priv of ['10.1.2.3', '172.16.0.1', '172.31.255.254', '192.168.0.7', '127.0.0.1', '169.254.1.1']) {
    assert.equal(isPrivateIPv4(priv), true, priv);
  }
  for (const pub of ['172.15.0.1', '172.32.0.1', '8.8.8.8', '203.0.113.9']) {
    assert.equal(isPrivateIPv4(pub), false, pub);
  }
});

test('chevauchement et appartenance', () => {
  assert.equal(cidrOverlaps('10.0.0.0/24', '10.0.0.128/25'), true);
  assert.equal(cidrOverlaps('10.0.0.0/25', '10.0.0.128/25'), false);
  assert.equal(cidrOverlaps('192.168.1.0/24', '192.168.1.0/24'), true);
  assert.equal(ipInCidr('10.0.0.42', '10.0.0.0/24'), true);
  assert.equal(ipInCidr('10.0.1.42', '10.0.0.0/24'), false);
  assert.equal(ipInCidr('invalide', '10.0.0.0/24'), false);
});

test('découpage VLSM', () => {
  const parts = splitCidr('192.168.10.0/24', 4);
  assert.equal(parts.length, 4);
  assert.deepEqual(parts.map((p) => p.cidr), [
    '192.168.10.0/26', '192.168.10.64/26', '192.168.10.128/26', '192.168.10.192/26',
  ]);
  assert.equal(parts[0].usable, 62);
  // 3 sous-réseaux demandés → on arrondit à la puissance de deux supérieure (4)
  assert.equal(splitCidr('10.0.0.0/24', 3).length, 4);
  assert.deepEqual(splitCidr('invalide', 4), []);
});

test('première adresse libre', () => {
  assert.equal(firstFreeIp('192.168.1.0/29', ['192.168.1.1', '192.168.1.2']), '192.168.1.3');
  assert.equal(firstFreeIp('192.168.1.0/30', ['192.168.1.1', '192.168.1.2']), null);
});

test('IPv6 : expansion, compression, préfixe', () => {
  assert.deepEqual(expandIPv6('2001:db8::1'), [
    '2001', '0db8', '0000', '0000', '0000', '0000', '0000', '0001',
  ]);
  assert.deepEqual(expandIPv6('::'), new Array(8).fill('0000'));
  assert.equal(expandIPv6('2001:db8:::1'), null);
  assert.equal(expandIPv6('gggg::1'), null);
  assert.equal(expandIPv6('1:2:3:4:5:6:7'), null, '7 groupes sans :: invalide');
  assert.equal(compressIPv6('2001:0db8:0000:0000:0000:0000:0000:0001'), '2001:db8::1');
  assert.equal(compressIPv6('fe80:0000:0000:0000:0000:0000:0000:0001'), 'fe80::1');
  assert.equal(compressIPv6('2001:0db8:0001:0002:0003:0004:0005:0006'), '2001:db8:1:2:3:4:5:6');
  // ::ffff:192.168.1.1 (IPv4 embarquée)
  assert.equal(compressIPv6('::ffff:192.168.1.1'), '::ffff:c0a8:101');

  const p = ipv6PrefixInfo('2001:db8:ab12::/48');
  assert.equal(p.valid, true);
  assert.equal(p.network, '2001:db8:ab12::');
  assert.equal(p.prefix, 48);
  assert.equal(p.size, '2^80');
  assert.equal(ipv6PrefixInfo('2001:db8::/200').valid, false);
  assert.equal(ipv6PrefixInfo('toto/64').valid, false);
  assert.equal(ipv6PrefixInfo('fd12::/64').isUniqueLocal, true);
});
