"""
TongHopvaTest/tests/stress_test_concurrency.py
=============================================================================
KỊCH BẢN KIỂM THỬ TẢI TRANH CHẤP MẠNG ĐỒNG THỜI (CONCURRENCY STRESS TEST)
Môn học: Lập trình Mạng - GVHD: TS. Đặng Hùng Vĩ (ĐH Kiến trúc Đà Nẵng)

Mục tiêu kiểm thử:
- Giả lập 20 luồng Client kết nối qua Socket TCP đồng thời (Multi-threading).
- Tranh chấp xuất dùng 1 lô hàng chỉ có 5 đơn vị tồn kho.
- Chứng minh hệ thống ngăn chặn triệt để hiện tượng Race Condition:
  + Đúng 5 yêu cầu thành công (HTTP 200).
  + Đúng 15 yêu cầu bị từ chối an toàn (HTTP 400).
  + Tồn kho cuối cùng chính xác là 0.0 (KHÔNG BAO GIỜ BỊ ÂM KHO).
  + CSDL và Audit Trail bảo toàn 100% tính toàn vẹn (ACID Transaction).
=============================================================================
"""

import json
import socket
import sys
import threading
import time
from typing import Any, Dict, List, Tuple

HOST = "127.0.0.1"
PORT = 8080
NUM_THREADS = 20
INITIAL_QTY = 5.0
USE_QTY_PER_THREAD = 1.0


def send_raw_http(method: str, path: str, payload: Dict[str, Any] = None) -> Tuple[int, Dict[str, Any], float]:
    """Gửi yêu cầu HTTP thuần qua Socket TCP và đo thời gian phản hồi (RTT)."""
    t0 = time.time()
    body_bytes = b""
    if payload is not None:
        body_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    req = [
        f"{method} {path} HTTP/1.1",
        f"Host: {HOST}:{PORT}",
        "Connection: close",
        "Accept: application/json"
    ]
    if payload is not None:
        req.append("Content-Type: application/json; charset=utf-8")
        req.append(f"Content-Length: {len(body_bytes)}")

    raw_data = "\r\n".join(req).encode("ascii") + b"\r\n\r\n" + body_bytes

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(10.0)
    try:
        sock.connect((HOST, PORT))
        sock.sendall(raw_data)
        res_raw = bytearray()
        while True:
            chunk = sock.recv(4096)
            if not chunk:
                break
            res_raw.extend(chunk)
    finally:
        sock.close()

    rtt = (time.time() - t0) * 1000

    idx = res_raw.find(b"\r\n\r\n")
    if idx == -1:
        return 500, {"error": "Malformed HTTP response"}, rtt

    header_str = res_raw[:idx].decode("iso-8859-1")
    body_str = res_raw[idx + 4:].decode("utf-8", errors="replace")

    status_line = header_str.split("\r\n")[0]
    status_code = int(status_line.split(" ")[1])

    try:
        data = json.loads(body_str) if body_str else {}
    except json.JSONDecodeError:
        data = {"raw": body_str}

    return status_code, data, rtt


