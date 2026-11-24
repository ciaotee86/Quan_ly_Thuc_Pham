"""Raw TCP/HTTP server for the family food-management project.

Only Python standard-library modules are used.  This module owns networking,
HTTP parsing, static-file discovery and SSE broadcasting.  SQLite access and
business rules stay in the teammates' database.py and core_services.py files.

Run from the repository root with: python -m server.tcp_server
"""

import socket
import threading
import sqlite3
import json
from pathlib import Path
import time
import logging


HOST = "0.0.0.0"
PORT = 8080
BACKLOG = 50
RECV_SIZE = 4096
MAX_HEADER_BYTES = 65536
MAX_BODY_BYTES = 1048576
CLIENT_TIMEOUT_SECONDS = 20
SSE_HEARTBEAT_SECONDS = 20

LOGGER = logging.getLogger("food_management.tcp_server")
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATABASE_PATH = PROJECT_ROOT / "database" / "food_management.db"

_state_lock = threading.RLock()
_subscriber_lock = threading.RLock()
_subscribers = {}
_active_clients = set()
_next_client_id = 1

_STATUS_TEXT = {
    200: "OK",
    201: "Created",
    204: "No Content",
    400: "Bad Request",
    404: "Not Found",
    405: "Method Not Allowed",
    408: "Request Timeout",
    411: "Length Required",
    413: "Payload Too Large",
    415: "Unsupported Media Type",
    422: "Unprocessable Entity",
    500: "Internal Server Error",
    501: "Not Implemented",
    503: "Service Unavailable",
}


class RequestError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


class ServiceUnavailable(Exception):
    pass


def _json_bytes(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str).encode("utf-8")


def _response(status, body=b"", content_type="application/json; charset=utf-8", extra_headers=None):
    if isinstance(body, str):
        body = body.encode("utf-8")
    headers = {
        "Content-Type": content_type,
        "Content-Length": str(len(body)),
        "Connection": "close",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
    }
    if extra_headers:
        headers.update(extra_headers)
    status_text = _STATUS_TEXT.get(status, "Unknown")
    header_text = "HTTP/1.1 {} {}\r\n".format(status, status_text)
    for name, value in headers.items():
        header_text += "{}: {}\r\n".format(name, value)
    return header_text.encode("ascii") + b"\r\n" + body


def _read_request(client_sock):
    """Read header through CRLFCRLF, then exactly Content-Length body bytes."""
    data = bytearray()
    header_end = -1
    while header_end < 0:
        chunk = client_sock.recv(RECV_SIZE)
        if not chunk:
            raise RequestError("Client đóng kết nối trước khi gửi HTTP header.")
        data.extend(chunk)
        header_end = data.find(b"\r\n\r\n")
        if header_end < 0 and len(data) > MAX_HEADER_BYTES:
            raise RequestError("HTTP header quá lớn.", 413)

    try:
        header_text = bytes(data[:header_end]).decode("iso-8859-1")
    except UnicodeDecodeError:
        raise RequestError("HTTP header không hợp lệ.")
    lines = header_text.split("\r\n")
    request_line = lines[0].split()
    if len(request_line) != 3 or not request_line[2].startswith("HTTP/"):
        raise RequestError("Request line không hợp lệ.")
    method, target, _version = request_line
    headers = {}
    for line in lines[1:]:
        if not line:
            continue
        if ":" not in line:
            raise RequestError("HTTP header không đúng định dạng.")
        name, value = line.split(":", 1)
        headers[name.strip().lower()] = value.strip()

    if headers.get("transfer-encoding", "").lower() == "chunked":
        raise RequestError("Server yêu cầu Content-Length; chưa hỗ trợ chunked body.", 411)
    try:
        content_length = int(headers.get("content-length", "0"))
    except ValueError:
        raise RequestError("Content-Length phải là số nguyên.")
    if content_length < 0:
        raise RequestError("Content-Length không được âm.")
    if content_length > MAX_BODY_BYTES:
        raise RequestError("Body vượt quá giới hạn 1 MB.", 413)
    if method.upper() == "POST" and "content-length" not in headers:
        raise RequestError("POST request phải khai báo Content-Length.", 411)

    body = bytearray(data[header_end + 4:])
    while len(body) < content_length:
        chunk = client_sock.recv(min(RECV_SIZE, content_length - len(body)))
        if not chunk:
            raise RequestError("Body kết thúc trước Content-Length.")
        body.extend(chunk)
    return method.upper(), target, headers, bytes(body[:content_length])


