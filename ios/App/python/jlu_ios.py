"""iOS 入口：在后台线程启动 吉大综合 本地 Web UI，只监听 127.0.0.1 的固定/空闲端口。

将数据目录与配置目录隔离到 iOS 应用沙盒（Application Support/jlu-data/config），
避免触碰不可写的容器根路径，同时复用全部 jlu_toolkit 核心逻辑与 React 前端。
"""
from __future__ import annotations

import os
import threading
from http.server import ThreadingHTTPServer
from typing import Optional

PREFERRED_PORT = 18765
_httpd: Optional[ThreadingHTTPServer] = None


def start(files_dir: str, app_version: Optional[str] = None) -> str:
    """启动本地服务并返回回环 URL；重复调用返回同一个地址。"""
    global _httpd
    if app_version and str(app_version).strip():
        os.environ["SUPERJLU_APP_VERSION"] = str(app_version).strip()
    if _httpd is not None:
        return f"http://127.0.0.1:{_httpd.server_address[1]}/"

    os.makedirs(files_dir, exist_ok=True)
    os.environ["XDG_CONFIG_HOME"] = os.path.join(files_dir, "config")
    os.environ["HOME"] = files_dir

    app_dir = os.path.dirname(os.path.abspath(__file__))
    studio_dist = os.path.join(app_dir, "studio_web", "dist")
    if os.path.isfile(os.path.join(studio_dist, "index.html")):
        os.environ.setdefault("JLU_STUDIO_DIST", studio_dist)

    from jlu_toolkit import ui

    store = ui.Store(ui.data_dir())
    try:
        httpd = ThreadingHTTPServer(("127.0.0.1", PREFERRED_PORT), ui.make_handler(store))
    except OSError:
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), ui.make_handler(store))
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, name="jlu-ui-ios", daemon=True).start()
    _httpd = httpd
    return f"http://127.0.0.1:{httpd.server_address[1]}/"


def auth_token() -> str:
    """读取当前本地接口令牌（供原生 WKWebView 注入 HttpOnly Cookie）。"""
    if _httpd is None:
        raise RuntimeError("UI server not started")
    return _httpd.RequestHandlerClass.auth_token


def stop() -> None:
    global _httpd
    if _httpd is not None:
        _httpd.shutdown()
        _httpd.server_close()
        _httpd = None
