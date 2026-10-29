// Giao diện trên trang: lớp phủ kéo chọn vùng và khung kết quả.
// Mọi thứ nằm trong Shadow DOM để CSS của Facebook/Zalo không ảnh hưởng (và ngược lại).
(() => {
  if (window.__ocrCopyLoaded) return;
  window.__ocrCopyLoaded = true;

  const AUTO_HIDE_MS = 7000;

  const host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: system-ui, "Segoe UI", Roboto, Arial, sans-serif; }
      .overlay { position: fixed; inset: 0; cursor: crosshair; pointer-events: auto; background: rgba(0,0,0,.25); }
      .overlay.dragging { background: transparent; }
      .box { position: fixed; display: none; border: 2px solid #1a73e8; box-shadow: 0 0 0 100vmax rgba(0,0,0,.35); }
      .hint { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); padding: 8px 14px; border-radius: 8px;
              background: #202124; color: #fff; font-size: 14px; white-space: nowrap; }
      .panel { position: fixed; right: 16px; bottom: 16px; width: min(420px, calc(100vw - 32px)); pointer-events: auto;
               background: #fff; color: #202124; border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,.28);
               padding: 12px; font-size: 14px; }
      .head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-weight: 600; }
      .head .status { flex: 1; }
      .ok { color: #188038; } .err { color: #d93025; }
      textarea { width: 100%; min-height: 96px; max-height: 50vh; resize: vertical; padding: 8px; border: 1px solid #dadce0;
                 border-radius: 8px; font-size: 14px; line-height: 1.45; color: #202124; background: #fff; }
      textarea:focus { outline: 2px solid #1a73e8; border-color: transparent; }
      .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
      button { border: 0; border-radius: 8px; padding: 7px 14px; font-size: 14px; cursor: pointer; background: #f1f3f4; color: #202124; }
      button.primary { background: #1a73e8; color: #fff; }
      button:hover { filter: brightness(.95); }
      .x { background: none; padding: 2px 6px; font-size: 18px; line-height: 1; color: #5f6368; }
      .spinner { width: 16px; height: 16px; border: 2px solid #dadce0; border-top-color: #1a73e8; border-radius: 50%;
                 animation: spin .8s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @media (prefers-color-scheme: dark) {
        .panel { background: #292a2d; color: #e8eaed; }
        textarea { background: #202124; color: #e8eaed; border-color: #5f6368; }
        button { background: #3c4043; color: #e8eaed; }
        .x { color: #9aa0a6; }
        .ok { color: #81c995; } .err { color: #f28b82; }
      }
    </style>`;

  let overlay = null;
  let panel = null;
  let hideTimer = null;

  function mount() {
    if (!host.isConnected) document.documentElement.appendChild(host);
  }

  // ---------- Kéo chọn vùng ----------

  function startSelect() {
    closePanel();
    if (overlay) return;
    mount();
    overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `<div class="hint">Kéo chuột để chọn vùng có chữ · Esc để huỷ</div><div class="box"></div>`;
    root.appendChild(overlay);
    const box = overlay.querySelector('.box');
    let start = null;

    overlay.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      overlay.setPointerCapture(e.pointerId);
      start = { x: e.clientX, y: e.clientY };
      overlay.classList.add('dragging');
      overlay.querySelector('.hint').style.display = 'none';
      Object.assign(box.style, { display: 'block', left: start.x + 'px', top: start.y + 'px', width: '0', height: '0' });
    });
    overlay.addEventListener('pointermove', (e) => {
      if (!start) return;
      const r = rectFrom(start, e);
      Object.assign(box.style, { left: r.x + 'px', top: r.y + 'px', width: r.width + 'px', height: r.height + 'px' });
    });
    overlay.addEventListener('pointerup', (e) => {
      if (!start) return;
      const rect = rectFrom(start, e);
      stopSelect();
      if (rect.width < 6 || rect.height < 6) return;
      // Đợi lớp phủ biến mất khỏi màn hình rồi mới chụp.
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
        chrome.runtime.sendMessage({
          type: 'region-selected',
          rect,
          viewport: { width: window.innerWidth, height: window.innerHeight },
        });
      }, 30)));
    });
    overlay.addEventListener('contextmenu', (e) => { e.preventDefault(); stopSelect(); });
    window.addEventListener('keydown', onKey, true);
  }

  function rectFrom(a, e) {
    return {
      x: Math.min(a.x, e.clientX),
      y: Math.min(a.y, e.clientY),
      width: Math.abs(e.clientX - a.x),
      height: Math.abs(e.clientY - a.y),
    };
  }

  function stopSelect() {
    overlay?.remove();
    overlay = null;
    if (!panel) window.removeEventListener('keydown', onKey, true);
  }

  function onKey(e) {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    e.preventDefault();
    if (overlay) stopSelect();
    else closePanel();
  }

  // ---------- Khung kết quả ----------

  function showPanel(html) {
    mount();
    clearTimeout(hideTimer);
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'panel';
      root.appendChild(panel);
      // Người dùng đang xem/sửa thì không tự ẩn.
      panel.addEventListener('pointerenter', () => clearTimeout(hideTimer));
      panel.addEventListener('focusin', () => clearTimeout(hideTimer));
      window.addEventListener('keydown', onKey, true);
    }
    panel.innerHTML = html;
    panel.querySelector('.x')?.addEventListener('click', closePanel);
  }

  function closePanel() {
    clearTimeout(hideTimer);
    panel?.remove();
    panel = null;
    if (!overlay) window.removeEventListener('keydown', onKey, true);
  }

  function autoHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(closePanel, AUTO_HIDE_MS);
  }

  const closeBtn = `<button class="x" title="Đóng (Esc)">×</button>`;

  function showBusy() {
    showPanel(`<div class="head"><div class="spinner"></div><span class="status">Đang nhận dạng chữ…</span>${closeBtn}</div>`);
  }

  function showResult({ text, copied }) {
    if (!text) {
      showError('Không tìm thấy chữ trong vùng này. Thử phóng to ảnh rồi chọn lại nhé.');
      return;
    }
    const status = copied
      ? `<span class="status ok">✓ Đã copy vào clipboard</span>`
      : `<span class="status">Kết quả nhận dạng</span>`;
    showPanel(`
      <div class="head">${status}${closeBtn}</div>
      <textarea spellcheck="false"></textarea>
      <div class="actions"><button class="primary copy">Copy</button></div>`);
    const area = panel.querySelector('textarea');
    area.value = text;
    panel.querySelector('.copy').addEventListener('click', async () => {
      const value = area.value;
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        chrome.runtime.sendMessage({ type: 'copy', text: value });
      }
      panel.querySelector('.status').outerHTML = `<span class="status ok">✓ Đã copy vào clipboard</span>`;
    });
    autoHide();
  }

  function showError(message) {
    showPanel(`<div class="head"><span class="status err"></span>${closeBtn}</div>`);
    panel.querySelector('.status').textContent = message;
    autoHide();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'start-select') startSelect();
    if (msg.type === 'busy') showBusy();
    if (msg.type === 'result') showResult(msg);
    if (msg.type === 'error') showError(msg.message);
  });
})();