def _split_target(target):
    path, separator, query_text = target.partition("?")
    path = path or "/"
    if path != "/":
        path = path.rstrip("/")
    query = {}
    if separator:
        for pair in query_text.split("&"):
            if not pair:
                continue
            key, equals, value = pair.partition("=")
            key = key.replace("+", " ")
            value = value.replace("+", " ") if equals else ""
            if key:
                query[key] = value
    return path, query


def _read_json_body(headers, body):
    if not body:
        return {}
    content_type = headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type and content_type != "application/json":
        raise RequestError("Body POST phải có Content-Type: application/json.", 415)
    try:
        value = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise RequestError("Body phải là JSON UTF-8 hợp lệ.")
    if not isinstance(value, dict):
        raise RequestError("JSON body phải là object.")
    return value


def _load_core_services():
    # Run from the repository root with `python -m server.tcp_server` so the
    # teammate-owned server package can be imported without changing sys.path.
    try:
        from server import core_services
    except ModuleNotFoundError as error:
        if error.name in ("server", "server.core_services"):
            raise ServiceUnavailable(
                "Chưa có server/core_services.py; API nghiệp vụ sẽ hoạt động sau khi ghép Phần 2."
            )
        raise ServiceUnavailable("Không nạp được core_services: thiếu module {}.".format(error.name))
    return core_services


def _service_function(services, names):
    for name in names:
        function = getattr(services, name, None)
        if callable(function):
            return function
    raise ServiceUnavailable("core_services chưa có hàm: {}.".format(" / ".join(names)))


def _call_query(function, query):
    if query:
        return function(**query)
    return function()


def _call_payload(function, payload):
    return function(**payload)


def _database_is_healthy():
    if not DATABASE_PATH.is_file():
        return False
    connection = None
    try:
        connection = sqlite3.connect(str(DATABASE_PATH), timeout=2)
        connection.execute("SELECT 1").fetchone()
        return True
    except sqlite3.Error:
        return False
    finally:
        if connection is not None:
            connection.close()


def _server_status():
    with _state_lock:
        client_count = len(_active_clients)
    return {
        "ok": True,
        "server": {"running": True, "host": HOST, "port": PORT},
        "database": {
            "healthy": _database_is_healthy(),
            "path": str(DATABASE_PATH),
        },
        "connected_clients": client_count,
    }


def _route_api(method, path, query, payload):
    if method == "OPTIONS":
        return 204, b""
    route_methods = {
        "/api/status": "GET",
        "/api/catalogs": "GET",
        "/api/inventory": "GET",
        "/api/fefo": "GET",
        "/api/alerts": "GET",
        "/api/recipes": "GET",
        "/api/recipes/suggest": "GET",
        "/api/shopping-list": "GET",
        "/api/audit-log": "GET",
        "/api/food/add": "POST",
        "/api/food/use": "POST",
        "/api/food/adjust": "POST",
        "/api/food/delete": "POST",
        "/api/simulation/date": "POST",
    }
    if path not in route_methods:
        return 404, {"error": "Không tìm thấy API.", "path": path}
    if method != route_methods[path]:
        return 405, {
            "error": "Sai HTTP method.",
            "expected_method": route_methods[path],
        }
    if path == "/api/status":
        return 200, _server_status()

    services = _load_core_services()
    get_routes = {
        "/api/catalogs": ("get_catalogs", "get_catalog_bundle", "list_catalogs"),
        "/api/inventory": ("get_inventory", "get_all_inventory", "list_food_items", "get_food_items"),
        "/api/fefo": ("get_fefo_recommendations", "get_fefo_items", "get_fefo_list", "get_fefo"),
        "/api/alerts": ("get_alerts", "get_inventory_alerts", "scan_alerts"),
        "/api/recipes": ("get_recipes", "list_recipes"),
        "/api/recipes/suggest": ("get_recipe_suggestions", "suggest_recipes", "recommend_recipes"),
        "/api/shopping-list": ("get_shopping_list", "generate_shopping_list"),
        "/api/audit-log": ("get_audit_log", "get_audit_logs", "list_inventory_transactions"),
    }
    if path in get_routes:
        function = _service_function(services, get_routes[path])
        return 200, _call_query(function, query)

    post_routes = {
        "/api/food/add": ("add_food", "add_food_item", "create_food_item"),
        "/api/food/adjust": ("adjust_food", "adjust_food_quantity", "adjust_inventory"),
        "/api/food/delete": ("soft_delete_food", "delete_food", "delete_food_item"),
        "/api/simulation/date": ("set_simulation_date", "set_system_date", "update_simulation_date"),
    }
    if path == "/api/food/use":
        function = _service_function(services, ("use_food",))
        item_id = payload.get("item_id")
        quantity = payload.get("quantity", payload.get("quantity_used"))
        reason = payload.get("reason", "")
        if item_id is None or quantity is None:
            raise RequestError("POST /api/food/use cần item_id và quantity.")
        try:
            result = function(int(item_id), float(quantity), str(reason))
        except (TypeError, ValueError):
            raise RequestError("item_id và quantity phải là số hợp lệ.")
        return 200, result
    function = _service_function(services, post_routes[path])
    result = _call_payload(function, payload)
    return (201 if path == "/api/food/add" else 200), result


