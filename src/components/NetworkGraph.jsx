import { useEffect, useMemo, useRef, useState } from 'react';
import { Network, DataSet } from 'vis-network/standalone';
import 'vis-network/styles/vis-network.css';
import { buildVisData } from '../lib/graphBuilders.js';
import { paddedHull, smoothClosedPathCommands, bboxOf } from '../lib/geometry.js';
import { subnetColor, hexA } from '../lib/subnets.js';
import { RISK_COLORS, RISK_LABELS, buildNodeSvg } from '../lib/icons.js';
import { CATEGORIES } from '../lib/classify.js';
import { IconFocus, IconRefresh, IconLayers } from './Icons.jsx';

const BASE_OPTIONS = {
  autoResize: true,
  width: '100%',
  height: '100%',
  interaction: {
    hover: true,
    tooltipDelay: 120,
    dragNodes: true,
    dragView: true,
    zoomView: true,
    keyboard: false,
  },
  physics: {
    enabled: true,
    solver: 'forceAtlas2Based',
    forceAtlas2Based: {
      gravitationalConstant: -58,
      centralGravity: 0.004,
      springLength: 130,
      springConstant: 0.06,
      damping: 0.5,
      avoidOverlap: 0.85,
    },
    maxVelocity: 45,
    minVelocity: 0.9,
    timestep: 0.45,
    stabilization: { enabled: true, iterations: 350, updateInterval: 25, fit: false },
  },
  nodes: { borderWidth: 0, shapeProperties: { useBorderWithImage: false } },
  edges: { hoverWidth: 0, selectionWidth: 0 },
};

