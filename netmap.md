# NetMap Visualizer

**NetMap Visualizer** transforme les exports XML bruts de Nmap en une carte topologique
interactive, avec un diagnostic instantané des faiblesses de votre parc informatique.
Le traitement s'exécute **à 100 % dans le navigateur** : aucune donnée réseau n'est
jamais envoyée vers un serveur (*privacy-first*).

![stack](https://img.shields.io/badge/React-18-61dafb) ![style](https://img.shields.io/badge/Tailwind-3-38bdf8) ![graph](https://img.shields.io/badge/vis--network-9-f59e0b) ![parser](https://img.shields.io/badge/fast--xml--parser-4-34d399)

## Fonctionnalités

- **Importation privacy-first** — zone de glisser-déposer pour fichiers `.xml` Nmap,
  parsing dans un **Web Worker** (l'interface reste fluide sur les gros scans),
  **fusion automatique** de plusieurs fichiers (larges plages `/16`, multiples sous-réseaux).
- **Graphe topologique interactif** — spatialisation par forces physiques
  (`vis-network`, solveur forceAtlas2), nœuds repositionnables à la souris, zoom,
  infobulles, **regroupement visuel par sous-réseau** (enveloppes colorées CIDR),
  icônes automatiques par catégorie : serveurs, routeurs/pare-feux, switchs,
  postes de travail, imprimantes, caméras IP, IoT (analyse OS × constructeur MAC × services).
- **Inspecteur d'équipement** — carte d'identité (IP, FQDN, MAC, constructeur, OS +
  indice de confiance), **matrice des ports** (numéro, protocole, état, service,
  version exacte), **bloc vulnérabilités** avec alertes rouge/orange
  (CVE des scripts NSE, services obsolètes, identifiants par défaut, OS en fin de vie).
- **Filtres de sécurité** — filtre par port/service (`22`, `ssh`, `3389`…), filtre par
  niveau de risque, mode « avec failles uniquement », recherche plein texte
  (IP, hôte, OS, service, CVE).
- **Exportation & reporting** — carte en **PNG haute définition (×3)** ou **SVG vectoriel**,
  liste des équipements en **CSV**, liste des vulnérabilités en **CSV**, rapport complet en **JSON**.

## Utilisation

```bash
# 1. Générez un export XML avec détection des versions et de l'OS
nmap -sV -sC -O -oX audit.xml 10.10.0.0/24

# 2. Déposez audit.xml dans l'application (ou cliquez « Explorer un scan de démonstration »)
```

## Développement

```bash
npm install
npm run dev        # serveur Vite sur http://localhost:5173
npm run selftest   # tests du pipeline parsing → risques → exports (Node, sans navigateur)
npm run build      # build de production dans dist/
```

## Architecture

```
src/
├── worker/nmapParser.worker.js   # Web Worker : parsing hors thread principal
├── lib/
│   ├── nmapParser.js             # fast-xml-parser → hôtes enrichis + fusion multi-fichiers
│   ├── classify.js               # classification serveur/routeur/switch/poste/imprimante/caméra/IoT
│   ├── risk.js                   # scripts NSE, signatures de versions, exposition, OS en fin de vie
│   ├── graphBuilders.js          # nœuds/liens vis-network (passerelles, traceroute, cœur)
│   ├── geometry.js               # enveloppes convexes arrondies des sous-réseaux
│   ├── icons.js                  # icônes SVG des équipements colorées par niveau de risque
│   ├── filters.js                # recherche texte, ports/services, risques
│   └── exporters.js              # rendu SVG/PNG haute définition, CSV, JSON
└── components/                   # DropZone, NetworkGraph, HostDrawer, FilterBar, StatsBar…
```

## Confidentialité

Aucune donnée ne quitte le navigateur : pas de backend, pas de télémétrie, pas de CDN
(polices et icônes embarquées localement). Le bouton « Réinitialiser » efface toute la session.
