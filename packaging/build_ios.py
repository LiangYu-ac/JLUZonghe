"""构建 吉大综合 iOS 原生工程并打包未签名 .ipa（或执行跨平台资源暂存）。"""
from __future__ import annotations

import argparse
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tarfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
IOS_DIR = ROOT / "ios"
DIST = ROOT / "dist"

PYTHON_APPLE_SUPPORT_TAG = "3.13-b18"
PYTHON_APPLE_SUPPORT_URL = (
    f"https://github.com/beeware/Python-Apple-support/releases/download/"
    f"{PYTHON_APPLE_SUPPORT_TAG}/Python-{PYTHON_APPLE_SUPPORT_TAG.split('-')[0]}-iOS-support."
    f"{PYTHON_APPLE_SUPPORT_TAG.split('-')[1]}.tar.gz"
)


def _read_version() -> str:
    txt = (ROOT / "jlu_toolkit" / "__init__.py").read_text(encoding="utf-8")
    m = re.search(r'__version__\s*=\s*"([^"]+)"', txt)
    return m.group(1) if m else "1.3.4"


def _copy_filtered_tree(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(
        src,
        dst,
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "*.pyo", ".DS_Store"),
    )


def stage_bundle_resources(skip_frontend: bool) -> None:
    if not skip_frontend:
        npm = shutil.which("npm.cmd") or shutil.which("npm")
        if not npm:
            raise RuntimeError("未找到 npm，请先安装 Node.js")
        print("[1/5] 构建前端生产资源...")
        subprocess.run([npm, "run", "build"], cwd=str(FRONTEND), check=True)

    dist_dir = FRONTEND / "dist"
    if not (dist_dir / "index.html").is_file():
        raise FileNotFoundError(f"缺少前端构建产物：{dist_dir / 'index.html'}")

    bundle_app = IOS_DIR / "App" / "bundle_app"
    if bundle_app.exists():
        shutil.rmtree(bundle_app)
    bundle_app.mkdir(parents=True, exist_ok=True)

    print("[2/5] 暂存 Python 后端与前端资产至 ios/App/bundle_app...")
    _copy_filtered_tree(ROOT / "jlu_toolkit", bundle_app / "jlu_toolkit")
    shutil.copy2(IOS_DIR / "App" / "python" / "jlu_ios.py", bundle_app / "jlu_ios.py")

    studio_web = bundle_app / "studio_web"
    studio_web.mkdir(parents=True, exist_ok=True)
    (studio_web / "__init__.py").write_text("", encoding="utf-8")
    _copy_filtered_tree(dist_dir, studio_web / "dist")

    bundle_pkgs = IOS_DIR / "App" / "bundle_packages"
    if bundle_pkgs.exists():
        shutil.rmtree(bundle_pkgs)
    bundle_pkgs.mkdir(parents=True, exist_ok=True)
    print("[3/5] 安装纯 Python 依赖至 ios/App/bundle_packages...")
    deps = ["openpyxl>=3.1,<4", "et-xmlfile", "xlrd>=2.0,<3", "certifi"]
    has_pip = subprocess.run([sys.executable, "-m", "pip", "--version"], capture_output=True).returncode == 0
    if has_pip:
        pip_cmd = [sys.executable, "-m", "pip", "install", "--no-deps", "--upgrade", "--target", str(bundle_pkgs), *deps]
    else:
        uv_exe = shutil.which("uv")
        if not uv_exe:
            raise RuntimeError("未找到 pip 或 uv，无法安装纯 Python 依赖")
        pip_cmd = [uv_exe, "pip", "install", "--no-deps", "--target", str(bundle_pkgs), *deps]
    subprocess.run(pip_cmd, check=True)
    # Remove any accidental native or cache files inside pure-Python target
    for p in list(bundle_pkgs.rglob("__pycache__")):
        shutil.rmtree(p, ignore_errors=True)
    for ext in ("*.dist-info",):
        for p in list(bundle_pkgs.glob(ext)):
            shutil.rmtree(p, ignore_errors=True)


