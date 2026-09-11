// ─────────────────────────────────────────────────────────────────────────────
// app.js — Point d'entrée : montage du canvas, barre d'outils, menus, autosave.
// ─────────────────────────────────────────────────────────────────────────────
import {
  state, onChange, emit, select, undo, redo, saveLocal, loadLocal, loadProject,
  emptyProject, addZone, makeZone, duplicateSelected, removeSelected, pushHistory,
} from './state.js';
import { mount, render, fitToContent, setZoom, svgElement } from './render.js';
import { attachInteractions } from './interactions.js';
import { renderPalette, renderInspector, setTab, refresh, updateStatus } from './panels.js';
import { PRESETS, presetPme } from './presets.js';
import { arrangeByZones, arrangeTree, tidyZones } from './layout.js';
import { exportPNG, exportSVG, exportJSON, exportMarkdown } from './export.js';

const $ = (id) => document.getElementById(id);

// ── Démarrage ────────────────────────────────────────────────────────────────
const canvasWrap = $('canvas-wrap');
mount($('canvas-svg'));
attachInteractions(canvasWrap);

const restored = loadLocal();
if (!restored) loadProject(presetPme());

render();
requestAnimationFrame(() => {
  fitToContent();
  render();
});
renderPalette();
refresh('project');

// ── Boucle de rafraîchissement ───────────────────────────────────────────────
onChange((_state, reason) => {
  if (reason === 'undo' || reason === 'redo' || reason === 'save' || reason === 'delete'
    || reason === 'duplicate' || reason === 'export-report' || reason === 'edit-name') return;
  render();
  refresh(reason);
  $('zoom-val').textContent = `${Math.round(state.ui.zoom * 100)} %`;
  const nameInput = $('project-name');
  if (document.activeElement !== nameInput) nameInput.value = state.project.name || '';
});

// ── Barre d'outils ───────────────────────────────────────────────────────────
$('project-name').addEventListener('input', (ev) => {
  state.project.name = ev.target.value;
  updateStatus();
  state.ui.dirty = true;
});

$('btn-undo').addEventListener('click', () => { if (undo()) toast('Annulé'); });
$('btn-redo').addEventListener('click', () => { if (redo()) toast('Rétabli'); });

$('btn-zoom-in').addEventListener('click', () => { setZoom(state.ui.zoom * 1.2); render(); });
$('btn-zoom-out').addEventListener('click', () => { setZoom(state.ui.zoom / 1.2); render(); });
$('btn-fit').addEventListener('click', () => { fitToContent(); render(); });

$('btn-flows').addEventListener('click', (ev) => {
  state.ui.flows = !state.ui.flows;
  ev.currentTarget.classList.toggle('on', state.ui.flows);
  render();
});
$('btn-snap').addEventListener('click', (ev) => {
  state.ui.snap = !state.ui.snap;
  ev.currentTarget.classList.toggle('on', state.ui.snap);
  toast(state.ui.snap ? 'Aimantage activé' : 'Aimantage désactivé');
});

$('btn-save').addEventListener('click', () => { saveLocal(); toast('Schéma enregistré dans ce navigateur'); });

$('btn-new-zone').addEventListener('click', () => {
  addZone(makeZone(80, 80, 460, 320, { name: `Zone ${state.project.zones.length + 1}` }));
  toast('Zone créée — redimensionnez-la puis placez vos équipements dedans');
});
$('btn-tidy-zones').addEventListener('click', tidyZones);

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => setTab(tab.dataset.tab));
});

// ── Menus déroulants ─────────────────────────────────────────────────────────
function openMenu(menuEl, anchor) {
  document.querySelectorAll('.dropdown.open').forEach((m) => { if (m !== menuEl) m.classList.remove('open'); });
  const open = menuEl.classList.toggle('open');
  if (!open) return;
  const r = anchor.getBoundingClientRect();
  menuEl.style.top = `${r.bottom + 6}px`;
  menuEl.style.left = `${Math.max(10, Math.min(r.left, window.innerWidth - 260))}px`;
}

document.addEventListener('click', (ev) => {
  if (!ev.target.closest('.dropdown') && !ev.target.closest('.toolbar .btn')) {
    document.querySelectorAll('.dropdown.open').forEach((m) => m.classList.remove('open'));
  }
});

$('menu-preset').innerHTML = PRESETS.map((p) => `
  <button data-preset="${p.id}"><span><b>${p.label}</b><small>${p.description}</small></span></button>`)
  .join('')
  + '<div class="dd-sep"></div>'
  + '<button data-preset="blank"><span><b>Schéma vierge</b><small>Canvas vide, à vous de jouer.</small></span></button>'
  + '<button data-preset="blank-zones"><span><b>Vierge + 3 zones</b><small>Internet / DMZ / LAN pré-dessinés.</small></span></button>';

$('menu-layout').innerHTML = `
  <button data-layout="zones"><span><b>Disposition par zones</b><small>Range les équipements dans leur zone et aligne les zones.</small></span></button>
  <button data-layout="tree"><span><b>Disposition hiérarchique</b><small>Couches successives depuis la bordure Internet.</small></span></button>
  <button data-layout="tidy"><span><b>Ajuster les zones</b><small>Recadre chaque zone autour de ses équipements.</small></span></button>`;