def _find_static_root():
    candidates = (
        PROJECT_ROOT / "client",
        PROJECT_ROOT / "uidukien",
        PROJECT_ROOT / "TongHopvaTest" / "client",
    )
    for candidate in candidates:
        if candidate.is_dir() and (candidate / "index.html").is_file():
            return candidate.resolve()
    return None


def _static_content_type(path):
    suffix = path.suffix.lower()
    content_types = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".ico": "image/x-icon",
        ".txt": "text/plain; charset=utf-8",
    }
    return content_types.get(suffix, "application/octet-stream")


def _serve_static(path):
    static_root = _find_static_root()
    if static_root is None:
        return 404, {"error": "Không tìm thấy giao diện tĩnh (client/, uidukien/ hoặc TongHopvaTest/client/)."}
    relative_name = "index.html" if path == "/" else path.lstrip("/").replace("\\", "/")
    relative_path = Path(relative_name)
    if ".." in relative_path.parts:
        return 404, {"error": "Không tìm thấy tài nguyên."}
    target = (static_root / relative_path).resolve()
    try:
        target.relative_to(static_root)
    except ValueError:
        return 404, {"error": "Không tìm thấy tài nguyên."}
    if not target.is_file():
        return 404, {"error": "Không tìm thấy tài nguyên.", "path": path}
    try:
        return 200, target.read_bytes(), _static_content_type(target)
    except OSError:
        return 500, {"error": "Không đọc được tài nguyên tĩnh."}


def _sse_frame(event_name, data):
    return (
        "event: {}\ndata: {}\n\n".format(
            event_name,
            json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=str),
        )
    ).encode("utf-8")


def _remove_subscriber(subscriber_id):
    with _subscriber_lock:
        subscriber = _subscribers.pop(subscriber_id, None)
    if subscriber is not None:
        try:
            subscriber["socket"].shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        try:
            subscriber["socket"].close()
        except OSError:
            pass


def _broadcast_event(event_name, details=None):
    event_data = {
        "type": event_name,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "data": details or {},
    }
    frame = _sse_frame(event_name, event_data)
    with _subscriber_lock:
        subscribers = list(_subscribers.items())
    dead_ids = []
    for subscriber_id, subscriber in subscribers:
        try:
            with subscriber["send_lock"]:
                subscriber["socket"].sendall(frame)
        except OSError:
            dead_ids.append(subscriber_id)
    for subscriber_id in dead_ids:
        LOGGER.info("Removing disconnected SSE client %s", subscriber_id)
        _remove_subscriber(subscriber_id)


def _serve_sse(client_sock, client_id):
    subscriber = {"socket": client_sock, "send_lock": threading.Lock()}
    with _subscriber_lock:
        _subscribers[client_id] = subscriber
    header = (
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: text/event-stream; charset=utf-8\r\n"
        "Cache-Control: no-cache\r\n"
        "Connection: keep-alive\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Access-Control-Allow-Headers: Content-Type, Authorization\r\n"
        "X-Accel-Buffering: no\r\n\r\n"
    ).encode("ascii")
    try:
        with subscriber["send_lock"]:
            client_sock.sendall(header + b": connected\n\n")
        while True:
            time.sleep(SSE_HEARTBEAT_SECONDS)
            # SSE comment heartbeat lets clients detect broken Wi-Fi sessions.
            with subscriber["send_lock"]:
                client_sock.sendall(b": keep-alive\n\n")
    except OSError:
        LOGGER.info("SSE client %s disconnected", client_id)
    finally:
        _remove_subscriber(client_id)


