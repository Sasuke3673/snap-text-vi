// Đưa runtime + model OCR vào extension/. Manifest V3 cấm tải code từ xa nên mọi thứ phải nằm sẵn trong extension.
//  - onnxruntime-web: copy từ node_modules
//  - model ONNX: tải từ Hugging Face theo revision cố định và kiểm tra SHA-256
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ext = join(root, 'extension');

const runtime = ['ort.wasm.min.js', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'];

const models = [
  {
    // PP-OCRv5 mobile text detection (PaddleOCR, Apache-2.0)
    file: 'ppocrv5_mobile_det.onnx',
    url: 'https://huggingface.co/snowfluke/ppu-paddle-ocr-models/resolve/bf1d5edb0335d3262be7caf13f766ba274b4cadd/detection/PP-OCRv5_mobile_det_infer.onnx',
    sha256: 'd7fe3ea74652890722c0f4d02458b7261d9f5ae6c92904d05707c9eb155c7924',
  },
  {
    // VieSVTR v7 Vietnamese text-line recognition (CC BY-NC 4.0)
    file: 'viesvtr_v7.onnx',
    url: 'https://huggingface.co/ngocthua830/viesvtr/resolve/61bcfb92a1010a01b8d7ed59961419667abe655f/weights/viesvtr_v7.onnx',
    sha256: 'da8dc9cac938472d97373e7eb88768e7e4e98300c4c4687c3766fbcb29d36b5e',
  },
];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

mkdirSync(join(ext, 'lib'), { recursive: true });
for (const f of runtime) {
  cpSync(join(root, 'node_modules', 'onnxruntime-web', 'dist', f), join(ext, 'lib', f));
  console.log('copied lib/' + f);
}

mkdirSync(join(ext, 'models'), { recursive: true });
for (const m of models) {
  const dest = join(ext, 'models', m.file);
  if (existsSync(dest) && sha256(readFileSync(dest)) === m.sha256) {
    console.log('ok     models/' + m.file);
    continue;
  }
  const res = await fetch(m.url);
  if (!res.ok) throw new Error(`Tải ${m.file} thất bại: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha256(buf) !== m.sha256) throw new Error(`${m.file}: SHA-256 không khớp`);
  writeFileSync(dest, buf);
  console.log('fetched models/' + m.file);
}
