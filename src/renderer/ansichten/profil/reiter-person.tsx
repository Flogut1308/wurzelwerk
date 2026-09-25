import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Kalender } from '../../../core/datum/typen'
import type { LebensdatumAngabe } from '../../../core/person/lebensdaten'
import type { EditorFeld } from '../../../core/person/offene-punkte'
import type { ReiterId } from '../../../core/person/reiter'
import type { BestandHinweisCode } from '../../../core/plausibilitaet/regeln'
import type { AppFehler } from '../../../shared/fehler/app-fehler'
import type { PersonDetailAus, PersonDetailAussage, PersonDetailGrunddatenFeld, PersonDetailKopf } from '../../../shared/schemata/person-detail'
import { Auswahlfeld } from '../../bausteine/auswahlfeld'
import { BelegAbzeichen } from '../../bausteine/beleg-abzeichen'
import { Datumsfeld } from '../../bausteine/datumsfeld'
import { Eingabekoerper } from '../../bausteine/eingabekoerper'
import { konfidenzStufe } from '../../bausteine/feld-konfidenz'
import { Formularfeld } from '../../bausteine/formularfeld'
import { Konfidenzwaehler } from '../../bausteine/konfidenzwaehler'
import { Ortsfeld, type OrtsfeldZustand } from '../../bausteine/ortsfeld'
import { ortsfeldNeuAnlegenEin } from '../../bausteine/ortsfeld-logik'
import { Schaltflaeche } from '../../bausteine/schaltflaeche'
import { Seitenschublade } from '../../bausteine/seitenschublade'
import { Text } from '../../bausteine/text'
import { useOrtSuche } from '../../brücke/abfrage-hooks'
import { useAussageAendern, useAussageAnlegen, useOrtAnlegen, usePersonFeldSetzen } from '../../brücke/befehl-hooks'
import { pruefhinweisCodeSchluessel } from '../liste/pruefhinweis-schluessel'
import { BelegListe } from './beleg-liste'
import { editorFeldId } from './editor-feld-id'
import { aussageAendernEinAus, type AussageAenderung } from './profil-aussage-logik'
import { useEntwurfMitVerzoegertemCommit } from './profil-bearbeiten-debounce'
import { GrunddatenBearbeitenAbschnitt } from './profil-bearbeiten-grunddaten'
import type { EreignisWert } from './profil-lebensdaten-logik'
import { praedikatSchluessel } from './profil-schluessel'
import {
  KONFIDENZ_VORGABE,
  aussageAnlegenEinFuer,
  aussageAusAngelegt,
  aussageDatumAnzeige,
  aussageKalender,
  datumAenderung,
  datumsgruppeAnzeige,
  datumswertAusText,
  lebendStatusAuswahl,
  lebendStatusOptionen,
  lebendStatusSchluessel,
  lebensdatumFeld,
  ohneKoaleszenz,
  ortAenderung,
  ortAnzeigeText,
  personFeldLebendStatusEin,
  todGruppeGrundSchluessel,
  todGruppeZustand,
  uebernahmeAusEreignis,
  warnungenZuordnen,
  type AnlegeWert,
  type DatumAnzeige,
  type LebendStatusAuswahl,
  type LebensdatumFeld,
} from './reiter-person-logik'
import './reiter-person.css'

export interface ReiterPersonProps {
  readonly personId: string
  readonly daten: PersonDetailAus
  /** Präfix der Editor-Kennungen (`editorFeldId`) — dasselbe wie für Reiter und Inhaltsbereich. */
  readonly idPraefix: string
  /** Sprung in einen anderen Reiter (hier: „Ereignis bearbeiten" → Reiter „Leben"). */
  readonly aufSprung: (reiter: ReiterId, feld: EditorFeld) => void
}

