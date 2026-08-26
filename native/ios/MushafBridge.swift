//
//  MushafBridge.swift
//
//  NEVER COMPILED. Written on Windows 11, where no Xcode exists. Expect to fix
//  compile errors on the first build; this is a reviewed starting point.
//
//  The native half of bridge v2 (src/native/shell.ts). Two things matter.
//
//  First, the shell must declare itself at document start, before the web app
//  boots — isNativeShell() is read during the first render, and a shell that
//  announces itself late gets one frame of the web dock before it disappears.
//
//  Second, this is the only object that knows how to reach the web app, so
//  CarPlay and the watch both go through it rather than each holding a web
//  view of their own. CarPlay cannot hold one at all.
//

import Foundation
import WebKit

struct NowPlaying: Codable {
    let surah: Int
    let title: String
    let reciter: String
    let artwork: String?
    let playing: Bool
    let progress: Double
}

final class MushafBridge: NSObject, WKScriptMessageHandler {
    static let shared = MushafBridge()

    private weak var webView: WKWebView?
    private var pending: [String: (Result<Data, Error>) -> Void] = [:]

    /// What the web side last published. CarPlay reads this rather than asking,
    /// because a template has to have something to draw immediately.
    private(set) var nowPlaying: NowPlaying?
    private(set) var selectedTab: String = "home"

    /// Called by the scene delegate once the web view exists.
    func attach(to webView: WKWebView) {
        self.webView = webView
        let controller = webView.configuration.userContentController
        controller.add(self, name: "mushaf")
        // Declared at document start so isNativeShell() is true on the first
        // render and the web dock never flashes. insetBottom is the height the
        // native tab bar actually occupies; --native-bottom follows it.
        controller.addUserScript(
            WKUserScript(
                source: "window.MushafNative = { ready: true, insetBottom: 88 };",
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )
    }

    // MARK: - Receiving what the web side publishes

    func userContentController(
        _ controller: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard let raw = message.body as? String,
              let data = raw.data(using: .utf8),
              let envelope = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let kind = envelope["kind"] as? String
        else { return }

        switch kind {
        case "tab":
            selectedTab = envelope["payload"] as? String ?? selectedTab
        case "nowPlaying":
            if let payload = envelope["payload"],
               let bytes = try? JSONSerialization.data(withJSONObject: payload) {
                nowPlaying = try? JSONDecoder().decode(NowPlaying.self, from: bytes)
            } else {
                nowPlaying = nil
            }
            NotificationCenter.default.post(name: .mushafNowPlayingChanged, object: nil)
        case "reply":
            guard let payload = envelope["payload"] as? [String: Any],
                  let id = payload["id"] as? String,
                  let handler = pending.removeValue(forKey: id)
            else { return }
            if let result = payload["result"],
               let bytes = try? JSONSerialization.data(withJSONObject: result) {
                handler(.success(bytes))
            } else {
                handler(.failure(BridgeError.noResult))
            }
        case "hello":
            break
        default:
            break
        }
    }

    // MARK: - Asking the web side

    enum BridgeError: Error { case noWebView, noResult, timedOut }

    /// Ask the web app something. `kind` is one of the v2 kinds: catalog,
    /// surahs, command.
    func request(
        kind: String,
        payload: Any? = nil,
        timeout: TimeInterval = 5,
        then handler: @escaping (Result<Data, Error>) -> Void
    ) {
        guard let webView else { return handler(.failure(BridgeError.noWebView)) }
        let id = UUID().uuidString
        pending[id] = handler

        var message: [String: Any] = ["id": id, "kind": kind, "v": 2]
        if let payload { message["payload"] = payload }

        guard let bytes = try? JSONSerialization.data(withJSONObject: message),
              let json = String(data: bytes, encoding: .utf8)
        else { return handler(.failure(BridgeError.noResult)) }

        // postMessage into the page, which is what answerNative() listens on.
        // Escaped through JSON so a surah name with a quote in it cannot break
        // out of the expression.
        let escaped = json.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
        webView.evaluateJavaScript("window.postMessage('\(escaped)', '*')")

        // The web side may be mid-launch, or the page may have been reloaded
        // out from under a pending request. A template that waits forever is
        // a template that never draws.
        DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { [weak self] in
            guard let pending = self?.pending.removeValue(forKey: id) else { return }
            pending(.failure(BridgeError.timedOut))
        }
    }

    /// Tell the web app to do something. Fire and forget: a transport command
    /// that needs a reply would make every button wait on a web view.
    func command(_ body: [String: Any]) {
        request(kind: "command", payload: body) { _ in }
    }
}

extension Notification.Name {
    static let mushafNowPlayingChanged = Notification.Name("mushafNowPlayingChanged")
}
