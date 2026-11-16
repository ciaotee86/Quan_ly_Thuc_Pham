# Hệ Thống Quản Lý Thực Phẩm Gia Đình & Gợi Ý FEFO (Client–Server)

> **Môn học**: Lập Trình Mạng  
> **Đề tài**: Xây dựng hệ thống quản lý thực phẩm gia đình, theo dõi hạn sử dụng theo nguyên tắc FEFO (First Expired, First Out) với kiến trúc mạng Client–Server.

---

## 📌 Tổng Quan Hệ Thống

Dự án cung cấp giải pháp toàn diện cho hộ gia đình quản lý kho thực phẩm, cảnh báo cận date/hết hạn, gợi ý thực đơn thông minh theo thuật toán FEFO và giảm thiểu lãng phí thực phẩm:
- **Desktop Server (Trạm quản lý trung tâm)**: Dành cho màn hình máy tính, tích hợp bảng điều khiển tổng quan, quản lý danh mục, thiết lập máy chủ socket, xem biểu đồ hao phí và nhật ký kiểm toán (Audit Log).
- **Mobile Client (Ứng dụng di động tiện lợi)**: Dành cho điện thoại thông minh, hỗ trợ quét mã/nhận diện thực phẩm (AI Scan), tra cứu kho nhanh, xuất/tiêu thụ thực phẩm, và nhận thông báo cảnh báo tức thời từ Server.
- **Shared Simulation Engine**: Module chia sẻ mô phỏng giao thức truyền thông mạng Client–Server, thuật toán FEFO, công cụ tổng hợp dữ liệu và dữ liệu mẫu khởi tạo.

---

## 🏗️ Cấu Trúc Dự Án

```text
Quan_ly_Thuc_Pham/
├── README.md                              # Hướng dẫn tổng quan dự án
├── .gitignore                             # Cấu hình bỏ qua file rác, build & node_modules
├── Documents/                             # Thư mục tài liệu dự án & thiết kế Figma
│   └── figma/                             # Bản vẽ Figma (.fig), Wireframes & Canvas Viewer HTML
└── giaodiendukien/                        # Toàn bộ mã nguồn & tài liệu đặc tả
    ├── 0_CAI_DAT_LAN_DAU (RUN_FIRST).bat  # Cài đặt tự động dependencies lần đầu khi mới clone
    ├── 1_MO_GIAO_DIEN_DESKTOP_SERVER.bat  # 1-Click mở Desktop Server
    ├── 2_MO_GIAO_DIEN_MOBILE_CLIENT.bat   # 1-Click mở Mobile Client
    ├── 3_MO_CA_HAI_GIAO_DIEN.bat          # 1-Click mở cả hai ứng dụng
    ├── README.md                          # Hướng dẫn chi tiết UI Prototype
    ├── package.json                       # Cấu hình npm workspaces
    ├── desktop-server/                    # Ứng dụng Desktop Server (React + Vite + TypeScript)
    ├── mobile-client/                     # Ứng dụng Mobile Client (React + Vite + TypeScript)
    ├── shared-sim/                        # Lõi thuật toán FEFO & mô phỏng giao thức mạng
    ├── tests/                             # Bộ kiểm thử tự động (Vitest & E2E Flow)
    ├── specs/                             # Hồ sơ đặc tả Spec Kit (Phân rã 87 chức năng)
    ├── docs/                              # Tài liệu BTL, file CSDL .sql & sơ đồ luồng
    └── .specify/                          # Quy chuẩn kiến trúc & hiến pháp dự án
```

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy

### Yêu Cầu Môi Trường
- **Node.js**: Phiên bản 18+ (khuyên dùng Node 20 LTS)
- **Trình duyệt**: Chrome, Edge hoặc trình duyệt hiện đại bất kỳ

### 1. Cài đặt Dependencies (Chỉ cần chạy 1 lần sau khi Clone)
- **Cách nhanh nhất**: Nhấp đúp chuột vào file **`giaodiendukien/0_CAI_DAT_LAN_DAU (RUN_FIRST).bat`** để tự động kiểm tra Node.js và chạy `npm install`.
- **Hoặc dùng Terminal**:
```bash
cd giaodiendukien
npm install
```

### 2. Khởi chạy ứng dụng

#### Cách 1: Sử dụng File chạy nhanh (.bat) trên Windows (1-Click)
- Nhấp đúp `1_MO_GIAO_DIEN_DESKTOP_SERVER.bat` để mở Desktop Server (`http://localhost:5173`).
- Nhấp đúp `2_MO_GIAO_DIEN_MOBILE_CLIENT.bat` để mở Mobile Client (`http://localhost:5174`).
- Nhấp đúp `3_MO_CA_HAI_GIAO_DIEN.bat` để mở đồng thời cả hai ứng dụng.

#### Cách 2: Chạy bằng Terminal
```bash
cd giaodiendukien

# Mở Desktop Server
npm run dev:desktop

# Mở Mobile Client
npm run dev:mobile

# Chạy kiểm thử tự động
npm test
```

---

## 📋 Tài Liệu & Thiết Kế
- **Thiết kế Figma & Phác thảo Wireframe**: Lưu tại thư mục [`Documents/figma/`](./Documents/figma/) (Gồm file gốc `.fig`, bộ vector SVG 34 màn hình và trình duyệt [`figma_canvas_viewer.html`](./Documents/figma/figma_canvas_viewer.html))
- **Hồ sơ kỹ thuật UI Prototype**: Lưu tại [`giaodiendukien/docs/`](./giaodiendukien/docs/)
- **Đặc tả chi tiết 27 màn hình và các luồng nghiệp vụ**: [`giaodiendukien/Thiet_ke_cau_truc_giao_dien_du_kien.md`](./giaodiendukien/Thiet_ke_cau_truc_giao_dien_du_kien.md)
- **Kế hoạch phân rã chức năng Spec Kit**: [`giaodiendukien/specs/001-ui-prototype/`](./giaodiendukien/specs/001-ui-prototype/)

---

## 👥 Tác Giả & Bản Quyền
Dự án được xây dựng phục vụ môn học **Lập Trình Mạng**.
