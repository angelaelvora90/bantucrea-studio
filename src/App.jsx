import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from './components/Header.jsx';
import DropZone from './components/DropZone.jsx';
import StatsBar from './components/StatsBar.jsx';
import FilterBar from './components/FilterBar.jsx';
import NetworkGraph from './components/NetworkGraph.jsx';
import HostDrawer from './components/HostDrawer.jsx';
import { DEFAULT_FILTERS, hostMatches } from './lib/filters.js';
import {
  download,
  downloadDataUrl,
  fileName,
  buildSvgMap,
  svgToPngDataUrl,
  hostsToCsv,
  findingsToCsv,
  hostsToJson,
} from './lib/exporters.js';

const createWorker = () =>
  new Worker(new URL('./worker/nmapParser.worker.js', import.meta.url), { type: 'module' });

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const colors =
    toast.kind === 'error'
      ? 'border-rose-500/50 bg-rose-950/90 text-rose-200'
      : toast.kind === 'warn'
        ? 'border-amber-500/50 bg-amber-950/90 text-amber-200'
        : 'border-emerald-500/50 bg-emerald-950/90 text-emerald-200';
  return (
    <button
      onClick={onClose}
      className={`fixed bottom-5 left-1/2 z-50 max-w-2xl -translate-x-1/2 rounded-xl border px-4 py-2.5 text-left text-xs shadow-2xl shadow-black/50 animate-slide-in-up ${colors}`}
    >
      {toast.message}
    </button>
  );
}