$('menu-export').innerHTML = `
  <button data-export="png"><span><b>Image PNG</b><small>Pour une présentation ou un document.</small></span></button>
  <button data-export="svg"><span><b>Vectoriel SVG</b><small>Redimensionnable sans perte.</small></span></button>
  <button data-export="json"><span><b>Projet JSON</b><small>Réimportable pour poursuivre le travail.</small></span></button>
  <div class="dd-sep"></div>
  <button data-export="md"><span><b>Rapport Markdown</b><small>Inventaire, adressage, filtrage et audit.</small></span></button>`;

$('btn-preset').addEventListener('click', (ev) => { ev.stopPropagation(); openMenu($('menu-preset'), ev.currentTarget); });
$('btn-layout').addEventListener('click', (ev) => { ev.stopPropagation(); openMenu($('menu-layout'), ev.currentTarget); });
$('btn-export').addEventListener('click', (ev) => { ev.stopPropagation(); openMenu($('menu-export'), ev.currentTarget); });

$('menu-preset').addEventListener('click', (ev) => {
  const id = ev.target.closest('[data-preset]')?.dataset.preset;
  if (!id) return;
  const apply = () => {
    if (id === 'blank') loadProject(emptyProject());
    else if (id === 'blank-zones') {
      const p = emptyProject();
      p.name = 'Nouvelle architecture';
      p.zones = [
        makeZone(60, 60, 420, 260, { name: 'Internet / Bordure', color: '#38bdf8' }),
        makeZone(60, 360, 420, 260, { name: 'DMZ', color: '#ef4444', cidr: '10.0.3.0/24', vlan: '30' }),
        makeZone(520, 60, 520, 560, { name: 'LAN', color: '#22c55e', cidr: '10.0.1.0/24', vlan: '10' }),
      ];
      loadProject(p);
    } else {
      const preset = PRESETS.find((x) => x.id === id);
      loadProject(preset.build());
    }
    requestAnimationFrame(() => { fitToContent(); render(); refresh('project'); });
    saveLocal();
    toast('Modèle chargé');
  };
  if (state.ui.dirty && !confirm('Charger ce modèle remplacera le schéma courant. Continuer ?')) return;
  apply();
  $('menu-preset').classList.remove('open');
});

$('menu-layout').addEventListener('click', (ev) => {
  const mode = ev.target.closest('[data-layout]')?.dataset.layout;
  if (!mode) return;
  if (mode === 'zones') arrangeByZones();
  if (mode === 'tree') arrangeTree();
  if (mode === 'tidy') tidyZones();
  $('menu-layout').classList.remove('open');
});

$('menu-export').addEventListener('click', async (ev) => {
  const kind = ev.target.closest('[data-export]')?.dataset.export;
  if (!kind) return;
  $('menu-export').classList.remove('open');
  try {
    if (kind === 'png') { await exportPNG(2); }
    if (kind === 'svg') exportSVG();
    if (kind === 'json') exportJSON();
    if (kind === 'md') exportMarkdown();
    toast('Export terminé');
  } catch (err) {
    toast(`Export impossible : ${err.message}`);
  }
});

// ── Import ───────────────────────────────────────────────────────────────────
$('btn-import').addEventListener('click', () => $('file-import').click());
$('file-import').addEventListener('change', async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const project = data.project || data;
    if (!project.nodes || !Array.isArray(project.nodes)) throw new Error('format inattendu');
    loadProject(project);
    requestAnimationFrame(() => { fitToContent(); render(); refresh('project'); });
    saveLocal();
    toast(`« ${project.name || file.name} » importé`);
  } catch (err) {
    toast(`Import impossible : ${err.message}`);
  } finally {
    ev.target.value = '';
  }
});

// ── Recherche palette ────────────────────────────────────────────────────────
$('palette-search').addEventListener('input', (ev) => {
  state.ui.paletteQuery = ev.target.value;
  renderPalette();
});

// ── Événements émis par les modules ──────────────────────────────────────────
onChange((_state, reason) => {
  if (reason === 'undo') { render(); refresh('history'); $('zoom-val').textContent = `${Math.round(state.ui.zoom * 100)} %`; toast('Annulé'); }
  if (reason === 'redo') { render(); refresh('history'); toast('Rétabli'); }
  if (reason === 'delete') { removeSelected(); }
  if (reason === 'duplicate') { duplicateSelected(); }
  if (reason === 'save') { saveLocal(); toast('Schéma enregistré'); }
  if (reason === 'export-report') exportMarkdown();
  if (reason === 'edit-name') {
    const input = document.querySelector('#panel-body [data-f="name"]');
    input?.focus();
    input?.select();
  }
  if (reason === 'placing') renderPalette();
});

// ── Autosauvegarde ───────────────────────────────────────────────────────────
// `unref` n'existe que sous Node : il évite que la minuterie maintienne le
// processus de test en vie. Dans un navigateur, l'appel est ignoré.
const autosaveTimer = setInterval(() => { if (state.ui.dirty) saveLocal(); }, 15000);
autosaveTimer?.unref?.();
window.addEventListener('beforeunload', () => { if (state.ui.dirty) saveLocal(); });
window.addEventListener('resize', () => render());

// ── Notifications ────────────────────────────────────────────────────────────
let toastTimer;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// Raccourcis : sélection initiale utile
select(null, null);
console.info('BantuCrea Studio — NetArch prêt. Projet :', state.project.name);
export { pushHistory };
