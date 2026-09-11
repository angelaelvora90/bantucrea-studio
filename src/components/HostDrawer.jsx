import { useMemo, useState } from 'react';
import { RISK_COLORS, RISK_LABELS, buildNodeSvg } from '../lib/icons.js';
import { SEV_LABELS } from '../lib/risk.js';
import { IconX, IconCopy, IconCheck, IconChevronRight, IconBug, IconGlobe, IconInfo } from './Icons.jsx';

const SEV_STYLES = {
  critical: { fg: '#fca5a5', bg: 'rgba(239,68,68,.12)', border: '#ef4444' },
  high: { fg: '#fdba74', bg: 'rgba(249,115,22,.12)', border: '#f97316' },
  medium: { fg: '#fcd34d', bg: 'rgba(245,158,11,.12)', border: '#f59e0b' },
  low: { fg: '#fde047', bg: 'rgba(234,179,8,.10)', border: '#eab308' },
  info: { fg: '#93c5fd', bg: 'rgba(59,130,246,.10)', border: '#3b82f6' },
};

const STATE_STYLES = {
  open: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  filtered: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  closed: 'bg-slate-600/20 text-slate-400 border-slate-600/40',
  'open|filtered': 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  'closed|filtered': 'bg-slate-600/20 text-slate-400 border-slate-600/40',
};

const Row = ({ label, children, mono }) => (
  <div className="flex items-start justify-between gap-3 py-1.5">
    <span className="shrink-0 text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
    <span className={`break-all text-right text-[12.5px] text-slate-200 ${mono ? 'font-mono' : ''}`}>{children}</span>
  </div>
);

function ScriptBlock({ script, port }) {
  const [open, setOpen] = useState(false);
  if (!script.output && !script.tables?.length) return null;
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] text-slate-300 hover:text-sky-300"
      >
        <IconChevronRight className={`h-3 w-3 shrink-0 transition ${open ? 'rotate-90' : ''}`} />
        <span className="font-mono">{script.id}</span>
        {port != null && <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">:{port}</span>}
      </button>
      {open && (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words border-t border-slate-800 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-slate-400">
          {script.output || script.tables.map((t) => t.text).join('\n')}
        </pre>
      )}
    </div>
  );
}

