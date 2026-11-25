import SafariServices
import UIKit
import WebKit

private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) {
        self.target = target
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}

final class MainViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    private let handlerName = "SuperJLUiOS"
    private let splashBg = UIColor(red: 0.0 / 255.0, green: 49.0 / 255.0, blue: 112.0 / 255.0, alpha: 1.0)

    private var webView: WKWebView!
    private let splashView = UIView()
    private let spinner = UIActivityIndicatorView(style: .medium)
    private let statusLabel = UILabel()
    private let retryButton = UIButton(type: .system)

    private var isDarkAppearance = false
    private var serverURL: URL?

    override var preferredStatusBarStyle: UIStatusBarStyle {
        if !splashView.isHidden {
            return .lightContent
        }
        return isDarkAppearance ? .lightContent : .darkContent
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = splashBg
        setupWebView()
        setupSplashView()
        bootPythonServer()
    }

    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: handlerName)
    }

    private func setupWebView() {
        let ucc = WKUserContentController()
        ucc.add(WeakMessageHandler(self), name: handlerName)

        let cfg = WKWebViewConfiguration()
        cfg.userContentController = ucc
        cfg.allowsInlineMediaPlayback = true

        webView = WKWebView(frame: .zero, configuration: cfg)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic

        webView.evaluateJavaScript("navigator.userAgent") { [weak self] val, _ in
            guard let self = self, let ua = val as? String, !ua.contains("SuperJLU-iOS") else { return }
            self.webView.customUserAgent = ua + " SuperJLU-iOS"
        }

        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    private func setupSplashView() {
        splashView.translatesAutoresizingMaskIntoConstraints = false
        splashView.backgroundColor = splashBg
        view.addSubview(splashView)
        NSLayoutConstraint.activate([
            splashView.topAnchor.constraint(equalTo: view.topAnchor),
            splashView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            splashView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            splashView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        let stack = UIStackView()
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 10
        stack.translatesAutoresizingMaskIntoConstraints = false

        let iconView = UIImageView(image: UIImage(named: "AppIcon") ?? UIImage(systemName: "graduationcap.fill"))
        iconView.contentMode = .scaleAspectFit
        iconView.layer.cornerRadius = 22
        iconView.layer.masksToBounds = true
        iconView.layer.borderWidth = 1.5
        iconView.layer.borderColor = UIColor(white: 1.0, alpha: 0.25).cgColor
        iconView.tintColor = .white
        iconView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            iconView.widthAnchor.constraint(equalToConstant: 88),
            iconView.heightAnchor.constraint(equalToConstant: 88),
        ])

        let titleLabel = UILabel()
        titleLabel.text = "吉大综合"
        titleLabel.font = .systemFont(ofSize: 28, weight: .bold)
        titleLabel.textColor = .white

        let subLabel = UILabel()
        subLabel.text = "吉林大学一站式校园服务"
        subLabel.font = .systemFont(ofSize: 14, weight: .medium)
        subLabel.textColor = UIColor(white: 1.0, alpha: 0.82)

        spinner.color = .white
        spinner.startAnimating()

        statusLabel.text = "正在启动本地服务…"
        statusLabel.font = .systemFont(ofSize: 13)
        statusLabel.textColor = UIColor(white: 1.0, alpha: 0.78)
        statusLabel.numberOfLines = 0
        statusLabel.textAlignment = .center

        retryButton.setTitle("重试启动", for: .normal)
        retryButton.setTitleColor(splashBg, for: .normal)
        retryButton.backgroundColor = .white
        retryButton.titleLabel?.font = .systemFont(ofSize: 14, weight: .semibold)
        retryButton.contentEdgeInsets = UIEdgeInsets(top: 8, left: 20, bottom: 8, right: 20)
        retryButton.layer.cornerRadius = 10
        retryButton.isHidden = true
        retryButton.addTarget(self, action: #selector(retryTapped), for: .touchUpInside)

        stack.addArrangedSubview(iconView)
        stack.setCustomSpacing(16, after: iconView)
        stack.addArrangedSubview(titleLabel)
        stack.addArrangedSubview(subLabel)
        stack.setCustomSpacing(24, after: subLabel)
        stack.addArrangedSubview(spinner)
        stack.addArrangedSubview(statusLabel)
        stack.addArrangedSubview(retryButton)

        splashView.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: splashView.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: splashView.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: splashView.leadingAnchor, constant: 28),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: splashView.trailingAnchor, constant: -28),
        ])
    }

    @objc private func retryTapped() {
        retryButton.isHidden = true
        spinner.startAnimating()
        statusLabel.text = "正在重新启动本地服务…"
        bootPythonServer()
    }

    private func appDataDirectory() -> String {
        let fm = FileManager.default
        let base = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? fm.temporaryDirectory
        let dir = base.appendingPathComponent("jlu-data", isDirectory: true)
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.path
    }

    private func bootPythonServer() {
        let version = (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "1.3.4"
        PythonRuntime.shared().startServer(withDataDir: appDataDirectory(), appVersion: version) { [weak self] urlStr, token, errMsg in
            guard let self = self else { return }
            if let errMsg = errMsg {
                self.spinner.stopAnimating()
                self.statusLabel.text = "启动失败：\(errMsg)"
                self.retryButton.isHidden = false
                return
            }
            guard let urlStr = urlStr, let url = URL(string: urlStr), let token = token else {
                self.spinner.stopAnimating()
                self.statusLabel.text = "本地服务返回无效地址"
                self.retryButton.isHidden = false
                return
            }
            self.serverURL = url
            let cookieProps: [HTTPCookiePropertyKey: Any] = [
                .domain: url.host ?? "127.0.0.1",
                .path: "/",
                .name: "superjlu_t",
                .value: token,
            ]
            if let cookie = HTTPCookie(properties: cookieProps) {
                self.webView.configuration.websiteDataStore.httpCookieStore.setCookie(cookie) { [weak self] in
                    self?.webView.load(URLRequest(url: url))
                }
            } else {
                self.webView.load(URLRequest(url: url))
            }
        }
    }

    // MARK: - WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == handlerName, let body = message.body as? [String: Any] else { return }
        let action = body["action"] as? String ?? ""

        if action == "setBarColors" {
            let dark = (body["dark"] as? Bool) ?? false
            isDarkAppearance = dark
            if let bgHex = body["bg"] as? String, let color = colorFromHex(bgHex) {
                view.backgroundColor = color
                webView.backgroundColor = color
            }
            setNeedsStatusBarAppearanceUpdate()
            return
        }

        if action == "shareIcs" {
            guard let icsText = body["body"] as? String, !icsText.isEmpty else { return }
            let rawName = (body["filename"] as? String ?? "jlu-schedule.ics")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let safeName = rawName.hasSuffix(".ics") ? rawName : "\(rawName).ics"
            let tmpUrl = FileManager.default.temporaryDirectory.appendingPathComponent(safeName)
            do {
                try icsText.write(to: tmpUrl, atomically: true, encoding: .utf8)
                let av = UIActivityViewController(activityItems: [tmpUrl], applicationActivities: nil)
                if let pop = av.popoverPresentationController {
                    pop.sourceView = view
                    pop.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
                }
                present(av, animated: true)
            } catch {
                // Ignore temp write errors cleanly
            }
        }
    }

    private func colorFromHex(_ hex: String) -> UIColor? {
        let s = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        guard s.count == 6, let val = UInt64(s, radix: 16) else { return nil }
        return UIColor(
            red: CGFloat((val >> 16) & 0xFF) / 255.0,
            green: CGFloat((val >> 8) & 0xFF) / 255.0,
            blue: CGFloat(val & 0xFF) / 255.0,
            alpha: 1.0
        )
    }

    // MARK: - WKNavigationDelegate & WKUIDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard !splashView.isHidden else { return }
        UIView.animate(withDuration: 0.25, animations: {
            self.splashView.alpha = 0
        }) { _ in
            self.splashView.isHidden = true
            self.setNeedsStatusBarAppearanceUpdate()
        }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }
        if isLocalLoopback(url) || url.scheme == "about" || url.scheme == "blob" {
            decisionHandler(.allow)
            return
        }
        openExternal(url)
        decisionHandler(.cancel)
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            if isLocalLoopback(url) {
                webView.load(URLRequest(url: url))
            } else {
                openExternal(url)
            }
        }
        return nil
    }

    private func isLocalLoopback(_ url: URL) -> Bool {
        let host = (url.host ?? "").lowercased()
        return host == "127.0.0.1" || host == "localhost"
    }

    private func openExternal(_ url: URL) {
        let scheme = (url.scheme ?? "").lowercased()
        if scheme == "http" || scheme == "https" {
            let safari = SFSafariViewController(url: url)
            present(safari, animated: true)
        } else {
            UIApplication.shared.open(url)
        }
    }
}
