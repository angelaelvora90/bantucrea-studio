// ─────────────────────────────────────────────────────────────────────────────
// panels.js — Palette d'équipements, inspecteur, pare-feu, calculateur CIDR,
// rapport d'audit, barre d'état.
// ─────────────────────────────────────────────────────────────────────────────
import { CATEGORIES, DEVICES, MEDIA, MEDIA_MAP, deviceMeta, iconMarkup } from './devices.js';
import {
  state, select, selected, emit, patch, pushHistory, removeSelected,
  duplicateSelected, addZone, makeZone, markDirty, uid,
} from './state.js';
import { escapeHtml, fitToContent } from './render.js';
import { auditProject, analyzeReachability, zoneOf, SEVERITY, categoryOf } from './audit.js';
import { cidrInfo, splitCidr, isValidIPv4, firstFreeIp } from './net.js';

let inspectorKey = '';
let lastAudit = null;

// ── Palette ──────────────────────────────────────────────────────────────────
export function renderPalette() {
  const host = document.getElementById('palette-items');
  if (!host) return;
  const q = state.ui.paletteQuery.trim().toLowerCase();
  // Ne reconstruire la palette que si la recherche ou le placement a changé :
  // elle est sinon régénérée à chaque modification de l'inspecteur.
  const sig = `${q}|${state.ui.placing || ''}`;
  if (host.__sig === sig) return;
  host.__sig = sig;
  const items = DEVICES.filter((d) => !q || `${d.label} ${d.hint}`.toLowerCase().includes(q));
  host.innerHTML = CATEGORIES
    .map((cat) => {
      const list = items.filter((d) => d.category === cat.id);
      if (!list.length) return '';
      return `<div class="pal-group">
        <div class="pal-title">${cat.label}</div>
        <div class="pal-grid">
          ${list.map((d) => `
            <button class="pal-item${state.ui.placing === d.type ? ' active' : ''}" data-device="${d.type}"
              title="${escapeHtml(d.hint)}" style="--c:${d.color}">
              <span class="pi-icon">${iconMarkup(d.type, 24)}</span>
              <span class="pi-label">${d.label}</span>
            </button>`).join('')}
        </div>
      </div>`;
    })
    .join('') || '<div class="empty">Aucun équipement ne correspond.</div>';
}

// ── Inspecteur ───────────────────────────────────────────────────────────────
export function renderInspector(force = false) {
  const host = document.getElementById('panel-body');
  if (!host) return;
  const tab = state.ui.activeTab;
  const { kind, id } = state.selection;
  const key = `${tab}|${kind}|${id}`;
  if (!force && key === inspectorKey) return;
  inspectorKey = key;

  if (tab === 'firewall') { host.innerHTML = firewallPanel(); wireFirewall(host); return; }
  if (tab === 'subnet') { host.innerHTML = subnetPanel(); wireSubnet(host); return; }
  if (tab === 'audit') { host.innerHTML = auditPanel(); wireAudit(host); return; }

  const sel = selected();
  if (!sel) { host.innerHTML = projectPanel(); wireProject(host); return; }
  if (kind === 'node') { host.innerHTML = nodePanel(sel); wireNode(host, sel); return; }
  if (kind === 'zone') { host.innerHTML = zonePanel(sel); wireZone(host, sel); return; }
  if (kind === 'link') { host.innerHTML = linkPanel(sel); wireLink(host, sel); return; }
  host.innerHTML = projectPanel();
  wireProject(host);
}

const field = (label, inner, hint = '') => `
  <label class="field">
    <span class="field-label">${label}</span>
    ${inner}
    ${hint ? `<span class="field-hint">${hint}</span>` : ''}
  </label>`;

