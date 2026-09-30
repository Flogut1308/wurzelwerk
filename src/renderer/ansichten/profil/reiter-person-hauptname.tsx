import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppFehler } from '../../../shared/fehler/app-fehler'
import type { PersonDetailName } from '../../../shared/schemata/person-detail'
import { Auswahlfeld, type AuswahlfeldOption } from '../../bausteine/auswahlfeld'
import { Formularfeld } from '../../bausteine/formularfeld'
import { Schaltflaeche } from '../../bausteine/schaltflaeche'
import { Text } from '../../bausteine/text'
import { Textfeld } from '../../bausteine/textfeld'
import { useNameAendern, useNameAnlegen } from '../../brücke/befehl-hooks'
import { useEntwurfMitVerzoegertemCommit } from './profil-bearbeiten-debounce'
import {
  NAMEN_EINTRAG_LEER,
  geaendertesNamensFeld,
  mitRufnameAusAuswahl,
  mitVornamen,
  nameAendernEinAusEintrag,
  namenEintragAusPersonDetailName,
  rufnameAuswahlVornamen,
  rufnameAuswahlWert,
  type NamenEintragWerte,
} from './profil-bearbeiten-logik'
import { hauptnameAnlegenEin, hauptnameHatSichtbarenInhalt, hauptnameZustand } from './reiter-person-logik'

export interface HauptnameGruppeProps {
  readonly personId: string
  readonly namen: readonly PersonDetailName[]
  readonly idPraefix: string
  /** Die Kurzbeschreibung (eine Aussage, Schreibweg in `reiter-person.tsx`) — steht laut Entwurf in
   * dieser Gruppe, gehört aber nicht zur Namensform. */
  readonly kurzbeschreibung: ReactNode
  /** „n weitere Namensformen · Reiter Namen" (E6). */
  readonly aufNamenReiter: () => void
}

/** Kennung eines Felds der Gruppe (Ziel für Tests und Beschriftung); eigener Namensraum neben
 * `editorFeldId`, weil diese Felder kein Sprungziel offener Punkte sind. */
export function hauptnameFeldId(idPraefix: string, teil: 'vornamen' | 'nachname' | 'rufname'): string {
  return `${idPraefix}-hauptname-${teil}`
}

/**
 * Gruppe „Hauptname" im Reiter Person (AP-1.30 PR 9c, Artboard 1a; docs/80 §33 V-130-9c): Vorname(n),
 * Nachname, Rufname der bevorzugten Namensform (E4) und die Kurzbeschreibung.
 *
 * - Schreibt über die flache Namensbrücke (`nameAendernEinAusEintrag`): verdeckte Felder (Vatersname,
 *   Präfix, Sprache, wortgetreuer `original_text`, …) gehen unverändert zurück; `feld` nennt das eine
 *   geänderte Vertragsfeld (Koaleszenz je Feld, E3).
 * - E1: der Rufname ist eine Auswahl aus den Vornamen + „nicht angegeben" (wie im Reiter Namen, #168)
 *   statt des Textfelds im Entwurf — eine Koseform ist eine eigene Namensform.
 * - E2: sind Vorname(n) und Nachname leer, wird nicht geschrieben; beim Verlassen steht wieder der
 *   gespeicherte Name da. Ohne Namen legt das erste nicht-leere Tippen die Form an (`name.anlegen`).
 * - E6: kein Geburtsname (Scope); der Link führt in den Reiter „Namen".
 */
