# Bộ File Figma Phác Thảo Wireframe & Giao Diện Dự Kiến

Thư mục này chứa **đầy đủ 2 bộ bản vẽ chuẩn vector SVG** của hệ thống Quản lý Thực phẩm Gia đình & Gợi ý FEFO (mô hình Client–Server), được thiết kế theo đúng quy chuẩn Artboard / Frame của Figma:
- **Desktop Frames**: `1440 × 900 px` (Chuẩn Desktop Figma).
- **Mobile Frames**: `390 × 844 px` (Chuẩn iPhone 14 Figma).
- **Master Board**: `6400 × 3600 px` (Canvas tổng hợp toàn bộ các màn hình).

---

## 1. Cấu trúc 2 Bộ File Thiết Kế (34 Bản vẽ Vector)

```text
giaodiendukien/figma/
├── figma_canvas_viewer.html                  # Trình xem Figma Suite (Xem 2 chế độ, Copy 1-Click vào Figma, Tải file)
├── figma_screens_data.js                     # Dữ liệu vector nhúng (chống lỗi CORS khi mở trên file:///)
├── README_FIGMA_IMPORT.md                    # Tài liệu hướng dẫn này
│
├── 🎨 BỘ 1: GIAO DIỆN DỰ KIẾN (HI-FI DESIGN - FULL MÀU SẮC & COMPONENT)
│   ├── master/
│   │   └── 00_FIGMA_MASTER_BOARD_ALL_SCREENS.svg # Master Board chứa tất cả 17 màn hình Hi-Fi
│   ├── desktop/                                  # 8 màn hình Desktop Server (1440 × 900 px)
│   │   ├── DSK-01_Dashboard_Server.svg
│   │   ├── DSK-02_FEFO_Recommendations.svg
│   │   ├── DSK-03_Inventory_Management.svg
│   │   ├── DSK-04_Alerts_Center.svg
│   │   ├── DSK-05_Audit_Logs.svg
│   │   ├── DSK-06_Catalog_Management.svg
│   │   ├── DSK-07_Settings_Configuration.svg
│   │   └── DSK-MODALS_Suite.svg
│   └── mobile/                                   # 8 màn hình Mobile Client (390 × 844 px)
│       ├── MOB-00_Connect_PIN.svg
│       ├── MOB-01_Home_FEFO.svg
│       ├── MOB-02_Inventory_Search_Filter.svg
│       ├── MOB-03_Food_Detail_Actions.svg
│       ├── MOB-04_Recipes_Cook.svg
│       ├── MOB-05_Alerts_Shopping_List.svg
│       ├── MOB-06_Add_Food_AI_Scan.svg
│       └── MOB-07_Stats_Logs_Settings.svg
│
└── 📐 BỘ 2: PHÁC THẢO KHUNG DÂY (WIREFRAME BLUEPRINT - CHUẨN ĐẶC TẢ BỐ CỤC)
    ├── wireframe/master/
    │   └── 00_FIGMA_MASTER_BOARD_WIREFRAMES.svg   # Master Board chứa tất cả 17 màn hình Wireframe
    ├── wireframe/desktop/                         # 8 màn hình Wireframe Desktop (1440 × 900 px)
    │   ├── WF-DSK-01_Dashboard_Server.svg
    │   ├── WF-DSK-02_FEFO_Recommendations.svg
    │   ├── WF-DSK-03_Inventory_Management.svg
    │   ├── WF-DSK-04_Alerts_Center.svg
    │   ├── WF-DSK-05_Audit_Logs.svg
    │   ├── WF-DSK-06_Catalog_Management.svg
    │   ├── WF-DSK-07_Settings_Configuration.svg
    │   └── WF-DSK-MODALS_Suite.svg
    └── wireframe/mobile/                          # 8 màn hình Wireframe Mobile (390 × 844 px)
        ├── WF-MOB-00_Connect_PIN.svg
        ├── WF-MOB-01_Home_FEFO.svg
        ├── WF-MOB-02_Inventory_Search_Filter.svg
        ├── WF-MOB-03_Food_Detail_Actions.svg
        ├── WF-MOB-04_Recipes_Cook.svg
        ├── WF-MOB-05_Alerts_Shopping_List.svg
        ├── WF-MOB-06_Add_Food_AI_Scan.svg
        └── WF-MOB-07_Stats_Logs_Settings.svg
```

---

## 2. Cách xem trực quan ngay lập tức (Không cần cài Figma)

Bạn chỉ cần **nhấp đúp chuột vào file `figma_canvas_viewer.html`** để mở trên trình duyệt (Chrome, Edge):
- **Chuyển đổi 2 Tab linh hoạt**:
  - 🎨 **Giao Diện Dự Kiến (17 màn hình)**: Đầy đủ màu sắc thương hiệu Culinary Slate Workbench, thẻ trạng thái, icon thực phẩm.
  - 📐 **Phác Thảo Wireframe (17 màn hình)**: Khung dây kỹ thuật đen trắng, phân cấp cấu trúc phục vụ báo cáo phân tích thiết kế.
- **Nút "📋 Sao chép SVG vào Figma (Ctrl+V)"**: Bấm 1 click là mã vector được lưu vào bộ nhớ tạm (hoạt động 100% trên cả `file:///` lẫn `http://`).
- **Nút "⬇ Tải file SVG về máy"**: Tải trực tiếp file `.svg` đang chọn về thư mục Downloads mà không bị nhảy tab.

---

## 3. Cách nhập (Import) vào Figma

Có 3 cách cực kỳ đơn giản:

### Cách 1: Kéo thả trực tiếp từ máy tính vào Figma (Khuyên dùng - Nhanh nhất)
1. Mở Figma trên web ([figma.com](https://figma.com)) hoặc phần mềm Figma trên máy tính.
2. Tạo file thiết kế mới (**New design file**).
3. Mở thư mục trên máy tính:
   - Muốn nộp/xem **Giao diện dự kiến**: Mở thư mục `figma/master/00_FIGMA_MASTER_BOARD_ALL_SCREENS.svg`.
   - Muốn nộp/xem **Khung dây Wireframe**: Mở thư mục `figma/wireframe/master/00_FIGMA_MASTER_BOARD_WIREFRAMES.svg`.
4. **Kéo file `.svg` thả thẳng vào giữa trang trắng của Figma**.
5. 👉 **Kết quả**: Figma tự động nhận diện thành tất cả các Frame và Layer vector nguyên bản, có thể chỉnh sửa 100%!

### Cách 2: Sao chép & Dán (1-Click Copy - Paste)
1. Mở file `figma_canvas_viewer.html` trên trình duyệt.
2. Chọn màn hình muốn lấy (ở Tab Giao diện dự kiến hoặc Tab Wireframe).
3. Bấm nút **"📋 Sao chép SVG vào Figma (Ctrl+V)"** ở trên đầu.
4. Chuyển sang cửa sổ Figma và bấm tổ hợp phím **Ctrl + V**.
5. Toàn bộ thiết kế sẽ dán ngay lập tức vào Figma!

### Cách 3: Dùng tính năng Import của Figma
1. Trong Figma, nhấn phím tắt **`Ctrl + Shift + K`** (hoặc chọn menu **File** -> **Place Image / Vector...**).
2. Chọn file `.svg` trong thư mục `desktop/`, `mobile/` hoặc `wireframe/`.
3. Click chuột vào canvas Figma để đặt vào vị trí mong muốn.