/**
 * `ReiterPerson` (AP-1.30 PR 9b, Artboard 1a, Vorgaben §3.1): Gruppen „Eckdaten" (Geschlecht,
 * Lebensstatus, Platzhalter), „Geburt" und „Tod" (je Datum und Ort, jeweils mit Sicherheit und
 * Belegzähler daneben). Hauptname/Rufname/Kurzbeschreibung folgen mit PR 9c.
 *
 * - Werte: die führende Aussage wird bearbeitet (Datum als Freitext mit Deutung, D10; Autosave
 *   400 ms/Blur mit Koaleszenzfeld); ein Wert aus einem Ereignis steht gesperrt und beschriftet da,
 *   mit „als Angabe übernehmen" und „Ereignis bearbeiten" (D3).
 * - Tod-Gruppe (D5): `todGruppeZustand` — kein Löschbefehl, die Werte bleiben gespeichert.
 * - Feldwarnungen (D7, E6): Text unter dem Feld (Feldzustand „Widerspruch"); ist die Tod-Gruppe
 *   nicht sichtbar, am Lebensstatus mit „Tod-Angaben einblenden".
 * - Belege (D8): Zähler mit Sprung zur Belegliste des Felds (Schublade); der Wähler kommt mit PR 9d.
 *
 * Die reine Logik steht in `reiter-person-logik.ts`.
 */