export function HauptnameGruppe({ personId, namen, idPraefix, kurzbeschreibung, aufNamenReiter }: HauptnameGruppeProps) {
  const { t } = useTranslation('profil')
  const zustand = hauptnameZustand(namen)
  const weitere = zustand.art === 'hauptname' ? zustand.weitere : 0
  const verweis =
    weitere === 0 ? t('hauptname_namensformen_verweis') : weitere === 1 ? t('hauptname_weitere_formen_eine') : t('hauptname_weitere_formen_mehrere', { anzahl: weitere })

  return (
    <section className="wz-reiter-person__gruppe wz-reiter-person__gruppe--erste" aria-labelledby="wz-reiter-person-hauptname-titel">
      <div className="wz-reiter-person__gruppe-kopf">
        <Text rolle="titel-klein" als="h2" id="wz-reiter-person-hauptname-titel">
          {t('gruppe_hauptname')}
        </Text>
        <Text rolle="hilfe" als="span">
          {t('hauptname_hinweis')}
        </Text>
        <span className="wz-reiter-person__gruppe-verweis">
          <Schaltflaeche variante="unauffaellig" aufKlick={aufNamenReiter}>
            {verweis}
          </Schaltflaeche>
        </span>
      </div>
      {zustand.art === 'ohne_hauptname' ? (
        <Text rolle="hilfe" als="p">
          {t('hauptname_ohne_hauptname')}
        </Text>
      ) : (
        <HauptnameFelder personId={personId} name={zustand.art === 'hauptname' ? zustand.name : null} idPraefix={idPraefix} kurzbeschreibung={kurzbeschreibung} />
      )}
      {zustand.art === 'ohne_hauptname' ? kurzbeschreibung : null}
    </section>
  )
}

/** Ziel einer Namensänderung: die Form und ihr zuletzt gelesener Stand (Vergleich für `feld`). */
interface NamensZiel {
  readonly id: string
  readonly gelesen: NamenEintragWerte
}

/**
 * Schreibweg des Hauptnamens (Muster `useAngabeSchreiben`, K): gibt es die Form, `name.aendern`;
 * sonst legt `name.anlegen` sie an. Bis das Lesemodell die neue Form liefert, ist die angelegte das
 * Ziel — eine Folgeänderung legt keine zweite an; läuft das Anlegen noch, wird nur der letzte Stand
 * gemerkt. Refs statt Zustand: die Rückrufe laufen nach dem Rendern (Debounce-Timer, Unmount-Flush,
 * Promise).
 */
function useHauptnameSchreiben(personId: string, gelesen: NamensZiel | null) {
  const anlegen = useNameAnlegen()
  const aendern = useNameAendern()
  const gelesenRef = useRef(gelesen)
  const angelegtRef = useRef<NamensZiel | null>(null)
  const laeuftRef = useRef(false)
  const ausstehendRef = useRef<NamenEintragWerte | null>(null)
  const aendernRef = useRef(aendern.mutate)
  const anlegenRef = useRef(anlegen.mutateAsync)
  useEffect(() => {
    gelesenRef.current = gelesen
    aendernRef.current = aendern.mutate
    anlegenRef.current = anlegen.mutateAsync
    // Das Lesemodell ist maßgeblich, sobald es die Form liefert.
    if (gelesen !== null) angelegtRef.current = null
  })

  function schreiben(eintrag: NamenEintragWerte): void {
    if (!hauptnameHatSichtbarenInhalt(eintrag)) return
    const ziel = gelesenRef.current ?? angelegtRef.current
    if (ziel !== null) {
      aendernRef.current(nameAendernEinAusEintrag(ziel.id, eintrag, geaendertesNamensFeld(ziel.gelesen, eintrag)))
      return
    }
    if (laeuftRef.current) {
      ausstehendRef.current = eintrag
      return
    }
    laeuftRef.current = true
    anlegenRef.current(hauptnameAnlegenEin(personId, eintrag)).then(
      (ergebnis) => {
        angelegtRef.current = { id: ergebnis.id, gelesen: eintrag }
        laeuftRef.current = false
        nachholen()
      },
      () => {
        // Der Fehler steht an der Gruppe (`anlegen.error`); ein gemerkter neuerer Stand versucht es erneut.
        laeuftRef.current = false
        nachholen()
      },
    )
  }

  function nachholen(): void {
    const ausstehend = ausstehendRef.current
    ausstehendRef.current = null
    if (ausstehend !== null) schreiben(ausstehend)
  }

  return { schreiben, fehler: aendern.error ?? anlegen.error ?? null }
}

function fehlerText(fehler: AppFehler | null, t: (schluessel: string, werte: Readonly<Record<string, string>>) => string, tFehler: (schluessel: string) => string): { readonly fehlertext?: string } {
  if (fehler === null) return {}
  return { fehlertext: t('lebensdatum_fehler', { titel: tFehler(`${fehler.code}.titel`), was_tun: tFehler(`${fehler.code}.was_tun`) }) }
}

