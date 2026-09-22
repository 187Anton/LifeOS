# Lokales Gate für deutsche Spracheingabe

## Ergebnis

Der eigene LifeOS-Mikrofonmodus bleibt gesperrt. Der reproduzierbare Test auf
dem unterstützten ARM64-Mac zeigt zwar eine grundsätzlich verfügbare lokale
deutsche Spracherkennung, aber noch keinen vollständigen, berechtigten
End-to-End-Nachweis ohne Netzwerk. Text und Betriebssystem-Diktat bleiben der
vollständige Basispfad; LifeOS öffnet keinen Audiokanal.

## Geprüfte Plattform

- Datum: 22. September 2026
- Architektur: Apple Silicon (`arm64`)
- Betriebssystem: macOS 26.6, Build 25G72
- Laufzeitkontext: temporärer, ad-hoc-signierter macOS-App-Bundle
- Zielsprache: Deutsch (`de-DE`, von Apple als `de_DE` zurückgegeben)

Der App-Bundle-Kontext ist wichtig, weil Speech-Fähigkeiten und Berechtigungen
prozess- und bundlebezogen ausgewertet werden. Der eingecheckte Test baut
diesen Kontext bei jedem Lauf neu und entfernt ihn anschließend wieder.

## Reproduzierbarer, read-only Nachweis

```bash
npm run grocery:verify:local-speech
```

Der Test liest ausschließlich Fähigkeiten, installierte Sprachmodelle und den
aktuellen Berechtigungsstatus. Er fordert keine Berechtigung an, greift nicht
auf das Mikrofon zu, startet keine Erkennung und lädt oder reserviert kein
Sprachmodell. Der temporäre Bundle enthält deshalb absichtlich keine
`NSMicrophoneUsageDescription`.

Der Lauf vom 22. September 2026 ergab:

| Merkmal                                          | Ergebnis            |
| ------------------------------------------------ | ------------------- |
| `SpeechTranscriber` verfügbar                    | ja                  |
| Deutsch unterstützt                              | ja                  |
| Deutsches `SpeechTranscriber`-Modell installiert | nein                |
| Legacy-Erkenner verfügbar                        | ja                  |
| Legacy-Erkenner meldet On-Device-Unterstützung   | ja                  |
| Speech-Berechtigung                              | noch nicht bestimmt |
| Gate                                             | offen               |

Zusätzlich ist ein deutsches Dictation-Modell vorhanden. Das ist kein
LifeOS-End-to-End-Nachweis: Es wurde weder eine berechtigte Aufnahme gestartet
noch mit deaktiviertem Netzwerk bestätigt, dass eine vollständige deutsche
Transkription ausschließlich lokal bleibt. `candidate` im Prüfergebnis wäre
daher selbst nach geschlossenen Fähigkeitsgründen nur eine Einladung für den
separaten End-to-End-Test, keine Produktfreigabe.

## Warum kein Mikrofonmodus implementiert wurde

Apples neue Transkriptions-API arbeitet laut Apple vollständig auf dem Gerät,
benötigt aber sprachspezifische Modell-Assets. Auf diesem Mac unterstützt sie
Deutsch, das deutsche Modell ist jedoch nicht installiert. Die ältere API kann
lokale Erkennung nur dann verbindlich verlangen, wenn der konkrete Erkenner
`supportsOnDeviceRecognition` meldet und jede Anfrage
`requiresOnDeviceRecognition` setzt. Ein echter Lauf benötigt außerdem die
Speech- und Mikrofonberechtigungen der LifeOS-App.

Ein Modell-Download verändert den gemeinsam genutzten Systemzustand und kann
Apple-Netzwerkzugriff auslösen. Eine Berechtigungsanfrage öffnet einen
Systemdialog. Beides wurde in diesem read-only Nachweis bewusst nicht
ausgelöst. Es gibt keinen Cloud-Fallback, keinen externen KI-Dienst und keine
Web-Speech-Ersatzimplementierung.

Offizielle Grundlagen:

- [Apple: SpeechTranscriber](https://developer.apple.com/documentation/speech/speechtranscriber)
- [Apple: AssetInventory](https://developer.apple.com/documentation/speech/assetinventory)
- [Apple: On-Device-Spracherkennung](https://developer.apple.com/documentation/speech/sfspeechrecognizer/supportsondevicerecognition)
- [Apple: lokale Verarbeitung verlangen](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition)
- [Apple: Speech-Berechtigung](https://developer.apple.com/documentation/speech/asking-permission-to-use-speech-recognition)
- [Apple: Mikrofon-Berechtigung](https://developer.apple.com/documentation/BundleResources/Information-Property-List/NSMicrophoneUsageDescription)
- [Apple WWDC25: Bring advanced speech-to-text to your app](https://developer.apple.com/videos/play/wwdc2025/277/)

## Erforderlicher späterer Freigabenachweis

Ein eigener Mikrofonmodus darf erst in einer neuen, ausdrücklich freigegebenen
Lieferstufe entstehen, wenn alle folgenden Punkte erfüllt sind:

1. Das deutsche Modell wird mit ausdrücklicher Zustimmung installiert und als
   installiert erkannt.
2. Die LifeOS-App erhält die notwendigen Speech- und Mikrofonbeschreibungen;
   die Systemberechtigungen werden im echten LifeOS-Bundle erteilt.
3. Eine synthetische deutsche Aufnahme wird Ende zu Ende transkribiert. Bei der
   Legacy-API ist `requiresOnDeviceRecognition = true` zwingend; bevorzugt wird
   die vollständig lokale `SpeechTranscriber`-API verwendet.
4. Derselbe Lauf gelingt bei deaktivierter Netzwerkverbindung und scheitert
   geschlossen, wenn Modell oder lokale Fähigkeit fehlen.
5. Start, Stopp, Abbruch, Navigation, verweigerte Berechtigung und Fehler
   beenden den Audiokanal zuverlässig; Audio erreicht weder API, Persistenz,
   Browser-Storage, Logs, Audit noch Backup.

Bis dahin ist der fehlende Mikrofonknopf das beabsichtigte sichere Verhalten
und kein Funktionsfehler. Öffentliche Release-Freigabe, Apple-Notarisierung und
ein zweiter sauberer Mac sind davon getrennte Gates.
