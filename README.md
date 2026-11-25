# 吉大综合

多端体验的**吉林大学一站式校园服务应用**。

## 核心功能

- **今日总览（Dashboard）**：实时展示正在上课/下一节课倒计时、今日课表时间轴、全科加权绩点、毕业学分环形进度、最近考试倒计时与校内最新通知。
- **我的课表**：现代 7 列周课表网格、周次切换、自动应用教务调停课、双击空白格加课、单击课程改课/设本周不上/隐藏、备份导入导出与 `.ics` 日历导出（含课前 15 分钟提醒）。
- **成绩与绩点工作室**：支持保研加权、奖学金加权、所有课程与自定义模板；实时增减对比差值、各学期加权走势折线图、成绩分布柱状图、多维高级筛选、异常数据核对以及本地 Excel/CSV 成绩单导入。
- **学业进度**：可视化毕业学分完成环形图、支持嵌套课组树展开、按修读状态/学期/性质筛选，以及从教务更新与请求教务重算。
- **空教室查询**：支持按日期与按周次查询、时间/节次联动、教学楼/教室类型/座位数筛选、屏蔽特殊教室、教室收藏及全天 1–12 节空闲矩阵透视。
- **考试安排**：考前实时倒计时卡片、考场座位总览、支持手动增改自定义考试，并在周课表叠加考试时段（`[考试]` 标记）与导出 `.ics` 考试日程。
- **校园通知与订阅**：汇总学校 OA 与各学院官网通知，双栏排版正文阅读与附件下载，支持关键词订阅规则与命中筛选。
- **服务与设置**：教务/学在吉大/选课/VPN/图书馆免登直达、校园网直连与校外 WebVPN 通道切换、四节点连通性检测、浅色/深色/跟随系统主题。
- **CLI 与 MCP 支持**：完整保留 `jlu-toolkit` 命令行工具与 `jlu-toolkit-mcp` AI 助手接入能力。

## 快速启动与全平台安装包

| 平台 | 运行 / 安装包产物 | 本地打包命令 |
| --- | --- | --- |
| **Windows (x64)** | 双击 [`启动吉大综合.bat`](启动吉大综合.bat)，或直接运行 `dist\吉大综合.exe` | `.venv\Scripts\python.exe packaging\build_exe.py` |
| **macOS (Apple Silicon / Intel)** | 双击 [`启动吉大综合.command`](启动吉大综合.command)，或拖拽 `dist/吉大综合-*.dmg` 中的 `吉大综合.app` 至「应用程序」 | `python3 packaging/build_macos.py` |
| **Android (7.0+ / API 24+)** | 下载安装 `dist/吉大综合-1.3.4-android.apk`（`arm64-v8a` / `x86_64`） | `.venv\Scripts\python.exe packaging\build_android.py` |
| **iOS (15.0+ / iPhone & iPad)** | 通过 AltStore / SideStore / Sideloadly / TrollStore / Xcode 侧载 `dist/吉大综合-1.3.4-ios-unsigned.ipa` | `python3 packaging/build_ios.py`（macOS + Xcode + XcodeGen） |

> 💡 提示：macOS 初次打开未公证的 `.app` 时，如遇系统拦截可在终端执行 `xattr -cr /Applications/吉大综合.app` 后正常打开。iOS 工程源码位于 [`ios/`](ios/)，通过 CPython 3.13 `Python.xcframework` + 原生 `WKWebView` 内核在本地 `127.0.0.1` 运行。

### 方式一：源码一键启动（全桌面端通用）
- **Windows**：双击 [`启动吉大综合.bat`](启动吉大综合.bat)
- **macOS**：双击或终端运行 [`启动吉大综合.command`](启动吉大综合.command)

### 方式二：命令行启动
```powershell
# 启动原生桌面窗口
.venv\Scripts\python.exe app.py

# 强制在系统默认浏览器打开
.venv\Scripts\python.exe app.py --browser
```

## 上传到 GitHub 与自动发布全平台安装包

