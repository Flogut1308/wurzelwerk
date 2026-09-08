// AP-0.9: Handler für `person.anlegen`. Läuft ausschließlich innerhalb der vom Befehlsbus
// (`src/main/befehle/bus.ts`) bereits geöffneten und armierten Transaktion - kein `BEGIN`/`COMMIT`
// hier (CLAUDE.md §2).
import type { PersonAnlegenEin } from '../../shared/schemata/befehle'
import { einfuegen } from '../repositories/person-repo'
import type { Tx } from '../repositories/basis'
import { neueId } from '../ipc/huelle'

/**
 * `id` und die Zeitstempel `erstellt_am`/`geaendert_am` kommen vom Handler, nicht vom Aufrufer
 * (D-3): `Date.now()` ist in `src/core/` verboten (CLAUDE.md §4), hier in `src/main/` erlaubt.
 * Beim Anlegen sind `erstellt_am` und `geaendert_am` identisch. Der Kopfkommentar der Spalten in
 * `docs/schema/0002_kern.sql` ("Befüllung per Trigger AP-0.8") ist damit überholt — es gibt keinen
 * solchen Trigger, die Migration selbst bleibt aber unverändert (CLAUDE.md §6: eine angewendete
 * Migrationsdatei wird nie geändert). Diese Handler-Zuweisung hier ist die tatsächliche Quelle.
 */
export function personAnlegen(tx: Tx, ein: PersonAnlegenEin): { readonly id: string } {
  const id = neueId()
  const jetzt = Date.now()
  einfuegen(tx, { ...ein, id, erstelltAm: jetzt, geaendertAm: jetzt })
  return { id }
}
