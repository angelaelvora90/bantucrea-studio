# BantuCrea Studio — NetArch

**Studio web de conception, de visualisation et d'audit d'architecture réseau d'entreprise.**

On dessine le schéma (glisser-déposer de routeurs, pare-feux, switchs, serveurs, bornes Wi-Fi…),
on délimite les zones (Internet, DMZ, LAN, serveurs, invités, IoT/Vidéo), on câble les liaisons,
puis l'application **analyse la sécurité et la cohérence du plan** : adressage, segmentation,
exposition de services, politique de filtrage, résilience.

Tout fonctionne **dans le navigateur** : aucune donnée ne quitte la machine, aucun backend requis.

---

## Démarrage

Depuis la racine du dépôt :

```bash
npm install        # une seule dépendance : jsdom (tests)
npm run netarch    # sert NetArch sur http://localhost:3000
```

Puis ouvrir <http://localhost:3000>. `netarch/server.js` est un serveur statique **sans aucune
dépendance** (Node ≥ 18) ; n'importe quel hébergeur statique (GitHub Pages, Netlify, Nginx, S3…)
convient aussi : il suffit de publier le dossier `netarch/public/`.

```bash
npm test           # 60 tests (moteur réseau, audit, front-end complet via jsdom)
```

---

## Ce que l'on peut faire

### Concevoir
- **26 équipements** répartis en 7 familles : bordure/externe, sécurité, réseau & distribution,
  serveurs & données, sans-fil, postes & objets, sites & énergie. Icônes SVG dessinées à la main.
- **Zones / VLAN** : rectangles colorés redimensionnables, chacun portant son préfixe CIDR et son VLAN.
- **Liaisons typées** : fibre, cuivre, trunk 802.1Q, sans-fil, tunnel VPN, liaison spécialisée —
  avec débit, VLAN et état *up/down*. Les flux s'animent sur les liaisons actives.
- Canvas infini : panoramique, zoom molette, aimantage à la grille, sélection multiple,
  annulation/rétablissement illimité (60 niveaux), sauvegarde automatique locale.
- **3 modèles prêts à l'emploi** : PME 40 postes avec DMZ filtrée, multi-sites en VPN IPsec,
  et un schéma volontairement non conforme pour démontrer l'audit.
- Réorganisation automatique : disposition par zones, arborescence hiérarchique, ajustement des zones.

### Vérifier
- **Calculateur d'adressage** IPv4 (réseau, masque, masque générique, diffusion, plage d'hôtes,
  adresses utiles, classe, portée publique/privée) et **découpage VLSM**. IPv6 : validation,
  compression RFC 5952 et adresse réseau d'un préfixe.
- **Politique de filtrage** par pare-feu : règles ordonnées source → destination → service,
  autoriser/refuser, activables individuellement, **refus par défaut** en fin de politique.
- **Analyseur de trajet** : on choisit une source, une destination et un service — l'application
  calcule le chemin réel dans le schéma et indique où le flux passe et où il est bloqué.
- **Audit noté /100** couvrant 14 familles de constats (voir ci-dessous), chaque constat étant
  cliquable pour centrer l'équipement concerné.

### Livrer
- Export **PNG** (×2), **SVG** vectoriel autonome, **JSON** réimportable,
  et **rapport Markdown** complet (vue d'ensemble, inventaire, liaisons, politique de filtrage, audit).

---

## Règles d'audit

| # | Contrôle | Gravité |
|---|---|---|
| 1 | Équipement raccordé à rien | moyenne |
| 2 | Adresse IP dupliquée | **critique** |
| 3 | Adresse hors du préfixe de sa zone | élevée |
| 4 | Adresse réseau ou de diffusion attribuée à un hôte | élevée |
| 5 | Adresse IPv4/IPv6 invalide | élevée |
| 6 | Préfixe de zone invalide | moyenne |
| 7 | Chevauchement d'adressage entre deux zones | élevée |
| 8 | Aucun pare-feu entre le réseau et l'extérieur | **critique** |
| 9 | Pare-feu sans règle / règle « tout vers tout » | moyenne / élevée |
| 10 | Service sensible (SSH, RDP, SMB, Telnet, FTP, SGBD) joignable sans filtrage | **critique** |
| 11 | Borne Wi-Fi sans VLAN dédié, ou dans le VLAN des serveurs | moyenne / élevée |
| 12 | Objets IoT / caméras non segmentés | moyenne |
| 13 | Liaison d'infrastructure sans redondance (arêtes critiques du graphe, algorithme de Tarjan) | moyenne |
| 14 | Îlots déconnectés · deux zones câblées en direct sans filtrage | moyenne / élevée |

Le score part de 100 et retire 100 points par constat critique, 40 par élevé, 12 par moyen, 3 par faible.

---

## Raccourcis

| Touche | Action |
|---|---|
| `Ctrl+Z` / `Ctrl+Y` | Annuler / rétablir |
| `Ctrl+D` | Dupliquer l'équipement sélectionné |
| `Ctrl+S` | Enregistrer dans le navigateur |
| `Ctrl+A`, `F` | Cadrer le schéma |
| `+` / `-` | Zoom |
| `Suppr` | Supprimer la sélection |
| `Maj` + glisser | Sélection multiple |
| `Échap` | Annuler le placement en cours |
| Flèches (`Maj` = ×4) | Déplacer l'équipement sélectionné |

---

## Organisation du code

```
netarch/
  server.js            Serveur statique (0 dépendance, anti path-traversal)
  public/
    index.html         Structure de l'interface
    styles/app.css     Thème sombre du studio
    js/
      app.js           Point d'entrée, barre d'outils, menus, autosauvegarde
      state.js         État du projet, historique, persistance locale
      devices.js       Catalogue des 26 équipements + icônes SVG
      render.js        Moteur de rendu SVG (zones, liaisons, nœuds, pan/zoom)
      interactions.js  Glisser-déposer, création de liaisons, clavier
      panels.js        Palette, inspecteur, pare-feu, adressage, audit
      layout.js        Dispositions automatiques
      export.js        PNG, SVG, JSON, rapport Markdown
      net.js           Moteur IPv4/IPv6 (pur, testé)
      audit.js         Graphe + moteur d'audit (pur, testé)
      presets.js       Architectures d'exemple
  test/
    net.test.js        12 scénarios — calcul d'adressage IPv4/IPv6
    audit.test.js      35 scénarios — graphe, pare-feu, analyse de trajet, audit, modèles
    ui.test.js         13 scénarios — front-end complet exécuté dans jsdom
```

`net.js` et `audit.js` sont des modules purs, sans DOM : ils sont testés directement sous Node.
`ui.test.js` charge `netarch/public/index.html` dans jsdom, exécute réellement `app.js` et vérifie
le rendu SVG, les panneaux, l'historique et les exports.

---

## Choix techniques

- **Aucune dépendance d'exécution.** Pas de framework, pas de build : du HTML, du CSS et des modules
  ES natifs. L'application se copie sur une clé USB et s'ouvre directement.
- **jsdom** est la seule dépendance, de développement, pour tester l'interface.
- **Rendu SVG différentiel** : chaque élément est mis en cache par identifiant et n'est reconstruit
  que si sa signature visuelle change — le glisser-déposer reste fluide à 100+ équipements.
- **Sécurité** : aucun appel réseau, aucune télémétrie, échappement HTML de toutes les saisies
  utilisateur avant injection dans le DOM, et le serveur statique refuse les traversées de chemin.

---

## Licence

MIT