本仓库已内置完整的 `.gitignore`、`.gitattributes` 与 GitHub Actions 工作流：
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml)：每次推送或 PR 自动运行 Windows/Linux `pytest` 与 Android Robolectric 单元测试；
- [`.github/workflows/release.yml`](.github/workflows/release.yml)：打版本标签后自动并行构建 **Windows (`.exe`)、macOS (`arm64` + `x86_64` `.dmg`)、Android (`.apk`)、iOS (`.ipa`)** 全部安装包与 `.sha256` 校验文件，并发布至 GitHub Release。

上传仓库并触发全平台自动发布只需执行：
```bash
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main

# 触发 GitHub Actions 构建全平台安装包并生成 Release
git tag v1.3.4
git push origin v1.3.4
```

## 安卓端与移动端特性

- **手机端安装**：将 `dist/吉大综合-1.3.4-android.apk` 传输到手机后点击安装（允许「安装未知来源应用」即可；包名 `cn.superjlu.app` 支持覆盖升级且保留本地缓存）。
- **移动端适配与手势交互**：底部 5 标签导航（总览 / 课表 / 成绩 / 考试 / 更多），课表页左右滑动切换周次，状态栏与 iPhone 底部安全区自动适配。
- **安卓原生能力**：Android Keystore 硬件加密存储、「今日课表 / 周课表 / 下节课与考试倒计时」3 种桌面小组件与锁屏常驻通知、系统分享导出 `.ics`、校园网直连 / WebVPN 路由提示。
- **安卓本地重建**：`.venv\Scripts\python.exe packaging\build_android.py --skip-frontend --with-tests`（预设阿里云 Maven/Google/Gradle 与清华 PyPI 镜像，依赖 JDK 17、Android SDK 35 与 Python 3.13）。

## 登录与网络排错

- **通道自动识别**：打开登录窗口时会自动并发检测 `cas.jlu.edu.cn`、`iedu.jlu.edu.cn` 与 `vpn.jlu.edu.cn` 的连通性并推荐对应通道：
  - 处于校园网内或已开启学校 SSL VPN（如 Array SSL VPN）时，请选择**校园网直连**；
  - 处于校外家庭宽带或手机热点时，请切换为**校外 WebVPN**；
  - 若你在二次认证提交后提示教务回跳失败，可直接点击登录窗内的「**改用应用内 WebVPN 继续（无需重发验证码）**」完成通道切换。
- **本机代理 / TUN 模式冲突**：若电脑开启了 Clash Meta 等开启 TUN / Fake-IP（`198.18.x.x`）的代理软件，可能导致 `vpn.jlu.edu.cn` 或教务站点 HTTPS 连接超时。请将 `*.jlu.edu.cn` 加入代理规则的 `DIRECT` 直连列表（或关闭系统代理/TUN 后重试），然后点击登录窗右上角「**重测**」。
- **账号说明**：统一身份认证账号请填写**吉大邮箱 `@` 前缀**（如 `zhangsan24`），而非学号。

## 架构与隐私说明

- **100% 纯本地运行**：吉大综合采用本机 `127.0.0.1` 回环服务 + 原生窗口 / 移动端 `WKWebView` / `WebView` 架构运行，所有教务、WebVPN、OA 请求都直接从你的设备发起；凭据由 Windows 凭据管理器、macOS 钥匙串或 Android Keystore / 应用沙盒保护，数据缓存仅保存在本地。
- **无需公网服务器部署**：教务系统与统一身份认证高度敏感且依赖校园网/个人身份会话，本项目无需且不建议部署到公网服务器上。
- **开源致谢**：核心教务/CAS/WebVPN/OA 后端引擎源自 MIT 开源项目 **[Runa-Asahi/SuperJLU](https://github.com/Runa-Asahi/SuperJLU)**（及镜像仓库 **[Aohpup/SuperJLU](https://github.com/Aohpup/SuperJLU)**），保留完整 [`LICENSE`](LICENSE) 与 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
