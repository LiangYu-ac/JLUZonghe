"""一键构建 吉大综合 macOS .app 与 .dmg 安装镜像。"""
from __future__ import annotations

import argparse
import hashlib
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
DIST = ROOT / "dist"


def _read_version() -> str:
    txt = (ROOT / "jlu_toolkit" / "__init__.py").read_text(encoding="utf-8")
    m = re.search(r'__version__\s*=\s*"([^"]+)"', txt)
    return m.group(1) if m else "1.3.4"


def _norm_arch() -> str:
    m = platform.machine().lower()
    if m in ("arm64", "aarch64"):
        return "arm64"
    if m in ("x86_64", "amd64"):
        return "x86_64"
    return m or "universal"


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="构建 吉大综合 macOS .app / .dmg")
    parser.add_argument("--skip-frontend", action="store_true", help="跳过 npm run build（复用现有 frontend/dist）")
    parser.add_argument("--no-dmg", action="store_true", help="仅构建 .app，不封装 .dmg")
    args = parser.parse_args(argv)

    if sys.platform != "darwin":
        print("build_macos.py 需要在 macOS 上运行以生成 .app 与 .dmg。", file=sys.stderr)
        return 1

    if not args.skip_frontend:
        npm = shutil.which("npm")
        if not npm:
            print("未找到 npm，请先安装 Node.js", file=sys.stderr)
            return 1
        print("[1/4] 构建前端生产资源...")
        subprocess.run([npm, "run", "build"], cwd=str(FRONTEND), check=True)

    version = _read_version()
    arch = _norm_arch()
    print(f"[2/4] 使用 PyInstaller 打包 吉大综合.app（v{version}, {arch}）...")
    subprocess.run(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--clean",
            str(ROOT / "packaging" / "jlu_macos.spec"),
        ],
        cwd=str(ROOT),
        check=True,
    )

    app_path = DIST / "吉大综合.app"
    if not app_path.is_dir():
        raise FileNotFoundError(f"未找到构建产物：{app_path}")

    codesign = shutil.which("codesign")
    if codesign:
        print("[3/4] 执行本地 ad-hoc 签名...")
        res = subprocess.run([codesign, "--force", "--deep", "--sign", "-", str(app_path)])
        if res.returncode != 0:
            print("提示：ad-hoc codesign 未完成，继续生成分发包。", file=sys.stderr)

    if args.no_dmg:
        print(f"[4/4] 构建完成：{app_path}")
        return 0

    hdiutil = shutil.which("hdiutil")
    if not hdiutil:
        print("未找到 hdiutil，跳过 .dmg 封装。", file=sys.stderr)
        return 0

    dmg_out = DIST / f"吉大综合-{version}-macos-{arch}.dmg"
    if dmg_out.exists():
        dmg_out.unlink()

    with tempfile.TemporaryDirectory() as td:
        stage = Path(td) / "dmg_stage"
        stage.mkdir(parents=True, exist_ok=True)
        shutil.copytree(app_path, stage / "吉大综合.app", symlinks=True)
        os.symlink("/Applications", stage / "Applications")
        print(f"[4/4] 封装 {dmg_out.name}...")
        subprocess.run(
            [
                hdiutil,
                "create",
                "-volname",
                "吉大综合",
                "-srcfolder",
                str(stage),
                "-ov",
                "-format",
                "UDZO",
                str(dmg_out),
            ],
            check=True,
        )

    sha = hashlib.sha256(dmg_out.read_bytes()).hexdigest()
    sha_file = dmg_out.with_name(dmg_out.name + ".sha256")
    sha_file.write_text(f"{sha}  {dmg_out.name}\n", encoding="utf-8")
    print(f"构建完成：{dmg_out} ({dmg_out.stat().st_size // 1024 // 1024} MB)")
    print(f"SHA256: {sha}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
