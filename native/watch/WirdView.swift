//
//  WirdView.swift
//
//  NEVER COMPILED. Written on Windows 11, where no Xcode exists.
//
//  The one thing a wrist does better than a phone.
//
//  Counting a wird is a tap you make without looking, often mid-recitation,
//  often in the dark. On a phone that means unlocking a screen and finding a
//  button; on a wrist it is a tap on your own arm. This is the only screen in
//  the app whose natural gesture is not available on the phone at all.
//
//  What it shows is *debt* -- pages owed -- and never a streak. The documented
//  failure mode in hifz is comparing your pace to someone else's, and the
//  roadmap rules out streaks, points and badges everywhere. A small screen is
//  not a reason to relax that; it is a reason the rule matters more, because
//  there is only room for one number and it must be the honest one.
//

import SwiftUI
import WatchKit

struct WirdView: View {
    @ObservedObject private var connector = WatchConnector.shared
    @State private var counted = 0

    var body: some View {
        VStack(spacing: 10) {
            Text("\(connector.pagesOwed)")
                .font(.system(size: 44, weight: .light, design: .serif))
            Text(connector.pagesOwed == 1 ? "page owed" : "pages owed")
                .font(.caption)
                .foregroundStyle(.secondary)

            Button {
                counted += 1
                connector.countWird()
                // Haptics, because the whole point is a tap made without
                // looking at the screen.
                WKInterfaceDevice.current().play(.click)
            } label: {
                Text("Counted \(counted)")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
        .padding()
    }
}