export default function HostDrawer({ host, onClose }) {
  const [expandedPort, setExpandedPort] = useState(null);
  const [copied, setCopied] = useState(false);

  const allScripts = useMemo(() => {
    const list = (host.hostScripts || []).map((s) => ({ script: s, port: null }));
    for (const p of host.ports) for (const s of p.scripts || []) list.push({ script: s, port: p.port });
    return list;
  }, [host]);

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(host, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* noop */ }
  };

  const color = RISK_COLORS[host.risk.level];
  const os = host.os?.[0];
  const sortedPorts = useMemo(
    () =>
      [...host.ports].sort((a, b) => {
        const w = (s) => (s === 'open' ? 0 : /filtered/.test(s) ? 1 : 2);
        return w(a.state) - w(b.state) || a.port - b.port;
      }),
    [host],
  );

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-slate-800 bg-slate-950/95 shadow-2xl shadow-black/60 backdrop-blur animate-slide-in-right">
      {/* En-tête */}
      <div className="flex items-start gap-3 border-b border-slate-800 p-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center [&>svg]:h-14 [&>svg]:w-14"
          dangerouslySetInnerHTML={{ __html: buildNodeSvg(host.category.category, host.risk.level) }} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-bold text-slate-100">
            {host.hostnames[0]?.name || host.ip || host.id}
          </h2>
          <p className="font-mono text-xs text-sky-300">{host.ip || host.id}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold"
              style={{ background: `${color}22`, color }}
            >
              {host.risk.level === 'critical' || host.risk.level === 'high' ? '⚠ ' : ''}
              Risque {RISK_LABELS[host.risk.level]}
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-800/70 px-2 py-0.5 text-[10.5px] text-slate-300">
              {host.category.label}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200" title="Fermer (Échap)">
            <IconX className="h-4 w-4" />
          </button>
          <button onClick={copyJson} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200" title="Copier la fiche JSON">
            {copied ? <IconCheck className="h-4 w-4 text-emerald-400" /> : <IconCopy className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {/* Carte d'identité */}
        <section className="mb-4">
          <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <IconInfo className="h-3.5 w-3.5" /> Carte d'identité
          </h3>
          <div className="divide-y divide-slate-800/60 rounded-xl border border-slate-800 bg-slate-900/50 px-3">
            <Row label="Adresse IP" mono>{host.ip || '—'}</Row>
            {host.ipv6 && <Row label="IPv6" mono>{host.ipv6}</Row>}
            {host.hostnames.length > 0 && (
              <Row label="Nom(s) d'hôte">{host.hostnames.map((hh) => hh.name).join(', ')}</Row>
            )}
            <Row label="Adresse MAC" mono>{host.mac?.addr || '—'}</Row>
            <Row label="Constructeur">{host.mac?.vendor || '—'}</Row>
            <Row label="Sous-réseau" mono>{host.subnet}</Row>
            {host.distance != null && <Row label="Distance">{host.distance} saut{host.distance > 1 ? 's' : ''}</Row>}
            {host.uptime?.lastboot && <Row label="Dernier boot">{host.uptime.lastboot}</Row>}
            <Row label="Détecté dans">{host.files.join(', ')}</Row>
          </div>

          {os && (
            <div className="mt-2 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] text-slate-200">{os.name}</span>
                <span className="text-[11px] font-semibold text-sky-300">{os.accuracy}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-sky-500" style={{ width: `${os.accuracy}%` }} />
              </div>
              <p className="mt-1 text-[10.5px] text-slate-500">Indice de confiance de la détection d'OS</p>
              {host.os.length > 1 && (
                <p className="mt-1 text-[10.5px] text-slate-500">
                  Autres hypothèses : {host.os.slice(1).map((o) => `${o.name} (${o.accuracy}%)`).join(' · ')}
                </p>
              )}
            </div>
          )}
        </section>

        {/* Vulnérabilités */}
        <section className="mb-4">
          <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <IconBug className="h-3.5 w-3.5" /> Vulnérabilités & constats
            <span className="ml-auto rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300">
              {host.risk.findings.length}
            </span>
          </h3>
          {host.risk.findings.length === 0 ? (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-300">
              ✓ Aucune faille détectée par les scripts NSE ni par l'analyse des versions.
            </div>
          ) : (
            <div className="space-y-2">
              {host.risk.findings.map((f, i) => {
                const st = SEV_STYLES[f.severity];
                return (
                  <article key={i} className="rounded-xl border border-slate-800 p-3" style={{ background: st.bg, borderLeft: `3px solid ${st.border}` }}>
                    <div className="flex items-center gap-2">
                      <span className="rounded px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide"
                        style={{ background: st.border, color: '#0b1220' }}>
                        {SEV_LABELS[f.severity]}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-slate-100" title={f.title}>
                        {f.title}
                      </span>
                      {f.port != null && (
                        <span className="rounded bg-slate-950/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">:{f.port}</span>
                      )}
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-slate-400 clamp-2" title={f.detail}>
                      {f.detail}
                    </p>
                    {f.cves.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {f.cves.map((cve) => (
                          <a
                            key={cve}
                            href={`https://www.cve.org/CVERecord?id=${encodeURIComponent(cve)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded border border-slate-700 bg-slate-950/70 px-1.5 py-0.5 font-mono text-[10px] text-sky-300 transition hover:border-sky-500/60"
                          >
                            {cve} ↗
                          </a>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Matrice des ports */}
        <section className="mb-4">
          <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <IconGlobe className="h-3.5 w-3.5" /> Matrice des ports
            <span className="ml-auto text-[10px] font-semibold normal-case text-slate-500">
              {host.openPortCount} ouvert{host.openPortCount > 1 ? 's' : ''} / {host.ports.length} sondé{host.ports.length > 1 ? 's' : ''}
            </span>
          </h3>
          {host.extraports?.length > 0 && (
            <p className="mb-1.5 text-[10.5px] text-slate-500">
              {host.extraports.map((e) => `${e.count} port(s) ${e.state}`).join(' · ')} non listés
            </p>
          )}
          <div className="overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full text-left text-[11.5px]">
              <thead>
                <tr className="bg-slate-900 text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="px-2.5 py-1.5">Port</th>
                  <th className="px-2 py-1.5">État</th>
                  <th className="px-2 py-1.5">Service</th>
                  <th className="px-2 py-1.5">Version</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                {sortedPorts.length === 0 && (
                  <tr><td colSpan="4" className="px-3 py-3 text-center text-slate-500">Aucun port dans l'export</td></tr>
                )}
                {sortedPorts.map((p) => {
                  const key = `${p.protocol}/${p.port}`;
                  const openRow = expandedPort === key;
                  const hasScripts = p.scripts?.length > 0;
                  return [
                    <tr
                      key={key}
                      onClick={() => hasScripts && setExpandedPort(openRow ? null : key)}
                      className={`transition ${hasScripts ? 'cursor-pointer hover:bg-slate-800/40' : ''}`}
                    >
                      <td className="px-2.5 py-1.5 font-mono font-semibold text-slate-200">
                        {p.port}
                        <span className="text-slate-500">/{p.protocol}</span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${STATE_STYLES[p.state] || STATE_STYLES.closed}`}>
                          {p.state}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-slate-300">
                        <span className="block max-w-[7.5rem] truncate" title={p.service?.name}>
                          {p.service?.name || '—'}
                          {p.service?.tunnel ? <span className="text-slate-500"> ({p.service.tunnel})</span> : null}
                        </span>
                        {hasScripts && (
                          <span className="text-[9.5px] text-sky-400">{openRow ? '▾' : '▸'} {p.scripts.length} script{p.scripts.length > 1 ? 's' : ''}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="block max-w-[9rem] truncate text-slate-400" title={`${p.service?.product || ''} ${p.service?.version || ''}`.trim()}>
                          {`${p.service?.product || ''} ${p.service?.version || ''}`.trim() || '—'}
                        </span>
                      </td>
                    </tr>,
                    openRow && (
                      <tr key={`${key}-scripts`}>
                        <td colSpan="4" className="bg-slate-900/50 px-2 py-2">
                          <div className="space-y-1.5">
                            {p.scripts.map((s) => <ScriptBlock key={s.id} script={s} port={p.port} />)}
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Sorties de scripts NSE */}
        {allScripts.length > 0 && (
          <section className="mb-4">
            <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Scripts NSE ({allScripts.length})
            </h3>
            <div className="space-y-1.5">
              {allScripts.map(({ script, port }, i) => (
                <ScriptBlock key={`${script.id}-${port}-${i}`} script={script} port={port} />
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
