// AP-0.13 — Kindprozess für den SIGKILL-Absturztest (`test/absturz/sigkill.test.ts`, F-08,
// 55_Architektur.md §9.3: "Ein Absturz mitten in einer Transaktion darf die Datenbank nicht
// beschädigen"). Läuft in einer Endlosschleife echte Befehle über den Befehlsbus (`fuehreAus`,
// `src/main/befehle/bus.ts`) gegen eine WAL-journalisierte Datenbank, bis der Elternprozess ihn per
// SIGKILL beendet.
//
// Bewusst KEIN eigener Signal-Handler: ein Handler würde dem Absturz ausweichen, den der Test
// gerade beweisen soll — dass SQLites WAL-Journalisierung selbst genügt, unabhängig von einer
// geordneten Beendigung des Prozesses.
//
// Aufruf (s. `test/absturz/_electron-stub.cjs` für den Grund des `--require`):
//   node --require test/absturz/_electron-stub.cjs --import tsx test/absturz/kind-prozess.ts <dbPfad> <seed>
//
// Nach jedem erfolgreich zurückgekehrten `fuehreAus`-Aufruf (== erfolgreich committete
// Transaktion) schreibt dieser Prozess eine Hochwassermarke (fortlaufender Zähler) in eine
// Sidecar-Datei `<dbPfad>.hochwasser` — über `writeFileSync` auf eine `.tmp`-Datei gefolgt von
// einem atomaren `renameSync` (nicht direkt auf die Zieldatei), damit ein SIGKILL mitten im
// Schreiben nie eine halb geschriebene, unlesbare Sidecar-Datei hinterlässt: die Zieldatei enthält
// zu jedem Zeitpunkt entweder den vorherigen vollständigen Stand oder den neuen, nie einen
// Bruchteil davon.
import { renameSync, writeFileSync } from 'node:fs'
import { fuehreAus } from '../../src/main/befehle/bus'
import { migrieren } from '../../src/main/datenbank/migration/laeufer'
import { oeffnen } from '../../src/main/datenbank/verbindung'
import { SeedPrng } from '../../src/core/zufall/seed-prng'

const dbPfad = process.argv[2]
const seedRoh = process.argv[3]

if (dbPfad === undefined || seedRoh === undefined) {
  throw new Error('kind-prozess.ts erwartet genau zwei Argumente: <dbPfad> <seed>.')
}

const seed = Number(seedRoh)
if (!Number.isFinite(seed)) {
  throw new Error(`kind-prozess.ts: <seed> ist keine Zahl: ${seedRoh}`)
}

const hochwassermarkePfad = `${dbPfad}.hochwasser`

function hochwassermarkeSchreiben(wert: number): void {
  const tmpPfad = `${hochwassermarkePfad}.tmp`
  writeFileSync(tmpPfad, `${String(wert)}\n`, 'utf8')
  renameSync(tmpPfad, hochwassermarkePfad)
}

const db = oeffnen(dbPfad)
migrieren(db)

const prng = new SeedPrng(seed)
const angelegteIds: string[] = []
let zaehler = 0

// Endlosschleife bis SIGKILL ist der Testzweck (s. Moduldoku oben).
while (true) {
  const wuerfel = prng.naechsteZahl() % 3
  const zufallsIndex = angelegteIds.length > 0 ? prng.naechsteZahl() % angelegteIds.length : undefined
  const bestehendeId = zufallsIndex === undefined ? undefined : angelegteIds[zufallsIndex]

  if (wuerfel === 0 && bestehendeId !== undefined) {
    fuehreAus(db, 'person.feldSetzen', { id: bestehendeId, feld: 'notiz', wert: `n-${String(zaehler)}` })
  } else {
    const ergebnis = fuehreAus(db, 'person.anlegen', { privat: 0, ist_platzhalter: 0 })
    angelegteIds.push(ergebnis.id)
  }

  zaehler += 1
  hochwassermarkeSchreiben(zaehler)
}
