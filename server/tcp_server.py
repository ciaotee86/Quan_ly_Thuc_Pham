"""TCP socket HTTP server for the family food-management project.

This module deliberately uses only Python's standard library.  Business rules
and SQLite access belong to ``server/core_services.py`` and
``server/database.py`` respectively; this file only parses HTTP, routes requests,
and returns JSON responses.

Run from the repository root with::

    python server/tcp_server.py
"""

from __future__ import annotations

import importlib
import inspect
import json
import logging
import socket
import sys
import threading
import uuid
from datetime import datetime, timezone
from http import HTTPStatus
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit


HOST = "0.0.0.0"
PORT = 8080
BACKLOG = 50
RECV_SIZE = 4096
MAX_HEADER_BYTES = 64 * 1024
MAX_BODY_BYTES = 1024 * 1024
CLIENT_TIMEOUT_SECONDS = 15

LOGGER = logging.getLogger("food_management.tcp_server")


class HttpRequestError(Exception):
    """An invalid or incomplete HTTP request received from a client."""

    def __init__(self, message: str, status: int = HTTPStatus.BAD_REQUEST) -> None:
        super().__init__(message)
        self.status = int(status)


class ServiceUnavailableError(Exception):
    """Raised when the team's core-services module is not ready yet."""


def _utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _json_response(
    status: int,
    payload: Any = None,
    *,
    headers: dict[str, str] | None = None,
) -> bytes:
    """Build one complete HTTP/1.1 JSON response, including CORS headers."""
    body = b"" if payload is None else json.dumps(
        payload, ensure_ascii=False, separators=(",", ":"), default=str
    ).encode("utf-8")
    reason = HTTPStatus(status).phrase if status in HTTPStatus._value2member_map_ else "Unknown"
    response_headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": str(len(body)),
        "Connection": "close",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
    """Import the teammate-owned service layer only when an API call needs it."""
    project_root = str(Path(__file__).resolve().parent.parent)
    if project_root not in sys.path:
        sys.path.insert(0, project_root)
    try:
        return importlib.import_module("server.core_services")
    except ModuleNotFoundError as exc:
        # Do not disguise an import error inside core_services as a missing file.
        if exc.name in {"server", "server.core_services"}:
            raise ServiceUnavailableError(
                "Chưa có server/core_services.py. Hãy ghép Phần 2 để bật nghiệp vụ API."
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


def _dispatch(method: str, path: str, query: dict[str, str], payload: dict[str, Any]) -> tuple[int, Any]:
    """Route the agreed REST endpoints to the Part 2 business services."""
    if method == "OPTIONS":
        return HTTPStatus.NO_CONTENT, None

    route_methods: dict[str, str] = {
        "/api/fefo": "GET",
        "/api/inventory": "GET",
        "/api/food/add": "POST",
        "/api/food/use": "POST",
        "/api/food/adjust": "POST",
        "/api/food/delete": "POST",
        "/api/alerts": "GET",
        "/api/audit-log": "GET",
        "/api/simulation/date": "POST",
    }
    expected_method = route_methods.get(path)
    if expected_method is None:
        return HTTPStatus.NOT_FOUND, {"error": "Không tìm thấy API.", "path": path}
    if method != expected_method:
        return HTTPStatus.METHOD_NOT_ALLOWED, {
            "error": "Phương thức HTTP không được hỗ trợ cho API này.",
            "expected_method": expected_method,
        }

    services = _load_core_services()
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
    if path == "/api/food/add":
        function = _find_service(services, ("add_food", "add_food_item", "create_food_item"))
        return HTTPStatus.CREATED, _call_with_payload(function, payload)
    if path == "/api/food/use":
        function = _find_service(services, ("use_food",))
        item_id = payload.get("item_id")
        quantity = payload.get("quantity", payload.get("quantity_used"))
        reason = payload.get("reason", "")
        if item_id is None or quantity is None:
            raise HttpRequestError("JSON cần có item_id và quantity (hoặc quantity_used).")
        try:
            result = function(int(item_id), float(quantity), str(reason))
        except (TypeError, ValueError) as exc:
            raise HttpRequestError("item_id và quantity phải là số hợp lệ.") from exc
        return HTTPStatus.OK, result
    if path == "/api/food/adjust":
        function = _find_service(
            services, ("adjust_food", "adjust_food_quantity", "adjust_inventory")
        )
        return HTTPStatus.OK, _call_with_payload(function, payload)
    if path == "/api/food/delete":
        function = _find_service(
            services, ("soft_delete_food", "delete_food", "delete_food_item")
        )
        return HTTPStatus.OK, _call_with_payload(function, payload)
    if path == "/api/alerts":
        function = _find_service(services, ("get_alerts", "get_inventory_alerts", "scan_alerts"))
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
        return HTTPStatus.OK, _call_with_payload(function, payload)
    return HTTPStatus.NOT_FOUND, {"error": "Không tìm thấy API.", "path": path}


def _handle_client(client_sock: socket.socket, client_address: tuple[str, int]) -> None:
    request_id = uuid.uuid4().hex[:12]
    started_at = datetime.now(timezone.utc)
    client_sock.settimeout(CLIENT_TIMEOUT_SECONDS)
    try:
        method, target, headers, body = _read_http_request(client_sock)
        parsed_target = urlsplit(target)
        path = parsed_target.path.rstrip("/") or "/"
        query = _unwrap_query(parse_qs(parsed_target.query, keep_blank_values=True))
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
