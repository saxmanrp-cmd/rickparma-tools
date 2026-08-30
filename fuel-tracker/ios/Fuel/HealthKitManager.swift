import Foundation
import HealthKit

struct HealthSnapshot {
    var steps: Double?
    var activeCalories: Double?
    var distanceMiles: Double?
    var restingHeartRate: Double?
    var sleepHours: Double?
    var weightLb: Double?
    var bodyFatPercent: Double?
    var leanBodyMassLb: Double?
    var bmi: Double?
    var waistInches: Double?

    var dictionary: [String: Any] {
        var out: [String: Any] = [:]
        if let steps { out["steps"] = steps }
        if let activeCalories { out["activeCalories"] = activeCalories }
        if let distanceMiles { out["distanceMiles"] = distanceMiles }
        if let restingHeartRate { out["restingHeartRate"] = restingHeartRate }
        if let sleepHours { out["sleepHours"] = sleepHours }
        if let weightLb { out["weightLb"] = weightLb }
        if let bodyFatPercent { out["bodyFatPercent"] = bodyFatPercent }
        if let leanBodyMassLb { out["leanBodyMassLb"] = leanBodyMassLb }
        if let bmi { out["bmi"] = bmi }
        if let waistInches { out["waistInches"] = waistInches }
        if let weightLb, let bodyFatPercent {
            let fatMass = weightLb * bodyFatPercent / 100.0
            out["fatMassLb"] = fatMass
            out["fatFreeMassLb"] = weightLb - fatMass
        }
        return out
    }
}

final class HealthKitManager {
    private let store = HKHealthStore()
    private let calendar = Calendar.current

    private var readTypes: Set<HKObjectType> {
        var set: Set<HKObjectType> = []
        [
            HKQuantityType.quantityType(forIdentifier: .stepCount),
            HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned),
            HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning),
            HKQuantityType.quantityType(forIdentifier: .restingHeartRate),
            HKQuantityType.quantityType(forIdentifier: .bodyMass),
            HKQuantityType.quantityType(forIdentifier: .bodyFatPercentage),
            HKQuantityType.quantityType(forIdentifier: .leanBodyMass),
            HKQuantityType.quantityType(forIdentifier: .bodyMassIndex),
            HKQuantityType.quantityType(forIdentifier: .waistCircumference),
            HKCategoryType.categoryType(forIdentifier: .sleepAnalysis)
        ].compactMap { $0 }.forEach { set.insert($0) }
        return set
    }

    func requestAuthorization() async throws -> Bool {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw NSError(domain: "FuelHealth", code: 1, userInfo: [NSLocalizedDescriptionKey: "Apple Health is not available on this device."])
        }
        return try await withCheckedThrowingContinuation { continuation in
            store.requestAuthorization(toShare: Set<HKSampleType>(), read: readTypes) { success, error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: success) }
            }
        }
    }

    func todaySnapshot() async throws -> HealthSnapshot {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw NSError(domain: "FuelHealth", code: 2, userInfo: [NSLocalizedDescriptionKey: "Apple Health is not available on this device."])
        }
        let start = calendar.startOfDay(for: Date())
        let end = Date()
        async let steps = cumulative(.stepCount, unit: .count(), start: start, end: end)
        async let energy = cumulative(.activeEnergyBurned, unit: .kilocalorie(), start: start, end: end)
        async let distance = cumulative(.distanceWalkingRunning, unit: .mile(), start: start, end: end)
        async let resting = mostRecent(.restingHeartRate, unit: HKUnit.count().unitDivided(by: .minute()))
        async let weight = mostRecent(.bodyMass, unit: .pound())
        async let bodyFat = mostRecent(.bodyFatPercentage, unit: .percent())
        async let leanMass = mostRecent(.leanBodyMass, unit: .pound())
        async let bmi = mostRecent(.bodyMassIndex, unit: .count())
        async let waist = mostRecent(.waistCircumference, unit: .inch())
        async let sleep = sleepHours()
        let values = try await (steps, energy, distance, resting, sleep, weight, bodyFat, leanMass, bmi, waist)
        return HealthSnapshot(
            steps: values.0,
            activeCalories: values.1,
            distanceMiles: values.2,
            restingHeartRate: values.3,
            sleepHours: values.4,
            weightLb: values.5,
            bodyFatPercent: values.6.map { $0 * 100.0 },
            leanBodyMassLb: values.7,
            bmi: values.8,
            waistInches: values.9
        )
    }

    private func cumulative(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, start: Date, end: Date) async throws -> Double? {
        guard let type = HKQuantityType.quantityType(forIdentifier: identifier) else { return nil }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, error in
                if let error { continuation.resume(throwing: error); return }
                continuation.resume(returning: result?.sumQuantity()?.doubleValue(for: unit))
            }
            store.execute(query)
        }
    }

    private func mostRecent(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit) async throws -> Double? {
        guard let type = HKQuantityType.quantityType(forIdentifier: identifier) else { return nil }
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: nil, limit: 1, sortDescriptors: [sort]) { _, samples, error in
                if let error { continuation.resume(throwing: error); return }
                let sample = samples?.first as? HKQuantitySample
                continuation.resume(returning: sample?.quantity.doubleValue(for: unit))
            }
            store.execute(query)
        }
    }

    private func sleepHours() async throws -> Double? {
        guard let type = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis) else { return nil }
        let now = Date()
        let start = calendar.date(byAdding: .hour, value: -18, to: now) ?? calendar.startOfDay(for: now)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: now, options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in
                if let error { continuation.resume(throwing: error); return }
                let asleepValues: Set<Int> = [
                    HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
                    HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                    HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
                    HKCategoryValueSleepAnalysis.asleepREM.rawValue
                ]
                let seconds = (samples as? [HKCategorySample] ?? []).reduce(0.0) { total, sample in
                    asleepValues.contains(sample.value) ? total + sample.endDate.timeIntervalSince(sample.startDate) : total
                }
                continuation.resume(returning: seconds > 0 ? seconds / 3600.0 : nil)
            }
            store.execute(query)
        }
    }
}
