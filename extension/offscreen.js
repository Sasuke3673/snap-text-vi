// Offscreen document: cắt ảnh, chạy OCR (ocr-engine.js trên onnxruntime-web) và ghi vào clipboard.

const IDLE_MS = 3 * 60 * 1000; // giải phóng bộ nhớ model sau 3 phút không dùng

let enginePromise = null;
let idleTimer = null;

function getEngine() {
  enginePromise ??= (async () => {
    ort.env.wasm.wasmPaths = chrome.runtime.getURL('lib/');
    // Đa luồng cần crossOriginIsolated, trang extension không có nên chạy 1 luồng.
    ort.env.wasm.numThreads = 1;
    const opts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
    const [det, rec] = await Promise.all([
      ort.InferenceSession.create(chrome.runtime.getURL('models/ppocrv5_mobile_det.onnx'), opts),
      ort.InferenceSession.create(chrome.runtime.getURL('models/viesvtr_v7.onnx'), opts),
    ]);
    return { det, rec };
  })();
  enginePromise.catch(() => (enginePromise = null));
  return enginePromise;
}

function scheduleIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    const pending = enginePromise;
    enginePromise = null;
    const engine = await pending?.catch(() => null);
    engine?.det.release();
    engine?.rec.release();
  }, IDLE_MS);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== 'offscreen') return;
  if (msg.type === 'ocr') {
    recognize(msg)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: String(err?.message || err) }));
    return true;
  }
  if (msg.type === 'copy') {
    sendResponse({ copied: copyText(msg.text) });
  }
});

async function recognize({ dataUrl, rect, viewport }) {
  clearTimeout(idleTimer);
  try {
    const [image, engine] = await Promise.all([loadImage(dataUrl, rect, viewport), getEngine()]);
    const { text: raw } = await SnapOcr.ocr(ort, engine, image);
    const text = cleanText(raw);
    return { text, copied: text ? copyText(text) : false };
  } finally {
    scheduleIdle();
  }
}

// Giải mã ảnh và cắt đúng vùng đã chọn (toạ độ CSS -> pixel ảnh chụp).
async function loadImage(dataUrl, rect, viewport) {
  // Không dùng img.decode(): offscreen document không được vẽ ra màn hình nên decode() treo mãi.
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());

  let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
  if (rect && viewport) {
    const pixelRatio = bitmap.width / viewport.width;
    sx = Math.max(0, Math.round(rect.x * pixelRatio));
    sy = Math.max(0, Math.round(rect.y * pixelRatio));
    sw = Math.min(bitmap.width - sx, Math.round(rect.width * pixelRatio));
    sh = Math.min(bitmap.height - sy, Math.round(rect.height * pixelRatio));
  }
  if (sw < 2 || sh < 2) throw new Error('Vùng chọn quá nhỏ');

  const canvas = new OffscreenCanvas(sw, sh);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; // ảnh PNG trong suốt -> nền trắng
  ctx.fillRect(0, 0, sw, sh);
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  bitmap.close();
  return ctx.getImageData(0, 0, sw, sh);
}

function cleanText(text) {
  return text
    .normalize('NFC')
    .replace(/[ \t]+/g, ' ')
    .replace(/ $/gm, '')
    .trim();
}

function copyText(text) {
  const el = document.getElementById('clipboard');
  el.value = text;
  el.select();
  const ok = document.execCommand('copy');
  el.value = '';
  return ok;
}
