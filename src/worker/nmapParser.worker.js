// Web Worker : parse les exports XML Nmap en arrière-plan pour ne jamais
// bloquer l'interface, même sur des scans de plusieurs dizaines de milliers
// d'hôtes. 100 % local : aucune donnée ne quitte le navigateur.

import { parseNmapContent, mergeScanResults } from '../lib/nmapParser.js';

self.onmessage = (event) => {
  const { files } = event.data || {};
  const results = [];
  const errors = [];
  try {
    files.forEach((f, i) => {
      try {
        results.push(parseNmapContent(f.content, f.name));
      } catch (err) {
        errors.push(err.message || `« ${f.name} » : erreur de lecture`);
      }
      self.postMessage({ type: 'progress', done: i + 1, total: files.length, name: f.name });
    });
    const merged = mergeScanResults(results);
    self.postMessage({ type: 'done', result: { ...merged, warnings: [...merged.warnings, ...errors] } });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || String(err) });
  }
};
