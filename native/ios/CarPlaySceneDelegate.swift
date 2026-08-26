//
//  CarPlaySceneDelegate.swift
//
//  NEVER COMPILED. Written on Windows 11, where no Xcode exists.
//
//  Also NEVER LAUNCHED, and not because of this file: a CarPlay audio app
//  requires the com.apple.developer.carplay-audio entitlement, which Apple
//  grants by application. Until that is granted this scene is never created,
//  however correct it is. Request the entitlement before extending this.
//
//  CarPlay is templates. There is no web view, so none of the app's own
//  screens can appear here — everything below is drawn by the system from
//  data fetched across the bridge.
//
//  What is deliberately absent: the mushaf page, the Veil, the Fork Drill,
//  Talqeen, the heat map. Not because they are hard here, but because a driver
//  must not be given something to read. Reciters, surahs, transport. Nothing
//  else belongs in a car.
//

import CarPlay
import Foundation

final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    private var interfaceController: CPInterfaceController?

    func templateApplicationScene(
        _ scene: CPTemplateApplicationScene,
        didConnect interfaceController: CPInterfaceController
    ) {
        self.interfaceController = interfaceController
        interfaceController.setRootTemplate(loadingTemplate(), animated: false, completion: nil)
        loadReciters()
    }

    func templateApplicationScene(
        _ scene: CPTemplateApplicationScene,
        didDisconnectInterfaceController interfaceController: CPInterfaceController
    ) {
        self.interfaceController = nil
    }

    // MARK: - Reciters

    /// Something to draw while the web view is still booting. A CarPlay scene
    /// can connect before the app's web view has loaded at all, and an empty
    /// root template reads as a broken app on the dashboard.
    private func loadingTemplate() -> CPListTemplate {
        let item = CPListItem(text: NSLocalizedString("Loading…", comment: ""), detailText: nil)
        return CPListTemplate(
            title: "Al-Mau'iza",
            sections: [CPListSection(items: [item])]
        )
    }

    private func loadReciters() {
        MushafBridge.shared.request(kind: "catalog") { [weak self] result in
            guard let self,
                  case .success(let data) = result,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let reciters = json["reciters"] as? [[String: Any]]
            else { return }

            let items: [CPListItem] = reciters.compactMap { r in
                guard let id = r["id"] as? String else { return nil }
                let name = (r["ar"] as? String) ?? (r["en"] as? String) ?? id
                // The riwayah is shown in brackets beside the name everywhere
                // else in this app, and a reciter reading Ad-Duri is not a
                // different voice saying the same words. It belongs here too.
                let riwayah = r["riwayah"] as? String
                let item = CPListItem(
                    text: name,
                    detailText: riwayah.map { "(\($0))" }
                )
                item.handler = { [weak self] _, completion in
                    self?.loadSurahs(reciterId: id, title: name)
                    completion()
                }
                return item
            }

            DispatchQueue.main.async {
                let template = CPListTemplate(
                    title: "Al-Mau'iza",
                    sections: [CPListSection(items: items)]
                )
                self.interfaceController?.setRootTemplate(template, animated: true, completion: nil)
            }
        }
    }

    // MARK: - Surahs

    private func loadSurahs(reciterId: String, title: String) {
        MushafBridge.shared.request(kind: "surahs", payload: reciterId) { [weak self] result in
            guard let self,
                  case .success(let data) = result,
                  let surahs = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
            else { return }

            let items: [CPListItem] = surahs.compactMap { s in
                guard let number = s["surah"] as? Int else { return nil }
                let name = (s["ar"] as? String) ?? "\(number)"
                let item = CPListItem(text: name, detailText: nil)
                item.handler = { _, completion in
                    MushafBridge.shared.command([
                        "verb": "play",
                        "surah": number,
                        "reciterId": reciterId,
                    ])
                    // Hand the driver straight to the now-playing template.
                    // Leaving them on a 114-row list while audio starts is how
                    // someone ends up scrolling at speed.
                    self.interfaceController?.pushTemplate(
                        CPNowPlayingTemplate.shared,
                        animated: true,
                        completion: nil
                    )
                    completion()
                }
                return item
            }

            DispatchQueue.main.async {
                let template = CPListTemplate(title: title, sections: [CPListSection(items: items)])
                self.interfaceController?.pushTemplate(template, animated: true, completion: nil)
            }
        }
    }
}
