"""TCP socket HTTP & SSE server for the family food-management project.

Pure Controller / Network Layer (Python standard library only):
- Never imports `server.database` directly.
- Routes all REST calls to `server.core_services` (which delegates to `server.models`).
- Streams live Server-Sent Events (`GET /api/events`) with `inventory_updated`
  notifications whenever inventory or simulation state changes.

Run from the repository root with::

    python server/tcp_server.py
"""

from __future__ import annotations

import importlib
import inspect
import json
import logging
import queue
import socket
import sys
import threading
import uuid
from datetime import datetime, timezone
from http import HTTPStatus
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlsplit


HOST = "0.0.0.0"
PORT = 8080
BACKLOG = 50
RECV_SIZE = 4096
MAX_HEADER_BYTES = 64 * 1024
MAX_BODY_BYTES = 1024 * 1024
CLIENT_TIMEOUT_SECONDS = 20
SSE_HEARTBEAT_SECONDS = 20.0

LOGGER = logging.getLogger("food_management.tcp_server")
PROJECT_ROOT = Path(__file__).resolve().parent.parent
_CLIENTS_LOCK = threading.RLock()
_ACTIVE_CLIENTS: set[int] = set()


class HttpRequestError(Exception):
    """An invalid or incomplete HTTP request received from a client."""

    def __init__(self, message: str, status: int = HTTPStatus.BAD_REQUEST) -> None:
        super().__init__(message)
        self.status = int(status)


class ServiceUnavailableError(Exception):
    """Raised when the core-services module is not ready."""


