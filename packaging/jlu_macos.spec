# -*- mode: python ; coding: utf-8 -*-
import re
from pathlib import Path
from PyInstaller.utils.hooks import collect_all

ROOT = Path(SPECPATH).parent

ver_txt = (ROOT / "jlu_toolkit" / "__init__.py").read_text(encoding="utf-8")
m = re.search(r'__version__\s*=\s*"([^"]+)"', ver_txt)
VERSION = m.group(1) if m else "1.3.4"

datas = [
    (str(ROOT / "jlu_toolkit" / "data"), "jlu_toolkit/data"),
    (str(ROOT / "assets" / "brand"), "assets/brand"),
    (str(ROOT / "frontend" / "dist"), "frontend/dist"),
    (str(ROOT / "LICENSE"), "."),
    (str(ROOT / "THIRD_PARTY_NOTICES.md"), "."),
]

hiddenimports = [
    "keyring.backends.macOS",
    "pystray._darwin",
    "webview",
]

tmp_ret = collect_all("webview")
datas += tmp_ret[0]
binaries = tmp_ret[1]
hiddenimports += tmp_ret[2]

a = Analysis(
    [str(ROOT / "app.py")],
    pathex=[str(ROOT)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="吉大综合",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    icon=str(ROOT / "assets" / "brand" / "jlu-zonghe.icns"),
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="吉大综合",
)

app = BUNDLE(
    coll,
    name="吉大综合.app",
    icon=str(ROOT / "assets" / "brand" / "jlu-zonghe.icns"),
    bundle_identifier="cn.superjlu.app",
    info_plist={
        "CFBundleDisplayName": "吉大综合",
        "CFBundleName": "吉大综合",
        "CFBundleShortVersionString": VERSION,
        "CFBundleVersion": VERSION,
        "NSHighResolutionCapable": True,
        "LSMinimumSystemVersion": "12.0",
        "NSAppTransportSecurity": {
            "NSAllowsLocalNetworking": True,
        },
    },
)
