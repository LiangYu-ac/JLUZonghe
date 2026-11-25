<div align="center">

<img src="jlu_toolkit/data/favicon.svg" width="88" height="88" alt="吉大综合" />

# 吉大综合

**吉林大学一站式多端校园服务应用**

[![Release](https://img.shields.io/github/v/release/LiangYu-ac/JLUZonghe?label=Release&color=094FA8)](https://github.com/LiangYu-ac/JLUZonghe/releases/latest)
[![CI](https://github.com/LiangYu-ac/JLUZonghe/actions/workflows/ci.yml/badge.svg)](https://github.com/LiangYu-ac/JLUZonghe/actions/workflows/ci.yml)
[![Multi-Platform Release](https://github.com/LiangYu-ac/JLUZonghe/actions/workflows/release.yml/badge.svg)](https://github.com/LiangYu-ac/JLUZonghe/actions/workflows/release.yml)
![Platforms](https://img.shields.io/badge/Platforms-Windows%20%7C%20macOS%20%7C%20Android%20%7C%20iOS-1565D8)
[![License: MIT](https://img.shields.io/badge/License-MIT-F5CE67)](LICENSE)

</div>

---

## 下载与安装

前往 **[GitHub Releases 最新版本](https://github.com/LiangYu-ac/JLUZonghe/releases/latest)** 下载对应平台安装包，开箱即用，无需配置本地开发环境：

| 平台 | 直链下载（v1.3.4） | 使用方式 |
| --- | --- | --- |
| **Windows (x64)** | [`JLUZonghe-1.3.4-windows-x64.exe`](https://github.com/LiangYu-ac/JLUZonghe/releases/download/v1.3.4/JLUZonghe-1.3.4-windows-x64.exe) | 绿色单文件可执行程序，**双击直接启动**，无需安装 Python 或配置环境 |
| **macOS (Apple Silicon / M 系列)** | [`JLUZonghe-1.3.4-macos-arm64.dmg`](https://github.com/LiangYu-ac/JLUZonghe/releases/download/v1.3.4/JLUZonghe-1.3.4-macos-arm64.dmg) | 双击打开镜像，将 `吉大综合.app` 拖入「应用程序」即可使用 |
| **macOS (Intel)** | [`JLUZonghe-1.3.4-macos-x86_64.dmg`](https://github.com/LiangYu-ac/JLUZonghe/releases/download/v1.3.4/JLUZonghe-1.3.4-macos-x86_64.dmg) | 双击打开镜像，将 `吉大综合.app` 拖入「应用程序」即可使用 |
| **Android (7.0+ / API 24+)** | [`JLUZonghe-1.3.4-android.apk`](https://github.com/LiangYu-ac/JLUZonghe/releases/download/v1.3.4/JLUZonghe-1.3.4-android.apk) | 通用安装包（`arm64-v8a` / `x86_64`），直接安装，支持覆盖升级且保留本地缓存 |
| **iOS (15.0+ / iPhone & iPad)** | [`JLUZonghe-1.3.4-ios-unsigned.ipa`](https://github.com/LiangYu-ac/JLUZonghe/releases/download/v1.3.4/JLUZonghe-1.3.4-ios-unsigned.ipa) | 未签名 IPA，支持通过 AltStore / SideStore / Sideloadly / TrollStore / Xcode 签名安装 |

> [!TIP]
> - 每个安装包在 [Releases 页面](https://github.com/LiangYu-ac/JLUZonghe/releases/tag/v1.3.4) 均附带 `.sha256` 校验文件，可用于核对下载完整性。
> - macOS 初次打开未公证应用如遇系统拦截，可在终端运行 `xattr -cr /Applications/吉大综合.app` 后正常打开。
> - Windows 如弹出 SmartScreen 未签名提示，点击「更多信息 → 仍要运行」即可。

---

## 核心功能

- **今日总览（Dashboard）**：实时展示正在上课 / 下一节课倒计时、今日课表时间轴、全科加权绩点、毕业学分环形进度、最近考试倒计时与校内最新通知。
- **我的课表**：7 列现代周课表网格、周次切换、自动应用教务调停课、双击空白格加课、单击课程编辑 / 设本周不上 / 隐藏、备份导入导出与 `.ics` 日历导出（含课前 15 分钟提醒）。
- **成绩与绩点工作室**：支持保研加权、奖学金加权、所有课程与自定义模板；实时对比加权差值、各学期绩点走势折线图、成绩分布柱状图、多维筛选、异常核对及本地 Excel / CSV 成绩单导入。
- **学业进度**：可视化毕业学分完成环形图，支持嵌套课组树展开、按修读状态 / 学期 / 性质筛选，以及从教务更新与请求教务重算。
- **空教室查询**：支持按日期与按周次查询、时间 / 节次联动、教学楼 / 教室类型 / 座位数筛选、屏蔽特殊教室、教室收藏与全天 1–12 节空闲矩阵透视。
- **考试安排**：考前实时倒计时卡片、考场座位总览、支持手动增改自定义考试，并在周课表叠加考试时段（`[考试]` 标记）与导出 `.ics` 考试日程。
- **校园通知与订阅**：汇总学校 OA 与各学院官网通知，双栏排版正文阅读与附件下载，支持关键词订阅规则与命中筛选。
- **校园服务与设置**：教务 / 学在吉大 / 选课 / VPN / 图书馆免登直达、校园网直连与校外 WebVPN 通道切换、四节点连通性检测，以及浅色 / 深色 / 跟随系统主题。
- **CLI 与 MCP 支持**：内置 `jlu-toolkit` 命令行工具与 `jlu-toolkit-mcp` AI 助手接入能力。

---

## 移动端特性

- **统一交互与手势**：底部 5 标签导航（总览 / 课表 / 成绩 / 考试 / 更多），课表页支持左右滑动切换周次，状态栏与 iPhone 底部安全区自动适配。
- **Android 原生能力**：Android Keystore 硬件加密存储、「今日课表 / 周课表 / 下节课与考试倒计时」3 种桌面小组件与锁屏常驻通知、系统分享导出 `.ics`、校园网直连 / WebVPN 路由提示。
- **iOS 原生内核**：基于 [`ios/`](ios/) 原生工程与 CPython 3.13 `Python.xcframework` + `WKWebView`，全部逻辑在本地 `127.0.0.1` 沙盒闭环运行。

---

## 登录与网络排错

- **通道自动识别**：打开登录窗口时会自动并发检测 `cas.jlu.edu.cn`、`iedu.jlu.edu.cn` 与 `vpn.jlu.edu.cn` 的连通性并推荐对应通道：
  - 处于校园网内或已开启学校 SSL VPN（如 Array SSL VPN）时，请选择**校园网直连**；
  - 处于校外家庭宽带或手机热点时，请切换为**校外 WebVPN**；
  - 若在二次认证提交后提示教务回跳失败，可直接点击登录窗内的「**改用应用内 WebVPN 继续（无需重发验证码）**」完成通道切换。
- **本机代理 / TUN 模式冲突**：若电脑开启了 Clash 等包含 TUN / Fake-IP（`198.18.x.x`）的代理软件，可能导致 `vpn.jlu.edu.cn` 或教务站点连接超时；请将 `*.jlu.edu.cn` 加入代理规则的 `DIRECT` 直连列表（或关闭系统代理 / TUN 后重试），再点击登录窗右上角「**重测**」。
- **账号说明**：统一身份认证账号请填写**吉大邮箱 `@` 前缀**（如 `zhangsan24`），而非学号。
- **研究生能用吗？**：目前仅支持吉林大学本科生教务系统（`iedu.jlu.edu.cn`），研究生教务暂不支持。

---

## 架构与隐私安全

- **100% 纯本地运行**：采用本机 `127.0.0.1` 回环服务 + 原生窗口 / 移动端 `WKWebView` / `WebView` 架构，所有教务、WebVPN 与 OA 请求均直接从您的设备发起。
- **系统级凭据保护**：账号密码由 Windows 凭据管理器、macOS 钥匙串或 Android Keystore / 应用沙盒保护，本地缓存不离开设备。
- **无需公网部署**：教务系统与统一身份认证高度敏感且依赖个人会话，本项目无需且不建议部署至公网服务器。

---

## 开发者与从源码构建

<details>
<summary>展开查看从源码运行、本地打包命令与自动化工作流说明</summary>

### 从源码运行（桌面端）

```powershell
# 启动原生桌面窗口
python app.py

# 在系统默认浏览器中打开
python app.py --browser
```

### 各平台本地打包命令

| 平台 | 构建命令 | 输出目录 |
| --- | --- | --- |
| **Windows (x64)** | `python packaging/build_exe.py` | `dist/` |
| **macOS (arm64 / x86_64)** | `python3 packaging/build_macos.py` | `dist/` |
| **Android (APK)** | `python3 packaging/build_android.py --with-tests` | `dist/` |
| **iOS (未签名 IPA)** | `python3 packaging/build_ios.py`（需 macOS + Xcode + XcodeGen） | `dist/` |

### GitHub Actions 自动化工作流

- [`.github/workflows/ci.yml`](.github/workflows/ci.yml)：每次推送或 PR 自动运行 Windows / Linux 全量 `pytest` 与 Android Robolectric 单元测试；
- [`.github/workflows/release.yml`](.github/workflows/release.yml)：推送 `v*` 标签后自动并行构建 **Windows (`.exe`)、macOS (`arm64` + `x86_64` `.dmg`)、Android (`.apk`)、iOS (`.ipa`)** 全部安装包与 `.sha256` 校验文件，并发布至 GitHub Release。

</details>
