// A-02, AP-1.30 PR 11e-1, Review #215 B1 (docs/80 §33 V-130-11e-1): Eigenschaftstest für `mitVornamen`.
// Maßstab: die Markierung folgt dem markierten Wort oder entfällt — sie springt NIE auf ein anderes Wort.
//
// Eingabemodell: jede Änderung des Vornamen-Felds ist EINE zusammenhängende Ersetzung eines Zeichenbereichs
// (ein Anschlag, Löschen, Einfügen aus der Zwischenablage über eine Auswahl). Daraus folgt die Wahrheit auf
// Zeichenebene: die Zeichen des markierten Worts, die die Ersetzung nicht trifft, „überleben" an bekannter
// neuer Stelle. Erlaubt ist eine Markierung nur auf einem Wort, das ein überlebendes Zeichen des markierten
// Worts enthält (dasselbe Wort, evtl. umgeschrieben) — oder auf einem Wort mit genau dem Text des markierten
// (vom Text her nicht zu unterscheiden, etwa „Karl Friedrich" markiert, Auswahl „Karl Friedrich" durch
// „Friedrich" ersetzt). Jede andere Markierung ist ein Sprung auf ein fremdes Wort.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  NAMEN_EINTRAG_LEER,
  mitVornamen,
  rufnameAuswahlWert,
  type NamenEintragWerte,
} from '../../src/renderer/ansichten/profil/profil-bearbeiten-logik'

const PARAMETER = { seed: 20261001, numRuns: 3000 } as const

/** Wörter mit Wiederholungen und Präfix-Beziehungen („Jo"/„Johann"), damit Mehrdeutigkeiten entstehen. */
const WORT = fc.constantFrom('Jo', 'Johann', 'Karl', 'Anna', 'K', 'Friedrich')
const EINFUEGUNG = fc.stringMatching(/^[JoKAnar ]{0,12}$/u)

interface Wortlage {
  readonly start: number
  readonly ende: number
  readonly text: string
}

function woerter(text: string): readonly Wortlage[] {
  return Array.from(text.matchAll(/\S+/gu), (treffer) => ({ start: treffer.index, ende: treffer.index + treffer[0].length, text: treffer[0] }))
}

describe('mitVornamen: die Markierung springt nie auf ein fremdes Wort (Review #215 B1)', () => {
  it('eine zusammenhängende Ersetzung markiert höchstens das (umgeschriebene) markierte Wort', () => {
    fc.assert(
      fc.property(
        fc.array(WORT, { minLength: 1, maxLength: 5 }),
        fc.nat(),
        fc.nat(),
        fc.nat(),
        EINFUEGUNG,
        (liste, markiertRoh, vonRoh, laengeRoh, einfuegung) => {
          const vorher = liste.join(' ')
          const lagen = woerter(vorher)
          const markiert = markiertRoh % lagen.length
          const marke = lagen[markiert]
          if (marke === undefined) return
          const von = vonRoh % (vorher.length + 1)
          const bis = von + (laengeRoh % (vorher.length - von + 1))
          const nachher = vorher.slice(0, von) + einfuegung + vorher.slice(bis)

          const eintrag: NamenEintragWerte = { ...NAMEN_EINTRAG_LEER, typ: 'geburtsname', vornamen: vorher, rufname: marke.text, rufnameIndex: markiert }
          const wert = rufnameAuswahlWert(mitVornamen(eintrag, nachher))
          if (wert === '') return
          const ziel = woerter(nachher)[Number(wert)]
          expect(ziel).toBeDefined()
          if (ziel === undefined) return

          // Überlebende Zeichen des markierten Worts, auf ihre neue Stelle abgebildet.
          const verschiebung = einfuegung.length - (bis - von)
          const ueberlebend: number[] = []
          for (let i = marke.start; i < marke.ende; i += 1) {
            if (i < von) ueberlebend.push(i)
            else if (i >= bis) ueberlebend.push(i + verschiebung)
          }
          const enthaeltUeberlebendes = ueberlebend.some((i) => i >= ziel.start && i < ziel.ende)
          const gleicherText = ziel.text === marke.text
          // Überschreiben: die Ersetzung trifft das markierte Wort selbst (nimmt ihm Zeichen oder klebt ohne
          // Leerzeichen an) — dann ist ein Wort aus dem eingefügten Text sein umgeschriebener Nachfolger
          // („K Jo", „Jo" markiert und durch „A" überschrieben → „A").
          const trifftWort = (von < marke.ende && bis > marke.start) || (von === marke.ende && /^\S/u.test(einfuegung)) || (bis === marke.start && /\S$/u.test(einfuegung))
          const ausEinfuegung = ziel.start < von + einfuegung.length && ziel.ende > von
          const ueberschrieben = trifftWort && ausEinfuegung
          expect(enthaeltUeberlebendes || gleicherText || ueberschrieben, `„${vorher}"@${markiert} → „${nachher}" markiert „${ziel.text}"@${wert}`).toBe(true)
        },
      ),
      PARAMETER,
    )
  })

  it('ein Anschlag im markierten Wort (gleiche Wortzahl, nur dieses Wort anders) behält die Markierung', () => {
    fc.assert(
      fc.property(fc.array(WORT, { minLength: 1, maxLength: 5 }), fc.nat(), fc.constantFrom('a', 'x', 'Z'), (liste, markiertRoh, zeichen) => {
        const markiert = markiertRoh % liste.length
        const marke = liste[markiert]
        if (marke === undefined) return
        const neu = liste.map((wort, i) => (i === markiert ? wort + zeichen : wort))
        const eintrag: NamenEintragWerte = { ...NAMEN_EINTRAG_LEER, typ: 'geburtsname', vornamen: liste.join(' '), rufname: marke, rufnameIndex: markiert }
        const nachher = mitVornamen(eintrag, neu.join(' '))
        expect(nachher).toMatchObject({ rufname: marke + zeichen, rufnameIndex: markiert })
      }),
      PARAMETER,
    )
  })
})
