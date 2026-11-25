# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path
from PyInstaller.utils.hooks import collect_all

ROOT = Path(SPECPATH).parent

datas = [
    (str(ROOT / "jlu_toolkit" / "data"), "jlu_toolkit/data"),
    (str(ROOT / "assets" / "brand"), "assets/brand"),
    (str(ROOT / "frontend" / "dist"), "frontend/dist"),
    (str(ROOT / "LICENSE"), "."),
    (str(ROOT / "THIRD_PARTY_NOTICES.md"), "."),
]

hiddenimports = [
    "keyring.backends.Windows",
    "pystray._win32",
    "webview",
    "clr_loader",
    "pythonnet",
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
    a.binaries,
    a.datas,
    [],
    name="吉大综合",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    icon=str(ROOT / "assets" / "brand" / "superjlu.ico"),
)
