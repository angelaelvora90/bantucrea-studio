// ─────────────────────────────────────────────────────────────────────────────
// interactions.js — Toutes les interactions du canvas : déplacement, création de
// liaisons, redimensionnement des zones, pan/zoom, sélection, raccourcis clavier.
// ─────────────────────────────────────────────────────────────────────────────
import {
  state, snapshot, pushRaw, pushHistory, select, clearSelection, selected,
  addNode, addLink, makeNode, makeLink, uid, emit, markDirty,
} from './state.js';
import {
  render, screenToWorld, setZoom, setTempLink, setMarquee, clearOverlays,
  centerOf, nodeById, svgElement, fitToContent,
} from './render.js';

const GRID = 14;
const MIN_ZONE = 120;

let drag = null; // état du glisser courant
let ghost = null;

function snap(v) {
  return state.ui.snap ? Math.round(v / GRID) * GRID : Math.round(v);
}

export function attachInteractions(canvasWrap) {
  const svg = svgElement();

  svg.addEventListener('pointerdown', (ev) => {
    if (ev.button === 1 || ev.button === 2) return;
    const point = screenToWorld(ev.clientX, ev.clientY);

    // 1) Placement d'un équipement depuis la palette
    if (state.ui.placing) {
      const node = makeNode(state.ui.placing, snap(point.x - 64), snap(point.y - 46));
      addNode(node);
      state.ui.placing = null;
      canvasWrap.classList.remove('placing');
      markDirty();
      render();
      emit('placed');
      return;
    }

    const target = ev.target.closest('[data-kind]');
    const isPort = ev.target.dataset?.port === '1';
    const isZoneHandle = ev.target.dataset?.resize === 'zone';

    if (target && isPort && target.dataset.kind === 'node') {
      const from = nodeById(target.dataset.id);
      drag = { mode: 'link', fromId: from.id, pre: snapshot() };
      svg.classList.add('linking');
      svg.setPointerCapture(ev.pointerId);
      ev.preventDefault();
      return;
    }

    if (target && isZoneHandle) {
      const zone = state.project.zones.find((z) => z.id === target.dataset.id);
      drag = { mode: 'zone-resize', id: zone.id, pre: snapshot() };
      svg.setPointerCapture(ev.pointerId);
      ev.preventDefault();
      return;
    }

    if (target?.dataset.kind === 'node') {
      const node = nodeById(target.dataset.id);
      select('node', node.id);
      drag = { mode: 'move', id: node.id, dx: point.x - node.x, dy: point.y - node.y, pre: snapshot(), moved: false };
      target.classList.add('dragging');
      svg.setPointerCapture(ev.pointerId);
      ev.preventDefault();
      return;
    }

    if (target?.dataset.kind === 'zone') {
      const zone = state.project.zones.find((z) => z.id === target.dataset.id);
      select('zone', zone.id);
      drag = { mode: 'zone-move', id: zone.id, dx: point.x - zone.x, dy: point.y - zone.y, pre: snapshot(), moved: false };
      svg.setPointerCapture(ev.pointerId);
      ev.preventDefault();
      return;
    }

    if (target?.dataset.kind === 'link') {
      select('link', target.dataset.id);
      drag = { mode: 'none' };
      return;
    }

    // Fond du canvas : panoramique ou sélection multiple (Maj)
    clearSelection();
    if (ev.shiftKey) {
      drag = { mode: 'marquee', start: point, pre: snapshot() };
    } else {
      drag = { mode: 'pan', startX: ev.clientX, startY: ev.clientY, tx: state.ui.tx, ty: state.ui.ty };
    }
    svg.setPointerCapture(ev.pointerId);
  });

  svg.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const point = screenToWorld(ev.clientX, ev.clientY);

    if (drag.mode === 'move') {
      const node = nodeById(drag.id);
      if (!node) return;
      if (!drag.moved) {
        drag.moved = true;
        pushRaw(drag.pre, 'Déplacement');
        markDirty();
      }
      node.x = snap(point.x - drag.dx);
      node.y = snap(point.y - drag.dy);
      render();
    } else if (drag.mode === 'zone-move') {
      const zone = state.project.zones.find((z) => z.id === drag.id);
      if (!zone) return;
      if (!drag.moved) { drag.moved = true; pushRaw(drag.pre, 'Déplacement zone'); markDirty(); }
      zone.x = snap(point.x - drag.dx);
      zone.y = snap(point.y - drag.dy);
      render();
    } else if (drag.mode === 'zone-resize') {
      const zone = state.project.zones.find((z) => z.id === drag.id);
      if (!zone) return;
      if (!drag.moved) { drag.moved = true; pushRaw(drag.pre, 'Redimensionnement zone'); markDirty(); }
      zone.w = Math.max(MIN_ZONE, snap(point.x - zone.x));
      zone.h = Math.max(MIN_ZONE, snap(point.y - zone.y));
      render();
    } else if (drag.mode === 'link') {
      const from = nodeById(drag.fromId);
      const hovered = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-kind="node"]');
      setTempLink(centerOf(from), point);
      document.querySelectorAll('.node.drop-target').forEach((n) => n.classList.remove('drop-target'));
      if (hovered && hovered.dataset.id !== drag.fromId) hovered.classList.add('drop-target');
      drag.toId = hovered?.dataset.id || null;
    } else if (drag.mode === 'pan') {
      state.ui.tx = drag.tx + (ev.clientX - drag.startX);
      state.ui.ty = drag.ty + (ev.clientY - drag.startY);
      render();
    } else if (drag.mode === 'marquee') {
      setMarquee(drag.start, point);
    }
  });

  const finish = (ev) => {
    if (!drag) return;
    const mode = drag.mode;
    const pre = drag.pre;
    const moved = drag.moved;

    if (mode === 'link') {
      svg.classList.remove('linking');
      document.querySelectorAll('.node.drop-target').forEach((n) => n.classList.remove('drop-target'));
      const toId = drag.toId;
      if (toId && toId !== drag.fromId) {
        const hovered = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-kind="node"]');
        const finalId = hovered?.dataset.id || toId;
        addLink(makeLink(drag.fromId, finalId));
        markDirty();
        render();
      }
    }
    if (mode === 'move') {
      document.querySelectorAll('.node.dragging').forEach((n) => n.classList.remove('dragging'));
    }
    clearOverlays();
    if ((mode === 'zone-move' || mode === 'zone-resize') && !moved && pre) {
      // simple clic : rien à annuler
    }
    drag = null;
    emit('interacted');
  };

  svg.addEventListener('pointerup', finish);
  svg.addEventListener('pointercancel', finish);
  svg.addEventListener('pointerleave', () => { if (drag?.mode === 'link') { clearOverlays(); } });

  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const rect = svg.getBoundingClientRect();
    const pivot = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    const factor = Math.exp(-ev.deltaY * 0.0015);
    setZoom(state.ui.zoom * factor, pivot);
    render();
  }, { passive: false });

  svg.addEventListener('dblclick', (ev) => {
    const target = ev.target.closest('[data-kind="node"]');
    if (!target) return;
    select('node', target.dataset.id);
    emit('edit-name');
  });

  svg.addEventListener('contextmenu', (ev) => ev.preventDefault());

  attachKeyboard();
  attachPaletteDrag(canvasWrap);
}

