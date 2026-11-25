"""跨平台适配、纯 Python AES-128-CFB 回退、iOS 入口与多端构建/图标资源校验。"""
from __future__ import annotations

import importlib.util
import json
import os
import py_compile
import urllib.request
from pathlib import Path

from jlu_toolkit import campus

ROOT = Path(__file__).resolve().parents[1]


def test_pure_python_aes128_cfb_matches_cryptography(monkeypatch):
    hosts = [
        "oa.jlu.edu.cn",
        "iedu.jlu.edu.cn",
        "cas.jlu.edu.cn",
        "ilearntec.jlu.edu.cn",
        "short.cn",
        "very-long-subdomain-host.campus.jlu.edu.cn",
    ]
    for h in hosts:
        expected_url = campus.vpn_url(f"https://{h}/test?a=1")
        with monkeypatch.context() as mp:
            mp.setattr(campus, "_HAS_CRYPTO", False)
            pure_url = campus.vpn_url(f"https://{h}/test?a=1")
            assert pure_url == expected_url
            assert campus.vpn_url_decode(pure_url) == f"https://{h}/test?a=1"

        # Verify legacy key decoding also matches under pure-Python fallback
        legacy_key = campus.VPN_KEY_LEGACY[0]
        tok_crypto = campus._encrypt_host(h, key=legacy_key)
        with monkeypatch.context() as mp:
            mp.setattr(campus, "_HAS_CRYPTO", False)
            assert campus._encrypt_host(h, key=legacy_key) == tok_crypto
            assert campus.vpn_url_decode(f"{campus.VPN_BASE}/http/{tok_crypto}/index.html") == f"http://{h}/index.html"


def test_ios_bootstrap_serves_studio_and_isolates_config(tmp_path, monkeypatch):
    for k in ("XDG_CONFIG_HOME", "HOME", "JLU_STUDIO_DIST", "SUPERJLU_APP_VERSION"):
        monkeypatch.delenv(k, raising=False)
    src = ROOT / "ios" / "App" / "python" / "jlu_ios.py"
    spec = importlib.util.spec_from_file_location("jlu_ios_t", src)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    data_root = tmp_path / "app_support"
    try:
        url = mod.start(str(data_root), app_version="1.3.4")
        assert url.startswith("http://127.0.0.1:")
        assert mod.start(str(data_root)) == url
        tok = mod.auth_token()
        assert len(tok) >= 32
        req = urllib.request.Request(url, headers={"X-SuperJLU-Token": tok})
        html = urllib.request.urlopen(req, timeout=5).read().decode("utf-8")
        assert "吉大综合" in html
        api_req = urllib.request.Request(url + "api/data", headers={"X-SuperJLU-Token": tok})
        snap = json.loads(urllib.request.urlopen(api_req, timeout=5).read().decode("utf-8"))
        assert "courses" in snap and "exams" in snap
        assert (data_root / "config" / "jlu-toolkit" / "data").is_dir()
    finally:
        mod.stop()


def test_apple_icons_valid():
    icns = ROOT / "assets" / "brand" / "jlu-zonghe.icns"
    assert icns.is_file() and icns.stat().st_size > 1024
    assert icns.read_bytes()[:4] == b"icns"

    PIL = __import__("PIL.Image", fromlist=["Image"])
    app_icon = ROOT / "ios" / "App" / "Resources" / "Assets.xcassets" / "AppIcon.appiconset" / "AppIcon-1024.png"
    assert app_icon.is_file()
    img = PIL.open(app_icon)
    assert img.size == (1024, 1024)
    assert img.mode == "RGB"


def test_github_and_multiplatform_files_present_and_compilable(tmp_path):
    required = [
        ".gitignore",
        ".gitattributes",
        ".github/workflows/ci.yml",
        ".github/workflows/release.yml",
        "packaging/jlu_macos.spec",
        "packaging/build_macos.py",
        "packaging/build_ios.py",
        "packaging/build_exe.py",
        "packaging/build_android.py",
        "ios/project.yml",
        "ios/App/Resources/Info.plist",
        "ios/App/Resources/dylib-Info-template.plist",
        "ios/App/Sources/AppDelegate.swift",
        "ios/App/Sources/MainViewController.swift",
        "ios/App/Sources/PythonRuntime.h",
        "ios/App/Sources/PythonRuntime.m",
        "启动吉大综合.command",
    ]
    for rel in required:
        p = ROOT / rel
        assert p.is_file() and p.stat().st_size > 0, f"Missing or empty: {rel}"

    for py_script in ("packaging/build_macos.py", "packaging/build_ios.py", "packaging/build_exe.py", "packaging/build_android.py"):
        py_compile.compile(str(ROOT / py_script), cfile=str(tmp_path / (Path(py_script).name + "c")), doraise=True)