function rufnameOptionen(t: (schluessel: string) => string, eintrag: NamenEintragWerte): readonly AuswahlfeldOption<string>[] {
  return [{ wert: '', beschriftung: t('name_rufname_unbestimmt') }, ...rufnameAuswahlVornamen(eintrag).map(({ wert, vorname }) => ({ wert, beschriftung: vorname }))]
}

interface HauptnameFelderProps {
  readonly personId: string
  /** `null` = die Person hat noch keinen Namen. Dieselbe Komponente für beide Fälle: ein Neueinhängen
   * beim ersten Anlegen schriebe über den Unmount-Flush des Debounce ein zweites Mal an. */
  readonly name: PersonDetailName | null
  readonly idPraefix: string
  /** Steht in der zweiten Zeile neben dem Rufnamen (Entwurf). */
  readonly kurzbeschreibung: ReactNode
}

/**
 * Die Felder des Hauptnamens als EIN Entwurf (`name.aendern` ersetzt die ganze Form). `useMemo`-Pflicht
 * (Bugfix AP-1.15 PR-A an der früheren flachen Maske): der Debounce-Hook erkennt „von außen geändert" an der
 * Referenz — ein bei jedem Rendern neu gebautes Objekt ergäbe eine Render-Schleife
 * (`reiter-person-hauptname.test.tsx`, „keine Render-Schleife").
 */
function HauptnameFelder({ personId, name, idPraefix, kurzbeschreibung }: HauptnameFelderProps) {
  const { t } = useTranslation('profil')
  const { t: tFehler } = useTranslation('fehler')
  const wert = useMemo(() => (name === null ? NAMEN_EINTRAG_LEER : namenEintragAusPersonDetailName(name)), [name])
  const gelesen = useMemo(() => (name === null ? null : { id: name.id, gelesen: wert }), [name, wert])
  const schreiber = useHauptnameSchreiben(personId, gelesen)
  const [eintrag, setEintrag, sofortSchreiben, sofortSetzen] = useEntwurfMitVerzoegertemCommit<NamenEintragWerte>(wert, schreiber.schreiben)

  function verlassen(): void {
    sofortSchreiben()
    if (!hauptnameHatSichtbarenInhalt(eintrag)) setEintrag(wert)
  }

  return (
    <div className="wz-reiter-person__hauptname">
      <div className="wz-reiter-person__hauptname-zeile">
        <div className="wz-reiter-person__wert">
          <Formularfeld beschriftung={t('name_vornamen_beschriftung')} {...fehlerText(schreiber.fehler, t, tFehler)}>
            <Textfeld
              id={hauptnameFeldId(idPraefix, 'vornamen')}
              wert={eintrag.vornamen}
              // V-130-11e-1: der Rufname folgt dem umgeschriebenen markierten Wort oder entfällt (`mitVornamen`).
              aufAenderung={(vornamen) => setEintrag(mitVornamen(eintrag, vornamen))}
              aufVerlassen={verlassen}
            />
          </Formularfeld>
        </div>
        <div className="wz-reiter-person__wert">
          <Formularfeld beschriftung={t('name_nachname_beschriftung')}>
            <Textfeld
              id={hauptnameFeldId(idPraefix, 'nachname')}
              wert={eintrag.nachname}
              aufAenderung={(nachname) => setEintrag({ ...eintrag, nachname })}
              aufVerlassen={verlassen}
            />
          </Formularfeld>
        </div>
      </div>
      <div className="wz-reiter-person__hauptname-zeile">
        <div className="wz-reiter-person__wert wz-reiter-person__wert--rufname">
          <Formularfeld beschriftung={t('name_rufname_beschriftung')} hilfetext={t('hauptname_rufname_hinweis')}>
            <Auswahlfeld
              id={hauptnameFeldId(idPraefix, 'rufname')}
              wert={rufnameAuswahlWert(eintrag)}
              optionen={rufnameOptionen(t, eintrag)}
              // Eine Auswahl ist ein Einzelschritt ohne Tippgeschwindigkeit: sofort schreiben — über den
              // Hook, damit er den Stand kennt (U-130-nachladen-sofortaendern).
              aufAenderung={(auswahl) => sofortSetzen(mitRufnameAusAuswahl(eintrag, auswahl))}
            />
          </Formularfeld>
        </div>
        <div className="wz-reiter-person__wert">{kurzbeschreibung}</div>
      </div>
    </div>
  )
}