function projectPanel() {
  const p = state.project;
  return `
    <div class="panel-head">
      <h3>Projet</h3>
      <p class="muted">Aucune sélection — cliquez sur un élément du schéma.</p>
    </div>
    ${field('Nom de l’architecture', `<input data-f="name" value="${escapeHtml(p.name)}">`)}
    ${field('Entreprise / client', `<input data-f="company" value="${escapeHtml(p.company || '')}" placeholder="Ex. Groupe Bantu SA">`)}
    ${field('Auteur', `<input data-f="author" value="${escapeHtml(p.author || '')}" placeholder="Nom du concepteur">`)}
    <div class="stat-grid">
      <div class="stat"><b>${p.nodes.length}</b><span>équipements</span></div>
      <div class="stat"><b>${p.links.length}</b><span>liaisons</span></div>
      <div class="stat"><b>${p.zones.length}</b><span>zones</span></div>
      <div class="stat"><b>${new Set(p.nodes.map((n) => n.vlan).filter(Boolean)).size}</b><span>VLAN</span></div>
    </div>
    <div class="btn-row">
      <button class="btn" data-act="new-zone">+ Ajouter une zone</button>
      <button class="btn" data-act="fit">Cadrer le schéma</button>
    </div>
    <div class="hint-box">
      <b>Astuces</b>
      <ul>
        <li>Glissez un équipement de la palette vers le canvas.</li>
        <li>Tirez depuis le petit cercle sous un équipement pour créer une liaison.</li>
        <li><kbd>Maj</kbd> + glisser sur le fond = sélection multiple · molette = zoom · <kbd>F</kbd> = cadrer.</li>
      </ul>
    </div>`;
}

function nodePanel(n) {
  const meta = deviceMeta(n.type);
  const zone = zoneOf(n, state.project.zones);
  const zoneInfo = zone?.cidr ? cidrInfo(zone.cidr) : null;
  const ipOk = !n.ip || !zoneInfo?.valid || isValidIPv4(n.ip) === false ? null : (
    zoneInfo.range[0] <= (ipToIntSafe(n.ip) ?? -1) && (ipToIntSafe(n.ip) ?? 0) <= zoneInfo.range[1]
  );
  return `
    <div class="panel-head" style="--c:${meta.color}">
      <div class="ph-icon">${iconMarkup(n.type, 26)}</div>
      <div>
        <h3>${escapeHtml(n.name)}</h3>
        <p class="muted">${meta.label}${zone ? ` · zone ${escapeHtml(zone.name)}` : ' · hors zone'}</p>
      </div>
    </div>
    ${field('Nom', `<input data-f="name" value="${escapeHtml(n.name)}">`)}
    ${field('Type', `<select data-f="type">${DEVICES.map((d) => `<option value="${d.type}"${d.type === n.type ? ' selected' : ''}>${d.label}</option>`).join('')}</select>`)}
    <div class="two-col">
      ${field('Adresse IP', `<input data-f="ip" value="${escapeHtml(n.ip)}" placeholder="10.0.2.20" spellcheck="false">`)}
      ${field('VLAN', `<input data-f="vlan" value="${escapeHtml(n.vlan)}" placeholder="20">`)}
    </div>
    ${n.ip && zoneInfo?.valid ? `<div class="chip ${ipOk ? 'ok' : 'bad'}">${ipOk
      ? `Dans ${zoneInfo.cidr}`
      : `Hors de ${zoneInfo.cidr} (zone ${escapeHtml(zone.name)})`}</div>` : ''}
    <div class="two-col">
      ${field('Statut', `<select data-f="status">
        <option value="up"${n.status === 'up' ? ' selected' : ''}>Actif</option>
        <option value="alert"${n.status === 'alert' ? ' selected' : ''}>Dégradé</option>
        <option value="down"${n.status === 'down' ? ' selected' : ''}>Hors service</option>
      </select>`)}
      ${field('Modèle', `<input data-f="model" value="${escapeHtml(n.model || '')}" placeholder="Référence">`)}
    </div>
    ${field('Système', `<input data-f="os" value="${escapeHtml(n.os || '')}" placeholder="Linux, Windows Server…">`)}
    ${categoryOf(n.type) === 'server' ? field('Ports exposés', `<input data-f="exposedPorts" value="${escapeHtml(n.exposedPorts || '')}" placeholder="443, 8443" spellcheck="false">`, 'Utilisé par l’audit d’exposition.') : ''}
    ${field('Notes', `<textarea data-f="notes" rows="3" placeholder="Rôle, contraintes, contacts…">${escapeHtml(n.notes || '')}</textarea>`)}
    ${n.type === 'firewall' ? `
      <div class="btn-row">
        <button class="btn primary" data-act="goto-firewall">Règles de filtrage (${(n.rules || []).length})</button>
      </div>` : ''}
    <div class="btn-row">
      <button class="btn" data-act="auto-ip">IP libre suivante</button>
      <button class="btn" data-act="duplicate">Dupliquer</button>
      <button class="btn danger" data-act="delete">Supprimer</button>
    </div>`;
}