// ── Palette : glisser-déposer + clic pour armer ──────────────────────────────
function attachPaletteDrag(canvasWrap) {
  const palette = document.getElementById('palette-items');
  if (!palette) return;

  palette.addEventListener('pointerdown', (ev) => {
    const item = ev.target.closest('[data-device]');
    if (!item) return;
    ev.preventDefault();
    const type = item.dataset.device;
    state.ui.placing = type;
    canvasWrap.classList.add('placing');
    showGhost(type, ev.clientX, ev.clientY);
    emit('placing');

    const move = (e) => showGhost(type, e.clientX, e.clientY);
    const up = (e) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      hideGhost();
      const over = document.elementFromPoint(e.clientX, e.clientY);
      if (!over?.closest('#canvas-svg')) {
        // relâché hors canvas : on garde le placement armé (mode clic)
        return;
      }
      const point = screenToWorld(e.clientX, e.clientY);
      const node = makeNode(type, snap(point.x - 64), snap(point.y - 46));
      addNode(node);
      state.ui.placing = null;
      canvasWrap.classList.remove('placing');
      markDirty();
      render();
      emit('placed');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

function showGhost(type, x, y) {
  if (!ghost) {
    ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    document.body.appendChild(ghost);
  }
  ghost.innerHTML = `<span data-ghost="${type}"></span>`;
  ghost.textContent = document.querySelector(`[data-device="${type}"] .pi-label`)?.textContent || type;
  ghost.style.left = `${x + 12}px`;
  ghost.style.top = `${y + 12}px`;
}

function hideGhost() {
  ghost?.remove();
  ghost = null;
}

// ── Clavier ──────────────────────────────────────────────────────────────────
export function attachKeyboard() {
  window.addEventListener('keydown', (ev) => {
    const tag = (ev.target?.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) || ev.target?.isContentEditable) return;

    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && ev.key.toLowerCase() === 'z' && !ev.shiftKey) { ev.preventDefault(); emit('undo'); return; }
    if (mod && (ev.key.toLowerCase() === 'y' || (ev.key.toLowerCase() === 'z' && ev.shiftKey))) { ev.preventDefault(); emit('redo'); return; }
    if (mod && ev.key.toLowerCase() === 'd') { ev.preventDefault(); emit('duplicate'); return; }
    if (mod && ev.key.toLowerCase() === 's') { ev.preventDefault(); emit('save'); return; }
    if (mod && ev.key.toLowerCase() === 'a') { ev.preventDefault(); fitToContent(); render(); emit('zoom'); return; }

    if (ev.key === 'Escape') {
      if (state.ui.placing) { state.ui.placing = null; emit('placing'); }
      clearSelection();
      render();
      return;
    }
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      if (selected()) { ev.preventDefault(); emit('delete'); }
      return;
    }
    if (ev.key === 'f' || ev.key === 'F') { fitToContent(); render(); emit('zoom'); return; }
    if (ev.key === '+' || ev.key === '=') { setZoom(state.ui.zoom * 1.15); render(); emit('zoom'); return; }
    if (ev.key === '-') { setZoom(state.ui.zoom / 1.15); render(); emit('zoom'); return; }

    if (ev.key.startsWith('Arrow') && state.selection.kind === 'node') {
      const node = nodeById(state.selection.id);
      if (!node) return;
      ev.preventDefault();
      const step = ev.shiftKey ? GRID * 4 : GRID;
      pushHistory('Déplacement clavier');
      if (ev.key === 'ArrowLeft') node.x -= step;
      if (ev.key === 'ArrowRight') node.x += step;
      if (ev.key === 'ArrowUp') node.y -= step;
      if (ev.key === 'ArrowDown') node.y += step;
      markDirty();
      render();
      emit('update');
    }
  });
}

export function refreshInteractions() {
  clearOverlays();
  render();
}

export { uid };