class SseBroker:
    """Thread-safe fan-out broker for Server-Sent Events (SSE) clients."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._subscribers: list[queue.Queue[tuple[str, dict[str, Any]]]] = []

    def subscribe(self) -> queue.Queue[tuple[str, dict[str, Any]]]:
        sub_queue: queue.Queue[tuple[str, dict[str, Any]]] = queue.Queue(maxsize=128)
        with self._lock:
            self._subscribers.append(sub_queue)
        return sub_queue

    def unsubscribe(self, sub_queue: queue.Queue[tuple[str, dict[str, Any]]]) -> None:
        with self._lock:
            if sub_queue in self._subscribers:
                self._subscribers.remove(sub_queue)

    def publish(self, event_name: str, data: dict[str, Any]) -> int:
        with self._lock:
            subscribers = list(self._subscribers)
        delivered = 0
        for sub_queue in subscribers:
            try:
                sub_queue.put_nowait((event_name, data))
                delivered += 1
            except queue.Full:
                pass
        return delivered

    @property
    def subscriber_count(self) -> int:
        with self._lock:
            return len(self._subscribers)


SSE_BROKER = SseBroker()

_STATIC_ROOT_CANDIDATES = (
    PROJECT_ROOT / "client",
    PROJECT_ROOT / "uidukien",
    PROJECT_ROOT / "TongHopvaTest" / "client",
)
_STATIC_CONTENT_TYPES = {
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


def _find_static_root() -> Path | None:
    """Find the first supported frontend folder, independent of cwd."""
    for candidate in _STATIC_ROOT_CANDIDATES:
        if candidate.is_dir() and (candidate / "index.html").is_file():
            return candidate.resolve()
    return None


def _serve_static(path: str) -> tuple[int, bytes, str]:
    """Serve a file from the discovered frontend folder without path traversal."""
    static_root = _find_static_root()
    if static_root is None:
        return (
            HTTPStatus.NOT_FOUND,
            b"Frontend not found. Expected client/, uidukien/, or TongHopvaTest/client/.",
            "text/plain; charset=utf-8",
        )

    relative = "index.html" if path == "/" else unquote(path).lstrip("/").replace("\\", "/")
    target = (static_root / relative).resolve()
    try:
        target.relative_to(static_root)
    except ValueError:
        return HTTPStatus.NOT_FOUND, b"Resource not found.", "text/plain; charset=utf-8"
    if not target.is_file():
        return HTTPStatus.NOT_FOUND, b"Resource not found.", "text/plain; charset=utf-8"
    try:
        content = target.read_bytes()
    except OSError:
        return HTTPStatus.INTERNAL_SERVER_ERROR, b"Could not read resource.", "text/plain; charset=utf-8"
    content_type = _STATIC_CONTENT_TYPES.get(target.suffix.lower(), "application/octet-stream")
    return HTTPStatus.OK, content, content_type


def _utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _json_response(
    status: int,
    payload: Any = None,
    *,
    headers: dict[str, str] | None = None,
) -> bytes:
    """Build one complete HTTP/1.1 JSON response, including CORS headers."""
    body = (
        b""
        if payload is None
        else json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str).encode("utf-8")
    )
    reason = HTTPStatus(status).phrase if status in HTTPStatus._value2member_map_ else "Unknown"
    response_headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": str(len(body)),
        "Connection": "close",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Cache-Control",
        "Access-Control-Max-Age": "86400",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
    }
    if headers:
        response_headers.update(headers)
    head = [f"HTTP/1.1 {status} {reason}\r\n"]
    head.extend(f"{key}: {value}\r\n" for key, value in response_headers.items())
    head.append("\r\n")
    return "".join(head).encode("ascii") + body


def _format_sse_event(event_name: str, data: dict[str, Any]) -> bytes:
    encoded_data = json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=str)
    return f"event: {event_name}\ndata: {encoded_data}\n\n".encode("utf-8")


def _stream_sse(client_sock: socket.socket, client_address: tuple[str, int], request_id: str) -> None:
    """Keep the TCP socket open and stream Server-Sent Events."""
    sub_queue = SSE_BROKER.subscribe()
    try:
        client_sock.settimeout(None)
        headers = (
            "HTTP/1.1 200 OK\r\n"
            "Content-Type: text/event-stream; charset=utf-8\r\n"
            "Cache-Control: no-cache\r\n"
            "Connection: keep-alive\r\n"
            "Access-Control-Allow-Origin: *\r\n"
            "X-Accel-Buffering: no\r\n"
            "\r\n"
        ).encode("ascii")
        client_sock.sendall(headers)
        client_sock.sendall(
            _format_sse_event(
                "connected",
                {
                    "ok": True,
                    "request_id": request_id,
                    "timestamp": _utc_timestamp(),
                    "message": "SSE stream connected",
                },
            )
        )
        LOGGER.info("%s GET /api/events -> 200 SSE connected", client_address[0])

        while True:
            try:
                event_name, payload = sub_queue.get(timeout=SSE_HEARTBEAT_SECONDS)
                client_sock.sendall(_format_sse_event(event_name, payload))
            except queue.Empty:
                client_sock.sendall(b": ping\n\n")
    except OSError:
        LOGGER.debug("SSE client disconnected: %s", client_address[0])
    finally:
        SSE_BROKER.unsubscribe(sub_queue)


def _read_http_request(client_sock: socket.socket) -> tuple[str, str, dict[str, str], bytes]:
    """Read one HTTP request, honoring Content-Length across recv() chunks."""
    received = bytearray()
    header_end = -1
    while header_end < 0:
        chunk = client_sock.recv(RECV_SIZE)
        if not chunk:
            raise HttpRequestError("Client closed the connection before sending headers.")
        received.extend(chunk)
        if len(received) > MAX_HEADER_BYTES and b"\r\n\r\n" not in received:
            raise HttpRequestError("Request headers are too large.", HTTPStatus.REQUEST_HEADER_FIELDS_TOO_LARGE)
        header_end = received.find(b"\r\n\r\n")

    raw_headers = bytes(received[:header_end])
    body = bytearray(received[header_end + 4 :])
    try:
        header_text = raw_headers.decode("iso-8859-1")
    except UnicodeDecodeError as exc:
        raise HttpRequestError("Invalid request headers.") from exc

    lines = header_text.split("\r\n")
    request_line = lines[0].split()
    if len(request_line) != 3:
        raise HttpRequestError("Malformed HTTP request line.")
    method, target, http_version = request_line
    if not http_version.startswith("HTTP/"):
        raise HttpRequestError("Unsupported HTTP version.")

    headers: dict[str, str] = {}
    for line in lines[1:]:
        if not line:
            continue
        if ":" not in line:
            raise HttpRequestError("Malformed HTTP header.")
        key, value = line.split(":", 1)
        key = key.strip().lower()
        if not key:
            raise HttpRequestError("Malformed HTTP header name.")
        headers[key] = value.strip()

    if headers.get("transfer-encoding", "").lower() == "chunked":
        raise HttpRequestError("Chunked request bodies are not supported; send Content-Length.")
    if method.upper() == "POST" and "content-length" not in headers:
        raise HttpRequestError("POST requests must include Content-Length.", HTTPStatus.LENGTH_REQUIRED)
    try:
        content_length = int(headers.get("content-length", "0"))
    except ValueError as exc:
        raise HttpRequestError("Content-Length must be an integer.") from exc
    if content_length < 0:
        raise HttpRequestError("Content-Length cannot be negative.")
    if content_length > MAX_BODY_BYTES:
        raise HttpRequestError("Request body is too large.", HTTPStatus.REQUEST_ENTITY_TOO_LARGE)

    while len(body) < content_length:
        chunk = client_sock.recv(min(RECV_SIZE, content_length - len(body)))
        if not chunk:
            raise HttpRequestError("Request body ended before Content-Length bytes arrived.")
        body.extend(chunk)

    return method.upper(), target, headers, bytes(body[:content_length])


def _load_core_services() -> Any:
    """Import the service facade layer (`server.core_services`)."""
    project_root = str(Path(__file__).resolve().parent.parent)
    if project_root not in sys.path:
        sys.path.insert(0, project_root)
    try:
        return importlib.import_module("server.core_services")
    except ModuleNotFoundError as exc:
        if exc.name in {"server", "server.core_services"}:
            raise ServiceUnavailableError(
                "Chưa có server/core_services.py. Hãy kiểm tra tầng dịch vụ nghiệp vụ."
            ) from exc
        raise ServiceUnavailableError(
            f"Không thể nạp tầng nghiệp vụ do thiếu module: {exc.name}."
        ) from exc


def _find_service(services: Any, candidates: tuple[str, ...]) -> Any:
    for name in candidates:
        function = getattr(services, name, None)
        if callable(function):
            return function
    names = ", ".join(candidates)
    raise ServiceUnavailableError(
        f"Tầng nghiệp vụ chưa khai báo hàm phù hợp (đang tìm: {names})."
    )


def _call_with_query(function: Any, query: dict[str, str]) -> Any:
    """Pass only query parameters accepted by a service function."""
    try:
        signature = inspect.signature(function)
    except (TypeError, ValueError):
        return function()
    parameters = signature.parameters
    if any(p.kind == inspect.Parameter.VAR_KEYWORD for p in parameters.values()):
        return function(**query)
    accepted = {
        name: value
        for name, value in query.items()
        if name in parameters
        and parameters[name].kind
        in (inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY)
    }
    return function(**accepted)


def _call_with_payload(function: Any, payload: dict[str, Any]) -> Any:
    """Adapt a JSON object to a service function's declared parameters."""
    try:
        signature = inspect.signature(function)
    except (TypeError, ValueError):
        return function(payload)
    parameters = signature.parameters
    if any(p.kind == inspect.Parameter.VAR_KEYWORD for p in parameters.values()):
        return function(**payload)
    if len(parameters) == 1:
        only_parameter = next(iter(parameters.values()))
        if only_parameter.name in {"payload", "data", "body", "request_data"}:
            return function(payload)
    accepted = {
        name: value
        for name, value in payload.items()
        if name in parameters
        and parameters[name].kind
        in (inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY)
    }
    required = [
        p.name
        for p in parameters.values()
        if p.default is inspect.Parameter.empty
        and p.kind in (inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY)
    ]
    missing = [name for name in required if name not in accepted]
    if missing:
        raise HttpRequestError(f"Thiếu trường bắt buộc trong JSON: {', '.join(missing)}.")
    return function(**accepted)


