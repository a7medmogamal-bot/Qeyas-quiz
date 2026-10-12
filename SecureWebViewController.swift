import UIKit
import WebKit

class SecureWebViewController: UIViewController, WKNavigationDelegate {

    private var webView: WKWebView!
    private var secureField: UITextField?
    private let appURL = URL(string: "https://qeyasquiz.vercel.app")!

    override func viewDidLoad() {
        super.viewDidLoad()

        setupWebView()
        setupSecureLayer()
        loadApp()
    }

    // MARK: - WebView

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.preferences.javaScriptEnabled = true
        config.preferences.javaScriptCanOpenWindowsAutomatically = true

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        view.addSubview(webView)
    }

    private func loadApp() {
        var request = URLRequest(url: appURL)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        webView.load(request)
    }

    // MARK: - Secure Layer (منع السكرين شوت)

    private func setupSecureLayer() {
        let field = UITextField()
        field.isSecureTextEntry = true
        field.isUserInteractionEnabled = false

        view.addSubview(field)
        view.layer.superlayer?.addSublayer(field.layer)
        field.layer.sublayers?.first?.addSublayer(view.layer)

        self.secureField = field
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        let host = url.host ?? ""

        // Google Sign-In → SFSafariViewController
        if host == "accounts.google.com" ||
           host == "firebaseapp.com" ||
           url.path.contains("/__/auth/") {
            let safariVC = SFSafariViewController(url: url)
            safariVC.delegate = self
            present(safariVC, animated: true)
            decisionHandler(.cancel)
            return
        }

        // روابط خارجية → Safari
        if host != "qeyasquiz.vercel.app" && !host.isEmpty {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.allow)
    }

    // MARK: - Screen capture protection

    override func viewWillResignActive(_ sender: Any) {
        super.viewWillResignActive(sender)
        // إخفاء المحتوى عند دخول التطبيق في الخلفية
        view.isHidden = true
    }

    override func viewDidBecomeActive(_ sender: Any) {
        super.viewDidBecomeActive(sender)
        view.isHidden = false
    }
}

// MARK: - SFSafariViewControllerDelegate

extension SecureWebViewController: SFSafariViewControllerDelegate {
    func safariViewControllerDidFinish(_ controller: SFSafariViewController) {
        // لما يتقفل Safari بعد Google Sign-In
        webView.reload()
    }
}
