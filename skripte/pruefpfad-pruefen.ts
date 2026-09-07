// Geschützter Prüfpfad (ADR-025, Reward-Hacking-Schutz): test/invarianten, test/golden und
// test/schema sind der Maßstab, nicht das Werkstück. Ändert ein Push/PR einen dieser Pfade
// zusammen mit Produktivcode unter src/, ist das kein automatisches Fehlverhalten — aber es
// läuft nie unbemerkt durch. Dieses Skript macht den Fall sichtbar (CI schlägt fehl).
import { execFileSync } from 'node:child_process'

const geschuetztePfade = [/^test\/invarianten\//, /^test\/golden\//, /^test\/schema\//]
const produktivPfad = /^src\//

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function geaenderteDateien(basis: string, kopf: string): string[] {
  const ausgabe = git(['diff', '--name-only', basis, kopf])
  return ausgabe === '' ? [] : ausgabe.split('\n')
}

const basis = process.env['PRUEFPFAD_BASE_SHA']
const kopf = process.env['PRUEFPFAD_HEAD_SHA'] ?? 'HEAD'

if (basis === undefined || basis === '' || /^0+$/.test(basis)) {
  console.log('Kein Vergleichspunkt (erster Push oder leere Basis) — Prüfung übersprungen.')
  process.exit(0)
}

const dateien = geaenderteDateien(basis, kopf)
const geaenderteGeschuetzte = dateien.filter((datei) => geschuetztePfade.some((muster) => muster.test(datei)))
const geaenderteProduktivDateien = dateien.filter((datei) => produktivPfad.test(datei))

if (geaenderteGeschuetzte.length > 0 && geaenderteProduktivDateien.length > 0) {
  console.error('Geschützter Prüfpfad und Produktivcode ändern sich im selben Vergleich:')
  console.error('')
  console.error('  Geschützt:')
  for (const datei of geaenderteGeschuetzte) console.error(`    ${datei}`)
  console.error('  Produktivcode:')
  for (const datei of geaenderteProduktivDateien) console.error(`    ${datei}`)
  console.error('')
  console.error(
    'ADR-025: Änderungen an test/invarianten, test/golden oder test/schema laufen nie in ' +
      'derselben Iteration wie der geprüfte Produktivcode. Aufteilen oder zweiten Blick einholen.',
  )
  process.exit(1)
}

console.log('Geschützter Prüfpfad: keine Vermischung mit Produktivcode gefunden.')
