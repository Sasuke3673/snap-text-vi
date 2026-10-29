# Snap Text VI — copy chữ từ ảnh ngay trên Chrome/Edge

Kéo chọn một vùng bất kỳ trên màn hình (ảnh trong Zalo Web, Facebook, video, PDF…) hoặc chuột phải vào ảnh. Extension nhận dạng chữ tiếng Việt và **copy ngay vào clipboard**.

- Chạy **offline**: model AI chạy ngay trong trình duyệt, ảnh không bị gửi đi đâu cả.
- Đọc tốt tiếng Việt có dấu, chữ tiếng Anh và số, kể cả chữ trong ảnh chụp ngoài đời (biển hiệu, biển số, logo…).
- Đọc được giao diện nền tối (dark mode).

## Cài đặt

1. Tải repo này về (`git clone` hoặc **Code → Download ZIP** rồi giải nén).
2. Mở `chrome://extensions` (trên Edge là `edge://extensions`).
3. Bật **Developer mode** (Chế độ dành cho nhà phát triển).
4. Bấm **Load unpacked** và chọn thư mục **`extension`** trong repo.
5. Ghim icon extension lên thanh công cụ cho tiện.

Không cần cài Node.js. Runtime và model OCR đã được đóng gói sẵn trong `extension/lib` và `extension/models` (khoảng 45 MB).

## Cách dùng

| Cách | Thao tác |
|---|---|
| Chọn vùng | Bấm **Alt+Shift+C**, hoặc bấm icon extension, hoặc chuột phải → *Chọn vùng để copy chữ*. Sau đó kéo chuột quanh phần có chữ. Bấm **Esc** để huỷ. |
| Ảnh trên trang | Chuột phải vào ảnh → **Copy chữ trong ảnh này** |

Kết quả tự copy vào clipboard và hiện trong một khung nhỏ ở góc phải dưới. Bạn có thể sửa lại chữ rồi bấm **Copy** lần nữa. Khung tự ẩn sau vài giây, trừ khi bạn đưa chuột vào.

Lần đầu dùng sau khi mở trình duyệt sẽ mất vài giây để nạp model. Các lần sau thường dưới 1–2 giây.

**Mẹo:** với Facebook và Zalo, nên dùng cách *chọn vùng*. Hai trang này hay phủ lớp khác lên ảnh nên chuột phải thường không nhận ra đó là ảnh.

Muốn đổi phím tắt: vào `chrome://extensions/shortcuts`.

## Giới hạn

- Chỉ chạy trên trình duyệt. Ứng dụng Zalo/Messenger cài trên máy tính không dùng được.
- Không chạy được trên trang hệ thống (`chrome://…`, Chrome Web Store).
- Chưa đọc được chữ dọc, chữ xoay nghiêng nhiều hoặc chữ uốn cong. Chữ viết tay dễ sai.
- Thỉnh thoảng vẫn nhầm dấu (ví dụ "kiểm" thành "kiễm"). Hãy xem lại trong khung kết quả trước khi dán.

## Giấy phép và nguồn model

> ⚠️ **Chỉ dùng cho mục đích phi thương mại.** Model nhận dạng chữ VieSVTR được phát hành theo giấy phép **CC BY-NC 4.0**, không cho phép dùng vào mục đích thương mại.

| Thành phần | Nguồn | Giấy phép |
|---|---|---|
| Dò vị trí dòng chữ: PP-OCRv5 mobile det | [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR), bản ONNX từ [snowfluke/ppu-paddle-ocr-models](https://huggingface.co/snowfluke/ppu-paddle-ocr-models) | Apache-2.0 |
| Nhận dạng chữ tiếng Việt: VieSVTR v7 | [ngocthua830/viesvtr](https://huggingface.co/ngocthua830/viesvtr) | [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) |
| Runtime: onnxruntime-web 1.22.0 | [Microsoft ONNX Runtime](https://github.com/microsoft/onnxruntime) | MIT |

Mã nguồn của extension (thư mục `extension/` trừ `lib/` và `models/`, cùng `scripts/`) do repo này viết.

## Cấu trúc

```
extension/
  manifest.json      Manifest V3
  background.js      Service worker: menu chuột phải, phím tắt, chụp màn hình, tải ảnh
  content.js         Lớp phủ kéo chọn vùng + khung kết quả (Shadow DOM)
  offscreen.html/js  Cắt ảnh, chạy OCR, ghi clipboard
  ocr-engine.js      Pipeline OCR: dò dòng chữ (PP-OCRv5) -> đọc từng dòng (VieSVTR)
  lib/               onnxruntime-web (sinh bởi `npm run vendor`)
  models/            Model ONNX (sinh bởi `npm run vendor`)
  icons/
scripts/vendor.mjs   Copy runtime từ node_modules, tải model theo phiên bản cố định và kiểm tra SHA-256
```

## Cập nhật runtime/model (dành cho dev)

```bash
npm install        # tự chạy `npm run vendor`
```
