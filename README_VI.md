# Tài chính cá nhân offline – v4.6 (Android PWA)

## Cài trên Android (mượt, như app)
1. Đưa code lên GitHub Pages (HTTPS bắt buộc).
2. Mở bằng **Chrome** trên điện thoại.
3. Menu (⋮) → **Cài đặt ứng dụng** / **Add to Home screen**.
4. Mở icon trên màn hình chính (chạy standalone, không thanh địa chỉ).

## Vân tay / Face ID trên Android
1. App **phải** chạy bằng HTTPS (GitHub Pages) hoặc localhost — không dùng file://.
2. Mở khóa bằng PIN lần đầu.
3. Vào **Sao lưu - Cài đặt** → **Đăng ký vân tay / Face ID** → xác nhận vân tay khi hệ thống hỏi.
4. Khóa app → lần sau bấm **Mở bằng vân tay / Face ID**.

Nếu đăng ký thất bại:
- Kiểm tra Chrome đã cập nhật.
- Đảm bảo máy có vân tay và đã thêm vân tay trong Cài đặt hệ thống.
- Origin (địa chỉ web) không đổi giữa lúc đăng ký và lúc mở.

## Tối ưu mượt
- Render danh sách gộp theo frame (requestAnimationFrame)
- Phân trang 50 giao dịch, debounce tìm kiếm
- CSS contain + content-visibility cho list dài
- Touch manipulation, không delay click

## Google Drive
Sao lưu thủ công, ghi đè `TaiChinhCaNhan_latest.pfbackup`. Cần OAuth Client ID + bật Drive API.