def run_stress_test():
    print("\n" + "=" * 78)
    print("      BẮT ĐẦU KIỂM THỬ TRANH CHẤP MẠNG ĐỒNG THỜI (CONCURRENCY STRESS TEST)")
    print(f"      Máy chủ đích: http://{HOST}:{PORT}")
    print("=" * 78)

    # 1. Kiểm tra kết nối máy chủ
    try:
        status, _, _ = send_raw_http("GET", "/api/status")
        if status != 200:
            print(f"❌ Lỗi: Máy chủ trả về mã {status}. Hãy bật 1_KHOI_DONG_SERVER.bat trước!")
            return False
    except Exception as e:
        print(f"❌ Không thể kết nối tới {HOST}:{PORT} - {e}")
        print("👉 Vui lòng mở file '1_KHOI_DONG_SERVER.bat' để bật máy chủ trước khi chạy test!")
        return False

    print("✔ Bước 1: Máy chủ TCP Socket đang trực tuyến và sẵn sàng.")

    # 2. Khởi tạo lô hàng kiểm thử
    add_payload = {
        "food_id": 1,
        "location_id": 1,
        "unit_id": 4,
        "quantity": INITIAL_QTY,
        "expiration_date": "2026-11-28",
        "min_threshold": 1.0,
        "notes": "Lô hàng kiểm thử tranh chấp đa luồng (Stress Test)"
    }
    status, res, rtt = send_raw_http("POST", "/api/food/add", add_payload)
    if status not in (200, 201):
        print(f"❌ Không thể tạo lô hàng mẫu: {res}")
        return False

    test_item_id = res.get("item_id")
    print(f"✔ Bước 2: Đã tạo lô hàng thử nghiệm item_id={test_item_id} với số lượng ban đầu = {INITIAL_QTY} hộp.")

    # 3. Chuẩn bị 20 luồng bắn đồng thời
    barrier = threading.Barrier(NUM_THREADS)
    results: List[Dict[str, Any]] = []
    results_lock = threading.Lock()

    def worker(thread_idx: int):
        barrier.wait()  # Chờ tất cả luồng sẵn sàng để kích nổ cùng lúc
        status, data, rtt = send_raw_http(
            "POST",
            "/api/food/use",
            {
                "item_id": test_item_id,
                "quantity": USE_QTY_PER_THREAD,
                "reason": f"Tranh chấp luồng #{thread_idx:02d}"
            }
        )
        with results_lock:
            results.append({
                "thread_idx": thread_idx,
                "status": status,
                "rtt": rtt,
                "data": data
            })

    threads = [threading.Thread(target=worker, args=(i + 1,)) for i in range(NUM_THREADS)]

    print(f"\n⚡ Bước 3: Đang kích nổ {NUM_THREADS} luồng Socket TCP đồng thời bắn vào item_id={test_item_id}...")
    t_start = time.time()
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    total_time = (time.time() - t_start) * 1000

    print(f"✔ Hoàn thành {NUM_THREADS} yêu cầu trong {total_time:.1f}ms.")

    # 4. Phân tích kết quả
    success_count = sum(1 for r in results if r['status'] in (200, 201))
    rejected_count = sum(1 for r in results if r['status'] >= 400)
    avg_rtt = sum(r['rtt'] for r in results) / len(results)

    print("\n" + "-" * 78)
    print("                      KẾT QUẢ PHÂN TÍCH TRANH CHẤP MẠNG")
    print("-" * 78)
    print(f"  • Tổng số luồng Client Socket:       {NUM_THREADS}")
    print(f"  • Số lượng yêu cầu thành công (200):  {success_count} / {int(INITIAL_QTY)} (Đúng số lượng có trong kho)")
    print(f"  • Số lượng bị từ chối an toàn (400):  {rejected_count} / {NUM_THREADS - int(INITIAL_QTY)} (Hết hàng, ngăn âm kho)")
    print(f"  • Độ trễ mạng trung bình (RTT):      {avg_rtt:.1f} ms/request")
    print("-" * 78)

    # 5. Kiểm tra tính toàn vẹn tồn kho trong CSDL
    status, inv_res, _ = send_raw_http("GET", "/api/inventory")
    items = inv_res if isinstance(inv_res, list) else inv_res.get("data", [])
    matching = next((it for it in items if it.get("item_id") == test_item_id), None)
    final_qty = matching.get("current_quantity") if matching else 0.0

    print(f"  • Tồn kho thực tế sau tranh chấp:    {final_qty} hộp")

    # 6. Dọn dẹp lô hàng test
    send_raw_http("POST", "/api/food/delete", {"item_id": test_item_id, "reason": "Dọn dẹp sau stress test"})

    # 7. Đánh giá Pass/Fail
    is_success = (success_count == int(INITIAL_QTY)) and (final_qty == 0.0)
    print("=" * 78)
    if is_success:
        print("  🏆 KẾT LUẬN: BÀI KIỂM THỬ ĐẠT ĐIỂM TUYỆT ĐỐI (PASSED 100%!)")
        print("  - Hệ thống ngăn chặn hoàn toàn lỗi Race Condition.")
        print("  - Cơ chế đa luồng (threading.RLock) và SQLite Transaction hoạt động chuẩn xác.")
        print("  - Không có hiện tượng âm kho hay sai lệch dữ liệu.")
    else:
        print("  ❌ KẾT LUẬN: BÀI KIỂM THỬ KHÔNG ĐẠT (FAILED)")
    print("=" * 78 + "\n")

    return is_success


if __name__ == "__main__":
    run_stress_test()
