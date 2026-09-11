import { useRef } from 'react';
import { IconRadar, IconUpload, IconTrash, IconShield, IconLock } from './Icons.jsx';

export default function Header({ hasData, onFiles, onReset, metas }) {
  const inputRef = useRef(null);
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-950/95 px-4">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-400">
          <IconRadar className="h-5 w-5" />
        </span>
        <div className="leading-tight">
          <h1 className="text-[15px] font-bold tracking-tight text-slate-100">
            NetMap <span className="text-sky-400">Visualizer</span>
          </h1>
          <p className="text-[10.5px] text-slate-500">Cartographie réseau à partir d'exports Nmap</p>
        </div>
      </div>

      <span className="ml-2 hidden items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 md:inline-flex">
        <IconLock className="h-3 w-3" /> 100 % local — aucune donnée transmise
      </span>

      {hasData && metas?.length > 0 && (
        <span className="hidden max-w-[34rem] truncate rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 font-mono text-[11px] text-slate-500 lg:block"
          title={metas.map((m) => m.args || m.name).join('\n')}>
          {metas.map((m) => m.name).join(' + ')}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".xml,text/xml,application/xml"
          multiple
          className="hidden"
          onChange={(e) => {
            onFiles([...e.target.files]);
            e.target.value = '';
          }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-sky-500/50 hover:text-sky-300"
        >
          <IconUpload className="h-3.5 w-3.5" /> Importer XML
        </button>
        {hasData && (
          <button
            onClick={onReset}
            title="Effacer la session (les données ne sont jamais envoyées ni conservées)"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-rose-500/50 hover:text-rose-300"
          >
            <IconTrash className="h-3.5 w-3.5" /> Réinitialiser
          </button>
        )}
      </div>
      <span className="sr-only">
        <IconShield /> Vos scans Nmap sont analysés uniquement dans votre navigateur.
      </span>
    </header>
  );
}