export default function App() {
  const [data, setData] = useState(null); // { hosts, metas, warnings }
  const [status, setStatus] = useState('idle'); // idle | parsing | ready
  const [progress, setProgress] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState(null);
  const [toast, setToast] = useState(null);
  const [exporting, setExporting] = useState(false);
  const workerRef = useRef(null);
  const graphApiRef = useRef(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((message, kind = 'ok') => {
    setToast({ message, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6500);
  }, []);

  // --- Analyse des fichiers via Web Worker -----------------------------------
  const parseFiles = useCallback(
    async (fileList) => {
      if (!fileList?.length) return;
      setStatus('parsing');
      setParseError(null);
      setProgress({ done: 0, total: fileList.length, name: fileList[0].name });
      try {
        const files = await Promise.all(
          fileList.map(async (f) => ({ name: f.name, content: await f.text() })),
        );
        workerRef.current?.terminate();
        const worker = createWorker();
        workerRef.current = worker;
        worker.onmessage = (e) => {
          const msg = e.data;
          if (msg.type === 'progress') setProgress(msg);
          else if (msg.type === 'done') {
            const { hosts, metas, warnings } = msg.result;
            if (!hosts.length) {
              setStatus(data ? 'ready' : 'idle');
              setProgress(null);
              if (!data) setParseError(warnings[0] || 'Aucun hôte exploitable dans ce fichier.');
              showToast(warnings.join(' ') || 'Aucun hôte exploitable dans ces fichiers.', 'error');
              return;
            }
            let mergedHosts = hosts;
            let mergedMetas = metas;
            if (data) {
              // Fusion avec la session existante (multi-fichiers successifs)
              const byId = new Map(data.hosts.map((h) => [h.id, h]));
              let added = 0;
              for (const h of hosts) if (!byId.has(h.id)) added += 1;
              // Le worker a déjà fusionné en interne ; on refusionne côté session.
              mergedHosts = [...byId.values()];
              for (const h of hosts) byId.set(h.id, h);
              mergedHosts = [...byId.values()];
              mergedMetas = [...data.metas, ...metas];
              showToast(
                `${hosts.length} hôte(s) importé(s) — ${added} nouveau(x), fusion ${hosts.length - added > 0 ? `de ${hosts.length - added} doublon(s)` : 'sans doublon'}.`,
              );
            } else if (warnings.length) {
              showToast(warnings.join(' '), 'warn');
            }
            setData({ hosts: mergedHosts, metas: mergedMetas, warnings });
            setStatus('ready');
            setProgress(null);
            setSelectedId(null);
          } else if (msg.type === 'error') {
            setStatus(data ? 'ready' : 'idle');
            setProgress(null);
            setParseError(msg.message);
            showToast(msg.message, 'error');
          }
        };
        worker.onerror = (err) => {
          setStatus(data ? 'ready' : 'idle');
          setProgress(null);
          showToast(`Erreur du worker d'analyse : ${err.message}`, 'error');
        };
        worker.postMessage({ files });
      } catch (err) {
        setStatus(data ? 'ready' : 'idle');
        setProgress(null);
        showToast(err.message, 'error');
      }
    },
    [data, showToast],
  );

  const loadDemo = useCallback(async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}demo-scan.xml`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const content = await res.text();
      parseFiles([{ name: 'demo-scan.xml', text: async () => content }]);
    } catch {
      showToast('Impossible de charger le scan de démonstration.', 'error');
    }
  }, [parseFiles, showToast]);

  const reset = useCallback(() => {
    workerRef.current?.terminate();
    setData(null);
    setStatus('idle');
    setProgress(null);
    setParseError(null);
    setFilters(DEFAULT_FILTERS);
    setSelectedId(null);
    showToast('Session effacée — les données restaient uniquement dans ce navigateur.');
  }, [showToast]);

  // --- Filtres -----------------------------------------------------------------
  const hosts = data?.hosts || [];
  const filteredHosts = useMemo(
    () => hosts.filter((h) => hostMatches(h, filters)),
    [hosts, filters],
  );
  const selectedHost = useMemo(
    () => hosts.find((h) => h.id === selectedId) || null,
    [hosts, selectedId],
  );

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setSelectedId(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [workerRef]);

  // --- Exports ------------------------------------------------------------------
  const handleExport = useCallback(
    async (kind) => {
      if (!filteredHosts.length) {
        showToast('Aucun hôte à exporter avec les filtres actifs.', 'warn');
        return;
      }
      setExporting(true);
      try {
        if (kind === 'png' || kind === 'svg') {
          const positions = graphApiRef.current?.getPositions() || {};
          const { svg, width, height } = buildSvgMap(filteredHosts, positions);
          if (kind === 'svg') {
            download(fileName('svg'), svg, 'image/svg+xml');
            showToast('Carte SVG exportée (vectoriel, prêt pour vos rapports).');
          } else {
            const png = await svgToPngDataUrl(svg, width, height, 3);
            downloadDataUrl(fileName('png'), png);
            showToast('Carte PNG exportée en haute définition (×3).');
          }
        } else if (kind === 'csv-hosts') {
          download(fileName('equipements.csv'), hostsToCsv(filteredHosts), 'text/csv');
          showToast(`Liste de ${filteredHosts.length} équipement(s) exportée en CSV.`);
        } else if (kind === 'csv-vulns') {
          download(fileName('vulnerabilites.csv'), findingsToCsv(filteredHosts), 'text/csv');
          showToast('Liste des vulnérabilités exportée en CSV.');
        } else if (kind === 'json') {
          download(fileName('json'), hostsToJson(filteredHosts, data?.metas || [], filters), 'application/json');
          showToast('Rapport JSON complet exporté.');
        }
      } catch (err) {
        showToast(`Échec de l'export : ${err.message}`, 'error');
      } finally {
        setExporting(false);
      }
    },
    [filteredHosts, data, filters, showToast],
  );

  const onFilesDropped = useCallback(
    (fileList) => {
      const xml = fileList.filter((f) => /\.xml$/i.test(f.name) || /xml/i.test(f.type));
      if (!xml.length) {
        showToast('Seuls les fichiers XML Nmap (-oX) sont acceptés.', 'error');
        return;
      }
      parseFiles(xml);
    },
    [parseFiles, showToast],
  );

  // --- Rendu ---------------------------------------------------------------------
  const ready = status === 'ready' && data;

  return (
    <div className="flex h-full flex-col">
      <Header hasData={ready} onFiles={onFilesDropped} onReset={reset} metas={data?.metas} />

      {!ready && status !== 'parsing' && (
        <DropZone onFiles={onFilesDropped} onDemo={loadDemo} error={parseError} />
      )}

      {status === 'parsing' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-sky-500/30 border-t-sky-400" />
          <div className="text-sm text-slate-300">Analyse des exports Nmap…</div>
          {progress && (
            <div className="w-72">
              <div className="mb-1 flex justify-between text-[11px] text-slate-500">
                <span className="max-w-[13rem] truncate font-mono">{progress.name}</span>
                <span>{progress.done} / {progress.total}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
              <p className="mt-2 text-center text-[10.5px] text-slate-600">
                Traitement dans un Web Worker — l'interface reste fluide, aucun envoi réseau.
              </p>
            </div>
          )}
        </div>
      )}

      {ready && (
        <>
          <StatsBar hosts={hosts} displayed={filteredHosts.length} />
          <FilterBar
            filters={filters}
            onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
            hosts={hosts}
            onExport={handleExport}
            exporting={exporting}
          />
          <main className="relative min-h-0 flex-1">
            <NetworkGraph
              hosts={filteredHosts}
              selectedId={selectedId}
              onSelect={setSelectedId}
              registerApi={(api) => (graphApiRef.current = api)}
            />
            {selectedHost && (
              <HostDrawer host={selectedHost} onClose={() => setSelectedId(null)} />
            )}
          </main>
        </>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
