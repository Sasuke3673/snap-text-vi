// Copy Tesseract.js runtime + language data from node_modules into extension/lib.
// Manifest V3 forbids loading remote code, so everything must ship inside the extension.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const lib = join(root, 'extension', 'lib');

const files = [
  ['tesseract.js/dist/tesseract.min.js', 'tesseract.min.js'],
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  // LSTM-only builds (default OEM). The .wasm.js variants embed the wasm binary.
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm.js'],
  ['@tesseract.js-data/vie/4.0.0_best_int/vie.traineddata.gz', 'lang/vie.traineddata.gz'],
];

rmSync(lib, { recursive: true, force: true });
for (const [from, to] of files) {
  const dest = join(lib, to);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(nm, from), dest);
  console.log('copied', to);
}