def _handle_client(client_sock, address, client_id):
    try:
        client_sock.settimeout(CLIENT_TIMEOUT_SECONDS)
        method, target, headers, body = _read_request(client_sock)
        path, query = _split_target(target)
        if method == "OPTIONS":
            client_sock.sendall(_response(204))
            return

        if path == "/api/events":
            if method != "GET":
                client_sock.sendall(_response(405, _json_bytes({"error": "SSE chỉ hỗ trợ GET."})))
                return
            _serve_sse(client_sock, client_id)
            return

        if path.startswith("/api/"):
            payload = _read_json_body(headers, body) if method == "POST" else {}
            status, result = _route_api(method, path, query, payload)
            if status >= 400 and isinstance(result, dict):
                result.setdefault("request_id", str(client_id))
            response = _response(status, _json_bytes(result) if result != b"" else b"")
            client_sock.sendall(response)
            if status < 400 and method == "POST":
                event_name = "SIMULATION_DATE_CHANGED" if path == "/api/simulation/date" else "INVENTORY_CHANGED"
                _broadcast_event(event_name, {"path": path, "result": result})
            LOGGER.info("%s %s %s -> %s", address[0], method, path, status)
            return

        if method != "GET":
            client_sock.sendall(_response(405, _json_bytes({"error": "Tài nguyên tĩnh chỉ hỗ trợ GET."})))
            return
        static_result = _serve_static(path)
        status = static_result[0]
        if len(static_result) == 3:
            _, static_body, content_type = static_result
        else:
            _, value = static_result
            static_body = _json_bytes(value)
            content_type = "application/json; charset=utf-8"
        client_sock.sendall(_response(status, static_body, content_type))
    except RequestError as error:
        try:
            client_sock.sendall(_response(error.status, _json_bytes({"error": str(error)})))
        except OSError:
            pass
    except socket.timeout:
        try:
            client_sock.sendall(_response(408, _json_bytes({"error": "Client gửi request quá thời gian."})))
        except OSError:
            pass
    except ServiceUnavailable as error:
        try:
            client_sock.sendall(_response(503, _json_bytes({"error": str(error)})))
        except OSError:
            pass
    except (sqlite3.Error, OSError):
        LOGGER.exception("Request from %s failed due to socket or SQLite error", address[0])
        try:
            client_sock.sendall(_response(500, _json_bytes({"error": "Lỗi máy chủ nội bộ."})))
        except OSError:
            pass
    except Exception:
        LOGGER.exception("Unhandled request error from %s", address[0])
        try:
            client_sock.sendall(_response(500, _json_bytes({"error": "Lỗi máy chủ nội bộ."})))
        except OSError:
            pass
    finally:
        # SSE owns the socket for the lifetime of the event stream. Its finally
        # block will close it here when that worker returns.
        with _state_lock:
            _active_clients.discard(client_id)
        try:
            client_sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        try:
            client_sock.close()
        except OSError:
            pass


def serve_forever(host=HOST, port=PORT):
    global _next_client_id
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server_sock:
        server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server_sock.bind((host, port))
        server_sock.listen(BACKLOG)
        LOGGER.info("TCP server listening on %s:%s", host, port)
        print("Máy chủ TCP đang chạy tại {}:{}".format(host, port))
        print("Nhấn Ctrl+C để dừng.")
        try:
            while True:
                client_sock, address = server_sock.accept()
                with _state_lock:
                    client_id = _next_client_id
                    _next_client_id += 1
                    _active_clients.add(client_id)
                worker = threading.Thread(
                    target=_handle_client,
                    args=(client_sock, address, client_id),
                    name="tcp-client-{}".format(client_id),
                    daemon=True,
                )
                worker.start()
        except KeyboardInterrupt:
            print("\nĐã dừng TCP server.")


def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    serve_forever()


if __name__ == "__main__":
    main()
