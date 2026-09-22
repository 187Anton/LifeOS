import Foundation
import Speech

@main
struct LifeOSSpeechCapabilityProbe {
    static func main() async {
        let requestedLocale = Locale(identifier: "de-DE")
        let legacyRecognizer = SFSpeechRecognizer(locale: requestedLocale)
        let authorizationStatus: String

        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized:
            authorizationStatus = "authorized"
        case .denied:
            authorizationStatus = "denied"
        case .restricted:
            authorizationStatus = "restricted"
        case .notDetermined:
            authorizationStatus = "notDetermined"
        @unknown default:
            authorizationStatus = "unknown"
        }

        var result: [String: Any] = [
            "requestedLocale": requestedLocale.identifier,
            "operatingSystem": ProcessInfo.processInfo.operatingSystemVersionString,
            "legacyRecognizerAvailable": legacyRecognizer?.isAvailable ?? false,
            "legacySupportsOnDeviceRecognition": legacyRecognizer?.supportsOnDeviceRecognition ?? false,
            "legacyAuthorizationStatus": authorizationStatus,
        ]

        var gateReasons: [String] = []
        if #available(macOS 26.0, *) {
            let supportedLocale = await SpeechTranscriber.supportedLocale(
                equivalentTo: requestedLocale
            )
            let installedLocales = await SpeechTranscriber.installedLocales
            let supportedLocales = await SpeechTranscriber.supportedLocales
            let reservedLocales = await AssetInventory.reservedLocales
            let dictationLocale = await DictationTranscriber.supportedLocale(
                equivalentTo: requestedLocale
            )
            let installedDictationLocales = await DictationTranscriber.installedLocales
            let germanSupported = supportedLocale.map { locale in
                supportedLocales.contains { $0.identifier == locale.identifier }
            } ?? false
            let germanInstalled = supportedLocale.map { locale in
                installedLocales.contains { $0.identifier == locale.identifier }
            } ?? false
            let germanDictationInstalled = dictationLocale.map { locale in
                installedDictationLocales.contains { $0.identifier == locale.identifier }
            } ?? false

            result.merge(
                [
                    "speechTranscriberAvailable": SpeechTranscriber.isAvailable,
                    "speechTranscriberSupportedLocale": supportedLocale?.identifier as Any,
                    "speechTranscriberGermanInstalled": germanInstalled,
                    "speechTranscriberInstalledLocales": installedLocales.map(\.identifier).sorted(),
                    "speechTranscriberGermanSupported": germanSupported,
                    "assetReservedLocales": reservedLocales.map(\.identifier).sorted(),
                    "maximumReservedLocales": AssetInventory.maximumReservedLocales,
                    "dictationSupportedLocale": dictationLocale?.identifier as Any,
                    "dictationGermanInstalled": germanDictationInstalled,
                ],
                uniquingKeysWith: { _, newValue in newValue }
            )

            if !germanSupported {
                gateReasons.append(
                    "SpeechTranscriber unterstützt de-DE auf diesem Gerät nicht."
                )
            } else if !germanInstalled {
                gateReasons.append(
                    "Das deutsche SpeechTranscriber-Modell ist nicht installiert."
                )
            }
        } else {
            result["speechTranscriberAvailable"] = false
            gateReasons.append("SpeechTranscriber ist erst ab macOS 26 verfügbar.")
        }

        if authorizationStatus != "authorized" {
            gateReasons.append(
                "Die Speech-Berechtigung ist nicht erteilt; ein End-to-End-Test ist nicht möglich."
            )
        }

        result["gateStatus"] = gateReasons.isEmpty ? "candidate" : "open"
        result["gateReasons"] = gateReasons

        do {
            let data = try JSONSerialization.data(
                withJSONObject: result,
                options: [.prettyPrinted, .sortedKeys]
            )
            print(String(decoding: data, as: UTF8.self))
        } catch {
            print("{\"error\":\"Ergebnis konnte nicht serialisiert werden.\"}")
        }
    }
}
