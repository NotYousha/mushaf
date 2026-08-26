//
//  WatchConnector.swift
//
//  NEVER COMPILED. Written on Windows 11, where no Xcode exists.
//
//  watchOS has no web view of any kind, so nothing of the web app can run
//  here. Everything the watch shows crosses two hops: the web app publishes to
//  MushafBridge on the phone, and the phone relays to the watch over
//  WatchConnectivity.
//
//  The relay is one-way for state and one-way for commands, deliberately. A
//  watch that awaits the phone, which awaits a web view, which may be
//  suspended, is a watch whose buttons hang.
//

import Foundation
import WatchConnectivity

struct WatchNowPlaying: Codable, Equatable {
    var surah: Int = 0
    var title: String = ""
    var reciter: String = ""
    var playing: Bool = false
    var progress: Double = 0
}

final class WatchConnector: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchConnector()

    @Published var now = WatchNowPlaying()
    /// Pages owed, from the sabaq/sabqi/manzil tiers on the phone. Debt, never
    /// a streak — the app shows what is owed and never a flame, and that rule
    /// does not get relaxed because the screen is small.
    @Published var pagesOwed: Int = 0

    private override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    // MARK: - Sending

    /// Fire and forget. `sendMessage` with a reply handler blocks the button
    /// until the phone answers, and the phone may be answering a web view that
    /// is suspended.
    func command(_ verb: String, surah: Int? = nil) {
        var body: [String: Any] = ["verb": verb]
        if let surah { body["surah"] = surah }
        guard WCSession.default.isReachable else {
            // Queued rather than dropped: transferUserInfo survives the phone
            // being briefly unreachable, which on a wrist is most of the time.
            WCSession.default.transferUserInfo(["command": body])
            return
        }
        WCSession.default.sendMessage(["command": body], replyHandler: nil) { _ in
            // A failed transport command is not worth an alert on a watch. The
            // next state push will show whether it took effect.
        }
    }

    /// One tap, one unit of the wird. The count lives on the phone, in
    /// IndexedDB with everything else; this only reports the tap.
    func countWird() {
        command("wird")
    }

    // MARK: - Receiving

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        apply(message)
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        apply(userInfo)
    }

    private func apply(_ message: [String: Any]) {
        guard let raw = message["nowPlaying"],
              let bytes = try? JSONSerialization.data(withJSONObject: raw),
              let decoded = try? JSONDecoder().decode(WatchNowPlaying.self, from: bytes)
        else {
            if let owed = message["pagesOwed"] as? Int {
                DispatchQueue.main.async { self.pagesOwed = owed }
            }
            return
        }
        DispatchQueue.main.async { self.now = decoded }
    }

    func session(
        _ session: WCSession,
        activationDidCompleteWith state: WCSessionActivationState,
        error: Error?
    ) {}
}
