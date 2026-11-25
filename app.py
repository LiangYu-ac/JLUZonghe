"""SuperJLU Studio 桌面启动入口。

默认以原生桌面窗口（pywebview Edge WebView2）启动，自动降级至
Microsoft Edge / Chrome 独立无地址栏桌面窗口（--app=）或系统默认浏览器 + 托盘图标。
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import threading
import webbrowser
from pathlib import Path
from typing import Optional

from jlu_toolkit import __version__, desktop, ui


def _find_app_browser() -> Optional[str]:
    """查找支持 --app= 独立窗口模式的 Chromium/Edge 浏览器。"""
    if sys.platform == "darwin":
        candidates = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        ]
    else:
        candidates = [
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        ]
    for p in candidates:
        if os.path.isfile(p):
            return p
    for cmd in ("msedge", "chrome", "chromium"):
        found = shutil.which(cmd)
        if found:
            return found
    return None


def _launch_pywebview(url: str, title: str, shutdown_cb) -> bool:
    """使用 pywebview 打开真正原生桌面窗口；失败返回 False。"""
    try:
        import webview  # type: ignore
    except Exception:
        return False

    try:
        webview.settings["ALLOW_DOWNLOADS"] = True
        window = webview.create_window(
            title,
            url,
            width=1340,
            height=880,
            min_size=(960, 660),
            text_select=True,
        )
        icon = desktop.icon_path()
        kwargs = {}
        if icon is not None and sys.platform.startswith("linux"):
            kwargs["icon"] = str(icon)
        webview.start(**kwargs)
        shutdown_cb()
        return True
    except Exception as exc:
        desktop._setup_logging().warning("pywebview 启动失败，自动降级：%s", exc)
        return False


def _launch_app_window(url: str) -> Optional[subprocess.Popen]:
    exe = _find_app_browser()
    if not exe:
        return None
    profile_dir = ui.jwxt.config_dir() / "browser_app_profile"
    profile_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        exe,
        f"--app={url}",
        f"--user-data-dir={profile_dir}",
        "--window-size=1340,880",
        "--disable-extensions",
    ]
    return subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="吉大综合 — 吉林大学一站式校园服务桌面端")
    parser.add_argument("--browser", action="store_true", help="使用系统默认浏览器打开，而非桌面独立窗口")
    parser.add_argument("--app-window", action="store_true", help="强制使用 Edge/Chrome 独立应用窗口")
    parser.add_argument("--port", type=int, default=None, help="指定监听端口（默认优先 8765）")
    parser.add_argument("--no-tray", action="store_true", help="禁用系统托盘图标")
    parser.add_argument("--headless", action="store_true", help="仅启动本机服务并打印地址，不弹窗")
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    log = desktop._setup_logging()

    try:
        if not args.headless and args.port is None:
            old = desktop.existing_instance()
            if old:
                url = ui.launch_url(desktop.url_for(old))
                log.info("检测到已在运行的 吉大综合 实例，端口 %s", old)
                if args.browser:
                    webbrowser.open(url)
                else:
                    proc = _launch_app_window(url)
                    if proc is None:
                        webbrowser.open(url)
                return 0

        httpd, base_url = desktop.start_server(port=args.port)
        port = httpd.server_address[1]
        if args.port is None:
            desktop.write_state(port)
        token = httpd.RequestHandlerClass.auth_token
        launch_url = ui.launch_url(base_url, token)
        log.info("吉大综合 v%s 已启动：%s", __version__, base_url)

        stopped = threading.Event()

        def shutdown():
            if not stopped.is_set():
                stopped.set()
                httpd.shutdown()
                httpd.server_close()
                if args.port is None:
                    desktop.clear_state(port)
                log.info("吉大综合 已退出")

        if sys.stdout is not None:
            print(f"吉大综合 v{__version__}: {launch_url}", flush=True)

        try:
            if args.headless:
                stopped.wait()
                return 0

            if not args.browser and not args.app_window:
                title = "吉大综合"
                if _launch_pywebview(launch_url, title, shutdown):
                    return 0

            def open_ui(u: str):
                full = ui.launch_url(u, token)
                if not args.browser:
                    proc = _launch_app_window(full)
                    if proc is not None:
                        return proc
                return webbrowser.open(full)

            if not args.browser:
                proc = _launch_app_window(launch_url)
                if proc is not None:
                    if args.no_tray or not desktop.run_tray(base_url, shutdown, open_ui):
                        proc.wait()
                        shutdown()
                    return 0

            webbrowser.open(launch_url)
            if args.no_tray or not desktop.run_tray(base_url, shutdown, open_ui):
                if sys.stdout is not None:
                    print("按 Ctrl+C 退出 吉大综合。", flush=True)
                stopped.wait()
        except KeyboardInterrupt:
            pass
        finally:
            shutdown()
        return 0
    except Exception:
        log.exception("吉大综合 启动异常")
        raise


if __name__ == "__main__":
    sys.exit(main())
