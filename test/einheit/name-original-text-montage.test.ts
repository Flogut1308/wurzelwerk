// AP-1.30 PR 2a: `istMontierterOriginalText` (src/core/name/zerlegung.ts) unterscheidet einen
// automatisch montierten `original_text` von einer wortgetreuen Schreibung — Grundlage der Regel, nach
// der die Profil-Namensänderung eine Quelle erhält, eine Montage aber neu erzeugen lässt.
import { describe, expect, it } from 'vitest'
import { istMontierterOriginalText, montiereOriginalText, rekonstruiereFlach, zerlegeName, type FlacherName } from '../../src/core/name/zerlegung'

/** Die rekonstruierten Felder, wie das Lesemodell sie nach dem Schreiben von `eingabe` liefert. */
function gespeichert(eingabe: FlacherName): FlacherName {
  return rekonstruiereFlach(zerlegeName(eingabe))
}

describe('istMontierterOriginalText (AP-1.30 PR 2a)', () => {
  it('null ist nie wortgetreu', () => {
    expect(istMontierterOriginalText(null, { nachname: 'Müller' })).toBe(true)
  })

  it('die Montage der Eingabe gilt als automatisch', () => {
    const eingabe = { titelVor: 'Dr.', vornamen: 'Johann Georg', praefix: 'von', nachname: 'Müller', zusatzNach: 'd. Ä.' }
    expect(istMontierterOriginalText(montiereOriginalText(eingabe), gespeichert(eingabe))).toBe(true)
  })

  it('reiner Leerraum-Unterschied gilt als automatisch', () => {
    const eingabe = { vornamen: ' Johann   Georg ', nachname: 'Müller' }
    expect(istMontierterOriginalText(montiereOriginalText(eingabe), gespeichert(eingabe))).toBe(true)
  })

  it('angehängter Rufname (kein vorhandener Vorname): die Montage ohne ihn gilt als automatisch', () => {
    const eingabe = { vornamen: 'Johann', rufnameText: 'Hans', nachname: 'Müller' }
    expect(montiereOriginalText(eingabe)).toBe('Johann Müller')
    expect(istMontierterOriginalText('Johann Müller', gespeichert(eingabe))).toBe(true)
  })

  it('eine abweichende Schreibung ist wortgetreu', () => {
    const eingabe = { vornamen: 'Johann Georg', nachname: 'Müller' }
    expect(istMontierterOriginalText('Joh. Georg Müller alias Miller', gespeichert(eingabe))).toBe(false)
  })

  it('ein Text ohne Bestandteile ist wortgetreu', () => {
    expect(istMontierterOriginalText('Anna', {})).toBe(false)
  })

  it('der letzte Vorname wird nur weggelassen, wenn er der Rufname ist', () => {
    const eingabe = { vornamen: 'Johann Georg', nachname: 'Müller' }
    expect(istMontierterOriginalText('Johann Müller', gespeichert(eingabe))).toBe(false)
  })
})
