"""
TongHopvaTest/client/tcp_client.py
=============================================================================
CLIENT TCP SOCKET THUẦN (PYTHON CONSOLE CLIENT)
Đề tài: Quản lý thực phẩm gia đình & Đề xuất tiêu thụ FEFO
Môn học: Lập trình Mạng - GVHD: TS. Đặng Hùng Vĩ (ĐH Kiến trúc Đà Nẵng)

Chức năng:
- Mở kết nối TCP Socket trực tiếp tới Máy chủ (mặc định localhost:8080).
- Đóng gói request HTTP/JSON và gửi qua socket.
- Nhận phản hồi, đo lường độ trễ mạng (RTT), hiển thị bảng dữ liệu trực quan.
=============================================================================
"""

import json
import socket
import sys
import time
from typing import Any, Dict, Optional, Tuple

SERVER_HOST = "127.0.0.1"
SERVER_PORT = 8080
BUFFER_SIZE = 4096


def send_tcp_request(method: str, path: str, payload: Optional[Dict[str, Any]] = None, host: str = SERVER_HOST, port: int = SERVER_PORT) -> Tuple[int, Any, float]:
    """
    Tạo kết nối TCP Socket, gửi request và nhận response, đo RTT.
    """
    start_time = time.time()
    body_bytes = b""
    if payload is not None:
        body_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    headers = [
        f"{method} {path} HTTP/1.1",
        f"Host: {host}:{port}",
        "Accept: application/json",
        "Connection: close"
    ]
    if payload is not None:
        headers.append("Content-Type: application/json; charset=utf-8")
        headers.append(f"Content-Length: {len(body_bytes)}")

    request_raw = "\r\n".join(headers).encode("ascii") + b"\r\n\r\n" + body_bytes

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(10.0)
        sock.connect((host, port))
        sock.sendall(request_raw)

        response_raw = bytearray()
        while True:
            chunk = sock.recv(BUFFER_SIZE)
            if not chunk:
                break
            response_raw.extend(chunk)
        sock.close()
    except Exception as e:
        rtt = (time.time() - start_time) * 1000
        return 0, {"error": f"Lỗi kết nối Socket tới {host}:{port}: {e}"}, rtt

    rtt = (time.time() - start_time) * 1000

    # Phân tích HTTP response
    try:
        head_end = response_raw.find(b"\r\n\r\n")
        if head_end == -1:
            return 500, {"error": "Phản hồi mạng không đúng định dạng HTTP."}, rtt

        header_str = response_raw[:head_end].decode("iso-8859-1")
        body_str = response_raw[head_end + 4:].decode("utf-8", errors="replace")

        status_line = header_str.split("\r\n")[0]
        status_code = int(status_line.split(" ")[1])

        try:
            data = json.loads(body_str) if body_str else {}
        except json.JSONDecodeError:
            data = {"raw_text": body_str}

        return status_code, data, rtt
    except Exception as e:
        return 500, {"error": f"Lỗi phân tích dữ liệu phản hồi: {e}"}, rtt


def print_banner():
    print("\n" + "=" * 75)
    print("    HỆ THỐNG QUẢN LÝ THỰC PHẨM GIA ĐÌNH & GỢI Ý TIÊU THỤ FEFO")
    print(f"    [TCP SOCKET CLIENT - PORT {SERVER_PORT}]")
    print("=" * 75)


