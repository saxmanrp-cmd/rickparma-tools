import Foundation
import UserNotifications

final class FuelNotificationManager {
    private let center = UNUserNotificationCenter.current()
    private let idPrefix = "fuel-coach-"

    func authorize() async -> Bool {
        do {
            return try await center.requestAuthorization(options: [.alert, .sound, .badge])
        } catch {
            return false
        }
    }

    func replace(_ items: [[String: Any]]) async throws -> Int {
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else {
            throw NSError(domain: "FuelNotifications", code: 1, userInfo: [NSLocalizedDescriptionKey: "Notification permission is required."])
        }

        await cancelAll()
        var scheduled = 0
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let fallbackFormatter = ISO8601DateFormatter()

        for item in items.prefix(8) {
            guard let rawID = item["id"] as? String,
                  let title = item["title"] as? String,
                  let body = item["body"] as? String,
                  let atString = item["at"] as? String,
                  let date = formatter.date(from: atString) ?? fallbackFormatter.date(from: atString),
                  date.timeIntervalSinceNow > 5 else { continue }

            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = .default
            content.userInfo = ["source": "fuel-coach", "id": rawID]

            let interval = max(5, date.timeIntervalSinceNow)
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
            let request = UNNotificationRequest(identifier: idPrefix + rawID, content: content, trigger: trigger)
            try await center.add(request)
            scheduled += 1
        }
        return scheduled
    }

    func cancelAll() async {
        let pending = await center.pendingNotificationRequests()
        let ids = pending.map(\.identifier).filter { $0.hasPrefix(idPrefix) }
        if !ids.isEmpty {
            center.removePendingNotificationRequests(withIdentifiers: ids)
        }
        let delivered = await center.deliveredNotifications()
        let deliveredIDs = delivered.map { $0.request.identifier }.filter { $0.hasPrefix(idPrefix) }
        if !deliveredIDs.isEmpty {
            center.removeDeliveredNotifications(withIdentifiers: deliveredIDs)
        }
    }

    func status() async -> String {
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized: return "authorized"
        case .provisional: return "provisional"
        case .denied: return "denied"
        case .notDetermined: return "notDetermined"
        case .ephemeral: return "ephemeral"
        @unknown default: return "unknown"
        }
    }
}