def ensure_python_apple_support() -> Path:
    deps_dir = IOS_DIR / "build_deps"
    xcfw = deps_dir / "Python.xcframework"
    if xcfw.is_dir():
        return deps_dir

    deps_dir.mkdir(parents=True, exist_ok=True)
    archive = deps_dir / "Python-iOS-support.tar.gz"
    if not archive.is_file():
        print(f"下载 BeeWare Python-Apple-support ({PYTHON_APPLE_SUPPORT_TAG})...")
        req = urllib.request.Request(PYTHON_APPLE_SUPPORT_URL, headers={"User-Agent": "curl/8"})
        with urllib.request.urlopen(req, timeout=180) as r, open(archive, "wb") as out:
            shutil.copyfileobj(r, out, length=262144)

    with tarfile.open(archive, "r:gz") as tf:
        tf.extractall(deps_dir)
    if not xcfw.is_dir():
        raise FileNotFoundError(f"解压后未找到 {xcfw}")
    return deps_dir


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="构建 吉大综合 iOS 原生应用与未签名 .ipa")
    parser.add_argument("--skip-frontend", action="store_true", help="跳过 npm run build（复用现有 frontend/dist）")
    parser.add_argument("--stage-only", action="store_true", help="仅暂存 app 与纯 Python 依赖，不运行 xcodebuild")
    parser.add_argument("--simulator", action="store_true", help="编译 iOS Simulator 版本而非真机未签名 .ipa")
    args = parser.parse_args(argv)

    stage_bundle_resources(skip_frontend=args.skip_frontend)
    if args.stage_only:
        print("已完成 iOS Python/前端资源暂存（--stage-only）。")
        return 0

    if sys.platform != "darwin":
        print("Xcode 编译需要 macOS 环境（当前仅 --stage-only 可跨平台运行）。", file=sys.stderr)
        return 1

    ensure_python_apple_support()
    xcodegen = shutil.which("xcodegen")
    if not xcodegen:
        raise RuntimeError("未找到 xcodegen，请先执行 `brew install xcodegen`")
    xcodebuild = shutil.which("xcodebuild")
    if not xcodebuild:
        raise RuntimeError("未找到 xcodebuild，请先安装 Xcode Command Line Tools")

    print("[4/5] 生成 Xcode 工程并编译...")
    subprocess.run([xcodegen, "generate"], cwd=str(IOS_DIR), check=True)

    sdk = "iphonesimulator" if args.simulator else "iphoneos"
    derived = IOS_DIR / "build" / "DerivedData"
    if derived.exists():
        shutil.rmtree(derived)

    cmd = [
        xcodebuild,
        "-project",
        str(IOS_DIR / "JLUZonghe.xcodeproj"),
        "-scheme",
        "JLUZonghe",
        "-configuration",
        "Release",
        "-sdk",
        sdk,
        "-derivedDataPath",
        str(derived),
        "CODE_SIGNING_ALLOWED=NO",
        "CODE_SIGNING_REQUIRED=NO",
        "CODE_SIGN_IDENTITY=",
        "build",
    ]
    if args.simulator:
        cmd.extend(["-destination", "generic/platform=iOS Simulator"])
    else:
        cmd.extend(["-destination", "generic/platform=iOS"])
    subprocess.run(cmd, cwd=str(IOS_DIR), check=True)

    products_dir = derived / "Build" / "Products" / f"Release-{sdk}"
    apps = list(products_dir.glob("*.app"))
    if not apps:
        raise FileNotFoundError(f"未在 {products_dir} 找到编译后的 .app")
    app_bundle = apps[0]

    version = _read_version()
    DIST.mkdir(parents=True, exist_ok=True)
    if args.simulator:
        out_zip = DIST / f"吉大综合-{version}-ios-simulator-app.zip"
        with zipfile.ZipFile(out_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for p in app_bundle.rglob("*"):
                zf.write(p, p.relative_to(app_bundle.parent))
        print(f"[5/5] 模拟器包完成：{out_zip}")
        return 0

    out_ipa = DIST / f"吉大综合-{version}-ios-unsigned.ipa"
    if out_ipa.exists():
        out_ipa.unlink()
    zip_exe = shutil.which("zip")
    if zip_exe:
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            payload_dir = Path(td) / "Payload"
            payload_dir.mkdir()
            shutil.copytree(app_bundle, payload_dir / app_bundle.name, symlinks=True)
            subprocess.run([zip_exe, "-qr", "-y", str(out_ipa), "Payload"], cwd=str(td), check=True)
    else:
        with zipfile.ZipFile(out_ipa, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for p in app_bundle.rglob("*"):
                if p.is_symlink():
                    continue
                rel = Path("Payload") / app_bundle.name / p.relative_to(app_bundle)
                info = zipfile.ZipInfo.from_file(p, rel.as_posix())
                if p.is_file() and os.access(p, os.X_OK):
                    info.external_attr = (0o100755 << 16)
                zf.writestr(info, p.read_bytes() if p.is_file() else b"")

    sha = hashlib.sha256(out_ipa.read_bytes()).hexdigest()
    sha_file = out_ipa.with_name(out_ipa.name + ".sha256")
    sha_file.write_text(f"{sha}  {out_ipa.name}\n", encoding="utf-8")
    print(f"[5/5] 未签名 IPA 构建完成：{out_ipa} ({out_ipa.stat().st_size // 1024 // 1024} MB)")
    print(f"SHA256: {sha}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
