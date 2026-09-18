// AP-0.20: `ereignis:`-Kanäle als geschlossener Vertrag. `sendeEreignis()` band den Kanalnamen
// bisher nur an `(typeof EREIGNIS_KANAELE)[number]` (roher `string`) und die Nutzlast an ein
// freies Typparameter `T` — ein Tippfehler im Kanalnamen oder eine unvollständige Nutzlast fiel
// dadurch nicht zur Compile-Zeit auf, nur (im besten Fall) zur Laufzeit im Renderer
// (`journalStatusNutzlastSchema.parse`). Dieser Test belegt mit `@ts-expect-error`, dass die
// verschärfte Signatur `sendeEreignis<K extends EreignisKanal>(kanal: K, nutzlast:
// EreignisNutzlast<K>)` genau diese zwei Fehlklassen jetzt zur Compile-Zeit fängt (rot bis zum
// Fix: `pnpm typen` meldet "Unused '@ts-expect-error' directive", weil die heutige, lose
// Signatur beide Aufrufe anstandslos durchlässt).
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }))

import { sendeEreignis } from '../../src/main/ipc/ereignisse'
import { EREIGNIS_KANAELE } from '../../src/shared/ipc/kanaele'

describe('ereignis:-Kanäle als geschlossener Vertrag (AP-0.20)', () => {
  it('EREIGNIS_KANAELE enthält ereignis:projektGeschlossen', () => {
    expect(EREIGNIS_KANAELE).toContain('ereignis:projektGeschlossen')
  })

  /** AP-1.11: Menüeintrag „Zustandsbibliothek" im Entwicklungsmenü (nur `!app.isPackaged`) navigiert
   * über genau diesen zusätzlichen Kanal — additiv nach dem Muster von `ereignis:projektGeschlossen`. */
  it('EREIGNIS_KANAELE enthält ereignis:zustandsbibliothekOeffnen', () => {
    expect(EREIGNIS_KANAELE).toContain('ereignis:zustandsbibliothekOeffnen')
  })

  it('sendeEreignis() lehnt einen erfundenen Kanalnamen und eine unvollständige Nutzlast zur Compile-Zeit ab', () => {
    // @ts-expect-error erfundener Kanalname ist kein EreignisKanal (AP-0.20)
    sendeEreignis('ereignis:tippfehler', { transaktionId: 'x', ursache: 'y' })
    // @ts-expect-error journalStatus-Nutzlast unvollständig (EreignisNutzlast<'ereignis:journalStatus'> nicht erfüllt)
    sendeEreignis('ereignis:journalStatus', { transaktionId: 'x' })

    expect(true).toBe(true)
  })
})
