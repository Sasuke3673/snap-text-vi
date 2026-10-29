// Service worker: điều phối giữa trang web (content.js) và offscreen document (OCR + clipboard).

const OFFSCREEN_URL = 'offscreen.html';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'ocr-image',
      title: 'Copy chữ trong ảnh này',
      contexts: ['image'],
    });
    chrome.contextMenus.create({
      id: 'ocr-region',
      title: 'Chọn vùng để copy chữ',
      contexts: ['page', 'image', 'video', 'link', 'selection', 'frame'],
    });
  });
});

chrome.action.onClicked.addListener((tab) => startRegionSelect(tab));

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'start-capture') startRegionSelect(tab);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'ocr-region') startRegionSelect(tab);
  if (info.menuItemId === 'ocr-image') ocrImage(info, tab);
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.target === 'offscreen') return;
  if (msg.type === 'region-selected' && sender.tab) ocrRegion(sender.tab, msg);
  if (msg.type === 'copy') sendToOffscreen({ type: 'copy', text: msg.text });
});

// ---------- Luồng chọn vùng ----------

async function startRegionSelect(tab) {
  if (!tab?.id) return;
  if (!(await injectUi(tab.id))) return;
  chrome.tabs.sendMessage(tab.id, { type: 'start-select' });
}

async function ocrRegion(tab, { rect, viewport }) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    notify(tab.id, { type: 'busy' });
    const result = await sendToOffscreen({ type: 'ocr', dataUrl, rect, viewport });
    notify(tab.id, { type: 'result', ...result });
  } catch (err) {
    notify(tab.id, { type: 'error', message: errorText(err) });
  }
}

// ---------- Luồng chuột phải vào ảnh ----------

async function ocrImage(info, tab) {
  if (!tab?.id || !(await injectUi(tab.id))) return;
  notify(tab.id, { type: 'busy' });
  try {
    const dataUrl = await loadImage(info.srcUrl, tab.id, info.frameId);
    const result = await sendToOffscreen({ type: 'ocr', dataUrl });
    notify(tab.id, { type: 'result', ...result });
  } catch (err) {
    notify(tab.id, { type: 'error', message: errorText(err) });
  }
}

// Tải ảnh thành data URL. Ảnh http(s)/data: tải từ service worker (có host_permissions nên không bị CORS);
// ảnh blob: (hay gặp trên Zalo Web) chỉ đọc được từ bên trong trang.
async function loadImage(src, tabId, frameId) {
  if (!src.startsWith('blob:')) {
    try {
      const res = await fetch(src, { credentials: 'include' });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.type.startsWith('image/')) return await blobToDataUrl(blob);
      }
    } catch {
      // thử tiếp trong trang
    }
  }
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId ?? 0] },
    func: async (url) => {
      try {
        const blob = await (await fetch(url)).blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    },
    args: [src],
  });
  if (!result) throw new Error('IMAGE_UNREADABLE');
  return result;
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

// ---------- Tiện ích ----------

async function injectUi(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return true;
  } catch {
    // Trang hệ thống (chrome://, Chrome Web Store, trang PDF...) không cho chèn script.
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#d93025' });
    chrome.action.setBadgeText({ tabId, text: '!' });
    chrome.action.setTitle({ tabId, title: 'Không dùng được trên trang này' });
    setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }), 3000);
    return false;
  }
}

function notify(tabId, msg) {
  chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}

let creatingOffscreen;
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  creatingOffscreen ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_URL,
      reasons: ['WORKERS', 'CLIPBOARD'],
      justification: 'Chạy Tesseract OCR trong Web Worker và ghi kết quả vào clipboard.',
    })
    .finally(() => (creatingOffscreen = null));
  await creatingOffscreen;
}

async function sendToOffscreen(msg) {
  await ensureOffscreen();
  const res = await chrome.runtime.sendMessage({ target: 'offscreen', ...msg });
  if (res?.error) throw new Error(res.error);
  return res;
}

function errorText(err) {
  const msg = String(err?.message || err);
  if (msg === 'IMAGE_UNREADABLE') {
    return 'Không đọc được ảnh này. Hãy mở ảnh to ra rồi dùng "Chọn vùng" (Alt+Shift+C).';
  }
  if (msg.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')) {
    return 'Thao tác hơi nhanh, bạn thử lại sau 1 giây nhé.';
  }
  return 'Có lỗi khi nhận dạng chữ: ' + msg;
}
