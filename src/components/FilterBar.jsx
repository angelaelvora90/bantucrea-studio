import { useEffect, useMemo, useState } from 'react';
import { RISK_COLORS, RISK_LABELS } from '../lib/icons.js';
import { IconSearch, IconDownload, IconBug } from './Icons.jsx';

const RISK_ORDER = ['critical', 'high', 'medium', 'low', 'none'];

const Chip = ({ active, color, onClick, children }) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
      active
        ? 'border-transparent text-slate-950'
        : 'border-slate-700 bg-slate-900/60 text-slate-400 hover:text-slate-200'
    }`}
    style={active ? { background: color } : {}}
  >
    <span
      className="h-2 w-2 rounded-full"
      style={{ background: active ? 'rgba(2,6,23,.75)' : color }}
    />
    {children}
  </button>
);

export default function FilterBar({ filters, onChange, hosts, onExport, exporting }) {
  const [q, setQ] = useState(filters.q);
  const [ports, setPorts] = useState(filters.ports);

  // Débounce léger sur la saisie ; onChange reçoit un patch partiel (fusionné côté parent)
  useEffect(() => {
    const t = setTimeout(() => onChange({ q, ports }), 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, ports]);

  const topPorts = useMemo(() => {
    const count = new Map();
    for (const h of hosts)
      for (const p of h.ports)
        if (p.state === 'open') count.set(p.port, (count.get(p.port) || 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [hosts]);

  const counts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0, none: 0 };
    for (const h of hosts) c[h.risk.level] += 1;
    return c;
  }, [hosts]);

  const toggleRisk = (lvl) => {
    const risks = filters.risks.includes(lvl)
      ? filters.risks.filter((r) => r !== lvl)
      : [...filters.risks, lvl];
    onChange({ risks });
  };

  const exportItems = [
    ['png', '🖼️ Carte en PNG (HD ×3)'],
    ['svg', '✒️ Carte en SVG (vectoriel)'],
    ['csv-hosts', '📄 Équipements en CSV'],
    ['csv-vulns', '🛡️ Vulnérabilités en CSV'],
    ['json', '🧾 Rapport complet en JSON'],
  ];

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950/60 px-3 py-2">
      {/* Recherche */}
      <label className="relative">
        <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher IP, hôte, OS, service, CVE…"
          className="w-64 rounded-lg border border-slate-700 bg-slate-900/70 py-1.5 pl-8 pr-3 text-xs text-slate-200 placeholder-slate-500 outline-none transition focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/20"
        />
      </label>

      {/* Filtre ports */}
      <div className="flex items-center gap-1.5">
        <input
          value={ports}
          onChange={(e) => setPorts(e.target.value)}
          placeholder="Ports / services : 22, ssh, 3389…"
          className="w-52 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-1.5 font-mono text-xs text-slate-200 placeholder-slate-500 outline-none transition focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/20"
        />
        {topPorts.map(([port, n]) => (
          <button
            key={port}
            onClick={() => setPorts((prev) => (prev ? `${prev}, ${port}` : String(port)))}
            title={`${n} hôte(s) avec le port ${port} ouvert — cliquer pour filtrer`}
            className="rounded-md border border-slate-700 bg-slate-900/60 px-1.5 py-1 font-mono text-[10.5px] text-slate-400 transition hover:border-sky-500/50 hover:text-sky-300"
          >
            {port}
          </button>
        ))}
      </div>

      <span className="mx-1 hidden h-5 w-px bg-slate-800 sm:block" />

      {/* Risques */}
      <div className="flex flex-wrap items-center gap-1.5">
        {RISK_ORDER.map((lvl) => (
          <Chip
            key={lvl}
            active={filters.risks.includes(lvl)}
            color={RISK_COLORS[lvl]}
            onClick={() => toggleRisk(lvl)}
          >
            {RISK_LABELS[lvl]} ({counts[lvl]})
          </Chip>
        ))}
        <button
          onClick={() => onChange({ vulnOnly: !filters.vulnOnly })}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
            filters.vulnOnly
              ? 'border-rose-400 bg-rose-500/20 text-rose-300'
              : 'border-slate-700 bg-slate-900/60 text-slate-400 hover:text-slate-200'
          }`}
        >
          <IconBug className="h-3 w-3" /> Avec failles uniquement
        </button>
      </div>

      {/* Export */}
      <div className="ml-auto">
        <details className="relative">
          <summary
            className={`flex cursor-pointer list-none items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition [&::-webkit-details-marker]:hidden ${
              exporting
                ? 'border-slate-700 text-slate-500'
                : 'border-emerald-600/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
            }`}
          >
            <IconDownload className="h-3.5 w-3.5" /> {exporting ? 'Export…' : 'Exporter'}
          </summary>
          <div className="absolute right-0 z-40 mt-1.5 w-64 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-2xl shadow-black/50 animate-fade-in">
            {exportItems.map(([kind, label]) => (
              <button
                key={kind}
                onClick={(e) => {
                  e.currentTarget.closest('details').open = false;
                  onExport(kind);
                }}
                className="block w-full px-3.5 py-2 text-left text-xs text-slate-300 transition hover:bg-slate-800 hover:text-sky-300"
              >
                {label}
              </button>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
