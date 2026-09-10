// AP-0.13, F-08, 55_Architektur.md §9.3: "Ein Absturz mitten in einer Transaktion darf die
// Datenbank nicht beschädigen." Dieser Test beweist die WAL-Absturzzusage EMPIRISCH statt nur zu
// behaupten: ein echter Kindprozess (`test/absturz/kind-prozess.ts`) führt eine Endlosschleife
// echter Befehle über den Befehlsbus gegen eine WAL-journalisierte Datenbank aus, wird zu einem von
// einem festen Seed abgeleiteten Zeitpunkt per SIGKILL beendet (kein geordnetes Herunterfahren, kein
// Signal-Handler im Kind — s. dessen Moduldoku), und die Datenbank wird danach vom Elternprozess neu
// geöffnet und geprüft.
//
// tsx-Loader-Aufruf (empirisch geprüft, s. Auftragsbericht AP-0.13): `node --import tsx <datei>`
// kompiliert eine `.ts`-Einstiegsdatei ohne `"type": "module"` (wie dieses Repository) über die
// klassische CJS-Ladekette — deshalb funktioniert ein klassischer `Module._load`-Patch
// (`_electron-stub.cjs`, per `--require` VOR `--import tsx` geladen) zuverlässig gegen
// `require('electron')`, das der Befehlsbus transitiv braucht (`sendeEreignis`/`protokoll/logger.ts`)
// und das unter einem plain-Node-Kindprozess (kein Electron-Fenster) sonst nur den Dateipfad zur
// Electron-Programmdatei liefert, nicht die echte API.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { ableitungAbweichung } from '../../src/main/datenbank/integritaet'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { SeedPrng } from '../../src/core/zufall/seed-prng'

const HIER = dirname(fileURLToPath(import.meta.url))
const ELECTRON_STUB_PFAD = join(HIER, '_electron-stub.cjs')
const KIND_PROZESS_PFAD = join(HIER, 'kind-prozess.ts')

/** Fester Seed für die Ableitung der Kill-Zeitpunkte (CLAUDE.md §13: Determinismus ist Pflicht). */
const KILL_SEED = 20260913
/** >= 20 laut Auftrag — 24 für etwas Sicherheitsmarge. */
const ANZAHL_LAEUFE = 24
/** Spanne der Verzögerung bis zum SIGKILL — deckt "vor der ersten Transaktion" bis "nach vielen hundert" ab (empirisch ~0.5-1 ms je Transaktion, s. Auftragsbericht). */
const MAX_VERZOEGERUNG_MS = 260

function killVerzoegerungenMs(anzahl: number): readonly number[] {
  const prng = new SeedPrng(KILL_SEED)
  const werte: number[] = []
  for (let i = 0; i < anzahl; i += 1) {
    werte.push(1 + (prng.naechsteZahl() % MAX_VERZOEGERUNG_MS))
  }
  return werte
}

const LAEUFE = killVerzoegerungenMs(ANZAHL_LAEUFE).map((verzoegerungMs, index) => ({
  verzoegerungMs,
  index,
  kindSeed: KILL_SEED + index,
}))

function verzoegerung(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function aufKindEndeWarten(kind: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((resolve) => {
    kind.once('close', () => resolve())
  })
}

interface TransaktionLfdZeile {
  readonly lfd: number
}
interface TransaktionOhneAenderungZeile {
  readonly id: string
}

describe('Absturzsicherheit: SIGKILL mitten in einer laufenden Transaktionsfolge (AP-0.13, F-08)', () => {
  let ordner: string | undefined

  afterEach(() => {
    if (ordner !== undefined) {
      // Räumt Datenbankdatei + `-wal`/`-shm`/Sidecar in einem Zug ab (alle liegen im selben,
      // testeigenen Temp-Ordner).
      rmSync(ordner, { recursive: true, force: true })
      ordner = undefined
    }
  })

  it.each(LAEUFE)(
    'SIGKILL nach ~$verzoegerungMs ms (Lauf #$index) hinterlässt eine intakte, bitgleiche Datenbank',
    async ({ verzoegerungMs, kindSeed }) => {
      ordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-absturz-'))
      const dbPfad = join(ordner, 'test.sqlite')
      const hochwasserPfad = `${dbPfad}.hochwasser`

      const vorbereitung = oeffnen(dbPfad)
      migrieren(vorbereitung)
      vorbereitung.close()

      let stderrGesammelt = ''
      const kind = spawn(
        process.execPath,
        ['--require', ELECTRON_STUB_PFAD, '--import', 'tsx', KIND_PROZESS_PFAD, dbPfad, String(kindSeed)],
        { stdio: ['ignore', 'ignore', 'pipe'] },
      )
      kind.stderr?.on('data', (chunk: unknown) => {
        stderrGesammelt += String(chunk)
      })

      await verzoegerung(verzoegerungMs)
      const wurdeGekillt = kind.kill('SIGKILL')
      await aufKindEndeWarten(kind)

      // Sanity-Netz (AP-0.13-Auftrag: "Teste den Kind-Start isoliert"): wenn der Kindprozess schon
      // VOR unserem SIGKILL beendet war, hat er vermutlich einen echten Fehler geworfen (z. B. ein
      // Ladeproblem) - ohne diese Prüfung würde der Test dann nur eine trivial unveränderte
      // Datenbank sehen und fälschlich grün bleiben, statt den echten Fehler zu zeigen.
      if (!wurdeGekillt) {
        throw new Error(
          `Kindprozess war bereits beendet, bevor SIGKILL geschickt wurde (evtl. Absturz vor dem Timing-Fenster). stderr: ${stderrGesammelt}`,
        )
      }

      const hochwassermarke = existsSync(hochwasserPfad) ? Number(readFileSync(hochwasserPfad, 'utf8').trim()) : 0
      expect(Number.isFinite(hochwassermarke)).toBe(true)

      const db = oeffnen(dbPfad)
      try {
        expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
        expect(db.pragma('foreign_key_check')).toEqual([])

        const lfdZeilen = db.prepare<[], TransaktionLfdZeile>('SELECT lfd FROM transaktion ORDER BY lfd').all()
        const lfdWerte = lfdZeilen.map((zeile) => zeile.lfd)
        expect(lfdWerte).toEqual(Array.from({ length: lfdWerte.length }, (_wert, i) => i + 1))
        expect(lfdWerte.length).toBeGreaterThanOrEqual(hochwassermarke)

        expect(ableitungAbweichung(db).betroffeneTabellen).toEqual([])

        const ohneAenderung = db
          .prepare<
            [],
            TransaktionOhneAenderungZeile
          >('SELECT t.id AS id FROM transaktion t LEFT JOIN aenderung a ON a.transaktion_id = t.id WHERE a.id IS NULL')
          .all()
        expect(ohneAenderung).toEqual([])
      } finally {
        db.close()
      }
    },
    30_000,
  )
})