export function ReiterPerson({ personId, daten, idPraefix, aufSprung }: ReiterPersonProps) {
  const { t } = useTranslation('profil')
  const status = daten.kopf.lebend_status
  const [geoeffnetBei, setGeoeffnetBei] = useState<LebendStatusAuswahl | null>(null)
  const [belegFeld, setBelegFeld] = useState<PersonDetailGrunddatenFeld | null>(null)
  const todZustand = todGruppeZustand(status, geoeffnetBei)
  const warnungen = warnungenZuordnen(daten.warnungen, todZustand === 'offen')
  const todGrund = todGruppeGrundSchluessel(status, todZustand)

  function angabe(angabeId: LebensdatumAngabe) {
    return (
      <LebensdatumAngabeFeld
        personId={personId}
        zustand={lebensdatumFeld(angabeId, daten.grunddaten, daten.lebensdaten)}
        warnungen={warnungen[angabeId]}
        idPraefix={idPraefix}
        aufSprung={aufSprung}
        aufBelegeOeffnen={setBelegFeld}
      />
    )
  }

  return (
    <div className="wz-reiter-person">
      {warnungen.reiter.length > 0 ? <FeldWarnungen codes={warnungen.reiter} /> : null}

      <GrunddatenBearbeitenAbschnitt
        personId={personId}
        kopf={daten.kopf}
        lebensstatus={
          <Lebensstatus
            personId={personId}
            status={status}
            warnungen={warnungen.lebend_status}
            aufTodEinblenden={() => setGeoeffnetBei(lebendStatusAuswahl(status))}
          />
        }
      />

      <section className="wz-reiter-person__gruppe" aria-labelledby="wz-reiter-person-geburt-titel">
        <Text rolle="titel-klein" als="h2" id="wz-reiter-person-geburt-titel">
          {t('gruppe_geburt')}
        </Text>
        {angabe('geburtsdatum')}
        {angabe('geburtsort')}
      </section>

      {todZustand === 'ausgeblendet' ? null : (
        <section className="wz-reiter-person__gruppe" aria-labelledby="wz-reiter-person-tod-titel">
          <div className="wz-reiter-person__gruppe-kopf">
            <Text rolle="titel-klein" als="h2" id="wz-reiter-person-tod-titel">
              {t('gruppe_tod')}
            </Text>
            {todGrund === null ? null : (
              <Text rolle="hilfe" als="span">
                {t(todGrund)}
              </Text>
            )}
          </div>
          {todZustand === 'eingeklappt' ? (
            <div>
              <Schaltflaeche variante="unauffaellig" aufKlick={() => setGeoeffnetBei(lebendStatusAuswahl(status))}>
                {t('tod_gruppe_einblenden')}
              </Schaltflaeche>
            </div>
          ) : (
            <>
              {angabe('todesdatum')}
              {angabe('todesort')}
              {status === 'verstorben' || status === 'vermutet_verstorben' ? null : (
                <div>
                  <Schaltflaeche variante="unauffaellig" aufKlick={() => setGeoeffnetBei(null)}>
                    {t('tod_gruppe_ausblenden')}
                  </Schaltflaeche>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {belegFeld === null ? null : (
        <Seitenschublade titel={t('beleg_schublade_titel', { feld: angabeBeschriftung(belegFeld.praedikat, t) })} aufSchliessen={() => setBelegFeld(null)}>
          <BelegListe feld={belegFeld} />
        </Seitenschublade>
      )}
    </div>
  )
}

/** Beschriftung eines Prädikats (Geburtsdatum, Sterbeort, …) — für Zugänglichkeitsnamen und Schublade. */
function angabeBeschriftung(praedikat: string, t: (schluessel: string) => string): string {
  const schluessel = praedikatSchluessel(praedikat)
  return schluessel === undefined ? praedikat : t(schluessel)
}

interface LebensstatusProps {
  readonly personId: string
  readonly status: PersonDetailKopf['lebend_status']
  readonly warnungen: readonly BestandHinweisCode[]
  readonly aufTodEinblenden: () => void
}

/** Lebensstatus (Eckdaten) über `person.feldSetzen lebend_status` — ein Einzelschritt wie das
 * Geschlecht. Warnungen der nicht sichtbaren Tod-Gruppe stehen hier, mit „Tod-Angaben einblenden". */
function Lebensstatus({ personId, status, warnungen, aufTodEinblenden }: LebensstatusProps) {
  const { t } = useTranslation('profil')
  const feldSetzen = usePersonFeldSetzen()
  const optionen = lebendStatusOptionen(status).map((wert) => ({ wert, beschriftung: t(lebendStatusSchluessel(wert)) }))
  return (
    <div className={warnungen.length > 0 ? 'wz-reiter-person__angabe wz-reiter-person__angabe--widerspruch' : 'wz-reiter-person__angabe'}>
      <Formularfeld beschriftung={t('lebend_status_beschriftung')} hilfetext={t('lebend_status_hinweis')}>
        <Auswahlfeld
          wert={lebendStatusAuswahl(status)}
          optionen={optionen}
          aufAenderung={(wert) => {
            const ein = personFeldLebendStatusEin(personId, wert)
            if (ein !== null) feldSetzen.mutate(ein)
          }}
        />
      </Formularfeld>
      {warnungen.length > 0 ? (
        <>
          <FeldWarnungen codes={warnungen} />
          <div>
            <Schaltflaeche variante="unauffaellig" aufKlick={aufTodEinblenden}>
              {t('tod_gruppe_einblenden')}
            </Schaltflaeche>
          </div>
        </>
      ) : null}
    </div>
  )
}

/** Feldwarnungen als Text unter dem Feld (D7, WCAG: Bedeutung nicht nur über Farbe). Text aus den
 * vorhandenen Prüfhinweis-Meldungen (U-1.34-C2b-texte). */
function FeldWarnungen({ codes, id }: { readonly codes: readonly BestandHinweisCode[]; readonly id?: string }) {
  const { t } = useTranslation('pruefhinweise')
  return (
    <ul className="wz-reiter-person__warnungen" id={id}>
      {codes.map((code, index) => (
        // Mehrfachfunde desselben Codes sind möglich (U-1.34-C2b-mehrfach) — Position als Schlüssel.
        <li key={`${code}-${index}`} className="wz-reiter-person__warnung">
          {t(pruefhinweisCodeSchluessel(code))}
        </li>
      ))}
    </ul>
  )
}

/** Feldwarnungen als `hinweis`-Slot von `Datumsfeld`/`Ortsfeld`: direkt unter dem Eingabekörper,
 * per `aria-describedby` verknüpft (Design-Review E6). Ohne Warnung kein Slot. */
function feldHinweis(codes: readonly BestandHinweisCode[]): { readonly hinweis?: ReactNode } {
  return codes.length > 0 ? { hinweis: <FeldWarnungen codes={codes} /> } : {}
}

/** `id` der Feldwarnungen am gesperrten Wert (Ziel von `aria-describedby`). */
function warnungenId(feldId: string): string {
  return `${feldId}-hinweis`
}

/** Übersetzungsfunktion mit Werten (i18next `t`), für die reinen Hilfsfunktionen unten. */
type Uebersetzer = (schluessel: string, werte: Readonly<Record<string, string | number>>) => string

/** Fehler eines Schreibvorgangs am Feld (Titel + was tun), kein Absturz. */
function fehlerText(fehler: AppFehler | null, t: Uebersetzer, tFehler: (schluessel: string) => string): string | undefined {
  if (fehler === null) return undefined
  return t('lebensdatum_fehler', { titel: tFehler(`${fehler.code}.titel`), was_tun: tFehler(`${fehler.code}.was_tun`) })
}

interface SchreibAuftrag {
  /** Änderung gegenüber dem Lesestand der Ziel-Aussage. */
  readonly aenderung: (ziel: PersonDetailAussage) => AussageAenderung
  /** Wert für `aussage.anlegen`, wenn es noch keine Aussage gibt; `null` = dann nichts schreiben. */
  readonly anlegen: AnlegeWert | null
  /** Mit Koaleszenzfeld (Autosave-Tippen) oder als Einzelschritt. */
  readonly koaleszenz: boolean
}

/**
 * Schreibweg EINER Angabe (K, docs/80 §33 V-130-9-entscheidungen): gibt es eine Aussage, ändert
 * `aussage.aendern` sie; sonst legt `aussage.anlegen` sie an. Bis das Lesemodell die neue Aussage
 * liefert, dient ihr angelegter Stand als Ziel (`aussageAusAngelegt`) — eine Folgeänderung legt
 * keine zweite an. Läuft das Anlegen noch, wird nur der letzte Auftrag gemerkt und danach als
 * Änderung geschickt. Refs statt Zustand: die Rückrufe laufen nach dem Rendern (Timer, Promise).
 */
function useAngabeSchreiben(personId: string, angabe: LebensdatumAngabe, aussage: PersonDetailAussage | null) {
  const anlegen = useAussageAnlegen()
  const aendern = useAussageAendern()
  const aussageRef = useRef(aussage)
  const angelegtRef = useRef<PersonDetailAussage | null>(null)
  const laeuftRef = useRef(false)
  const ausstehendRef = useRef<SchreibAuftrag | null>(null)
  const aendernRef = useRef(aendern.mutate)
  const anlegenRef = useRef(anlegen.mutateAsync)
  useEffect(() => {
    aussageRef.current = aussage
    aendernRef.current = aendern.mutate
    anlegenRef.current = anlegen.mutateAsync
    // Das Lesemodell ist maßgeblich, sobald es eine Aussage liefert.
    if (aussage !== null) angelegtRef.current = null
  })

  function schreiben(auftrag: SchreibAuftrag): void {
    const ziel = aussageRef.current ?? angelegtRef.current
    if (ziel !== null) {
      const ein = aussageAendernEinAus(ziel, auftrag.aenderung(ziel))
      if (ein !== null) aendernRef.current(auftrag.koaleszenz ? ein : ohneKoaleszenz(ein))
      return
    }
    if (auftrag.anlegen === null) return
    if (laeuftRef.current) {
      ausstehendRef.current = auftrag
      return
    }
    const ein = aussageAnlegenEinFuer(personId, angabe, auftrag.anlegen, KONFIDENZ_VORGABE)
    laeuftRef.current = true
    anlegenRef.current(ein).then(
      (ergebnis) => {
        angelegtRef.current = aussageAusAngelegt(ergebnis.id, ein)
        laeuftRef.current = false
        nachholen()
      },
      () => {
        // Der Fehler steht am Feld (`anlegen.error`); ein gemerkter neuerer Auftrag versucht es erneut.
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

interface LebensdatumAngabeFeldProps {
  readonly personId: string
  readonly zustand: LebensdatumFeld
  readonly warnungen: readonly BestandHinweisCode[]
  readonly idPraefix: string
  readonly aufSprung: (reiter: ReiterId, feld: EditorFeld) => void
  readonly aufBelegeOeffnen: (feld: PersonDetailGrunddatenFeld) => void
}

/** Ein Lebensdatum: gesperrter Ereigniswert oder bearbeitbares Datum/Ort. Leer und Aussage teilen
 * dieselbe Komponente (kein Neueinhängen beim ersten Anlegen — sonst schriebe der Unmount-Flush
 * des Debounce einen ausstehenden Entwurf ein zweites Mal als Anlage). */
function LebensdatumAngabeFeld({ personId, zustand, warnungen, idPraefix, aufSprung, aufBelegeOeffnen }: LebensdatumAngabeFeldProps) {
  if (zustand.art === 'ereignis') {
    return <GesperrterWert personId={personId} zustand={zustand} warnungen={warnungen} idPraefix={idPraefix} aufSprung={aufSprung} />
  }
  const aussage = zustand.art === 'aussage' ? zustand.aussage : null
  const feld = zustand.art === 'aussage' ? zustand.feld : null
  const angabe = zustand.angabe
  return angabe === 'geburtsort' || angabe === 'todesort' ? (
    <OrtAngabe personId={personId} angabe={angabe} aussage={aussage} feld={feld} warnungen={warnungen} idPraefix={idPraefix} aufBelegeOeffnen={aufBelegeOeffnen} />
  ) : (
    <DatumAngabe personId={personId} angabe={angabe} aussage={aussage} feld={feld} warnungen={warnungen} idPraefix={idPraefix} aufBelegeOeffnen={aufBelegeOeffnen} />
  )
}

interface BearbeitbareAngabeProps {
  readonly personId: string
  readonly angabe: LebensdatumAngabe
  readonly aussage: PersonDetailAussage | null
  readonly feld: PersonDetailGrunddatenFeld | null
  readonly warnungen: readonly BestandHinweisCode[]
  readonly idPraefix: string
  readonly aufBelegeOeffnen: (feld: PersonDetailGrunddatenFeld) => void
}

function datumText(anzeige: DatumAnzeige, tDatum: Uebersetzer): string {
  switch (anzeige.art) {
    case 'formatiert':
      return tDatum(anzeige.ergebnis.schluessel, anzeige.ergebnis.werte)
    case 'text':
      return anzeige.text
    case 'leer':
      return ''
  }
}

function angabeKlasse(warnungen: readonly BestandHinweisCode[]): string {
  return warnungen.length > 0 ? 'wz-reiter-person__angabe wz-reiter-person__angabe--widerspruch' : 'wz-reiter-person__angabe'
}

/** Datum als Freitext mit Deutung („Verstanden als …", D10), Autosave mit Koaleszenzfeld „datum".
 * Leer oder nicht auflösbar wird nichts geschrieben; ein geleertes Feld zeigt beim Verlassen wieder
 * den gespeicherten Wert (Löschen einer Angabe gibt es hier nicht — keine stille Datenlöschung). */
function DatumAngabe({ personId, angabe, aussage, feld, warnungen, idPraefix, aufBelegeOeffnen }: BearbeitbareAngabeProps) {
  const { t } = useTranslation('profil')
  const { t: tDatum } = useTranslation('datum')
  const { t: tFehler } = useTranslation('fehler')
  const schreiber = useAngabeSchreiben(personId, angabe, aussage)
  const gespeichert = aussage === null ? '' : datumText(aussageDatumAnzeige(aussage), tDatum)
  const [kalender, setKalender] = useState<Kalender>(aussage === null ? 'gregorian' : aussageKalender(aussage))
  const [kalenderErweitert, setKalenderErweitert] = useState(false)

  function datumSchreiben(text: string, mitKalender: Kalender): void {
    const datum = datumswertAusText(text, mitKalender)
    if (datum === null) return
    schreiber.schreiben({ aenderung: (ziel) => datumAenderung(ziel, datum), anlegen: { datum }, koaleszenz: true })
  }

  const [entwurf, setEntwurf, sofortSchreiben] = useEntwurfMitVerzoegertemCommit(gespeichert, (text) => datumSchreiben(text, kalender))
  const beschriftung = angabeBeschriftung(angabe, t)

  return (
    <div className={angabeKlasse(warnungen)}>
      <div className="wz-reiter-person__angabe-zeile">
        <div className="wz-reiter-person__wert wz-reiter-person__wert--datum">
          <Formularfeld beschriftung={t('lebensdatum_datum_beschriftung')} {...optionalerFehler(fehlerText(schreiber.fehler, t, tFehler))}>
            <Datumsfeld
              id={editorFeldId(idPraefix, angabe)}
              ariaLabel={beschriftung}
              text={entwurf}
              aufAenderung={setEntwurf}
              aufVerlassen={() => {
                sofortSchreiben()
                if (entwurf.trim() === '') setEntwurf(gespeichert)
              }}
              kalender={kalender}
              aufKalenderAenderung={(neu) => {
                setKalender(neu)
                datumSchreiben(entwurf, neu)
              }}
              kalenderErweitert={kalenderErweitert}
              aufKalenderErweitertAenderung={setKalenderErweitert}
              {...feldHinweis(warnungen)}
            />
          </Formularfeld>
        </div>
        <Sicherheit angabe={angabe} aussage={aussage} feld={feld} schreiber={schreiber} aufBelegeOeffnen={aufBelegeOeffnen} />
      </div>
    </div>
  )
}

/** `exactOptionalPropertyTypes`: `fehlertext` nur setzen, wenn es einen gibt. */
function optionalerFehler(text: string | undefined): { readonly fehlertext?: string } {
  return text === undefined ? {} : { fehlertext: text }
}

/**
 * Ort über das Ortsfeld: Auswahl eines Treffers (oder neu angelegt) schreibt den Ortsverweis als
 * Einzelschritt. Das Ortsfeld liefert nur Verweise — freier Ortstext (Import/Altbestand) wird
 * angezeigt und beim Wählen durch den Verweis ersetzt. Verlassen ohne Auswahl stellt den
 * gespeicherten Ort wieder her. E5: ein Datum an der Orts-Aussage (Altbestand) wird angezeigt und
 * bleibt beim Ortswechsel erhalten (`datumBeibehalten`); „Datum entfernen" entfernt es aktiv.
 */
function OrtAngabe({ personId, angabe, aussage, feld, warnungen, idPraefix, aufBelegeOeffnen }: BearbeitbareAngabeProps) {
  const { t } = useTranslation('profil')
  const { t: tDatum } = useTranslation('datum')
  const { t: tFehler } = useTranslation('fehler')
  const schreiber = useAngabeSchreiben(personId, angabe, aussage)
  const ortAnlegen = useOrtAnlegen()
  const gespeichert = aussage === null ? '' : ortAnzeigeText(aussage)
  const [text, setText] = useState(gespeichert)
  const [vorherGespeichert, setVorherGespeichert] = useState(gespeichert)
  const [sucht, setSucht] = useState(false)
  const [hervorgehoben, setHervorgehoben] = useState<number | null>(null)
  // Von außen geänderter Ort (Undo, Nachladen): übernehmen, während des Renderns (wie
  // `useEntwurfMitVerzoegertemCommit`, kein kaskadierender Effekt).
  if (gespeichert !== vorherGespeichert) {
    setVorherGespeichert(gespeichert)
    setText(gespeichert)
    setSucht(false)
  }

  const sucheAktiv = sucht && text.trim() !== ''
  const suche = useOrtSuche({ text }, { enabled: sucheAktiv })
  const zustand: OrtsfeldZustand = sucheAktiv ? (suche.isPending ? 'laedt' : 'bereit') : 'leer'
  const treffer = suche.data?.treffer ?? []

  function ortSchreiben(ortId: string): void {
    schreiber.schreiben({ aenderung: (ziel) => ortAenderung(ziel, ortId), anlegen: { wertRefId: ortId }, koaleszenz: false })
  }

  function ausgewaehlt(ortId: string): void {
    const gewaehlt = treffer.find((eintrag) => eintrag.id === ortId)
    setText(gewaehlt?.anzeigename ?? text)
    setSucht(false)
    setHervorgehoben(null)
    ortSchreiben(ortId)
  }

  function neuAnlegen(): void {
    const name = text
    setSucht(false)
    ortAnlegen.mutateAsync(ortsfeldNeuAnlegenEin(name)).then(
      (ergebnis) => ortSchreiben(ergebnis.id),
      // Der Fehler des Ort-Anlegens steht am Feld (`ortAnlegen.error`).
      () => undefined,
    )
  }

  const datumHinweis = aussage?.datum === null || aussage === null ? null : datumText(datumsgruppeAnzeige(aussage.datum), tDatum)
  const fehler = fehlerText(schreiber.fehler ?? ortAnlegen.error ?? null, t, tFehler)

  return (
    <div className={angabeKlasse(warnungen)}>
      <div className="wz-reiter-person__angabe-zeile">
        <div className="wz-reiter-person__wert wz-reiter-person__wert--ort">
          <Formularfeld beschriftung={t('lebensdatum_ort_beschriftung')} {...optionalerFehler(fehler)}>
            <Ortsfeld
              id={editorFeldId(idPraefix, angabe)}
              ariaLabel={angabeBeschriftung(angabe, t)}
              text={text}
              aufAenderung={(neu) => {
                setText(neu)
                setSucht(true)
              }}
              zustand={zustand}
              treffer={treffer}
              hervorgehobenerIndex={hervorgehoben}
              aufHervorgehobenerIndexAenderung={setHervorgehoben}
              aufAusgewaehlt={ausgewaehlt}
              aufNeuAnlegen={neuAnlegen}
              aufVerlassen={() => {
                setText(gespeichert)
                setSucht(false)
                setHervorgehoben(null)
              }}
              {...feldHinweis(warnungen)}
            />
          </Formularfeld>
        </div>
        <Sicherheit angabe={angabe} aussage={aussage} feld={feld} schreiber={schreiber} aufBelegeOeffnen={aufBelegeOeffnen} />
      </div>
      {datumHinweis === null ? null : (
        <div className="wz-reiter-person__hinweis">
          <Text rolle="hilfe" als="p">
            {t('lebensdatum_ort_datum_hinweis', { datum: datumHinweis })}
          </Text>
          <Schaltflaeche
            variante="unauffaellig"
            aufKlick={() => schreiber.schreiben({ aenderung: () => ({ datum: null }), anlegen: null, koaleszenz: false })}
          >
            {t('lebensdatum_ort_datum_entfernen')}
          </Schaltflaeche>
        </div>
      )}
    </div>
  )
}

interface SicherheitProps {
  readonly angabe: LebensdatumAngabe
  readonly aussage: PersonDetailAussage | null
  readonly feld: PersonDetailGrunddatenFeld | null
  readonly schreiber: { readonly schreiben: (auftrag: SchreibAuftrag) => void }
  readonly aufBelegeOeffnen: (feld: PersonDetailGrunddatenFeld) => void
}

/** Sicherheit neben dem Wert (Einzelschritt, ohne Koaleszenz) und Belegzähler mit Sprung zur
 * Belegliste (D8). Ohne Aussage gesperrt: erst ein Wert legt die Angabe an. */
function Sicherheit({ angabe, aussage, feld, schreiber, aufBelegeOeffnen }: SicherheitProps) {
  const { t } = useTranslation('profil')
  return (
    <div className="wz-reiter-person__sicherheit">
      <Text rolle="beschriftung" als="span">
        {t('lebensdatum_sicherheit_beschriftung')}
      </Text>
      <div className="wz-reiter-person__sicherheit-zeile">
        <Konfidenzwaehler
          wert={konfidenzStufe(aussage?.konfidenz ?? null)}
          gesperrt={aussage === null}
          ariaLabel={t('lebensdatum_sicherheit_gruppe', { feld: angabeBeschriftung(angabe, t) })}
          aufAenderung={(stufe) => schreiber.schreiben({ aenderung: () => ({ konfidenz: stufe }), anlegen: null, koaleszenz: false })}
        />
        {feld === null ? <BelegAbzeichen anzahl={0} /> : <BelegAbzeichen anzahl={feld.belegzahl} aufKlick={() => aufBelegeOeffnen(feld)} />}
      </div>
    </div>
  )
}

interface GesperrterWertProps {
  readonly personId: string
  readonly zustand: Extract<LebensdatumFeld, { readonly art: 'ereignis' }>
  readonly warnungen: readonly BestandHinweisCode[]
  readonly idPraefix: string
  readonly aufSprung: (reiter: ReiterId, feld: EditorFeld) => void
}

function ereignisWertText(wert: EreignisWert, t: Uebersetzer, tDatum: Uebersetzer): string {
  switch (wert.art) {
    case 'datum':
      return tDatum(wert.ergebnis.schluessel, wert.ergebnis.werte)
    case 'originaltext':
      return t('wert_originaltext', { text: wert.text })
    case 'text':
      return wert.text
    case 'unbekannt':
      return t('wert_unbekannt', {})
  }
}

/**
 * Wert aus einem Ereignis (Abnahme „Abgeleitete Werte sichtbar, gesperrt, beschriftet"): nur lesbar
 * (fokussierbar für den Sprung aus der rechten Spalte), beschriftet „aus dem Ereignis Geburt/Tod",
 * mit zwei Aktionen am Feld (D3). Sicherheit und Belege des Ereignisses liefert das Lesemodell nicht
 * (U-130-1-ereignis-konfidenz) — darum hier keine.
 */
function GesperrterWert({ personId, zustand, warnungen, idPraefix, aufSprung }: GesperrterWertProps) {
  const { t } = useTranslation('profil')
  const { t: tDatum } = useTranslation('datum')
  const { t: tFehler } = useTranslation('fehler')
  const anlegen = useAussageAnlegen()
  const uebernahme = uebernahmeAusEreignis(personId, zustand.lebensdatum)
  const istOrt = zustand.angabe === 'geburtsort' || zustand.angabe === 'todesort'
  const fehler = fehlerText(anlegen.error ?? null, t, tFehler)
  return (
    <div className={angabeKlasse(warnungen)}>
      <div className="wz-reiter-person__wert wz-reiter-person__wert--gesperrt">
        <Formularfeld beschriftung={t(istOrt ? 'lebensdatum_ort_beschriftung' : 'lebensdatum_datum_beschriftung')} {...optionalerFehler(fehler)}>
          <Eingabekoerper
            id={editorFeldId(idPraefix, zustand.angabe)}
            ariaLabel={angabeBeschriftung(zustand.angabe, t)}
            wert={ereignisWertText(zustand.wert, t, tDatum)}
            aufAenderung={() => undefined}
            nurLesen
            {...(warnungen.length > 0 ? { beschreibungId: warnungenId(editorFeldId(idPraefix, zustand.angabe)) } : {})}
          />
          {warnungen.length > 0 ? <FeldWarnungen codes={warnungen} id={warnungenId(editorFeldId(idPraefix, zustand.angabe))} /> : null}
        </Formularfeld>
      </div>
      <Text rolle="hilfe" als="p">
        {t(zustand.herkunftSchluessel)}
      </Text>
      <div className="wz-reiter-person__aktionen">
        {uebernahme === null ? null : (
          <Schaltflaeche variante="unauffaellig" aufKlick={() => anlegen.mutate(uebernahme)}>
            {t('lebensdatum_als_angabe_uebernehmen')}
          </Schaltflaeche>
        )}
        <Schaltflaeche variante="unauffaellig" aufKlick={() => aufSprung('leben', 'ereignisse')}>
          {t('lebensdatum_ereignis_bearbeiten')}
        </Schaltflaeche>
      </div>
    </div>
  )
}