def show_fefo_recommendations():
    print("\n⏳ Đang gửi yêu cầu GET /api/fefo qua Socket TCP...")
    status, res, rtt = send_tcp_request("GET", "/api/fefo")
    if status != 200:
        print(f"❌ Lỗi ({status}): {res.get('error')}")
        return

    items = res.get("items", [])
    ref_date = res.get("reference_date", "")
    counts = res.get("counts_by_priority", {})

    print(f"\n✅ Nhận {len(items)} mặt hàng (RTT: {rtt:.1f}ms | Mốc tính ngày: {ref_date})")
    print(f"📊 Thống kê: [Cao: {counts.get('Cao', 0)}] | [Trung bình: {counts.get('Trung bình', 0)}] | [Thấp: {counts.get('Thấp', 0)}]")
    print("-" * 75)
    print(f"{'Hạng':<5}{'Tên thực phẩm':<24}{'Vị trí':<18}{'Hạn dùng':<12}{'Còn':<6}{'Ưu tiên'}")
    print("-" * 75)

    for item in items[:15]:  # Hiển thị 15 món đầu
        rank = f"#{item.get('rank', 0)}"
        name = item.get('food_name', '')[:22]
        loc = item.get('location_name', '')[:16]
        exp = item.get('expiry_date', '')
        days = f"{item.get('days_remaining', 0)}d"
        prio = item.get('priority_level', '')
        print(f"{rank:<5}{name:<24}{loc:<18}{exp:<12}{days:<6}{prio}")

    if len(items) > 15:
        print(f"... và còn {len(items) - 15} mặt hàng khác.")
    print("-" * 75)


def show_inventory():
    print("\n⏳ Đang gửi yêu cầu GET /api/inventory qua Socket TCP...")
    status, res, rtt = send_tcp_request("GET", "/api/inventory")
    if status != 200:
        print(f"❌ Lỗi ({status}): {res.get('error')}")
        return

    items = res if isinstance(res, list) else res.get("data", [])
    print(f"\n✅ Tồn kho thực tế: {len(items)} mặt hàng (RTT: {rtt:.1f}ms)")
    print("-" * 75)
    print(f"{'ID':<5}{'Tên thực phẩm':<25}{'Số lượng':<12}{'Vị trí lưu trữ':<20}{'Hạn dùng'}")
    print("-" * 75)
    for it in items[:15]:
        item_id = str(it.get('item_id', ''))
        name = it.get('food_name', '')[:23]
        qty = f"{it.get('current_quantity', 0)} {it.get('unit_name', '')}"
        loc = it.get('location_name', '')[:18]
        exp = it.get('expiration_date', '')
        print(f"{item_id:<5}{name:<25}{qty:<12}{loc:<20}{exp}")
    if len(items) > 15:
        print(f"... và còn {len(items) - 15} mặt hàng khác.")
    print("-" * 75)


def show_alerts():
    print("\n⏳ Đang quét cảnh báo kép qua GET /api/alerts...")
    status, res, rtt = send_tcp_request("GET", "/api/alerts")
    if status != 200:
        print(f"❌ Lỗi ({status}): {res.get('error')}")
        return

    counts = res.get("counts", {})
    expiring = res.get("expiring_soon_items", [])
    low_stock = res.get("low_stock_items", [])

    print(f"\n🚨 KẾT QUẢ CẢNH BÁO (RTT: {rtt:.1f}ms):")
    print(f"  • Quá hạn (Hỏng):       {counts.get('expired', 0)} món")
    print(f"  • Cận hạn (≤ 3 ngày):   {counts.get('expiring_soon', 0)} món")
    print(f"  • Chạm ngưỡng tồn kho:  {counts.get('low_stock', 0)} món")

    if expiring:
        print("\n⚠️  DANH SÁCH SẮP HẾT HẠN CẦN NẤU GẤP:")
        for it in expiring:
            print(f"   - {it.get('food_name')} (Còn {it.get('days_remaining')} ngày, HSD: {it.get('expiry_date')}, Vị trí: {it.get('location_name')})")

    if low_stock:
        print("\n🛒 DANH SÁCH CHẠM NGƯỠNG TỒN (CẦN MUA THÊM):")
        for it in low_stock:
            print(f"   - {it.get('food_name')}: còn {it.get('current_quantity')} {it.get('unit_name')} (Ngưỡng min: {it.get('min_threshold')})")


