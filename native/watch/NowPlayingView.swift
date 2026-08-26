//
//  NowPlayingView.swift
//
//  NEVER COMPILED. Written on Windows 11, where no Xcode exists.
//
//  The transport, and nothing else. No surah list: picking one of 114 on a
//  wrist is worse than reaching for the phone, and the watch is only ever
//  worth using for what is already playing.
//

import SwiftUI

struct NowPlayingView: View {
    @ObservedObject private var connector = WatchConnector.shared

    var body: some View {
        VStack(spacing: 8) {
            Text(connector.now.title.isEmpty ? "—" : connector.now.title)
                .font(.headline)
                .lineLimit(2)
                .multilineTextAlignment(.center)

            Text(connector.now.reciter)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)

            ProgressView(value: connector.now.progress)
                .progressViewStyle(.linear)

            HStack(spacing: 20) {
                Button { connector.command("prev") } label: {
                    Image(systemName: "backward.fill")
                }
                Button { connector.command(connector.now.playing ? "pause" : "play") } label: {
                    Image(systemName: connector.now.playing ? "pause.fill" : "play.fill")
                        .font(.title2)
                }
                Button { connector.command("next") } label: {
                    Image(systemName: "forward.fill")
                }
            }
            .buttonStyle(.plain)
        }
        .padding()
    }
}
