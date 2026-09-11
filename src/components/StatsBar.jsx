import { useMemo } from 'react';
import { RISK_COLORS } from '../lib/icons.js';

const Stat = ({ label, value, hint, children }) => (
  <div className="flex items-center gap-2.5 px-3 py-1.5">
    {children}
    <div className="leading-tight">
      <div className="text-sm font-bold tabular-nums text-slate-100">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500" title={hint}>{label}</div>
    </div>
  </div>
);

const Dot = ({ color }) => <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />;

export default function StatsBar({ hosts, displayed }) {
  const stats = useMemo(() => {
    const openPorts = hosts.reduce((n, h) => n + h.openPortCount, 0);
    const subnets = new Set(hosts.map((h) => h.subnet)).size;
    const byLevel = { critical: 0, high: 0, medium: 0, low: 0, none: 0 };
    let findings = 0;
    for (const h of hosts) {
      byLevel[h.risk.level] += 1;
      findings += h.risk.findings.length;
    }
    return { openPorts, subnets, byLevel, findings };
  }, [hosts]);

  return (
    <div className="flex shrink-0 flex-wrap items-stretch divide-x divide-slate-800/80 overflow-x-auto border-b border-slate-800 bg-slate-950/60">
      <Stat label="Hôtes actifs" value={hosts.length}>
        <Dot color="#38bdf8" />
      </Stat>
      <Stat label="Ports ouverts" value={stats.openPorts}>
        <Dot color="#7dd3fc" />
      </Stat>
      <Stat label="Sous-réseaux" value={stats.subnets}>
        <Dot color="#a78bfa" />
      </Stat>
      <Stat label="Vulnérabilités" value={stats.findings} hint="Constats issus des scripts NSE et de l'analyse des versions">
        <Dot color="#f59e0b" />
      </Stat>
      <div className="flex items-center gap-3 px-3 py-1.5">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">Hôtes par risque</div>
        {['critical', 'high', 'medium', 'low'].map((lvl) => (
          <span key={lvl} className="flex items-center gap-1 text-xs font-semibold tabular-nums" style={{ color: RISK_COLORS[lvl] }}>
            <Dot color={RISK_COLORS[lvl]} /> {stats.byLevel[lvl]}
          </span>
        ))}
        <span className="flex items-center gap-1 text-xs font-semibold tabular-nums text-slate-500">
          <Dot color={RISK_COLORS.none} /> {stats.byLevel.none}
        </span>
      </div>
      {displayed !== hosts.length && (
        <div className="ml-auto flex items-center gap-2 px-3 py-1.5">
          <span className="rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-300">
            {displayed} / {hosts.length} affichés
          </span>
        </div>
      )}
    </div>
  );
}