def _unwrap_query(query_values: dict[str, list[str]]) -> dict[str, str]:
    return {key: values[-1] for key, values in query_values.items() if values}


def _parse_json_body(body: bytes) -> dict[str, Any]:
    if not body:
        return {}
    try:
        value = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HttpRequestError("Body phải là JSON UTF-8 hợp lệ.") from exc
    if not isinstance(value, dict):
        raise HttpRequestError("Body JSON phải là một object.")
    return value


def _normalize_add_payload(payload: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(payload)
    if "expiration_date" not in normalized and "expiry_date" in normalized:
        normalized["expiration_date"] = normalized["expiry_date"]
    if "notes" not in normalized and "note" in normalized:
        normalized["notes"] = normalized["note"]
    return normalized


def _normalize_adjust_payload(payload: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(payload)
    if "new_quantity" not in normalized and "quantity" in normalized:
        normalized["new_quantity"] = normalized["quantity"]
    return normalized


def _normalize_date_payload(payload: dict[str, Any]) -> dict[str, Any]:
    date_val = (
        payload.get("simulation_date")
        or payload.get("new_date")
        or payload.get("new_date_str")
        or payload.get("date")
    )
    if not date_val:
        raise HttpRequestError("Thiếu trường simulation_date (YYYY-MM-DD).")
    return {"simulation_date": str(date_val), "new_date_str": str(date_val)}


def _dispatch(method: str, path: str, query: dict[str, str], payload: dict[str, Any]) -> tuple[int, Any]:
    """Route REST endpoints strictly to `server.core_services`."""
    if method == "OPTIONS":
        return HTTPStatus.NO_CONTENT, None

    route_methods: dict[str, str] = {
        "/api/status": "GET",
        "/api/events": "GET",
        "/api/catalogs": "GET",
        "/api/fefo": "GET",
        "/api/inventory": "GET",
        "/api/alerts": "GET",
        "/api/shopping-list": "GET",
        "/api/recipes": "GET",
        "/api/recipes/suggest": "GET",
        "/api/audit-log": "GET",
        "/api/simulation/date": "POST",
        "/api/food/add": "POST",
        "/api/food/use": "POST",
        "/api/food/adjust": "POST",
        "/api/food/delete": "POST",
    }
    expected_method = route_methods.get(path)
    if expected_method is None:
        return HTTPStatus.NOT_FOUND, {"error": "Không tìm thấy API.", "path": path}
    if method != expected_method:
        return HTTPStatus.METHOD_NOT_ALLOWED, {
            "error": "Phương thức HTTP không được hỗ trợ cho API này.",
            "expected_method": expected_method,
        }

    if path == "/api/events":
        return HTTPStatus.OK, {
            "ok": True,
            "stream": "text/event-stream",
            "event": "inventory_updated",
            "subscribers": SSE_BROKER.subscriber_count,
        }

    services = _load_core_services()

    if path == "/api/status":
        function = _find_service(services, ("get_status",))
        status = _call_with_query(function, query)
        if not isinstance(status, dict):
            status = {"service_status": status}
        else:
            status = dict(status)
        with _CLIENTS_LOCK:
            connected_clients = len(_ACTIVE_CLIENTS)
        status["socket_server"] = {
            "running": True,
            "host": HOST,
            "port": PORT,
            "connected_clients": connected_clients,
        }
        return HTTPStatus.OK, status

    if path == "/api/catalogs":
        function = _find_service(services, ("get_catalogs", "get_metadata"))
        return HTTPStatus.OK, _call_with_query(function, query)

    if path == "/api/fefo":
        function = _find_service(
            services,
            ("get_fefo_recommendations", "get_fefo_items", "get_fefo_list", "get_fefo"),
        )
        return HTTPStatus.OK, _call_with_query(function, query)

    if path == "/api/inventory":
        function = _find_service(
            services, ("get_inventory", "get_all_inventory", "list_food_items", "get_food_items")
        )
        return HTTPStatus.OK, _call_with_query(function, query)

    if path == "/api/alerts":
        function = _find_service(services, ("get_alerts", "get_inventory_alerts", "scan_alerts"))
        return HTTPStatus.OK, _call_with_query(function, query)

    if path == "/api/shopping-list":
        function = _find_service(services, ("get_shopping_list",))
        return HTTPStatus.OK, _call_with_query(function, query)

    if path == "/api/recipes":
        function = _find_service(services, ("get_recipes", "get_all_recipes"))
        return HTTPStatus.OK, _call_with_query(function, query)

    if path == "/api/recipes/suggest":
        function = _find_service(services, ("suggest_recipes",))
        return HTTPStatus.OK, _call_with_query(function, query)

    if path == "/api/audit-log":
        function = _find_service(
            services, ("get_audit_log", "get_audit_logs", "list_inventory_transactions")
        )
        return HTTPStatus.OK, _call_with_query(function, query)

    if path == "/api/simulation/date":
        function = _find_service(
            services, ("set_simulation_date", "set_system_date", "update_simulation_date")
        )
        norm_payload = _normalize_date_payload(payload)
        result = _call_with_payload(function, norm_payload)
        SSE_BROKER.publish(
            "inventory_updated",
            {"action": "simulation_date", "timestamp": _utc_timestamp(), "data": result},
        )
        return HTTPStatus.OK, result

    if path == "/api/food/add":
        function = _find_service(services, ("add_food_item", "add_food", "create_food_item"))
        norm_payload = _normalize_add_payload(payload)
        result = _call_with_payload(function, norm_payload)
        SSE_BROKER.publish(
            "inventory_updated",
            {"action": "food_added", "timestamp": _utc_timestamp(), "data": result},
        )
        return HTTPStatus.CREATED, result

    if path == "/api/food/use":
        function = _find_service(services, ("use_food",))
        item_id = payload.get("item_id")
        quantity = payload.get("quantity", payload.get("quantity_used", payload.get("use_quantity")))
        reason = payload.get("reason", "Nấu ăn hàng ngày")
        actor_device = payload.get("actor_device", "Client")
        if item_id is None or quantity is None:
            raise HttpRequestError("JSON cần có item_id và quantity (hoặc quantity_used).")
        try:
            result = function(int(item_id), float(quantity), str(reason), str(actor_device))
        except (TypeError, ValueError) as exc:
            raise HttpRequestError(str(exc)) from exc
        SSE_BROKER.publish(
            "inventory_updated",
            {"action": "food_used", "timestamp": _utc_timestamp(), "data": result},
        )
        return HTTPStatus.OK, result

    if path == "/api/food/adjust":
        function = _find_service(
            services, ("adjust_food", "adjust_food_quantity", "adjust_inventory")
        )
        norm_payload = _normalize_adjust_payload(payload)
        result = _call_with_payload(function, norm_payload)
        SSE_BROKER.publish(
            "inventory_updated",
            {"action": "food_adjusted", "timestamp": _utc_timestamp(), "data": result},
        )
        return HTTPStatus.OK, result

    if path == "/api/food/delete":
        function = _find_service(
            services, ("delete_food_item", "soft_delete_food", "delete_food")
        )
        result = _call_with_payload(function, payload)
        SSE_BROKER.publish(
            "inventory_updated",
            {"action": "food_deleted", "timestamp": _utc_timestamp(), "data": result},
        )
        return HTTPStatus.OK, result

    return HTTPStatus.NOT_FOUND, {"error": "Không tìm thấy API.", "path": path}


def _handle_client(client_sock: socket.socket, client_address: tuple[str, int]) -> None:
    request_id = uuid.uuid4().hex[:12]
    started_at = datetime.now(timezone.utc)
    client_sock.settimeout(CLIENT_TIMEOUT_SECONDS)
    try:
        method, target, _headers, body = _read_http_request(client_sock)
        parsed_target = urlsplit(target)
        path = parsed_target.path.rstrip("/") or "/"
        query = _unwrap_query(parse_qs(parsed_target.query, keep_blank_values=True))

        if method == "GET" and path == "/api/events":
            _stream_sse(client_sock, client_address, request_id)
            return

        if not path.startswith("/api/"):
            if method == "OPTIONS":
                response = _json_response(HTTPStatus.NO_CONTENT)
            elif method != "GET":
                response = _json_response(
                    HTTPStatus.METHOD_NOT_ALLOWED,
                    {"error": "Static resources support GET only.", "request_id": request_id},
                    headers={"Allow": "GET, OPTIONS"},
                )
            else:
                status, content, content_type = _serve_static(path)
                response = _static_response(status, content, content_type)
            client_sock.sendall(response)
            LOGGER.info("%s %s %s -> static", client_address[0], method, path)
            return

        if method == "OPTIONS":
            status, result = HTTPStatus.NO_CONTENT, None
        else:
            payload = _parse_json_body(body) if method == "POST" else {}
            status, result = _dispatch(method, path, query, payload)

        response_payload = result
        if status >= 400:
            response_payload = {
                "error": result.get("error", "Yêu cầu không thành công.")
                if isinstance(result, dict)
                else str(result),
                "request_id": request_id,
            }
            if isinstance(result, dict):
                response_payload.update({k: v for k, v in result.items() if k != "error"})

        response = _json_response(int(status), response_payload)
        LOGGER.info("%s %s %s -> %s", client_address[0], method, path, status)
    except HttpRequestError as exc:
        response = _json_response(
            exc.status,
            {"error": str(exc), "request_id": request_id},
        )
        LOGGER.warning("%s invalid request: %s", client_address[0], exc)
    except ValueError as exc:
        response = _json_response(
            HTTPStatus.BAD_REQUEST,
            {"error": str(exc), "request_id": request_id},
        )
        LOGGER.warning("%s validation error: %s", client_address[0], exc)
    except ServiceUnavailableError as exc:
        response = _json_response(
            HTTPStatus.SERVICE_UNAVAILABLE,
            {"error": str(exc), "request_id": request_id},
        )
        LOGGER.warning("%s service unavailable: %s", client_address[0], exc)
    except socket.timeout:
        response = _json_response(
            HTTPStatus.REQUEST_TIMEOUT,
            {"error": "Hết thời gian chờ dữ liệu từ client.", "request_id": request_id},
        )
        LOGGER.warning("%s request timed out", client_address[0])
    except Exception:
        response = _json_response(
            HTTPStatus.INTERNAL_SERVER_ERROR,
            {"error": "Lỗi nội bộ máy chủ.", "request_id": request_id},
        )
        LOGGER.exception("%s request failed", client_address[0])

    try:
        client_sock.sendall(response)
    except OSError:
        LOGGER.debug("Could not send response to %s", client_address[0])
    finally:
        elapsed_ms = (datetime.now(timezone.utc) - started_at).total_seconds() * 1000
        LOGGER.debug("request_id=%s duration_ms=%.1f", request_id, elapsed_ms)
        try:
            client_sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        client_sock.close()
        with _CLIENTS_LOCK:
            _ACTIVE_CLIENTS.discard(id(client_sock))


def _static_response(status: int, body: bytes, content_type: str) -> bytes:
    reason = HTTPStatus(status).phrase if status in HTTPStatus._value2member_map_ else "Unknown"
    headers = (
        f"HTTP/1.1 {int(status)} {reason}\r\n"
        f"Content-Type: {content_type}\r\n"
        f"Content-Length: {len(body)}\r\n"
        "Connection: close\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "X-Content-Type-Options: nosniff\r\n\r\n"
    ).encode("ascii")
    return headers + body


def serve_forever(host: str = HOST, port: int = PORT) -> None:
    """Bind the required TCP socket and serve each accepted client in a thread."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server_sock:
        server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server_sock.bind((host, port))
        server_sock.listen(BACKLOG)
        LOGGER.info("Food Management TCP server listening on %s:%s", host, port)
        print(f"Máy chủ TCP đang lắng nghe tại {host}:{port}")
        print("Nhấn Ctrl+C để dừng máy chủ.")
        try:
            while True:
                client_sock, client_address = server_sock.accept()
                with _CLIENTS_LOCK:
                    _ACTIVE_CLIENTS.add(id(client_sock))
                worker = threading.Thread(
                    target=_handle_client,
                    args=(client_sock, client_address),
                    name=f"client-{client_address[0]}-{client_address[1]}",
                    daemon=True,
                )
                worker.start()
        except KeyboardInterrupt:
            print("\nĐã dừng máy chủ TCP.")


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    serve_forever()


if __name__ == "__main__":
    main()
