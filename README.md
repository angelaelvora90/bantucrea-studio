# BantuCrea Studio — Réseau & Sécurité

Deux applications web complémentaires pour la **conception** et l'**analyse** d'un réseau
d'entreprise. Toutes deux s'exécutent **à 100 % dans le navigateur** : aucune donnée réseau
ne quitte la machine.

| | Application | À quoi ça sert | Stack | Doc |
|---|---|---|---|---|
| 🗺️ | **[NetMap Visualizer](netmap.md)** | Transforme un export **XML Nmap** en carte topologique interactive avec diagnostic de vulnérabilités | React 18 · Vite · Tailwind · vis-network | [`netmap.md`](netmap.md) |
| 📐 | **[NetArch](netarch/README.md)** | **Studio de conception** : on dessine l'architecture (zones, VLAN, pare-feu) puis l'app applique un **audit de sécurité noté /100** | ES modules natifs · SVG · 0 dépendance | [`netarch/README.md`](netarch/README.md) |

Les deux se complètent : **NetArch** pour concevoir et faire valider un plan *avant* déploiement,
**NetMap** pour confronter le plan à la réalité d'un scan *après* déploiement.

---

## Démarrage

```bash
npm install
```

### NetMap Visualizer — analyser un scan Nmap

```bash
npm run dev        # http://localhost:5173
npm run build      # build de production dans dist/
npm run selftest   # auto-test du parseur et du moteur de risque
```

### NetArch — concevoir et auditer une architecture

```bash
npm run netarch    # http://localhost:3000
npm test           # 60 tests (moteur réseau, audit, front-end via jsdom)
```

NetArch n'a **aucune dépendance d'exécution** : `netarch/server.js` est un serveur statique
de 70 lignes. On peut aussi publier `netarch/public/` sur n'importe quel hébergeur statique.

---

## Organisation du dépôt

```
index.html  src/  vite.config.js  tailwind.config.js   ← NetMap Visualizer (Vite)
public/demo-scan.xml                                   ← jeu de données de démo NetMap
scripts/selftest.mjs                                   ← auto-test NetMap
netmap.md                                              ← documentation NetMap

netarch/                                               ← NetArch (autonome)
  server.js                                            ← serveur statique
  public/{index.html,styles,js}                        ← application
  test/{net,audit,ui}.test.js                          ← 60 tests
  README.md                                            ← documentation NetArch
```

Les deux applications sont volontairement **indépendantes** : NetArch n'est pas construite par
Vite et n'interfère pas avec le dossier `public/` de NetMap.

---

## Licence

MIT
