// AP-1.17c1-Nachbesserung (rot zuerst, CLAUDE.md §5): beim Bau des Bildvergleichs-Motivs „Quelle
// bearbeiten" (`test/e2e/bildvergleich.spec.ts`) blieb die „Quelle bearbeiten"-Schublade in der
// echten App leer/mit Fehlertext („Die Quelle konnte nicht geladen werden.") — nicht wegen eines
// UI-Bugs, sondern weil `abfrage:quelle.detail` (und seine Geschwister `befehl:archiv.*`,
// `befehl:quelle.*`, `befehl:zitat.*`, `befehl:negativbefund.*`, `abfrage:negativbefund.liste`)
// zwar in `src/shared/ipc/vertrag.ts` deklariert UND in `src/main/ipc/registrierung.ts` bedient
// sind, aber nie in die Preload-Weißliste `ALLE_KANAELE` (`src/shared/ipc/kanaele.ts`) übernommen
// wurden. `src/preload/index.ts::aufrufen()` prüft jeden Kanalnamen gegen genau diese Liste, bevor
// er `ipcRenderer.invoke` überhaupt ruft — ein fehlender Eintrag liefert unabhängig vom
// tatsächlichen Handler `IPC_UNBEKANNTER_KANAL` zurück (bestätigt per Direktaufruf gegen die
// laufende App). Diese dreizehn Kanäle waren dadurch aus dem Renderer heraus NIE erreichbar, seit
// sie eingeführt wurden — ein stiller, vollständiger Funktionsausfall der Quellen-/Zitat-/
// Archiv-/Negativbefund-Pflege, den kein bestehender Test bemerkte (die einzige Vollständigkeits-
// prüfung, `dialoge.test.ts`, deckt nur die beiden Dialog-Kanäle ab).
//
// Nachtrag: diese Liste war selbst nur eine Handpflege-Liste der bekannten 13 — sie hätte KEINE
// künftig fehlende Kanäle gefangen. Der eigentliche Wächter ist jetzt der Compile-Zeit-
// Vollständigkeitsbeweis in `src/shared/ipc/kanaele.ts` (`FehlendeKanaele`/`_kanaeleVollstaendig`):
// er lässt `pnpm typen` fehlschlagen, sobald IRGENDEIN in `Vertrag` deklarierter Kanal in der
// Weißliste fehlt. Er deckte beim Einbau sofort drei weitere, bis dahin unbemerkte Fälle derselben
// Bugklasse auf (`befehl:schnappschuss.erzeugen`, `abfrage:schnappschuss.liste`,
// `befehl:schnappschuss.wiederherstellen`) — die diese hartkodierte Liste nie erfasst hätte.
// Dieser Test bleibt als Dokumentation des ursprünglichen Vorfalls (die 16 real gefundenen
// Kanäle) erhalten, ist aber nicht mehr die Vollständigkeitsprüfung.
import { describe, expect, it } from 'vitest'
import { ALLE_KANAELE } from '../../src/shared/ipc/kanaele'

// Alle real gefundenen, zuvor fehlenden Kanäle: die ursprünglichen 13 (Archiv/Quelle/Zitat/
// Negativbefund, AP-1.17/AP-1.18) plus die drei vom Compile-Zeit-Guard aufgedeckten
// Schnappschuss-Kanäle.
const ERWARTETE_KANAELE = [
  'befehl:archiv.anlegen',
  'befehl:archiv.aendern',
  'abfrage:archiv.suche',
  'befehl:quelle.anlegen',
  'befehl:quelle.aendern',
  'abfrage:quelle.detail',
  'befehl:zitat.anlegen',
  'befehl:zitat.aendern',
  'befehl:zitat.loeschen',
  'befehl:negativbefund.anlegen',
  'befehl:negativbefund.aendern',
  'befehl:negativbefund.loeschen',
  'abfrage:negativbefund.liste',
  'befehl:schnappschuss.erzeugen',
  'abfrage:schnappschuss.liste',
  'befehl:schnappschuss.wiederherstellen',
] as const

describe('ALLE_KANAELE (Preload-Weißliste) — real gefundene, zuvor fehlende Kanäle', () => {
  it.each(ERWARTETE_KANAELE)('enthält "%s" (in registrierung.ts bedient, s. Kopfkommentar)', (kanal) => {
    expect(ALLE_KANAELE).toContain(kanal)
  })
})
