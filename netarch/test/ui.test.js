// Test de bout en bout du front : charge public/index.html dans un DOM réel,
// exécute app.js et vérifie le rendu SVG, les panneaux et les interactions.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  test('front-end (ignoré : jsdom absent, lancer `npm install`)', { skip: true }, () => {});
}

if (JSDOM) {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  var dom = new JSDOM(html, {
    url: 'http://localhost:3000/',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  after(() => { try { dom.window.close(); } catch { /* déjà fermée */ } });

  // API navigateur absentes de jsdom mais nécessaires au canvas.
  window.Element.prototype.setPointerCapture = function noop() {};
  window.Element.prototype.releasePointerCapture = function noop() {};
  window.document.elementFromPoint = () => null;
  window.confirm = () => true;
  window.alert = () => {};

  for (const key of [
    'window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Element', 'Node',
    'SVGElement', 'Event', 'MouseEvent', 'CustomEvent', 'Image', 'XMLSerializer',
    'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'Blob',
  ]) {
    if (window[key] === undefined) continue;
    try {
      globalThis[key] = window[key];
    } catch {
      Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
    }
  }
  globalThis.window = window;
  globalThis.document = window.document;

  const { state, addNode, makeNode, addLink, makeLink, undo, redo, select, emit, loadProject } =
    await import('../public/js/state.js');
  const { render } = await import('../public/js/render.js');
  const { refresh, setTab } = await import('../public/js/panels.js');
  const { presetPme } = await import('../public/js/presets.js');
  const { DEVICES } = await import('../public/js/devices.js');
  const { buildMarkdown, buildSvgString } = await import('../public/js/export.js');
  await import('../public/js/app.js');

  const $ = (sel) => window.document.querySelector(sel);
  const $$ = (sel) => [...window.document.querySelectorAll(sel)];
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  // Laisse passer le requestAnimationFrame de démarrage.
  await new Promise((r) => setTimeout(r, 30));

  test('le modèle PME est chargé et rendu dans le SVG', () => {
    const expected = presetPme();
    assert.equal(state.project.nodes.length, expected.nodes.length);
    assert.equal($$('#canvas-svg .node').length, expected.nodes.length);
    assert.equal($$('#canvas-svg .link').length, expected.links.length);
    assert.equal($$('#canvas-svg .zone').length, expected.zones.length);
  });

  test('chaque équipement affiche son nom, son IP et son port de liaison', () => {
    const node = $$('#canvas-svg .node').find((g) => g.dataset.id === 'n-web');
    assert.ok(node, 'le nœud WEB-01 doit être rendu');
    assert.equal(node.querySelector('.nd-name').textContent, 'WEB-01');
    assert.match(node.querySelector('.nd-sub').textContent, /10\.0\.3\.10/);
    assert.ok(node.querySelector('.nd-port'), 'poignée de liaison présente');
    assert.match(node.getAttribute('transform'), /translate\(/);
  });

  test('la palette propose tout le catalogue', () => {
    assert.equal($$('#palette-items .pal-item').length, DEVICES.length);
    assert.ok($('#palette-items [data-device="firewall"]'));
  });

  test('la recherche de la palette filtre le catalogue', () => {
    const input = $('#palette-search');
    input.value = 'pare-feu';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal($$('#palette-items .pal-item').length, 1);
    input.value = '';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal($$('#palette-items .pal-item').length, DEVICES.length);
  });

  test('sélectionner un équipement alimente l’inspecteur', () => {
    select('node', 'n-fw');
    emit('selection');
    const nameField = $('#panel-body [data-f="name"]');
    assert.equal(nameField.value, 'FW-BORDURE');
    assert.ok($('#panel-body [data-f="ip"]'));
    assert.ok($('#panel-body [data-act="goto-firewall"]'), 'bouton vers les règles de pare-feu');
  });

  test('modifier un champ met à jour l’équipement et le canvas', () => {
    const input = $('#panel-body [data-f="name"]');
    input.value = 'FW-EDGE-01';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(state.project.nodes.find((n) => n.id === 'n-fw').name, 'FW-EDGE-01');
    const node = $$('#canvas-svg .node').find((g) => g.dataset.id === 'n-fw');
    assert.equal(node.querySelector('.nd-name').textContent, 'FW-EDGE-01');
  });

  test('annuler restaure la valeur précédente', () => {
    assert.equal(undo(), true);
    assert.equal(state.project.nodes.find((n) => n.id === 'n-fw').name, 'FW-BORDURE');
    assert.equal(redo(), true);
    assert.equal(state.project.nodes.find((n) => n.id === 'n-fw').name, 'FW-EDGE-01');
    undo();
  });

  test('l’onglet Pare-feu liste les règles et refuse par défaut', () => {
    setTab('firewall');
    assert.equal($$('#panel-body .rule').length, 9);
    assert.ok($('#panel-body [data-act="analyze"]'));
    // Analyseur de trajet : Internet → WEB-01 en SSH doit être bloqué.
    const from = $('#panel-body [data-path="from"]');
    const to = $('#panel-body [data-path="to"]');
    const service = $('#panel-body [data-path="service"]');
    from.value = 'n-int';
    to.value = 'n-web';
    service.value = 'tcp/22';
    click($('#panel-body [data-act="analyze"]'));
    assert.match($('#path-result').textContent, /Trajet bloqué/);
    assert.match($('#path-result').textContent, /refus par défaut/);
  });

  test('l’onglet Adressage calcule un préfixe CIDR', () => {
    setTab('subnet');
    const input = $('#subnet-input');
    input.value = '172.16.4.0/22';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    const text = $('#subnet-out').textContent;
    assert.match(text, /172\.16\.4\.0/);
    assert.match(text, /255\.255\.252\.0/);
    assert.match(text, /1022 utiles/);
    assert.ok($$('#split-out .kv span').length >= 4);
  });

  test('l’onglet Audit affiche un score et des constats cliquables', () => {
    setTab('audit');
    const score = Number($('.score-txt b').textContent);
    assert.ok(score > 0 && score <= 100, `score = ${score}`);
    assert.ok($$('#panel-body .finding').length >= 1);
    const first = $('#panel-body .finding');
    assert.ok(first.dataset.target !== undefined);
  });

  test('ajouter puis supprimer un équipement met à jour le rendu', () => {
    setTab('props');
    const before = state.project.nodes.length;
    const node = addNode(makeNode('printer', 40, 900, { name: 'MFP-TEST', ip: '10.0.1.200' }));
    render();
    assert.equal(state.project.nodes.length, before + 1);
    assert.equal($$('#canvas-svg .node').length, before + 1);

    const link = addLink(makeLink('n-sw1', node.id, { vlan: '10' }));
    render();
    assert.ok(link);
    assert.equal($$('#canvas-svg .link').length, presetPme().links.length + 1);

    select('node', node.id);
    emit('selection');
    click($('#panel-body [data-act="delete"]'));
    assert.equal(state.project.nodes.length, before);
    assert.equal($$('#canvas-svg .link').length, presetPme().links.length);
  });

  test('le projet se recharge et l’export Markdown est complet', () => {
    loadProject(presetPme());
    render();
    const md = buildMarkdown();
    assert.match(md, /# PME — Siège 40 postes/);
    assert.match(md, /## 2\. Inventaire des équipements/);
    assert.match(md, /\| WEB-01 \| Serveur \| DMZ \| 10\.0\.3\.10 \| 30 \|/);
    assert.match(md, /## 4\. Politique de filtrage/);
    assert.match(md, /## 5\. Audit de conformité — score \d+\/100/);

    const svg = buildSvgString();
    assert.match(svg, /<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.equal((svg.match(/xmlns=/g) || []).length, 1, 'une seule déclaration xmlns (XML valide)');
    assert.equal((svg.match(/class="node /g) || []).length, state.project.nodes.length);
    assert.equal((svg.match(/class="link /g) || []).length, state.project.links.length);
    assert.equal((svg.match(/class="zone"/g) || []).length, state.project.zones.length);
    assert.match(svg, /viewBox="0 0 \d+ \d+"/);
    assert.match(svg, /feDropShadow/, 'la casse du filtre SVG est préservée');
    assert.doesNotMatch(svg, /class="nd-port"/, 'les poignées d’interface ne doivent pas être exportées');
  });

  test('la barre d’état reflète le contenu du schéma', () => {
    refresh('project');
    const text = $('#status-bar').textContent;
    assert.match(text, /21 équipements/);
    assert.match(text, /20 liaisons/);
    assert.match(text, /5 zones/);
  });
}
