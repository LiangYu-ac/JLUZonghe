"""一键构建 SuperJLU Studio Android APK。"""
from __future__ import annotations

import argparse
import hashlib
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
ANDROID = ROOT / "android"
DIST = ROOT / "dist"


def _read_version() -> str:
    txt = (ROOT / "jlu_toolkit" / "__init__.py").read_text(encoding="utf-8")
    m = re.search(r'__version__\s*=\s*"([^"]+)"', txt)
    return m.group(1) if m else "1.3.4"


def _find_jdk17() -> Path:
    java_name = "java.exe" if os.name == "nt" else "java"
    candidates = [
        Path(os.environ["JAVA_HOME"]) if os.environ.get("JAVA_HOME") else None,
        Path(r"C:\Program Files\Microsoft\jdk-17.0.11.9-hotspot"),
        Path(r"C:\Program Files\Eclipse Adoptium\jdk-17"),
        Path(r"C:\Program Files\Android\Android Studio\jbr"),
    ]
    for base in (Path(r"C:\Program Files\Microsoft"), Path(r"C:\Program Files\Eclipse Adoptium"), Path(r"C:\Program Files\Java")):
        if base.is_dir():
            candidates.extend(sorted(base.glob("jdk-17*"), reverse=True))
    java_on_path = shutil.which("java")
    if java_on_path:
        candidates.append(Path(java_on_path).resolve().parent.parent)
    for p in candidates:
        if p and (p / "bin" / java_name).is_file():
            out = subprocess.run(
                [str(p / "bin" / java_name), "-version"],
                capture_output=True,
                text=True,
            )
            ver = out.stdout + out.stderr
            if '"17.' in ver or "17." in ver:
                return p
    raise RuntimeError("未找到 JDK 17，请先安装 JDK 17 或设置 JAVA_HOME")


def _find_android_sdk() -> Path:
    candidates = [
        Path(os.environ["ANDROID_HOME"]) if os.environ.get("ANDROID_HOME") else None,
        Path(os.environ["ANDROID_SDK_ROOT"]) if os.environ.get("ANDROID_SDK_ROOT") else None,
        Path.home() / "AppData" / "Local" / "Android" / "Sdk",
        Path.home() / "Android" / "Sdk",
        Path.home() / "Library" / "Android" / "sdk",
    ]
    local_props = ANDROID / "local.properties"
    if local_props.is_file():
        for line in local_props.read_text(encoding="utf-8", errors="ignore").splitlines():
            if line.startswith("sdk.dir="):
                candidates.insert(0, Path(line.split("=", 1)[1].strip()))
    for p in candidates:
        if p and (p / "platforms" / "android-35").is_dir():
            return p
    raise RuntimeError("未找到含 android-35 的 Android SDK，请先安装 SDK 并配置 ANDROID_HOME")


