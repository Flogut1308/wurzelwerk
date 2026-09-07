## ADR-008 — Auslieferung und Signierung

**Status:** entschieden, Umsetzung Phase 5

- **macOS:** Apple Developer Program (99 USD/Jahr), Developer-ID-Zertifikat, Hardened Runtime, `notarytool`, Stapling. Ohne Notarisierung erscheint ab macOS 15+ ein Gatekeeper-Dialog, den Nutzer nur über die Systemeinstellungen umgehen können — für Endnutzersoftware untragbar.
- **Windows:** bester Weg 2026 ist **Azure Trusted Signing** (Microsofts gehosteter Dienst, kein Hardware-Token, für Einzelentwickler nutzbar bei Nachweis von drei Jahren Historie, ~9,99 USD/Monat). Alternative: OV-Zertifikat (~200–400 EUR/Jahr, seit 2023 nur auf Token/HSM) mit SmartScreen-Warnung bis Reputationsaufbau, oder EV (~400–700 EUR/Jahr) mit sofortiger Reputation.
- **Auto-Update:** `electron-updater` mit `provider: github` gegen GitHub Releases — keine eigene Infrastruktur. macOS-Updates verlangen ein signiertes Bundle.

**Entschieden (F2): Eigennutzung plus Weitergabe an Verwandtschaft** — aber nicht als
installierbare App. Konsequenz:

- Verwandte bekommen **keinen Installer**, sondern den **Lesemodus-Export als einzelne
  HTML-Datei** (E-06). Die läuft in jedem Browser, braucht keine Installation, keine Signierung
  und kein Zertifikat. Das umgeht die gesamte Signierungsproblematik für den Hauptzweck der
  Weitergabe.
- Signierung wird damit **nur** nötig, wenn du die App selbst auf mehreren Rechnern nutzt oder
  jemand mitarbeiten soll. Empfehlung: **erst dann bezahlen.** Bis dahin die eigene App lokal
  ad-hoc signieren (`codesign --sign -`) — läuft auf dem eigenen Mac problemlos.
- Wenn du später doch verteilen willst: Apple-Mitgliedschaft zuerst (macOS ist strenger),
  Windows danach über Azure Trusted Signing.
