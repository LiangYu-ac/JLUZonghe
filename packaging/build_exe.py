"""一键构建 吉大综合.exe：先构建前端 dist，再调用 PyInstaller 打包。"""
from __future__ import annotations

import argparse
import hashlib
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"


def _read_version() -> str:
    txt = (ROOT / "jlu_toolkit" / "__init__.py").read_text(encoding="utf-8")
    m = re.search(r'__version__\s*=\s*"([^"]+)"', txt)
    return m.group(1) if m else "1.3.4"


def main(argv=None) -> int:
    for _stream in (sys.stdout, sys.stderr):
        if hasattr(_stream, "reconfigure"):
            _stream.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="构建 吉大综合 Windows 独立版 .exe")
    parser.add_argument("--skip-frontend", action="store_true", help="跳过 npm run build（复用现有 frontend/dist）")
    args = parser.parse_args(argv)

    if not args.skip_frontend:
        npm = shutil.which("npm.cmd") or shutil.which("npm")
        if not npm:
            print("未找到 npm，请先安装 Node.js", file=sys.stderr)
            return 1
        print("[1/3] 构建前端生产资源...")
        subprocess.run([npm, "run", "build"], cwd=str(FRONTEND), check=True)

    print(f"[2/3] 打包 吉大综合.exe（v{_read_version()}）...")
    subprocess.run(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--clean",
            str(ROOT / "packaging" / "superjlu_studio.spec"),
        ],
        cwd=str(ROOT),
        check=True,
    )
    out = ROOT / "dist" / "吉大综合.exe"
    if not out.is_file():
        raise FileNotFoundError(f"未找到构建产物：{out}")

    sha = hashlib.sha256(out.read_bytes()).hexdigest()
    sha_file = out.with_name(out.name + ".sha256")
    sha_file.write_text(f"{sha}  {out.name}\n", encoding="utf-8")
    print(f"[3/3] 构建完成：{out} ({out.stat().st_size // 1024 // 1024} MB)")
    print(f"SHA256: {sha}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
