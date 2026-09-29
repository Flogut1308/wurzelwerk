import { expect, type Page } from '@playwright/test'
import { z } from 'zod'
import { AUTOSAVE_DEBOUNCE_MS } from '../../src/shared/autosave'

/**
 * Gemeinsamer Takt der E2E-Koaleszenz-Stichproben (`ablauf-07-autosave-koaleszenz.spec.ts`,
 * `ablauf-10-reiter-person.spec.ts`, AP-1.30 / AP-0.15): Tastenanschläge, die EINZELN geschrieben
 * werden und deren Schreibvorgänge im Koaleszenz-Fenster liegen, ergeben EINEN Undo-Schritt.
 *
 * Zwei Dinge sind hier festgelegt (docs/80 §33 V-130-fix-ablauf07):
 *
 * 1. **Der Takt ist so knapp wie möglich.** Zwischen zwei Schreibvorgängen liegt zwingend die
 *    Debounce-Frist (`AUTOSAVE_DEBOUNCE_MS`); alles darüber hinaus (Bestätigungs-Poll, Nachlauf) ist
 *    Testaufwand, den ein langsamer Runner verlängert. Früher 250 ms Nachlauf und 50-ms-Poll —
 *    nominal ~720 ms je Schritt, ein einzelner Aussetzer von ~1,3 s auf dem CI-Runner riss das
 *    Fenster (PR #161, PR #170). Jetzt `NACHLAUF_MS` und `POLL_INTERVALL_MS` unten: nominal ~500 ms.
 * 2. **Die Vorbedingung misst die Uhr der App**, nicht die des Tests: `src/main/journal/koaleszenz.ts`
 *    vergleicht `transaktion.zeitpunkt` zweier Transaktionen (gesetzt in `src/main/befehle/bus.ts`
 *    VOR dem Commit). Die Test-Uhr nach dem Poll misst zusätzlich Commit-, IPC- und Poll-Latenz des
 *    jeweiligen Schritts — ein Aussetzer dort machte die Vorbedingung rot, obwohl die App noch
 *    zusammenfasste. Der Zeitpunkt der zusammengefassten Transaktion rückt bei jedem Merge auf die
 *    jüngste Änderung nach (gleitendes Fenster) und ist über `abfrage:journal.verlauf` lesbar.
 *
 * Die Zusicherung selbst bleibt unverändert: Fenster 2000 ms (keine Toleranz), jeder Anschlag einzeln
 * bestätigt, am Ende EIN Undo auf den Ausgangsstand. Zusätzlich (additiv) wird je Schritt geprüft,
 * dass die jüngste Transaktion dieselbe bleibt — ein Koaleszenzfehler fällt damit am Schritt auf, an
 * dem er entsteht, nicht erst am Undo.
 */

/** Koaleszenz-Fenster des Bus (`src/main/journal/koaleszenz.ts`, 55_Architektur.md §4.8). */
export const KOALESZENZ_FENSTER_MS = 2000

/**
 * Nachlauf nach dem bestätigten Schreiben, bevor der nächste Anschlag folgt. Grund: nach
 * `ereignis:datenGeaendert` lädt der Renderer den gespeicherten Stand nach und übernimmt ihn in den
 * Entwurf (Sync-Zweig in `src/renderer/ansichten/profil/profil-bearbeiten-debounce.ts`); ein Anschlag
 * VOR diesem Nachladen würde vom nachgeladenen Stand überschrieben. Gemessen ging auch ganz ohne
 * Nachlauf kein Anschlag verloren (lokal, auch bei 20-facher CPU-Drosselung des Renderers) — 50 ms
 * sind Reserve, kein Messwert.
 */
export const NACHLAUF_MS = 50

/** Abfrageintervall der Bestätigung „dieser Stand ist gespeichert". */
export const POLL_INTERVALL_MS = 10

/**
 * Frist je Anschlag bis zum bestätigten Schreiben (ab Anschlag): im ungünstigsten Fall (Frist
 * ausgeschöpft + Nachlauf) liegt der nächste Schreibvorgang noch im Fenster. Die Frist entscheidet
 * NICHT über die Zusicherung — die prüft `KoaleszenzTakt.geschrieben()` an der App-Uhr.
 */
export const SCHREIB_FRIST_MS = KOALESZENZ_FENSTER_MS - AUTOSAVE_DEBOUNCE_MS - NACHLAUF_MS

const VerlaufSchema = z.array(z.object({ id: z.string(), zeitpunkt: z.number() }))

interface Transaktion {
  readonly id: string
  readonly zeitpunkt: number
}

/** Jüngste Transaktion, die `personId` betrifft — Zeitpunkt nach der Uhr der App. */
async function juengsteTransaktion(fenster: Page, personId: string): Promise<Transaktion> {
  const ergebnis = await fenster.evaluate(async (id) => window.wurzelwerk.aufrufen('abfrage:journal.verlauf', { grenze: 1, personId: id }), personId)
  if (!ergebnis.ok) throw new Error('abfrage:journal.verlauf fehlgeschlagen')
  // `aufrufen()` ist im Preload kanalunabhängig auf `Ergebnis<unknown>` typisiert — per Zod prüfen.
  const juengste = VerlaufSchema.parse(ergebnis.daten)[0]
  if (juengste === undefined) throw new Error('abfrage:journal.verlauf: keine Transaktion zur Person')
  return juengste
}

/**
 * Begleitet eine Folge einzeln geschriebener Anschläge. Nach jedem bestätigten Schreiben
 * `geschrieben()` aufrufen: ab dem zweiten Schreiben muss der Abstand zum vorigen (App-Uhr) unter
 * dem Fenster liegen und die jüngste Transaktion dieselbe sein (zusammengefasst).
 */
export class KoaleszenzTakt {
  private readonly fenster: Page
  private readonly personId: string
  private vorige: Transaktion | null = null

  constructor(fenster: Page, personId: string) {
    this.fenster = fenster
    this.personId = personId
  }

  async geschrieben(): Promise<void> {
    const jetzt = await juengsteTransaktion(this.fenster, this.personId)
    const vorige = this.vorige
    if (vorige !== null) {
      // Vorbedingung der Koaleszenz — derselbe Vergleich wie `versucheZusammenfassen()`.
      expect(jetzt.zeitpunkt - vorige.zeitpunkt, 'Abstand zweier Schreibvorgänge (App-Uhr)').toBeLessThan(KOALESZENZ_FENSTER_MS)
      expect(jetzt.id, 'im Fenster zusammengefasst (dieselbe Transaktion)').toBe(vorige.id)
    }
    this.vorige = jetzt
    await this.fenster.waitForTimeout(NACHLAUF_MS)
  }
}
