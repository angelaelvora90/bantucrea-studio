import { useRef, useState } from 'react';
import { IconUpload, IconShield, IconRadar, IconLayers, IconBug, IconDownload, IconCopy, IconCheck } from './Icons.jsx';

const NMAP_CMD = 'nmap -sV -sC -O -oX audit.xml <cible>';

export default function DropZone({ onFiles, onDemo, error }) {
  const [drag, setDrag] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const files = [...e.dataTransfer.files];
    if (files.length) onFiles(files); // la validation (XML uniquement) est faite par le parent
  };

  const copyCmd = async () => {
    try {
      await navigator.clipboard.writeText(NMAP_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard indisponible */
    }
  };

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
      <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[1.05fr_1fr]">
        {/* Colonne présentation */}
        <div className="animate-slide-in-up">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300">
            <IconRadar className="h-3.5 w-3.5" /> Audit réseau visuel
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-100">
            Vos exports Nmap, enfin <span className="text-sky-400">lisibles</span>.
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-400">
            Déposez un fichier <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[12px] text-sky-300">.xml</code> généré
            par Nmap : la carte topologique apparaît instantanément, avec le diagnostic de sécurité de chaque
            équipement — ports, services, versions et vulnérabilités détectées par les scripts NSE.
          </p>

          <ul className="mt-5 space-y-2.5 text-sm text-slate-300">
            <li className="flex items-start gap-2.5">
              <IconLayers className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
              Graphe interactif par sous-réseau, icônes automatiques (serveurs, routeurs, imprimantes, caméras…)
            </li>
            <li className="flex items-start gap-2.5">
              <IconBug className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
              Alertes sur les failles : CVE signalées, services obsolètes, identifiants par défaut
            </li>
            <li className="flex items-start gap-2.5">
              <IconDownload className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              Export PNG/SVG de la carte et CSV/JSON pour vos rapports d'audit
            </li>
          </ul>

          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/70 p-3.5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              1. Lancez votre scan, avec détection des versions et OS :
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-slate-950 px-3 py-2 font-mono text-[12.5px] text-emerald-300">
                {NMAP_CMD}
              </code>
              <button
                onClick={copyCmd}
                title="Copier la commande"
                className="rounded-lg border border-slate-700 p-2 text-slate-400 transition hover:border-sky-500/50 hover:text-sky-300"
              >
                {copied ? <IconCheck className="h-4 w-4 text-emerald-400" /> : <IconCopy className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">2. Déposez le fichier <span className="font-mono text-slate-400">audit.xml</span> ci-contre — la fusion de plusieurs fichiers est prise en charge.</p>
          </div>
        </div>

        {/* Colonne dépôt */}
        <div className="flex flex-col gap-4 animate-slide-in-up" style={{ animationDelay: '.08s' }}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={handleDrop}
            className={`group flex min-h-[280px] flex-1 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition ${
              drag
                ? 'border-sky-400 bg-sky-500/10 shadow-[0_0_40px_-10px_rgba(56,189,248,.5)]'
                : 'border-slate-700 bg-slate-900/50 hover:border-sky-500/60 hover:bg-slate-900'
            }`}
          >
            <span
              className={`mb-4 grid h-16 w-16 place-items-center rounded-2xl border transition ${
                drag ? 'border-sky-400 bg-sky-500/20 text-sky-300' : 'border-slate-700 bg-slate-800 text-slate-400 group-hover:text-sky-300'
              }`}
            >
              <IconUpload className="h-7 w-7" />
            </span>
            <p className="text-base font-semibold text-slate-200">
              {drag ? 'Déposez pour analyser' : 'Glissez-déposez vos fichiers XML Nmap'}
            </p>
            <p className="mt-1 text-xs text-slate-500">ou cliquez pour parcourir — plusieurs fichiers acceptés (fusion automatique)</p>
            <input
              ref={inputRef}
              type="file"
              accept=".xml,text/xml,application/xml"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = [...e.target.files];
                if (files.length) onFiles(files);
                e.target.value = '';
              }}
            />
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
          )}

          <button
            onClick={onDemo}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-medium text-slate-300 transition hover:border-sky-500/50 hover:text-sky-300"
          >
            ⚡ Explorer un scan de démonstration
            <span className="mt-0.5 block text-[11px] font-normal text-slate-500">14 équipements · 2 sous-réseaux · vulnérabilités réelles simulées</span>
          </button>

          <p className="flex items-center justify-center gap-2 text-center text-[11px] text-slate-500">
            <IconShield className="h-3.5 w-3.5 text-emerald-400" />
            Privacy-first : le parsing s'exécute entièrement dans votre navigateur (Web Worker). Aucun envoi réseau.
          </p>
        </div>
      </div>
    </div>
  );
}
