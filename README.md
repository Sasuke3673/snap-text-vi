# Snap Text VI — copy chữ từ ảnh ngay trên Chrome/Edge

Kéo chọn một vùng bất kỳ trên màn hình (ảnh trong Zalo Web, Facebook, video, PDF…) hoặc chuột phải vào ảnh. Extension nhận dạng chữ tiếng Việt và **copy ngay vào clipboard**.

- Chạy **offline** bằng [Tesseract.js](https://github.com/naptha/tesseract.js), ảnh không bị gửi đi đâu cả.
- Đọc tốt tiếng Việt có dấu, đọc được cả chữ tiếng Anh và số.
- Tự đảo màu với giao diện nền tối (dark mode).

## Cài đặt

1. Tải repo này về (`git clone` hoặc **Code → Download ZIP** rồi giải nén).
2. Mở `chrome://extensions` (trên Edge là `edge://extensions`).
3. Bật **Developer mode** (Chế độ dành cho nhà phát triển).
4. Bấm **Load unpacked** và chọn thư mục **`extension`** trong repo.
5. Ghim icon extension lên thanh công cụ cho tiện.

Không cần cài Node.js. Thư viện OCR đã được đóng gói sẵn trong `extension/lib`.

## Cách dùng

| Cách | Thao tác |
|---|---|
| Chọn vùng | Bấm **Alt+Shift+C**, hoặc bấm icon extension, hoặc chuột phải → *Chọn vùng để copy chữ*. Sau đó kéo chuột quanh phần có chữ. Bấm **Esc** để huỷ. |
| Ảnh trên trang | Chuột phải vào ảnh → **Copy chữ trong ảnh này** |

Kết quả tự copy vào clipboard và hiện trong một khung nhỏ ở góc phải dưới. Bạn có thể sửa lại chữ rồi bấm **Copy** lần nữa. Khung tự ẩn sau vài giây, trừ khi bạn đưa chuột vào.

**Mẹo để đọc chính xác hơn:** mở ảnh ở chế độ xem phóng to rồi mới chọn vùng, và chỉ chọn phần có chữ. Với Facebook và Zalo, nên dùng cách *chọn vùng*: hai trang này hay phủ lớp khác lên ảnh nên chuột phải thường không nhận ra đó là ảnh.

Muốn đổi phím tắt: vào `chrome://extensions/shortcuts`.

## Giới hạn

- Chỉ chạy trên trình duyệt. Ứng dụng Zalo/Messenger cài trên máy tính không dùng được.
- Không chạy được trên trang hệ thống (`chrome://…`, Chrome Web Store).
- Chữ viết tay, ảnh chụp bị nghiêng hoặc mờ sẽ dễ sai, nhất là dấu hỏi/ngã (ví dụ "kiểm" thành "kiếm"). Hãy xem lại trong khung kết quả trước khi dán.

## Cấu trúc

```
extension/
  manifest.json    Manifest V3
  background.js    Service worker: menu chuột phải, phím tắt, chụp màn hình, tải ảnh
  content.js       Lớp phủ kéo chọn vùng + khung kết quả (Shadow DOM)
  offscreen.html/js  Cắt và xử lý ảnh, chạy Tesseract, ghi clipboard
  lib/             Tesseract.js + dữ liệu tiếng Việt (sinh bởi `npm run vendor`)
  icons/
scripts/vendor.mjs Copy thư viện từ node_modules vào extension/lib
```

## Cập nhật thư viện OCR (dành cho dev)

```bash
npm install        # tự chạy `npm run vendor` để copy lại vào extension/lib
```
