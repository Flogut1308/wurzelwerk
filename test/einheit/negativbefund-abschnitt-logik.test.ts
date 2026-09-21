// AP-1.17 PR-C2 — rot zuerst (CLAUDE.md §5, eiserne Regel): vor der Komponente geschrieben. Reine
// Umrechnungen aus `negativbefund-abschnitt-logik.ts` (Muster `quelle-bearbeiten-logik.test.ts`),
// OHNE React/DOM/Netzwerk — kein Mock nötig.
import { describe, expect, it } from 'vitest'
import {
  NEGATIVBEFUND_ENTWURF_LEER,
  ganzzahlTextIstGueltig,
  negativbefundAendernEinAusEntwurf,
  negativbefundAnlegenEinAusEntwurf,
  negativbefundEntwurfAusEintrag,
  negativbefundEntwurfHatInhalt,
  type NegativbefundEntwurfWerte,
} from '../../src/renderer/ansichten/profil/negativbefund-abschnitt-logik'
import type { NegativbefundEintrag } from '../../src/shared/schemata/negativbefund-liste'

function negativbefundEintrag(ueberschreibung: Partial<NegativbefundEintrag> = {}): NegativbefundEintrag {
  return {
    id: 'negativbefund-1',
    quelleId: null,
    gesuchtePersonId: 'person-1',
    gesuchtesPraedikat: null,
    zeitraumVon: null,
    zeitraumBis: null,
    beschreibung: null,
    datumDerPruefung: null,
    ...ueberschreibung,
  }
}

describe('negativbefund-abschnitt-logik: Ganzzahl-Gültigkeit (AP-1.17 PR-C2)', () => {
  it('ganzzahlTextIstGueltig: leer ist gültig (kein Zeitraumjahr angegeben, erlaubt)', () => {
    expect(ganzzahlTextIstGueltig('')).toBe(true)
    expect(ganzzahlTextIstGueltig('   ')).toBe(true)
  })

  it('ganzzahlTextIstGueltig: eine Ganzzahl ist gültig, ein Fließkomma/Text nicht', () => {
    expect(ganzzahlTextIstGueltig('1890')).toBe(true)
    expect(ganzzahlTextIstGueltig('-500')).toBe(true)
    expect(ganzzahlTextIstGueltig('1890,5')).toBe(false)
    expect(ganzzahlTextIstGueltig('achtzehnhundert')).toBe(false)
  })
})

describe('negativbefund-abschnitt-logik: Entwurf <-> Eintrag (AP-1.17 PR-C2)', () => {
  it('negativbefundEntwurfAusEintrag: null -> leerer String/leeres Feld, quelleId bleibt durchgereicht', () => {
    const entwurf = negativbefundEntwurfAusEintrag(negativbefundEintrag({ quelleId: 'quelle-1' }))
    expect(entwurf).toEqual<NegativbefundEntwurfWerte>({
      gesuchtesPraedikat: '',
      zeitraumVonText: '',
      zeitraumBisText: '',
      beschreibung: '',
      datumDerPruefung: '',
      quelleId: 'quelle-1',
    })
  })

  it('negativbefundEntwurfAusEintrag: befüllte Zahlen werden zu Text', () => {
    const entwurf = negativbefundEntwurfAusEintrag(negativbefundEintrag({ zeitraumVon: 1880, zeitraumBis: 1900 }))
    expect(entwurf.zeitraumVonText).toBe('1880')
    expect(entwurf.zeitraumBisText).toBe('1900')
  })

  it('negativbefundEntwurfHatInhalt: komplett leer -> nicht absendbar', () => {
    expect(negativbefundEntwurfHatInhalt(NEGATIVBEFUND_ENTWURF_LEER)).toBe(false)
  })

  it('negativbefundEntwurfHatInhalt: mindestens ein Textfeld gefüllt -> absendbar', () => {
    const entwurf: NegativbefundEntwurfWerte = { ...NEGATIVBEFUND_ENTWURF_LEER, gesuchtesPraedikat: 'Geburt' }
    expect(negativbefundEntwurfHatInhalt(entwurf)).toBe(true)
  })

  it('negativbefundEntwurfHatInhalt: nur ein Zeitraumjahr gefüllt -> absendbar', () => {
    const entwurf: NegativbefundEntwurfWerte = { ...NEGATIVBEFUND_ENTWURF_LEER, zeitraumVonText: '1900' }
    expect(negativbefundEntwurfHatInhalt(entwurf)).toBe(true)
  })

  it('negativbefundAnlegenEinAusEntwurf: leere Felder -> undefined, quelleId NIE Teil der Nutzlast', () => {
    expect(negativbefundAnlegenEinAusEntwurf('person-1', NEGATIVBEFUND_ENTWURF_LEER)).toEqual({
      gesuchtePersonId: 'person-1',
      gesuchtesPraedikat: undefined,
      zeitraumVon: undefined,
      zeitraumBis: undefined,
      beschreibung: undefined,
      datumDerPruefung: undefined,
    })
  })

  it('negativbefundAnlegenEinAusEntwurf: befüllte Felder landen unverändert im Ergebnis', () => {
    const entwurf: NegativbefundEntwurfWerte = {
      ...NEGATIVBEFUND_ENTWURF_LEER,
      gesuchtesPraedikat: 'Geburt',
      zeitraumVonText: '1880',
      zeitraumBisText: '1900',
      beschreibung: 'Kirchenbuch durchsucht, kein Eintrag gefunden.',
      datumDerPruefung: '2026-09-20',
    }
    expect(negativbefundAnlegenEinAusEntwurf('person-1', entwurf)).toEqual({
      gesuchtePersonId: 'person-1',
      gesuchtesPraedikat: 'Geburt',
      zeitraumVon: 1880,
      zeitraumBis: 1900,
      beschreibung: 'Kirchenbuch durchsucht, kein Eintrag gefunden.',
      datumDerPruefung: '2026-09-20',
    })
  })

  it('negativbefundEntwurfAusEintrag + negativbefundAendernEinAusEntwurf: ein bestehendes quelleId wird UNVERÄNDERT durchgereicht (kein stiller Verknüpfungsverlust)', () => {
    const eintrag = negativbefundEintrag({ quelleId: 'quelle-1', gesuchtesPraedikat: 'Geburt' })
    const entwurf = negativbefundEntwurfAusEintrag(eintrag)
    // Das sichtbare Feld "gesuchtesPraedikat" wurde geändert — die verborgene quelleId bleibt trotzdem erhalten.
    const geaendert: NegativbefundEntwurfWerte = { ...entwurf, gesuchtesPraedikat: 'Taufe' }
    const ergebnis = negativbefundAendernEinAusEntwurf(eintrag.id, eintrag.gesuchtePersonId, geaendert)
    expect(ergebnis.gesuchtesPraedikat).toBe('Taufe')
    expect(ergebnis.quelleId).toBe('quelle-1')
  })

  it('negativbefundAendernEinAusEntwurf: kein quelleId auf der Zeile -> undefined statt null (Vertrag kennt kein null)', () => {
    const eintrag = negativbefundEintrag()
    const entwurf = negativbefundEntwurfAusEintrag(eintrag)
    const ergebnis = negativbefundAendernEinAusEntwurf(eintrag.id, eintrag.gesuchtePersonId, entwurf)
    expect(ergebnis.quelleId).toBeUndefined()
  })
})
