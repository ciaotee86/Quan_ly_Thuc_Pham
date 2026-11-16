# Giao Diện Dự Kiến (`Quan_ly_Thuc_Pham/giaodiendukien`)

Thư mục này chứa **toàn bộ giao diện dự kiến** của hệ thống Quản lý Thực phẩm Gia đình & Gợi ý FEFO (mô hình Client–Server), bao gồm cả **mã nguồn ứng dụng chạy thực tế (UI Prototype)** và **hồ sơ tài liệu phân tích, đặc tả, bản vẽ khung (Wireframes)**.

---

## ⚡ Hướng dẫn cho người mới Clone về máy (Khắc phục lỗi `ERR_CONNECTION_REFUSED`)

Nếu bạn hoặc bạn bè vừa tải/clone dự án từ GitHub về máy và mở trình duyệt thấy báo:
> `This site can't be reached - localhost refused to connect (ERR_CONNECTION_REFUSED)`

Đó là vì **Git không lưu thư mục `node_modules`**, máy mới clone về chưa có thư viện và chưa bật server cục bộ. Hãy làm 3 bước sau:

1. **Bước 1**: Đảm bảo máy tính đã cài đặt **Node.js** (nếu chưa có, tải bản LTS tại [nodejs.org](https://nodejs.org/)).
2. **Bước 2**: Nhấp đúp vào file **`0_CAI_DAT_LAN_DAU (RUN_FIRST).bat`** (hoặc mở terminal tại thư mục này gõ `npm install`) để tải thư viện về máy (chỉ cần làm 1 lần duy nhất).
3. **Bước 3**: Nhấp đúp vào **`1_MO_GIAO_DIEN_DESKTOP_SERVER.bat`** hoặc **`2_MO_GIAO_DIEN_MOBILE_CLIENT.bat`** để chạy giao diện.
   *(Lưu ý: Giữ nguyên cửa sổ đen cmd đang chạy, đừng tắt đi thì trình duyệt mới kết nối được).*

---

## 1. Cách mở và xem giao diện nhanh nhất (1 Click)

Chỉ cần **nhấp đúp chuột (Double Click)** vào các file `.bat` trong thư mục này:

- 🖥️ **`1_MO_GIAO_DIEN_DESKTOP_SERVER.bat`**: Tự động bật máy chủ và mở trình duyệt ứng dụng **Desktop Server** tại `http://localhost:5173`.
- 📱 **`2_MO_GIAO_DIEN_MOBILE_CLIENT.bat`**: Tự động bật máy chủ và mở trình duyệt ứng dụng **Mobile Client** tại `http://localhost:5174` *(Bấm F12 để chọn kích thước điện thoại 390×844)*.
- 🚀 **`3_MO_CA_HAI_GIAO_DIEN.bat`**: Mở song song cả 2 ứng dụng để thử nghiệm tương tác Client–Server.

Hoặc chạy lệnh từ terminal tại thư mục này:
```powershell
npm run dev:desktop  # Chạy Desktop Server (cổng 5173)
npm run dev:mobile   # Chạy Mobile Client (cổng 5174)
npm test             # Chạy kiểm thử tự động
```

---

## 2. Cấu trúc thư mục

```text
giaodiendukien/
├── 0_CAI_DAT_LAN_DAU (RUN_FIRST).bat       # File cài đặt thư viện tự động lần đầu
├── 1_MO_GIAO_DIEN_DESKTOP_SERVER.bat      # File chạy nhanh Desktop Server
├── 2_MO_GIAO_DIEN_MOBILE_CLIENT.bat       # File chạy nhanh Mobile Client
├── 3_MO_CA_HAI_GIAO_DIEN.bat              # File chạy nhanh cả 2 ứng dụng
├── README.md                              # Hướng dẫn tổng quan này
├── package.json                           # Cấu hình npm workspaces
├── package-lock.json
├── tsconfig.base.json                     # Cấu hình TypeScript
├── vitest.config.ts                       # Cấu hình test Vitest
├── CHANGELOG.md                           # Nhật ký thay đổi phiên bản
│
├── desktop-server/                        # Mã nguồn ứng dụng Desktop Server (Vite + React)
├── mobile-client/                         # Mã nguồn ứng dụng Mobile Client (Vite + React)
├── shared-sim/                            # Lõi dữ liệu, thuật toán FEFO và mô phỏng Client–Server
├── tests/                                 # Bộ kiểm thử tự động Vitest & Playwright E2E
│
├── Thiet_ke_cau_truc_giao_dien_du_kien.md # Tài liệu đặc tả 27 màn hình & luồng nghiệp vụ
├── specs/                                 # Hồ sơ đặc tả Spec-Driven Development (Spec Kit)
│   └── 001-ui-prototype/
│       ├── spec.md                        # Đặc tả chức năng phân rã 3 cấp (87 chức năng)
│       ├── plan.md                        # Kế hoạch kiến trúc, 3 UI Concept & ASCII Wireframes
│       ├── tasks.md                       # Tiến độ 30 tác vụ (T001–T030)
│       └── ui-tokens-contract.md          # Hệ thống Design Tokens CSS
└── .specify/                              # Cấu hình Spec Kit & Hiến pháp dự án
```
