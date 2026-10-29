// OCR 2 bước: PP-OCRv5 mobile det (tìm dòng chữ) + VieSVTR (đọc từng dòng tiếng Việt).
// Ảnh vào: { data: RGBA Uint8ClampedArray, width, height }. Dùng được cả trong Node (test) lẫn trình duyệt.
(function (root) {
  const DET_MEAN = [0.485, 0.456, 0.406];
  const DET_STD = [0.229, 0.224, 0.225];
  const DET_THRESH = 0.3;
  const DET_BOX_THRESH = 0.6;
  const DET_UNCLIP = 1.6;
  const DET_MIN_SIDE = 64;
  const DET_MAX_SIDE = 2048;

  const REC_HEIGHT = 64, REC_STRIDE = 4, REC_MIN_W = 32, REC_MAX_W = 1600;
  const REC_VOCAB = [...(
    'aAàÀảẢãÃáÁạẠăĂằẰẳẲẵẴắẮặẶâÂầẦẩẨẫẪấẤậẬbBcCdDđĐeEèÈẻẺẽẼéÉẹẸêÊềỀểỂễỄếẾệỆ' +
    'fFgGhHiIìÌỉỈĩĨíÍịỊjJkKlLmMnNoOòÒỏỎõÕóÓọỌôÔồỒổỔỗỖốỐộỘơƠờỜởỞỡỠớỚợỢpPqQrR' +
    'sStTuUùÙủỦũŨúÚụỤưƯừỪửỬữỮứỨựỰvVwWxXyYỳỲỷỶỹỸýÝỵỴzZ0123456789' +
    '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~ '
  )];

  // Lấy mẫu song tuyến tính vùng (sx, sy, sw, sh) của ảnh RGBA về kích thước dw x dh.
  function sample(img, sx, sy, sw, sh, dw, dh, fn) {
    const { data, width, height } = img;
    const fx = sw / dw, fy = sh / dh;
    for (let y = 0; y < dh; y++) {
      const syf = Math.min(height - 1, Math.max(0, sy + (y + 0.5) * fy - 0.5));
      const y0 = Math.floor(syf), y1 = Math.min(height - 1, y0 + 1), wy = syf - y0;
      for (let x = 0; x < dw; x++) {
        const sxf = Math.min(width - 1, Math.max(0, sx + (x + 0.5) * fx - 0.5));
        const x0 = Math.floor(sxf), x1 = Math.min(width - 1, x0 + 1), wx = sxf - x0;
        const a = (y0 * width + x0) * 4, b = (y0 * width + x1) * 4;
        const c = (y1 * width + x0) * 4, d = (y1 * width + x1) * 4;
        for (let ch = 0; ch < 3; ch++) {
          const top = data[a + ch] * (1 - wx) + data[b + ch] * wx;
          const bot = data[c + ch] * (1 - wx) + data[d + ch] * wx;
          fn(x, y, ch, top * (1 - wy) + bot * wy);
        }
      }
    }
  }

  // Thêm viền cùng màu nền quanh ảnh: vùng chọn sát chữ thì bộ dò hay bỏ sót.
  function pad(img, p) {
    const { data, width, height } = img;
    let r = 0, g = 0, b = 0, n = 0;
    for (let x = 0; x < width; x++) for (const y of [0, height - 1]) {
      const i = (y * width + x) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    for (let y = 0; y < height; y++) for (const x of [0, width - 1]) {
      const i = (y * width + x) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    const W = width + 2 * p, H = height + 2 * p;
    const out = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      out[i * 4] = r / n; out[i * 4 + 1] = g / n; out[i * 4 + 2] = b / n; out[i * 4 + 3] = 255;
    }
    for (let y = 0; y < height; y++) {
      out.set(data.subarray(y * width * 4, (y + 1) * width * 4), ((y + p) * W + p) * 4);
    }
    return { data: out, width: W, height: H };
  }

  async function detect(ort, session, img) {
    let scale = 1;
    const minSide = Math.min(img.width, img.height), maxSide = Math.max(img.width, img.height);
    if (minSide < DET_MIN_SIDE) scale = DET_MIN_SIDE / minSide;
    if (maxSide * scale > DET_MAX_SIDE) scale = DET_MAX_SIDE / maxSide;
    const W = Math.max(32, Math.round((img.width * scale) / 32) * 32);
    const H = Math.max(32, Math.round((img.height * scale) / 32) * 32);

    // Paddle chuẩn hoá theo thứ tự kênh BGR.
    const input = new Float32Array(3 * W * H);
    sample(img, 0, 0, img.width, img.height, W, H, (x, y, ch, v) => {
      const c = 2 - ch;
      input[c * W * H + y * W + x] = (v / 255 - DET_MEAN[c]) / DET_STD[c];
    });
    const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, H, W]) });
    const prob = out[session.outputNames[0]].data;

    // Gom các điểm ảnh > ngưỡng thành từng cụm (mỗi cụm ~ một dòng/cụm chữ).
    const seen = new Uint8Array(W * H);
    const stack = new Int32Array(W * H);
    const boxes = [];
    for (let start = 0; start < W * H; start++) {
      if (seen[start] || prob[start] <= DET_THRESH) continue;
      let sp = 0, x0 = W, y0 = H, x1 = 0, y1 = 0, sum = 0, n = 0;
      stack[sp++] = start; seen[start] = 1;
      while (sp) {
        const i = stack[--sp], x = i % W, y = (i / W) | 0;
        sum += prob[i]; n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (!seen[j] && prob[j] > DET_THRESH) { seen[j] = 1; stack[sp++] = j; }
        }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (Math.min(bw, bh) < 3 || sum / n < DET_BOX_THRESH) continue;
      // "unclip": bản đồ xác suất co nhỏ hơn chữ thật, nới ra theo tỉ lệ diện tích/chu vi.
      const d = (bw * bh * DET_UNCLIP) / (2 * (bw + bh));
      const sx = img.width / W, sy = img.height / H;
      boxes.push({
        x0: Math.max(0, (x0 - d) * sx), y0: Math.max(0, (y0 - d) * sy),
        x1: Math.min(img.width, (x1 + 1 + d) * sx), y1: Math.min(img.height, (y1 + 1 + d) * sy),
      });
    }
    return boxes;
  }

  async function recognize(ort, session, img, box) {
    const sw = box.x1 - box.x0, sh = box.y1 - box.y0;
    let w = Math.ceil((REC_HEIGHT * sw) / sh);
    w = Math.max(REC_MIN_W, Math.min(REC_MAX_W, Math.ceil(w / REC_STRIDE) * REC_STRIDE));
    const input = new Float32Array(3 * w * REC_HEIGHT);
    const plane = w * REC_HEIGHT;
    sample(img, box.x0, box.y0, sw, sh, w, REC_HEIGHT, (x, y, ch, v) => {
      input[ch * plane + y * w + x] = (v / 255 - 0.5) / 0.5;
    });
    const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, REC_HEIGHT, w]) });
    const logits = out[session.outputNames[0]];
    const [, T, V] = logits.dims;
    let text = '', prev = 0, confSum = 0, confN = 0;
    for (let t = 0; t < T; t++) {
      const row = logits.data.subarray(t * V, (t + 1) * V);
      let best = 0, max = -Infinity;
      for (let k = 0; k < V; k++) if (row[k] > max) { max = row[k]; best = k; }
      if (best !== 0) {
        let z = 0;
        for (let k = 0; k < V; k++) z += Math.exp(row[k] - max);
        confSum += 1 / z; confN++;
        if (best !== prev) text += REC_VOCAB[best - 1] ?? '';
      }
      prev = best;
    }
    return { text: text.trim(), conf: confN ? confSum / confN : 0 };
  }

  // Xếp các khung theo dòng (trên xuống), trong dòng theo trái sang phải.
  function toLines(items) {
    items.sort((a, b) => (a.box.y0 + a.box.y1) - (b.box.y0 + b.box.y1));
    const lines = [];
    for (const it of items) {
      const cy = (it.box.y0 + it.box.y1) / 2;
      const line = lines.find((l) => cy > l.y0 && cy < l.y1);
      if (line) {
        line.items.push(it);
        line.y0 = Math.min(line.y0, it.box.y0); line.y1 = Math.max(line.y1, it.box.y1);
      } else {
        lines.push({ y0: it.box.y0, y1: it.box.y1, items: [it] });
      }
    }
    return lines
      .map((l) => l.items.sort((a, b) => a.box.x0 - b.box.x0).map((i) => i.text).join(' '))
      .join('\n');
  }

  async function ocr(ort, { det, rec }, img) {
    const p = Math.round(Math.max(8, Math.min(img.width, img.height) * 0.1));
    const padded = pad(img, p);
    const boxes = await detect(ort, det, padded);
    const items = [];
    for (const box of boxes) {
      const r = await recognize(ort, rec, padded, box);
      if (r.text && r.conf > 0.4) items.push({ box, ...r });
    }
    return { text: toLines(items), lines: items.length };
  }

  root.SnapOcr = { ocr, detect, recognize };
})(typeof self !== 'undefined' ? self : globalThis);
