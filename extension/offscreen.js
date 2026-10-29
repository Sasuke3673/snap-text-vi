// Offscreen document: cắt/xử lý ảnh, chạy Tesseract OCR và ghi vào clipboard.

// Chỉ dùng 'vie': mô hình tiếng Việt vẫn đọc tốt chữ tiếng Anh, còn ghép thêm 'eng'
// lại hay làm mất dấu ("đồng" -> "dong").
const LANGS = ['vie'];
const IDLE_MS = 3 * 60 * 1000; // giải phóng bộ nhớ worker sau 3 phút không dùng

let workerPromise = null;
let idleTimer = null;

function getWorker() {
  workerPromise ??= Tesseract.createWorker(LANGS, 1 /* OEM.LSTM_ONLY */, {
    workerPath: chrome.runtime.getURL('lib/worker.min.js'),
    corePath: chrome.runtime.getURL('lib/core'),
    langPath: chrome.runtime.getURL('lib/lang'),
    workerBlobURL: false,
    cacheMethod: 'none',
  }).then(async (worker) => {
    await worker.setParameters({ preserve_interword_spaces: '1' });
    return worker;
  });
  workerPromise.catch(() => (workerPromise = null));
  return workerPromise;
}

function scheduleIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    const pending = workerPromise;
    workerPromise = null;
    (await pending)?.terminate();
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
    const canvas = await prepareImage(dataUrl, rect, viewport);
    const worker = await getWorker();
    const { data } = await worker.recognize(canvas);
    const text = cleanText(data.text);
    return { text, copied: text ? copyText(text) : false };
  } finally {
    scheduleIdle();
  }
}

// Cắt đúng vùng đã chọn, phóng to chữ nhỏ, chuyển ảnh xám và đảo màu nếu nền tối
// (chế độ tối của Zalo/Facebook) — Tesseract đọc chữ đen trên nền sáng tốt nhất.
async function prepareImage(dataUrl, rect, viewport) {
  // Không dùng img.decode(): offscreen document không được vẽ ra màn hình nên decode() treo mãi.
  const img = await createImageBitmap(await (await fetch(dataUrl)).blob());

  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  let pixelRatio = 1; // số pixel ảnh chụp trên 1 pixel CSS (màn hình 4K/scale 200% thì = 2)
  if (rect && viewport) {
    pixelRatio = img.width / viewport.width;
    sx = Math.max(0, Math.round(rect.x * pixelRatio));
    sy = Math.max(0, Math.round(rect.y * pixelRatio));
    sw = Math.min(img.width - sx, Math.round(rect.width * pixelRatio));
    sh = Math.min(img.height - sy, Math.round(rect.height * pixelRatio));
  }
  if (sw < 2 || sh < 2) throw new Error('Vùng chọn quá nhỏ');

  // Chữ trên màn hình thường chỉ cao 12–16px; phóng lên ~2 lần giúp đọc dấu tiếng Việt chính xác hơn.
  // Màn hình độ phân giải cao đã cho ảnh to sẵn nên phóng ít hơn.
  const MAX_SIDE = 4000;
  let zoom = Math.max(sw, sh) < 1600 ? Math.max(1, 2 / pixelRatio) : 1;
  zoom = Math.min(zoom, MAX_SIDE / Math.max(sw, sh));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * zoom);
  canvas.height = Math.round(sh * zoom);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff'; // ảnh PNG trong suốt -> nền trắng
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  img.close();

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = pixels.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = y;
    sum += y;
  }
  if (sum / (d.length / 4) < 110) {
    for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 255 - d[i];
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

function cleanText(text) {
  return text
    .normalize('NFC')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
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