function zonePanel(z) {
  const info = z.cidr ? cidrInfo(z.cidr) : null;
  const members = state.project.nodes.filter((n) => zoneOf(n, state.project.zones)?.id === z.id);
  return `
    <div class="panel-head" style="--c:${z.color}">
      <div class="ph-dot" style="background:${z.color}"></div>
      <div>
        <h3>${escapeHtml(z.name)}</h3>
        <p class="muted">Zone · ${members.length} équipement(s)</p>
      </div>
    </div>
    ${field('Nom de la zone', `<input data-f="name" value="${escapeHtml(z.name)}">`)}
    ${field('Préfixe CIDR', `<input data-f="cidr" value="${escapeHtml(z.cidr)}" placeholder="10.0.2.0/24" spellcheck="false">`, 'Sert au contrôle d’adressage et au pare-feu.')}
    ${info?.valid ? `<div class="kv">
        <span>Réseau</span><b>${info.network}</b>
        <span>Masque</span><b>${info.mask}</b>
        <span>Diffusion</span><b>${info.broadcast}</b>
        <span>Hôtes</span><b>${info.firstHost} → ${info.lastHost}</b>
        <span>Adresses utiles</span><b>${info.usable}</b>
      </div>` : (z.cidr ? '<div class="chip bad">Préfixe CIDR invalide</div>' : '')}
    ${field('VLAN associé', `<input data-f="vlan" value="${escapeHtml(z.vlan || '')}" placeholder="20">`)}
    ${field('Couleur', `<div class="swatches">
        ${['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']
        .map((c) => `<button class="swatch${c === z.color ? ' on' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
      </div>`)}
    ${field('Note', `<textarea data-f="note" rows="2">${escapeHtml(z.note || '')}</textarea>`)}
    <div class="btn-row">
      <button class="btn" data-act="fit-zone">Ajuster aux équipements</button>
      <button class="btn danger" data-act="delete">Supprimer la zone</button>
    </div>`;
}

function linkPanel(l) {
  const a = state.project.nodes.find((n) => n.id === l.a);
  const b = state.project.nodes.find((n) => n.id === l.b);
  const media = MEDIA_MAP[l.media] || MEDIA_MAP.copper;
  return `
    <div class="panel-head" style="--c:${media.color}">
      <div class="ph-line" style="background:${media.color}"></div>
      <div>
        <h3>Liaison</h3>
        <p class="muted">${escapeHtml(a?.name || '?')} ⇄ ${escapeHtml(b?.name || '?')}</p>
      </div>
    </div>
    ${field('Support', `<select data-f="media">${MEDIA.map((m) => `<option value="${m.id}"${m.id === l.media ? ' selected' : ''}>${m.label}</option>`).join('')}</select>`)}
    <div class="two-col">
      ${field('Débit', `<input data-f="speed" value="${escapeHtml(l.speed || '')}" placeholder="1 Gb/s">`)}
      ${field('VLAN / trunk', `<input data-f="vlan" value="${escapeHtml(l.vlan || '')}" placeholder="10,20,30">`)}
    </div>
    ${field('État', `<select data-f="state">
      <option value="up"${l.state !== 'down' ? ' selected' : ''}>Up</option>
      <option value="down"${l.state === 'down' ? ' selected' : ''}>Down</option>
    </select>`)}
    ${field('Note', `<textarea data-f="note" rows="2" placeholder="Câble, gaine, contrat…">${escapeHtml(l.note || '')}</textarea>`)}
    <div class="btn-row">
      <button class="btn" data-act="invert">Inverser A/B</button>
      <button class="btn danger" data-act="delete">Supprimer la liaison</button>
    </div>`;
}

function ipToIntSafe(ip) {
  const parts = String(ip).split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    n = n * 256 + Number(p);
  }
  return n >>> 0;
}

// ── Pare-feu ─────────────────────────────────────────────────────────────────
function firewallPanel() {
  const firewalls = state.project.nodes.filter((n) => n.type === 'firewall');
  if (!firewalls.length) {
    return `<div class="panel-head"><h3>Pare-feu</h3><p class="muted">Aucun pare-feu dans le schéma.</p></div>
      <div class="empty">Ajoutez un équipement <b>Pare-feu</b> depuis la palette pour définir une politique de filtrage.</div>`;
  }
  const currentId = state.ui.fwId && firewalls.some((f) => f.id === state.ui.fwId)
    ? state.ui.fwId
    : firewalls[0].id;
  state.ui.fwId = currentId;
  const fw = firewalls.find((f) => f.id === currentId);
  const zoneOptions = ['', 'any', 'hors zone', ...state.project.zones.map((z) => z.name)];
  const zoneOpts = (value) => zoneOptions
    .map((z) => `<option value="${escapeHtml(z)}"${z === value ? ' selected' : ''}>${z === 'any' ? 'Toutes zones' : z === 'hors zone' ? 'Internet / hors zone' : z === '' ? '— choisir —' : escapeHtml(z)}</option>`)
    .join('');

  return `
    <div class="panel-head"><h3>Politique de filtrage</h3>
      <p class="muted">Règles évaluées de haut en bas, refus par défaut.</p></div>
    ${field('Pare-feu', `<select data-fw-select>${firewalls
      .map((f) => `<option value="${f.id}"${f.id === currentId ? ' selected' : ''}>${escapeHtml(f.name)}</option>`).join('')}</select>`)}
    <div class="rules">
      ${(fw.rules || []).map((r, i) => `
        <div class="rule ${r.action === 'deny' ? 'deny' : 'allow'}${r.enabled === false ? ' off' : ''}" data-rule="${r.id}">
          <div class="rule-top">
            <input class="rule-name" data-r="name" value="${escapeHtml(r.name || '')}" placeholder="Nom de la règle">
            <span class="pill ${r.action === 'deny' ? 'p-deny' : 'p-allow'}">${r.action === 'deny' ? 'REFUSER' : 'AUTORISER'}</span>
          </div>
          <div class="rule-row">
            <select data-r="src">${zoneOpts(r.src)}</select>
            <span class="arrow">→</span>
            <select data-r="dst">${zoneOpts(r.dst)}</select>
          </div>
          <div class="rule-row">
            <input data-r="service" value="${escapeHtml(r.service || 'any')}" placeholder="tcp/443" spellcheck="false">
            <select data-r="action">
              <option value="allow"${r.action !== 'deny' ? ' selected' : ''}>Autoriser</option>
              <option value="deny"${r.action === 'deny' ? ' selected' : ''}>Refuser</option>
            </select>
            <button class="icon-btn" data-r-act="toggle" title="${r.enabled === false ? 'Activer' : 'Désactiver'}">${r.enabled === false ? '⊘' : '●'}</button>
            <button class="icon-btn danger" data-r-act="del" title="Supprimer">✕</button>
          </div>
        </div>`).join('') || '<div class="empty">Aucune règle : tout est refusé par défaut.</div>'}
    </div>
    <div class="btn-row">
      <button class="btn primary" data-act="add-rule">+ Ajouter une règle</button>
    </div>
    <hr class="sep">
    <h4>Analyseur de trajet</h4>
    <p class="muted small">Simule un flux à travers le schéma et montre où il est filtré.</p>
    <div class="two-col">
      ${field('Source', `<select data-path="from">${state.project.nodes.map((n) => `<option value="${n.id}">${escapeHtml(n.name)}</option>`).join('')}</select>`)}
      ${field('Destination', `<select data-path="to">${state.project.nodes.map((n) => `<option value="${n.id}">${escapeHtml(n.name)}</option>`).join('')}</select>`)}
    </div>
    ${field('Service', `<input data-path="service" value="tcp/443" spellcheck="false">`, 'Ex. tcp/443, udp/53, any')}
    <div class="btn-row"><button class="btn" data-act="analyze">Analyser le trajet</button></div>
    <div id="path-result"></div>`;
}

// ── Calculateur de sous-réseau ───────────────────────────────────────────────
function subnetPanel() {
  return `
    <div class="panel-head"><h3>Plan d’adressage</h3><p class="muted">Calcul CIDR IPv4 et découpage VLSM.</p></div>
    ${field('Préfixe', `<input id="subnet-input" value="192.168.10.0/24" spellcheck="false">`)}
    <div id="subnet-out"></div>
    <hr class="sep">
    <h4>Découpage</h4>
    ${field('Nombre de sous-réseaux', `<input id="split-count" type="number" min="2" max="64" value="4">`)}
    <div id="split-out"></div>
    <hr class="sep">
    <h4>Zones du schéma</h4>
    <div id="zone-summary"></div>`;
}

function computeSubnet() {
  const input = document.getElementById('subnet-input');
  const out = document.getElementById('subnet-out');
  if (!input || !out) return;
  const info = cidrInfo(input.value);
  if (!info.valid) {
    out.innerHTML = `<div class="chip bad">${escapeHtml(info.error)}</div>`;
  } else {
    out.innerHTML = `<div class="kv">
      <span>Adresse réseau</span><b>${info.network}</b>
      <span>Masque</span><b>${info.mask}</b>
      <span>Masque générique</span><b>${info.wildcard}</b>
      <span>Diffusion</span><b>${info.broadcast}</b>
      <span>Premier hôte</span><b>${info.firstHost}</b>
      <span>Dernier hôte</span><b>${info.lastHost}</b>
      <span>Adresses</span><b>${info.hostCount} (${info.usable} utiles)</b>
      <span>Préfixe</span><b>/${info.prefix} · classe ${info.class}</b>
      <span>Portée</span><b>${info.isPrivate ? 'Privée (RFC 1918)' : 'Publique'}</b>
    </div>
    <div class="btn-row">
      <button class="btn" data-act="zone-from-cidr">Créer une zone ici</button>
      <button class="btn" data-act="apply-zone">Appliquer à la zone sélectionnée</button>
    </div>`;
  }
  computeSplit();
}

function computeSplit() {
  const input = document.getElementById('subnet-input');
  const count = document.getElementById('split-count');
  const out = document.getElementById('split-out');
  if (!input || !out) return;
  const parts = splitCidr(input.value, Number(count?.value || 4));
  out.innerHTML = parts.length
    ? `<div class="kv compact">${parts.map((p) => `<span>${escapeHtml(p.cidr)}</span><b>${p.usable} hôtes</b>`).join('')}</div>`
    : '<div class="chip bad">Découpage impossible.</div>';
}

function renderZoneSummary() {
  const host = document.getElementById('zone-summary');
  if (!host) return;
  const zones = state.project.zones;
  host.innerHTML = zones.length ? zones.map((z) => {
    const info = z.cidr ? cidrInfo(z.cidr) : null;
    const members = state.project.nodes.filter((n) => zoneOf(n, zones)?.id === z.id);
    const ips = members.map((m) => m.ip).filter(Boolean);
    return `<div class="zone-card" style="--c:${z.color}" data-zone="${z.id}">
      <div class="zc-head"><b>${escapeHtml(z.name)}</b><span>${members.length} équip.</span></div>
      <div class="zc-body">
        <span>${z.cidr ? escapeHtml(z.cidr) : 'pas de préfixe'}</span>
        <span>${info?.valid ? `${info.usable} adresses · ${ips.length} utilisées` : '—'}</span>
        ${info?.valid ? `<span>IP libre : <b>${firstFreeIp(info.cidr, ips) || 'aucune'}</b></span>` : ''}
      </div>
    </div>`;
  }).join('') : '<div class="empty">Aucune zone : dessinez-en une sur le canvas.</div>';
}

// ── Audit ────────────────────────────────────────────────────────────────────
export function runAudit() {
  lastAudit = auditProject(state.project);
  state.ui.auditTargets = new Set();
  for (const f of lastAudit.findings) {
    for (const t of f.targets || []) state.ui.auditTargets.add(t);
  }
  return lastAudit;
}

function auditPanel() {
  const audit = runAudit();
  const c = audit.counts;
  const tone = audit.score >= 85 ? 'good' : audit.score >= 60 ? 'warn' : 'bad';
  return `
    <div class="panel-head"><h3>Audit de l’architecture</h3>
      <p class="muted">${c.nodes} équipements · ${c.links} liaisons · ${c.zones} zones</p></div>
    <div class="score ${tone}">
      <svg viewBox="0 0 120 120" class="ring">
        <circle cx="60" cy="60" r="52" class="ring-bg"/>
        <circle cx="60" cy="60" r="52" class="ring-fg"
          stroke-dasharray="${(audit.score / 100) * 326.7} 326.7"/>
      </svg>
      <div class="score-txt"><b>${audit.score}</b><span>/100</span></div>
    </div>
    <div class="sev-grid">
      <div class="sev s-critical"><b>${c.critical}</b><span>critiques</span></div>
      <div class="sev s-high"><b>${c.high}</b><span>élevées</span></div>
      <div class="sev s-medium"><b>${c.medium}</b><span>moyennes</span></div>
      <div class="sev s-low"><b>${c.low}</b><span>faibles</span></div>
    </div>
    <div class="findings">
      ${audit.findings.map((f) => `
        <button class="finding ${f.severity}" data-target="${(f.targets || [])[0] || ''}">
          <span class="dot"></span>
          <span class="f-body">
            <b>${escapeHtml(f.title)}</b>
            <small>${escapeHtml(f.detail)}</small>
            <em>${SEVERITY[f.severity].label}</em>
          </span>
        </button>`).join('') || '<div class="empty ok">Aucune anomalie détectée. Beau travail.</div>'}
    </div>
    <div class="btn-row">
      <button class="btn" data-act="export-report">Exporter le rapport (Markdown)</button>
    </div>`;
}

// ── Câblage des panneaux ─────────────────────────────────────────────────────
function bindFields(host, onChange) {
  host.querySelectorAll('[data-f]').forEach((input) => {
    const handler = () => onChange(input.dataset.f, input.value, input.tagName === 'SELECT');
    input.addEventListener('input', handler);
    input.addEventListener('change', handler);
  });
}

function wireProject(host) {
  bindFields(host, (f, v) => { patch(state.project, { [f]: v }, 'Projet'); markDirty(); });
  host.addEventListener('click', (ev) => {
    const act = ev.target.closest('[data-act]')?.dataset.act;
    if (act === 'new-zone') { addZone(makeZone(80, 80, 420, 300, { name: `Zone ${state.project.zones.length + 1}` })); markDirty(); emit('update'); }
    if (act === 'fit') { fitToContent(); emit('update'); }
  });
}

function wireNode(host, node) {
  bindFields(host, (f, v) => {
    if (f === 'type') {
      const meta = deviceMeta(v);
      patch(node, { type: v, w: meta.w, h: meta.h, ...meta.defaults }, 'Type');
      markDirty();
      emit('update');
      renderInspector(true);
    } else {
      patch(node, { [f]: v }, 'Propriété');
      markDirty();
      emit('update');
    }
  });
  host.addEventListener('click', (ev) => {
    const act = ev.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'delete') { removeSelected(); markDirty(); emit('update'); }
    if (act === 'duplicate') { duplicateSelected(); markDirty(); emit('update'); }
    if (act === 'goto-firewall') { state.ui.fwId = node.id; setTab('firewall'); }
    if (act === 'auto-ip') {
      const zone = zoneOf(node, state.project.zones);
      if (!zone?.cidr) { alert('Cette zone n’a pas de préfixe CIDR : renseignez-le d’abord.'); return; }
      const used = state.project.nodes.map((n) => n.ip).filter(Boolean);
      const ip = firstFreeIp(zone.cidr, used);
      if (ip) { patch(node, { ip }, 'IP automatique'); markDirty(); emit('update'); }
      else alert('Aucune adresse libre dans ce préfixe.');
    }
  });
}

function wireZone(host, zone) {
  bindFields(host, (f, v) => { patch(zone, { [f]: v }, 'Zone'); markDirty(); emit('update'); });
  host.addEventListener('click', (ev) => {
    const swatch = ev.target.closest('[data-color]');
    if (swatch) { patch(zone, { color: swatch.dataset.color }, 'Couleur'); markDirty(); emit('update'); return; }
    const act = ev.target.closest('[data-act]')?.dataset.act;
    if (act === 'delete') { removeSelected(); markDirty(); emit('update'); }
    if (act === 'fit-zone') {
      const members = state.project.nodes.filter((n) => zoneOf(n, state.project.zones)?.id === zone.id);
      if (!members.length) return;
      const pad = 40;
      const x = Math.min(...members.map((m) => m.x)) - pad;
      const y = Math.min(...members.map((m) => m.y)) - pad;
      const w = Math.max(...members.map((m) => m.x + m.w)) - x + pad;
      const h = Math.max(...members.map((m) => m.y + m.h)) - y + pad;
      patch(zone, { x, y, w, h }, 'Ajustement zone');
      markDirty();
      emit('update');
    }
  });
}

function wireLink(host, link) {
  bindFields(host, (f, v) => { patch(link, { [f]: v }, 'Liaison'); markDirty(); emit('update'); });
  host.addEventListener('click', (ev) => {
    const act = ev.target.closest('[data-act]')?.dataset.act;
    if (act === 'delete') { removeSelected(); markDirty(); emit('update'); }
    if (act === 'invert') { patch(link, { a: link.b, b: link.a }, 'Inversion'); markDirty(); emit('update'); }
  });
}

function wireFirewall(host) {
  const sel = host.querySelector('[data-fw-select]');
  sel?.addEventListener('change', () => { state.ui.fwId = sel.value; renderInspector(true); });

  host.querySelectorAll('[data-rule]').forEach((ruleEl) => {
    const id = ruleEl.dataset.rule;
    const fw = state.project.nodes.find((n) => n.id === state.ui.fwId);
    const rule = fw?.rules?.find((r) => r.id === id);
    if (!rule) return;
    ruleEl.querySelectorAll('[data-r]').forEach((input) => {
      const handler = () => {
        const f = input.dataset.r;
        patch(rule, { [f]: f === 'service' ? (input.value.trim() || 'any') : input.value }, 'Règle');
        markDirty();
        emit('update');
        if (['action', 'src', 'dst'].includes(f)) renderInspector(true);
      };
      input.addEventListener('input', handler);
      input.addEventListener('change', handler);
    });
    ruleEl.querySelectorAll('[data-r-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.rAct === 'del') {
          pushHistoryLocal('Suppression règle');
          fw.rules = fw.rules.filter((r) => r.id !== id);
        } else {
          pushHistoryLocal('Règle activée/désactivée');
          rule.enabled = rule.enabled === false;
        }
        markDirty();
        renderInspector(true);
        emit('update');
      });
    });
  });

  host.addEventListener('click', (ev) => {
    const act = ev.target.closest('[data-act]')?.dataset.act;
    const fw = state.project.nodes.find((n) => n.id === state.ui.fwId);
    if (act === 'add-rule' && fw) {
      pushHistoryLocal('Ajout règle');
      fw.rules = fw.rules || [];
      fw.rules.push({ id: uid('r'), name: `Règle ${fw.rules.length + 1}`, src: 'any', dst: 'any', service: 'any', action: 'allow', enabled: true });
      markDirty();
      renderInspector(true);
      emit('update');
    }
    if (act === 'analyze') analyzePath(host);
  });
}

function pushHistoryLocal(label) {
  pushHistory(label);
}

function analyzePath(host) {
  const from = host.querySelector('[data-path="from"]')?.value;
  const to = host.querySelector('[data-path="to"]')?.value;
  const service = host.querySelector('[data-path="service"]')?.value || 'any';
  const out = host.querySelector('#path-result');
  if (!from || !to || !out) return;
  const res = analyzeReachability(state.project, from, to, service);
  const tone = res.verdict === 'allowed' ? 'ok' : res.verdict === 'denied' ? 'bad' : 'muted';
  out.innerHTML = `
    <div class="chip ${tone}">${res.verdict === 'allowed' ? '✓ Trajet autorisé' : res.verdict === 'denied' ? '✕ Trajet bloqué' : '∅ Injoignable'} — ${escapeHtml(res.message)}</div>
    <ol class="path">
      ${res.hops.map((h) => `
        <li class="${h.decision === 'deny' ? 'deny' : ''}">
          <b>${escapeHtml(h.node.name)}</b>
          <small>${escapeHtml(h.zone)}${h.node.type === 'firewall'
            ? ` · ${h.decision === 'allow' ? `autorisé par « ${h.rule?.name || '—'} »` : h.defaultDeny ? 'refus par défaut' : `refusé par « ${h.rule?.name || '—'} »`}`
            : ''}</small>
        </li>`).join('')}
    </ol>`;
}

function wireSubnet(host) {
  const input = host.querySelector('#subnet-input');
  const count = host.querySelector('#split-count');
  input?.addEventListener('input', computeSubnet);
  count?.addEventListener('input', computeSplit);
  host.addEventListener('click', (ev) => {
    const card = ev.target.closest('[data-zone]');
    if (card) { select('zone', card.dataset.zone); return; }
    const act = ev.target.closest('[data-act]')?.dataset.act;
    const value = host.querySelector('#subnet-input')?.value || '';
    if (act === 'zone-from-cidr') {
      const info = cidrInfo(value);
      if (!info.valid) { alert(info.error); return; }
      addZone(makeZone(80, 80, 420, 300, { name: `Zone ${info.cidr}`, cidr: info.cidr }));
      markDirty();
      emit('update');
    }
    if (act === 'apply-zone') {
      const zone = state.selection.kind === 'zone' ? selected() : null;
      if (!zone) { alert('Sélectionnez d’abord une zone sur le canvas.'); return; }
      patch(zone, { cidr: value }, 'Préfixe de zone');
      markDirty();
      emit('update');
    }
  });
  computeSubnet();
  renderZoneSummary();
}

function wireAudit(host) {
  host.querySelectorAll('[data-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.target;
      if (!id) return;
      select('node', id);
      centerOnNode(id);
    });
  });
  host.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-act="export-report"]')) emit('export-report');
  });
}

function centerOnNode(id) {
  const node = state.project.nodes.find((n) => n.id === id);
  if (!node) return;
  const svg = document.getElementById('canvas-svg');
  const rect = svg.getBoundingClientRect();
  state.ui.tx = rect.width / 2 - (node.x + node.w / 2) * state.ui.zoom;
  state.ui.ty = rect.height / 2 - (node.y + node.h / 2) * state.ui.zoom;
  emit('update');
}

// ── Onglets & barre d'état ───────────────────────────────────────────────────
export function setTab(tab) {
  state.ui.activeTab = tab;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  renderInspector(true);
  emit('update');
}

export function updateTabs() {
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === state.ui.activeTab);
    if (t.dataset.tab === 'audit') {
      const audit = lastAudit || runAudit();
      const badge = t.querySelector('.tab-badge');
      const count = audit.findings.filter((f) => f.severity !== 'low').length;
      if (badge) {
        badge.textContent = count;
        badge.hidden = count === 0;
        badge.className = `tab-badge ${audit.counts.critical ? 'crit' : audit.counts.high ? 'high' : 'ok'}`;
      }
    }
  });
}

export function updateStatus() {
  const el = document.getElementById('status-bar');
  if (!el) return;
  const p = state.project;
  const saved = state.ui.lastSaved
    ? state.ui.lastSaved.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : '—';
  el.innerHTML = `
    <span>${p.nodes.length} équipements</span>
    <span>${p.links.length} liaisons</span>
    <span>${p.zones.length} zones</span>
    <span>${new Set(p.nodes.map((n) => n.vlan).filter(Boolean)).size} VLAN</span>
    <span class="spacer"></span>
    <span class="${state.ui.dirty ? 'warn' : 'ok'}">${state.ui.dirty ? '● modifications non enregistrées' : `✓ enregistré à ${saved}`}</span>
    <span>zoom ${Math.round(state.ui.zoom * 100)} %</span>`;
}

export function refresh(reason) {
  if (reason === 'selection' || reason === 'project' || reason === 'placed') {
    renderInspector(true);
  } else {
    renderInspector(false);
  }
  if (state.ui.activeTab === 'subnet') renderZoneSummary();
  if (state.ui.activeTab === 'audit') renderInspector(true);
  runAudit();
  updateTabs();
  updateStatus();
  renderPalette();
}