def use_food_item():
    try:
        item_id_str = input("\nNhập item_id thực phẩm cần dùng: ").strip()
        if not item_id_str:
            return
        item_id = int(item_id_str)
        qty_str = input("Nhập số lượng sử dụng: ").strip()
        qty = float(qty_str)
        reason = input("Lý do xuất dùng [Nấu ăn gia đình]: ").strip() or "Nấu ăn gia đình"

        payload = {"item_id": item_id, "quantity": qty, "reason": reason}
        print("⏳ Đang gửi POST /api/food/use qua Socket TCP...")
        status, res, rtt = send_tcp_request("POST", "/api/food/use", payload)
        if status in (200, 201):
            print(f"✅ Thành công (RTT: {rtt:.1f}ms): {res.get('message', 'Đã trừ kho')}")
            print(f"   Thực phẩm: {res.get('food_name')}, Còn lại: {res.get('new_quantity')} {res.get('unit_name')}")
        else:
            print(f"❌ Thất bại ({status}): {res.get('error')}")
    except ValueError:
        print("❌ Dữ liệu nhập vào phải là số hợp lệ!")


def change_simulation_date():
    new_date = input("\nNhập ngày giả lập mới (YYYY-MM-DD): ").strip()
    if not new_date:
        return
    payload = {"simulation_date": new_date}
    status, res, rtt = send_tcp_request("POST", "/api/simulation/date", payload)
    if status in (200, 201):
        print(f"✅ Đã chuyển ngày giả lập sang: {new_date} (RTT: {rtt:.1f}ms)")
    else:
        print(f"❌ Thất bại ({status}): {res.get('error')}")


def show_audit_log():
    status, res, rtt = send_tcp_request("GET", "/api/audit-log")
    if status != 200:
        print(f"❌ Lỗi ({status}): {res.get('error')}")
        return

    logs = res if isinstance(res, list) else res.get("data", [])
    print(f"\n📜 NHẬT KÝ BIẾN ĐỘNG KHO (AUDIT LOG - {len(logs)} giao dịch | RTT: {rtt:.1f}ms):")
    print("-" * 75)
    for log in logs[:10]:
        t = log.get("transaction_time", "")
        action = log.get("action_type", "")
        name = log.get("food_name", "")
        change = log.get("change_quantity", 0)
        reason = log.get("reason", "")
        print(f"[{t}] {action:<10} | {name:<20} | Thay đổi: {change:+g} | Lý do: {reason}")
    print("-" * 75)


def main():
    while True:
        print_banner()
        print("  [1] 📋 Đề xuất FEFO ưu tiên tiêu thụ (Hạn dùng gần nhất)")
        print("  [2] 🧊 Danh sách tồn kho thực phẩm trong tủ lạnh")
        print("  [3] 🚨 Quét cảnh báo kép (Hết hạn, Cận hạn, Chạm ngưỡng)")
        print("  [4] 🥢 Xuất dùng thực phẩm (Nấu ăn / Trừ kho)")
        print("  [5] 📅 Đổi ngày giả lập hệ thống (Test nhảy hạn realtime)")
        print("  [6] 📜 Xem nhật ký giao dịch kho (Audit Trail)")
        print("  [0] 🚪 Thoát ứng dụng")
        print("=" * 75)

        choice = input("👉 Chọn chức năng (0-6): ").strip()
        if choice == "1":
            show_fefo_recommendations()
        elif choice == "2":
            show_inventory()
        elif choice == "3":
            show_alerts()
        elif choice == "4":
            use_food_item()
        elif choice == "5":
            change_simulation_date()
        elif choice == "6":
            show_audit_log()
        elif choice == "0":
            print("\n👋 Tạm biệt! Kết thúc phiên kết nối TCP Socket Client.")
            break
        else:
            print("⚠️ Lựa chọn không hợp lệ, vui lòng chọn lại.")

        input("\n[Nhấn Enter để tiếp tục...]")


if __name__ == "__main__":
    main()
