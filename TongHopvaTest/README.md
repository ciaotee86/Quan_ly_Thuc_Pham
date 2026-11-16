# GÓI TỔNG HỢP VÀ KIỂM THỬ HỆ THỐNG QUẢN LÝ THỰC PHẨM GIA ĐÌNH & ĐỀ XUẤT FEFO

> **Môn học:** Lập trình Mạng (TS. Đặng Hùng Vĩ - Khoa CNTT, ĐH Kiến trúc Đà Nẵng)  
> **Ngôn ngữ:** Python 3 (Thuần Standard Library: `socket`, `threading`, `sqlite3`, `json`)  
> **CSDL:** SQLite 3NF (`food_management.db`)  
> **Kiến trúc:** Client–Server qua TCP Socket (Port 8080)

---

## 📂 1. Cấu trúc thư mục tối giản (Đã lọc sạch file thừa)

```text
TongHopvaTest/
├── 1_KHOI_DONG_SERVER.bat       # [BƯỚC 1] Khởi động TCP Socket Server (Port 8080)
├── 2_CHAY_CLIENT_CONSOLE.bat    # [BƯỚC 2A] Mở Python TCP Socket Client tương tác console
├── 3_MO_GIAO_DIEN_WEB.bat       # [BƯỚC 2B] Mở Web Client đồ họa trên trình duyệt
├── 4_KIEM_THU_TRANH_CHAP.bat    # [BƯỚC 3] Kịch bản kiểm thử tranh chấp mạng 20 luồng đồng thời
├── README.md                    # Hướng dẫn này
├── Tai_Lieu_Nang_Cap_He_Thong_Moi.docx  # Báo cáo kỹ thuật chi tiết các tính năng mới
├── Tai_Lieu_Nang_Cap_He_Thong_Moi.txt
│
├── database/                    # TẦNG CƠ SỞ DỮ LIỆU SQLITE 3NF
│   ├── schema.sql               # 8 bảng quan hệ chuẩn 3NF và view FEFO
│   ├── seed_data.sql            # Bộ dữ liệu mẫu ban đầu (25 thực phẩm, ngăn tủ, đơn vị)
│   └── food_management.db       # CSDL SQLite hoàn chỉnh
│
├── server/                      # TẦNG MÁY CHỦ (SERVER LAYER)
│   ├── tcp_server.py            # Socket Server TCP đa luồng, Realtime SSE + REST API + Web
│   ├── core_services.py         # Lõi FEFO, Tie-breaker FIFO, Match Score món & Shopping List
│   └── database.py              # DAL truy xuất CSDL thread-safe (WAL mode, Foreign Keys)
│
├── client/                      # TẦNG MÁY KHÁCH (CLIENT LAYER)
│   ├── tcp_client.py            # Client console Python thuần Socket đo RTT mạng
│   ├── index.html               # Giao diện Web Client trực quan
│   ├── app.js                   # Xử lý tương tác, Realtime Event listener & đồng bộ tự động
│   └── style.css                # Định dạng giao diện chuẩn responsive
│
└── tests/                       # KIỂM THỬ TẢI & TRANH CHẤP MẠNG
    └── stress_test_concurrency.py # Kịch bản 20 luồng bắn đồng thời qua Barrier(20)

```

---

## 🚀 2. Hướng dẫn chạy và kịch bản demo (Dành cho buổi chấm bảo vệ)

### **Bước 1: Bật máy chủ TCP Socket Server**
- Nhấp đúp chuột vào file **`1_KHOI_DONG_SERVER.bat`**.
- Server sẽ khởi động trên cổng `8080`, hiển thị thông tin lắng nghe các kết nối TCP từ các Client.

### **Bước 2: Trình diễn 2 loại Client kết nối đến Server**

#### **Lựa chọn A: Trình diễn bằng Python Socket Client (Rất ghi điểm môn Lập trình Mạng)**
- Nhấp đúp vào **`2_CHAY_CLIENT_CONSOLE.bat`**.
- Màn hình menu console tương tác sẽ hiện ra:
  - Chọn **`1`**: Gửi request qua Socket lấy đề xuất FEFO xếp hạng hạn cận nhất lên đầu.
  - Chọn **`2`**: Xem danh sách tồn kho thực tế trong tủ lạnh.
  - Chọn **`3`**: Quét cảnh báo kép (đồ quá hạn, đồ cận hạn dưới 3 ngày, đồ chạm ngưỡng min).
  - Chọn **`4`**: Xuất dùng thực phẩm (trừ kho và ghi Audit Trail).
  - Chọn **`5`**: Đổi ngày giả lập để kiểm tra nhảy hạn theo thời gian.
  - Mỗi thao tác đều đo lường độ trễ mạng **RTT (ms)** và số byte truyền nhận qua socket.

#### **Lựa chọn B: Trình diễn bằng Web Client đồ họa**
- Nhấp đúp vào **`3_MO_GIAO_DIEN_WEB.bat`** (hoặc truy cập `http://localhost:8080/` trên Chrome/Edge).
- Toàn bộ giao diện quản lý thực phẩm gia đình, bộ lọc ngăn tủ lạnh, bảng đề xuất FEFO và công thức món ăn sẽ hiển thị trực quan.
- **Tính năng Realtime đặc biệt:** Mở 2 tab trình duyệt cùng lúc; khi tab 1 thao tác xuất dùng thực phẩm, tab 2 sẽ tự động nhận thông báo Toast và cập nhật số lượng ngay lập tức mà không cần F5!

### **Bước 3: Trình diễn Kiểm thử Tranh chấp Mạng Đa luồng (Stress Test)**
- Nhấp đúp vào file **`4_KIEM_THU_TRANH_CHAP.bat`**.
- Màn hình console sẽ kích nổ đồng thời 20 luồng Socket TCP tranh chấp 1 lô hàng 5 hộp.
- Kết quả sẽ khẳng định hệ thống đạt **PASSED 100%**: đúng 5 yêu cầu thành công, đúng 15 yêu cầu bị chặn, tồn kho còn 0.0 (không âm kho), ngăn chặn triệt để Race Condition.