/** Dessine les enveloppes colorées + les étiquettes de sous-réseaux sous les nœuds. */
function drawHulls(ctx, network, hosts) {
  if (hosts.length === 0) return;
  const idSet = hosts.map((h) => h.id);
  let positions;
  try {
    positions = network.getPositions(idSet);
  } catch {
    return;
  }
  const bySubnet = new Map();
  for (const h of hosts) {
    const p = positions[h.id];
    if (!p) continue;
    if (!bySubnet.has(h.subnet)) bySubnet.set(h.subnet, []);
    bySubnet.get(h.subnet).push(p);
  }
  ctx.save();
  for (const [subnet, pts] of bySubnet) {
    const color = subnetColor(subnet);
    const hull = paddedHull(pts, 52);
    if (hull.length < 2) continue;
    const path = new Path2D(smoothClosedPathCommands(hull));
    ctx.fillStyle = hexA(color, 0.07);
    ctx.strokeStyle = hexA(color, 0.4);
    ctx.lineWidth = 1.6;
    ctx.setLineDash([7, 6]);
    ctx.fill(path);
    ctx.stroke(path);
    ctx.setLineDash([]);

    // Plaquette d'étiquette en haut à gauche de l'enveloppe
    const b = bboxOf(hull);
    const label = `${subnet} — ${pts.length} hôte${pts.length > 1 ? 's' : ''}`;
    ctx.font = '600 11.5px ui-sans-serif, system-ui, sans-serif';
    const w = ctx.measureText(label).width + 18;
    ctx.fillStyle = 'rgba(15,23,42,0.92)';
    ctx.strokeStyle = hexA(color, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(b.minX, b.minY - 30, w, 19, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(label, b.minX + 9, b.minY - 16.5);
  }
  ctx.restore();
}

function GraphButton({ title, onClick, children, active }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-lg border backdrop-blur transition ${
        active
          ? 'border-sky-500/60 bg-sky-500/20 text-sky-300'
          : 'border-slate-700 bg-slate-900/80 text-slate-400 hover:border-sky-500/50 hover:text-sky-300'
      }`}
    >
      {children}
    </button>
  );
}

export default function NetworkGraph({ hosts, selectedId, onSelect, registerApi }) {
  const containerRef = useRef(null);
  const networkRef = useRef(null);
  const dataRef = useRef(null);
  const hostsRef = useRef(hosts);
  const [showHulls, setShowHulls] = useState(true);
  const hullsRef = useRef(true);
  const [stabilizing, setStabilizing] = useState(true);
  hostsRef.current = hosts;

  // --- Création du réseau --------------------------------------------------
  useEffect(() => {
    const nodes = new DataSet();
    const edges = new DataSet();
    dataRef.current = { nodes, edges };
    const network = new Network(containerRef.current, { nodes, edges }, BASE_OPTIONS);
    networkRef.current = network;

    network.on('click', ({ nodes: sel }) => onSelect(sel[0] || null));
    network.on('hoverNode', () => (containerRef.current.style.cursor = 'pointer'));
    network.on('blurNode', () => (containerRef.current.style.cursor = 'default'));
    network.on('beforeDrawing', (ctx) => {
      if (hullsRef.current) drawHulls(ctx, network, hostsRef.current);
    });
    network.on('stabilizationIterationsDone', () => {
      network.setOptions({ physics: { stabilization: false } });
      setStabilizing(false);
      network.fit({ animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
    });

    registerApi?.({
      fit: () => network.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } }),
      focus: (id) =>
        network.focus(id, { scale: 1.15, animation: { duration: 450, easingFunction: 'easeInOutQuad' } }),
      stabilize: () => {
        setStabilizing(true);
        network.stabilize(320);
      },
      getPositions: () => {
        try {
          return network.getPositions();
        } catch {
          return {};
        }
      },
    });

    return () => network.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Mise à jour des données (diff pour préserver les positions) ----------
  useEffect(() => {
    const data = dataRef.current;
    const network = networkRef.current;
    if (!data || !network) return;
    const { nodes, edges } = buildVisData(hosts);
    const keep = new Set(nodes.map((n) => n.id));
    const before = data.nodes.getIds();
    data.nodes.remove(before.filter((id) => !keep.has(id)));
    data.nodes.update(nodes);
    data.edges.clear();
    data.edges.add(edges);
    // Réorganise quand le jeu de données change profondément (import, réinitialisation)
    if (before.length === 0 && nodes.length > 0) {
      network.setOptions({ physics: { stabilization: { enabled: true, iterations: 350 } } });
      setStabilizing(true);
      network.stabilize(350);
      setStabilizing(false);
      network.fit({ animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
      network.setOptions({ physics: { stabilization: false } });
    }
  }, [hosts]);

  // --- Sélection -----------------------------------------------------------
  useEffect(() => {
    networkRef.current?.selectNodes(selectedId ? [selectedId] : []);
  }, [selectedId]);

  useEffect(() => {
    hullsRef.current = showHulls;
    networkRef.current?.redraw();
  }, [showHulls]);

  // --- Légende ---------------------------------------------------------------
  const legend = useMemo(() => {
    const cats = [...new Set(hosts.map((h) => h.category.category))];
    const subnets = [...new Set(hosts.map((h) => h.subnet))].sort();
    const risks = [...new Set(hosts.map((h) => h.risk.level))].sort(
      (a, b) => ['critical', 'high', 'medium', 'low', 'none'].indexOf(a) - ['critical', 'high', 'medium', 'low', 'none'].indexOf(b),
    );
    return { cats, subnets, risks };
  }, [hosts]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="graph-bg h-full w-full outline-none" />

      {stabilizing && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-20 mx-auto w-fit rounded-full border border-slate-700 bg-slate-900/90 px-4 py-1.5 text-xs text-slate-300 shadow-lg animate-fade-in">
          <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-sky-400 border-t-transparent align-[-2px]" />
          Spatialisation des nœuds…
        </div>
      )}

      {/* Contrôles */}
      <div className="absolute right-3 top-3 z-20 flex flex-col gap-1.5">
        <GraphButton title="Recentrer la vue" onClick={() => networkRef.current?.fit({ animation: { duration: 400 } })}>
          <IconFocus className="h-4 w-4" />
        </GraphButton>
        <GraphButton
          title="Relancer la spatialisation"
          onClick={() => {
            setStabilizing(true);
            networkRef.current?.stabilize(320);
          }}
        >
          <IconRefresh className="h-4 w-4" />
        </GraphButton>
        <GraphButton
          title={showHulls ? 'Masquer les regroupements par sous-réseau' : 'Afficher les regroupements par sous-réseau'}
          active={showHulls}
          onClick={() => setShowHulls((v) => !v)}
        >
          <IconLayers className="h-4 w-4" />
        </GraphButton>
      </div>

      {/* Légende */}
      {hosts.length > 0 && (
        <div className="panel absolute bottom-3 left-3 z-20 max-w-[19rem] p-3 text-[11px] shadow-xl animate-fade-in">
          <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1.5">
            {legend.risks.map((lvl) => (
              <span key={lvl} className="flex items-center gap-1.5 text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full ring-2 ring-slate-900" style={{ background: RISK_COLORS[lvl] }} />
                {RISK_LABELS[lvl]}
              </span>
            ))}
          </div>
          <div className="mb-2 flex flex-wrap gap-x-3 gap-y-2 border-t border-slate-800 pt-2">
            {legend.cats.map((cat) => (
              <span key={cat} className="flex items-center gap-1.5 text-slate-400">
                <span
                  className="inline-block h-4 w-4"
                  dangerouslySetInnerHTML={{ __html: buildNodeSvg(cat, 'none') }}
                />
                {CATEGORIES[cat].label}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-2.5 gap-y-1.5 border-t border-slate-800 pt-2">
            {legend.subnets.map((sn) => (
              <span key={sn} className="flex items-center gap-1 font-mono text-[10px] text-slate-400">
                <span className="h-2.5 w-3 rounded-sm border border-dashed" style={{ borderColor: subnetColor(sn), background: hexA(subnetColor(sn), 0.15) }} />
                {sn}
              </span>
            ))}
          </div>
        </div>
      )}

      {hosts.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
          <p className="rounded-xl border border-slate-800 bg-slate-900/90 px-5 py-3 text-sm text-slate-400">
            Aucun hôte ne correspond aux filtres actifs.
          </p>
        </div>
      )}
    </div>
  );
}