def _find_python313() -> Path:
    uv = shutil.which("uv")
    if uv:
        r = subprocess.run([uv, "python", "find", "3.13"], capture_output=True, text=True)
        if r.returncode == 0:
            p = Path(r.stdout.strip())
            if p.is_file():
                return p
    py313_dir = Path.home() / "AppData" / "Roaming" / "uv" / "python"
    if py313_dir.is_dir():
        for p in sorted(py313_dir.glob("cpython-3.13*/python.exe"), reverse=True):
            if p.is_file():
                return p
    for cmd in ("python3.13", "python3", "python"):
        exe = shutil.which(cmd)
        if exe:
            v = subprocess.run([exe, "-c", "import sys; print(sys.version_info[:2])"], capture_output=True, text=True)
            if "(3, 13)" in v.stdout:
                return Path(exe)
    raise RuntimeError("未找到 Chaquopy 所需的 Python 3.13（可通过 `uv python install 3.13` 安装）")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="构建 SuperJLU Studio Android APK")
    parser.add_argument("--skip-frontend", action="store_true", help="跳过 npm run build（复用现有 frontend/dist）")
    parser.add_argument("--with-tests", action="store_true", help="同时运行 Android Robolectric 单测")
    args = parser.parse_args(argv)

    if not args.skip_frontend:
        npm = shutil.which("npm.cmd") or shutil.which("npm")
        if not npm:
            print("未找到 npm，请先安装 Node.js", file=sys.stderr)
            return 1
        print("[1/4] 构建前端生产资源...")
        subprocess.run([npm, "run", "build"], cwd=str(FRONTEND), check=True)

    jdk17 = _find_jdk17()
    sdk = _find_android_sdk()
    py313 = _find_python313()
    version = _read_version()

    local_props = ANDROID / "local.properties"
    sdk_line = "sdk.dir=" + str(sdk).replace("\\", "/")
    if not local_props.is_file() or sdk_line not in local_props.read_text(encoding="utf-8", errors="ignore"):
        local_props.write_text(sdk_line + "\n", encoding="ascii")

    env = os.environ.copy()
    env["JAVA_HOME"] = str(jdk17)
    env["ANDROID_HOME"] = str(sdk)
    env["ANDROID_SDK_ROOT"] = str(sdk)
    env["PATH"] = f"{jdk17 / 'bin'}{os.pathsep}{env.get('PATH', '')}"
    env["JLU_VERSION_NAME"] = version
    env["JLU_VERSION_CODE"] = env.get("JLU_VERSION_CODE", "10304")
    env.setdefault("PIP_INDEX_URL", "https://pypi.tuna.tsinghua.edu.cn/simple")

    gradlew = ANDROID / ("gradlew.bat" if os.name == "nt" else "gradlew")
    tasks = ["--no-daemon", f"-PbuildPython={py313}"]
    if os.environ.get("ROBOLECTRIC_REPO_URL"):
        tasks.append(f"-Drobolectric.dependency.repo.url={os.environ['ROBOLECTRIC_REPO_URL']}")
    if os.environ.get("ROBOLECTRIC_REPO_ID"):
        tasks.append(f"-Drobolectric.dependency.repo.id={os.environ['ROBOLECTRIC_REPO_ID']}")
    if args.with_tests:
        tasks.append("testDebugUnitTest")
    tasks.append("assembleDebug")

    print(f"[2/4] 调用 Gradle + Chaquopy 构建 APK（JDK={jdk17.name}, Py={py313.parent.name}）...")
    subprocess.run([str(gradlew), *tasks], cwd=str(ANDROID), env=env, check=True)

    built_apk = ANDROID / "app" / "build" / "outputs" / "apk" / "debug" / "app-debug.apk"
    if not built_apk.is_file():
        raise FileNotFoundError(f"未找到构建产物：{built_apk}")

    DIST.mkdir(parents=True, exist_ok=True)
    out_apk = DIST / f"吉大综合-{version}-android.apk"
    shutil.copy2(built_apk, out_apk)

    apksigner_jars = sorted((sdk / "build-tools").glob("*/lib/apksigner.jar"))
    java_exe = jdk17 / "bin" / ("java.exe" if os.name == "nt" else "java")
    print("[3/4] 校验 APK 签名...")
    if apksigner_jars:
        subprocess.run(
            [str(java_exe), "-jar", str(apksigner_jars[-1]), "verify", "--print-certs", str(out_apk)],
            check=True,
        )
    else:
        signer_name = "apksigner.bat" if os.name == "nt" else "apksigner"
        apksigner = sorted((sdk / "build-tools").glob(f"*/{signer_name}"))[-1]
        subprocess.run([str(apksigner), "verify", "--print-certs", str(out_apk)], check=True)

    sha = hashlib.sha256(out_apk.read_bytes()).hexdigest()
    sha_file = out_apk.with_suffix(".apk.sha256")
    sha_file.write_text(f"{sha}  {out_apk.name}\n", encoding="utf-8")

    print(f"[4/4] 构建完成：{out_apk} ({out_apk.stat().st_size // 1024 // 1024} MB)")
    print(f"SHA256: {sha}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
