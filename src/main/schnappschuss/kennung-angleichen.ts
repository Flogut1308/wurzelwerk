// AP-1.34 (E12, A2): Kennungszähler nach einer Datei-Wiederherstellung nachziehen — gemeinsam
// genutzt von `importZuruecknehmen()` (`src/main/journal/undo.ts`) und
// `schnappschussWiederherstellen()` (`./wiederherstellen.ts`). Kein eigenes SQL (CLAUDE.md §2:
// das steht in `src/main/repositories/kennung-repo.ts`) und keine Transaktion: je Bereich ein
// einzelnes UPDATE auf die NICHT_JOURNALISIERTE Tabelle `kennung_zaehler`.
import type { KennungZaehler } from '../../shared/schemata/kennung-zaehler'
import { oeffnen } from '../datenbank/verbindung'
import { zaehlerMindestensSetzen, zaehlerTabelleVorhanden } from '../repositories/kennung-repo'

/**
 * Öffnet die wiederhergestellte Datei kurz und zieht jeden gesicherten Zähler auf mindestens
 * seinen alten Stand. Ein einzelnes UPDATE je Bereich auf eine NICHT_JOURNALISIERTE Tabelle —
 * keine Journalklammer nötig. Kennt die wiederhergestellte Datei den Zähler nicht (Schnappschuss
 * älter als Migration 0007), bleibt sie unberührt (E13). Der Handle ist beim Rücksprung — auch
 * bei einem Wurf — geschlossen (Windows: der Aufrufer benennt die Datei danach ggf. um).
 */
export function zaehlerNachziehen(dbPfad: string, zaehlerVorher: readonly KennungZaehler[]): void {
  if (zaehlerVorher.length === 0) {
    return
  }
  const wiederhergestellt = oeffnen(dbPfad)
  try {
    if (!zaehlerTabelleVorhanden(wiederhergestellt)) {
      return
    }
    for (const zaehler of zaehlerVorher) {
      zaehlerMindestensSetzen(wiederhergestellt, zaehler.bereich, zaehler.naechste)
    }
  } finally {
    wiederhergestellt.close()
  }
}
