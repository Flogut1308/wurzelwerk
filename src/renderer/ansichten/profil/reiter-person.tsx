import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Kalender } from '../../../core/datum/typen'
import { KURZBESCHREIBUNG_PRAEDIKAT } from '../../../core/person/praedikate'
import type { LebensdatumAngabe } from '../../../core/person/lebensdaten'
import type { EditorFeld } from '../../../core/person/offene-punkte'
import type { ReiterId } from '../../../core/person/reiter'
import type { BestandHinweisCode } from '../../../core/plausibilitaet/regeln'
import type { AppFehler } from '../../../shared/fehler/app-fehler'
import type { PersonDetailAus, PersonDetailAussage, PersonDetailEreignisExistenz, PersonDetailGrunddatenFeld, PersonDetailKopf } from '../../../shared/schemata/person-detail'
import {
  GRUPPEN_ANGABEN,
  belegChips,
  belegZeileZustand,
  belegZiel,
  ereignisBelegeFuer,
  existenzFuer,
  existenzOhneEntfernte,
  gruppeVon,
  ohneEntfernte,
  verknuepfungEntfernenEin,
  type BelegGruppe,
  type VerknuepfungsPaar,
} from './beleg-waehler-logik'
import { BelegWaehler, BelegZeile } from './beleg-waehler'
import { Auswahlfeld } from '../../bausteine/auswahlfeld'
import { BelegAbzeichen } from '../../bausteine/beleg-abzeichen'
import { Datumsfeld } from '../../bausteine/datumsfeld'
import { datumsfeldInterpretation, datumswertAusText, etwaDatumswertAusText } from '../../bausteine/datumsfeld-logik'
import { Eingabekoerper } from '../../bausteine/eingabekoerper'
import { konfidenzStufe } from '../../bausteine/feld-konfidenz'
import { Formularfeld } from '../../bausteine/formularfeld'
import { Konfidenzwaehler } from '../../bausteine/konfidenzwaehler'
import { Ortsfeld, type OrtsfeldZustand } from '../../bausteine/ortsfeld'
import { ortsfeldNeuAnlegenEin } from '../../bausteine/ortsfeld-logik'
import { Schaltflaeche } from '../../bausteine/schaltflaeche'
import { Seitenschublade } from '../../bausteine/seitenschublade'
import { Text } from '../../bausteine/text'
import { Textfeld } from '../../bausteine/textfeld'
import { useOrtSuche } from '../../brücke/abfrage-hooks'
import { useAussageAendern, useAussageAnlegen, useAussageLoeschen, useAussageZitatLoeschen, useOrtAnlegen, usePersonFeldSetzen } from '../../brücke/befehl-hooks'
import { pruefhinweisCodeSchluessel } from '../liste/pruefhinweis-schluessel'
import { BelegListe, type BelegListeFeld } from './beleg-liste'
import { editorFeldId } from './editor-feld-id'
import { aussageAendernEinAus, type AussageAenderung } from './profil-aussage-logik'
import { useEntwurfMitVerzoegertemCommit } from './profil-bearbeiten-debounce'
import { UnlesbareEingabenKontext, useUnlesbarMelden } from './unlesbare-eingaben'
import { GrunddatenBearbeitenAbschnitt } from './profil-bearbeiten-grunddaten'
import type { EreignisWert } from './profil-lebensdaten-logik'
import { praedikatSchluessel } from './profil-schluessel'
import { HauptnameGruppe } from './reiter-person-hauptname'
import {
  KONFIDENZ_VORGABE,
  aussageAnlegenEinFuer,
  aussageAusAngelegt,
  aussageDatumAnzeige,
  aussageKalender,
  datumAenderung,
  datumsgruppeAnzeige,
  gespeicherteDeutung,
  kurzbeschreibungAenderung,
  kurzbeschreibungAussage,
  kurzbeschreibungText,
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
  type ReiterPersonPraedikat,
} from './reiter-person-logik'
import './reiter-person.css'

export interface ReiterPersonProps {
  readonly personId: string
  readonly daten: PersonDetailAus
  /** Präfix der Editor-Kennungen (`editorFeldId`) — dasselbe wie für Reiter und Inhaltsbereich. */
  readonly idPraefix: string
  /** Sprung in einen anderen Reiter (hier: „Ereignis bearbeiten" → Reiter „Leben"). */
  readonly aufSprung: (reiter: ReiterId, feld: EditorFeld) => void
  /** Reiterwechsel ohne Zielfeld (PR 9c: „n weitere Namensformen · Reiter Namen"), mit derselben
   * Nachfrage bei unlesbaren Eingaben wie die Reiterleiste. */
  readonly aufReiterWechsel: (reiter: ReiterId) => void
}

/**
 * `ReiterPerson` (AP-1.30 PR 9b, Artboard 1a, Vorgaben §3.1): Gruppen „Hauptname" (PR 9c: Vorname(n),
 * Nachname, Rufname, Kurzbeschreibung), „Eckdaten" (Geschlecht, Lebensstatus, Platzhalter), „Geburt"
 * und „Tod" (je Datum und Ort, jeweils mit Sicherheit und Belegzähler daneben).
 *
 * - Werte: die führende Aussage wird bearbeitet (Datum als Freitext mit Deutung, D10; Autosave
 *   400 ms/Blur mit Koaleszenzfeld); ein Wert aus einem Ereignis steht gesperrt und beschriftet da,
 *   mit „als Angabe übernehmen" und „Ereignis bearbeiten" (D3).
 * - Tod-Gruppe (D5): `todGruppeZustand` — kein Löschbefehl, die Werte bleiben gespeichert.
 * - Feldwarnungen (D7, E6): Text unter dem Feld (Feldzustand „Widerspruch"); ist die Tod-Gruppe
 *   nicht sichtbar, am Lebensstatus mit „Tod-Angaben einblenden".
 * - Belege (D8): Zähler mit Sprung zur Belegliste des Felds (Schublade). PR 9d (docs/80 §33
 *   V-130-9d): je Gruppe eine Beleg-Zeile (Chips + „Beleg verknüpfen"), der Wähler steht im Kopf
 *   der Schublade (`beleg-waehler.tsx`), „Verknüpfung entfernen" je Beleg in der Liste.
 *
 * Die reine Logik steht in `reiter-person-logik.ts`.
 */
export function ReiterPerson({ personId, daten, idPraefix, aufSprung, aufReiterWechsel }: ReiterPersonProps) {
  const { t } = useTranslation('profil')
  const status = daten.kopf.lebend_status
  const [geoeffnetBei, setGeoeffnetBei] = useState<LebendStatusAuswahl | null>(null)
  // PR 9d: offene Belegschublade — für eine Gruppe („Beleg verknüpfen", Chips) oder eine Angabe
  // (Belegzähler). Nur die Kennung wird gehalten; Inhalt und Ziele kommen bei jedem Rendern aus dem
  // aktuellen Lesemodell (sonst zeigte die Schublade nach dem Verknüpfen einen alten Stand).
  const [schublade, setSchublade] = useState<BelegSchublade | null>(null)
  const oeffneAngabe = useCallback((angabeId: LebensdatumAngabe) => setSchublade({ gruppe: gruppeVon(angabeId), angabe: angabeId }), [])
  const nachfrager = useContext(UnlesbareEingabenKontext)
  // hueter #167 H1 / Nachreview N1: hält das Todesdatum einen unlesbaren, ungespeicherten Text, bleibt
  // die Tod-Gruppe offen — auch wenn der Lebensstatus (auch per Undo) auf „lebend"/„nicht erfasst"
  // wechselt; sonst hinge das Feld still aus. Gehalten wird, bis das Feld verlassen ist (nicht nur,
  // solange der Text unlesbar ist): sonst schnappte die Gruppe beim Korrigieren mitten im Tippen zu,
  // und der Aushänge-Flush schriebe einen halben Wert. Ausblenden von Hand fragt nach.
  const [todesdatumHaelt, setTodesdatumHaelt] = useState(false)
  const aufOffenHalten = useCallback((angabeId: LebensdatumAngabe, halten: boolean) => {
    if (angabeId === 'todesdatum') setTodesdatumHaelt(halten)
  }, [])
  const regulaerZustand = todGruppeZustand(status, geoeffnetBei)
  const todZustand = todesdatumHaelt ? 'offen' : regulaerZustand
  const warnungen = warnungenZuordnen(daten.warnungen, todZustand === 'offen')
  // N2: eine nur wegen des ungespeicherten Texts offene Gruppe nennt diesen Grund.
  const todGrund = todesdatumHaelt && regulaerZustand !== 'offen' ? 'tod_gruppe_grund_ungespeichert' : todGruppeGrundSchluessel(status, todZustand)

  function angabe(angabeId: LebensdatumAngabe) {
    return (
      <LebensdatumAngabeFeld
        personId={personId}
        zustand={lebensdatumFeld(angabeId, daten.grunddaten, daten.lebensdaten)}
        existenzen={daten.ereignis_existenz}
        warnungen={warnungen[angabeId]}
        idPraefix={idPraefix}
        aufSprung={aufSprung}
        aufBelegeOeffnen={oeffneAngabe}
        aufOffenHalten={aufOffenHalten}
      />
    )
  }

  /** Feldzustände der Angaben einer Gruppe (dieselben, die Wert, Sicherheit und Zähler zeigen). */
  function gruppenFelder(angaben: readonly LebensdatumAngabe[]): readonly LebensdatumFeld[] {
    return angaben.map((angabeId) => lebensdatumFeld(angabeId, daten.grunddaten, daten.lebensdaten))
  }

  function belegZeile(gruppe: BelegGruppe) {
    const felder = gruppenFelder(GRUPPEN_ANGABEN[gruppe])
    return (
      <BelegZeile
        zustand={belegZeileZustand(felder.map((feld) => belegZiel(feld, daten.ereignis_existenz)))}
        chips={belegChips(felder, daten.ereignis_existenz)}
        aufOeffnen={() => setSchublade({ gruppe, angabe: null })}
      />
    )
  }

  function todAusblenden(): void {
    const ausblenden = () => setGeoeffnetBei(null)
    if (nachfrager === null) ausblenden()
    else nachfrager.nachfragen([editorFeldId(idPraefix, 'todesdatum')], ausblenden)
  }

  return (
    <div className="wz-reiter-person">
      {warnungen.reiter.length > 0 ? <FeldWarnungen codes={warnungen.reiter} /> : null}

      <HauptnameGruppe
        personId={personId}
        namen={daten.namen}
        idPraefix={idPraefix}
        aufNamenReiter={() => aufReiterWechsel('namen')}
        kurzbeschreibung={<KurzbeschreibungAngabe personId={personId} aussage={kurzbeschreibungAussage(daten.grunddaten)} idPraefix={idPraefix} />}
      />

      <div className="wz-reiter-person__gruppe">
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
      </div>

      <section className="wz-reiter-person__gruppe" aria-labelledby="wz-reiter-person-geburt-titel">
        <Text rolle="titel-klein" als="h2" id="wz-reiter-person-geburt-titel">
          {t('gruppe_geburt')}
        </Text>
        {angabe('geburtsdatum')}
        {angabe('geburtsort')}
        {belegZeile('geburt')}
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
              {belegZeile('tod')}
              {status === 'verstorben' || status === 'vermutet_verstorben' ? null : (
                <div>
                  <Schaltflaeche variante="unauffaellig" aufKlick={todAusblenden}>
                    {t('tod_gruppe_ausblenden')}
                  </Schaltflaeche>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {schublade === null ? null : (
        <Seitenschublade
          titel={t('beleg_schublade_titel', { feld: schublade.angabe === null ? t(GRUPPEN_TITEL[schublade.gruppe]) : angabeBeschriftung(schublade.angabe, t) })}
          aufSchliessen={() => setSchublade(null)}
        >
          <BelegSchubladeInhalt
            angaben={schublade.angabe === null ? GRUPPEN_ANGABEN[schublade.gruppe] : [schublade.angabe]}
            felder={gruppenFelder(schublade.angabe === null ? GRUPPEN_ANGABEN[schublade.gruppe] : [schublade.angabe])}
            grunddaten={daten.grunddaten}
            existenzen={daten.ereignis_existenz}
            stand={daten}
          />
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

/** Offene Belegschublade (PR 9d): `angabe = null` = die ganze Gruppe. */
interface BelegSchublade {
  readonly gruppe: BelegGruppe
  readonly angabe: LebensdatumAngabe | null
}

const GRUPPEN_TITEL: { readonly [G in BelegGruppe]: string } = { geburt: 'gruppe_geburt', tod: 'gruppe_tod' }

interface BelegSchubladeInhaltProps {
  readonly angaben: readonly LebensdatumAngabe[]
  readonly felder: readonly LebensdatumFeld[]
  readonly grunddaten: PersonDetailAus['grunddaten']
  readonly existenzen: readonly PersonDetailEreignisExistenz[]
  readonly stand: PersonDetailAus
}

/**
 * Inhalt der Belegschublade (PR 9d, E11): im Kopf der Beleg-Wähler (nur mit Aussage-Ziel, E3/E4),
 * darunter je Angabe die Belegliste mit „Verknüpfung entfernen" (E10: nur `aussage_zitat.loeschen`,
 * das Zitat bleibt). `zitat.loeschen` bietet die Schublade selbst nicht an; erreichbar ist es nur über
 * den vorhandenen Weg „Quelle bearbeiten" → Pflege-Ansicht → „Entfernen" (hueter #176 H5).
 */
function BelegSchubladeInhalt({ angaben, felder, grunddaten, existenzen, stand }: BelegSchubladeInhaltProps) {
  const { t } = useTranslation('profil')
  const { t: tDatum } = useTranslation('datum')
  const { t: tFehler } = useTranslation('fehler')
  const entfernen = useAussageZitatLoeschen()
  // hueter #176 H3: eben entfernte Paare bleiben bis zum nächsten Lesestand ausgeblendet (wie
  // `unterwegs` im Wähler) — ein zweiter Klick vor dem Nachladen fände sonst „nicht gefunden".
  const [entfernt, setEntfernt] = useState<{ readonly stand: unknown; readonly paare: readonly VerknuepfungsPaar[] }>({ stand: null, paare: [] })
  const paareEntfernt = entfernt.stand === stand ? entfernt.paare : []
  const abschnitte = useRef(new Map<LebensdatumAngabe, HTMLElement>())
  const zustand = belegZeileZustand(felder.map((feld) => belegZiel(feld, existenzen)))
  const fehler = fehlerText(entfernen.error ?? null, t, tFehler)

  function verknuepfungEntfernen(angabeId: LebensdatumAngabe, aussageId: string, zitatId: string): void {
    // H4 (WCAG 2.4.3): der Beleg samt Knopf verschwindet gleich — der Fokus bleibt im Abschnitt der
    // Angabe, also in der Schublade (Escape schließt weiter).
    abschnitte.current.get(angabeId)?.focus()
    const paar = { aussageId, zitatId }
    setEntfernt({ stand, paare: [...paareEntfernt, paar] })
    entfernen.mutate(verknuepfungEntfernenEin(aussageId, zitatId), {
      // Gescheitert: der Beleg ist noch da und erscheint wieder (der Fehler steht darüber).
      onError: () => setEntfernt((vorher) => ({ stand: vorher.stand, paare: vorher.paare.filter((kandidat) => kandidat !== paar) })),
    })
  }

  /** PR 9d-2: stammt der Wert der Angabe aus einem Ereignis mit Existenz-Aussage, listet die Schublade
   * deren Belege, die diese Angabe belegen (`feld` NULL oder passend) — dieselben, die Chip und
   * Zähler zählen; „Verknüpfung entfernen" löscht die Verknüpfung an der Existenz-Aussage. */
  function ereignisListe(angabeId: LebensdatumAngabe): BelegListeFeld | null {
    const feldZustand = felder.find((kandidat) => kandidat.angabe === angabeId)
    if (feldZustand?.art !== 'ereignis') return null
    const existenz = existenzFuer(feldZustand, existenzen)
    if (existenz === undefined) return null
    const wert = t('beleg_ereignis_wert', { wert: ereignisWertText(feldZustand.wert, t, tDatum), herkunft: t(feldZustand.herkunftSchluessel) })
    return { aussagen: [{ aussage_id: existenz.aussage_id, wert, belege: ereignisBelegeFuer(angabeId, existenzOhneEntfernte(existenz, paareEntfernt)) }] }
  }

  return (
    <>
      {zustand.art === 'waehlbar' ? (
        <BelegWaehler zustand={zustand} stand={stand} />
      ) : (
        <Text rolle="hilfe" als="p">
          {t(zustand.art === 'nur_ereignis' ? 'beleg_am_ereignis_belegen' : 'beleg_verknuepfen_ohne_wert')}
        </Text>
      )}
      {/* H3: Fehler des Entfernens werden angesagt (`aria-live`, nicht `role="status"`: den trägt der Speicherstatus). */}
      <div aria-live="polite">
        {fehler === undefined ? null : (
          <Text rolle="hilfe" als="p">
            {fehler}
          </Text>
        )}
      </div>
      {angaben.map((angabeId) => {
        const gelesen = grunddaten.find((kandidat) => kandidat.praedikat === angabeId)
        const feld = gelesen === undefined ? undefined : ohneEntfernte(gelesen, paareEntfernt)
        const ausEreignis = ereignisListe(angabeId)
        return (
          <section
            key={angabeId}
            ref={(element) => {
              if (element === null) abschnitte.current.delete(angabeId)
              else abschnitte.current.set(angabeId, element)
            }}
            tabIndex={-1}
            className="wz-reiter-person__beleg-abschnitt"
            aria-label={angabeBeschriftung(angabeId, t)}
          >
            {angaben.length > 1 ? (
              <Text rolle="beschriftung" als="h3">
                {angabeBeschriftung(angabeId, t)}
              </Text>
            ) : null}
            {feld === undefined && ausEreignis === null ? (
              <Text rolle="hilfe" als="p">
                {t('beleg_schublade_keine_belege')}
              </Text>
            ) : null}
            {ausEreignis === null ? null : (
              <BelegListe
                feld={ausEreignis}
                mitQuelleAnlegen={false}
                belegHinweis={(beleg) => (beleg.feld === null ? t('beleg_ereignis_datum_und_ort') : null)}
                entfernenGesperrt={entfernen.isPending}
                aufVerknuepfungEntfernen={(aussageId, zitatId) => verknuepfungEntfernen(angabeId, aussageId, zitatId)}
              />
            )}
            {feld === undefined ? null : (
              <BelegListe
                feld={feld}
                mitQuelleAnlegen={false}
                entfernenGesperrt={entfernen.isPending}
                aufVerknuepfungEntfernen={(aussageId, zitatId) => verknuepfungEntfernen(angabeId, aussageId, zitatId)}
              />
            )}
          </section>
        )
      })}
    </>
  )
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

/** Gemerkter Auftrag, solange ein Anlegen läuft: der letzte Schreibauftrag oder (PR 9c, E5) das Löschen. */
type AusstehenderAuftrag = { readonly art: 'schreiben'; readonly auftrag: SchreibAuftrag } | { readonly art: 'loeschen' }

/**
 * Schreibweg EINER Angabe (K, docs/80 §33 V-130-9-entscheidungen): gibt es eine Aussage, ändert
 * `aussage.aendern` sie; sonst legt `aussage.anlegen` sie an. Bis das Lesemodell die neue Aussage
 * liefert, dient ihr angelegter Stand als Ziel (`aussageAusAngelegt`) — eine Folgeänderung legt
 * keine zweite an. Läuft das Anlegen noch, wird nur der letzte Auftrag gemerkt und danach als
 * Änderung geschickt. Refs statt Zustand: die Rückrufe laufen nach dem Rendern (Timer, Promise).
 *
 * PR 9c (V-130-9c E5): verallgemeinert auf jedes Prädikat des Reiters (`ReiterPersonPraedikat`, dazu
 * die Kurzbeschreibung) und um `loeschen` ergänzt — `aussage.loeschen` als Einzelschritt. Eine eben
 * gelöschte Aussage ist kein Ziel mehr, bis das Lesemodell sie nicht mehr liefert (danach legt das
 * nächste Tippen neu an; ein Undo, das sie zurückbringt, macht sie wieder zum Ziel).
 */
function useAngabeSchreiben(personId: string, praedikat: ReiterPersonPraedikat, aussage: PersonDetailAussage | null) {
  const anlegen = useAussageAnlegen()
  const aendern = useAussageAendern()
  const loeschenBefehl = useAussageLoeschen()
  const aussageRef = useRef(aussage)
  const angelegtRef = useRef<PersonDetailAussage | null>(null)
  const geloeschtIdRef = useRef<string | null>(null)
  const laeuftRef = useRef(false)
  const ausstehendRef = useRef<AusstehenderAuftrag | null>(null)
  const aendernRef = useRef(aendern.mutate)
  const anlegenRef = useRef(anlegen.mutateAsync)
  const loeschenRef = useRef(loeschenBefehl.mutate)
  useEffect(() => {
    aussageRef.current = aussage
    aendernRef.current = aendern.mutate
    anlegenRef.current = anlegen.mutateAsync
    loeschenRef.current = loeschenBefehl.mutate
    // Das Lesemodell ist maßgeblich, sobald es eine Aussage liefert.
    if (aussage !== null) angelegtRef.current = null
    // Liefert es keine mehr, ist die Löschung angekommen.
    if (aussage === null) geloeschtIdRef.current = null
  })

  function ziel(): PersonDetailAussage | null {
    const kandidat = aussageRef.current ?? angelegtRef.current
    return kandidat === null || kandidat.aussage_id === geloeschtIdRef.current ? null : kandidat
  }

  function schreiben(auftrag: SchreibAuftrag): void {
    const vorhanden = ziel()
    if (vorhanden !== null) {
      const ein = aussageAendernEinAus(vorhanden, auftrag.aenderung(vorhanden))
      if (ein !== null) aendernRef.current(auftrag.koaleszenz ? ein : ohneKoaleszenz(ein))
      return
    }
    if (auftrag.anlegen === null) return
    if (laeuftRef.current) {
      ausstehendRef.current = { art: 'schreiben', auftrag }
      return
    }
    const ein = aussageAnlegenEinFuer(personId, praedikat, auftrag.anlegen, KONFIDENZ_VORGABE)
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

  function loeschen(): void {
    if (laeuftRef.current) {
      ausstehendRef.current = { art: 'loeschen' }
      return
    }
    const vorhanden = ziel()
    if (vorhanden === null) return
    geloeschtIdRef.current = vorhanden.aussage_id
    angelegtRef.current = null
    loeschenRef.current({ id: vorhanden.aussage_id })
  }

  function nachholen(): void {
    const ausstehend = ausstehendRef.current
    ausstehendRef.current = null
    if (ausstehend === null) return
    if (ausstehend.art === 'loeschen') loeschen()
    else schreiben(ausstehend.auftrag)
  }

  return { schreiben, loeschen, fehler: aendern.error ?? anlegen.error ?? loeschenBefehl.error ?? null }
}

interface LebensdatumAngabeFeldProps {
  readonly personId: string
  readonly zustand: LebensdatumFeld
  /** `person.detail.ereignis_existenz` — für den Belegzähler eines Ereigniswerts (PR 9d-2). */
  readonly existenzen: readonly PersonDetailEreignisExistenz[]
  readonly warnungen: readonly BestandHinweisCode[]
  readonly idPraefix: string
  readonly aufSprung: (reiter: ReiterId, feld: EditorFeld) => void
  readonly aufBelegeOeffnen: (angabe: LebensdatumAngabe) => void
  /** Meldet, ob das Datumsfeld seine Gruppe offen halten muss: es hält einen unlesbaren,
   * ungespeicherten Text oder wird seitdem noch bearbeitet (hueter #167 H1, Nachreview N1). */
  readonly aufOffenHalten: (angabe: LebensdatumAngabe, halten: boolean) => void
}

/** Ein Lebensdatum: gesperrter Ereigniswert oder bearbeitbares Datum/Ort. Leer und Aussage teilen
 * dieselbe Komponente (kein Neueinhängen beim ersten Anlegen — sonst schriebe der Unmount-Flush
 * des Debounce einen ausstehenden Entwurf ein zweites Mal als Anlage). */
function LebensdatumAngabeFeld({ personId, zustand, existenzen, warnungen, idPraefix, aufSprung, aufBelegeOeffnen, aufOffenHalten }: LebensdatumAngabeFeldProps) {
  if (zustand.art === 'ereignis') {
    const existenz = existenzFuer(zustand, existenzen)
    return (
      <GesperrterWert
        personId={personId}
        zustand={zustand}
        belegzahl={existenz === undefined ? null : ereignisBelegeFuer(zustand.angabe, existenz).length}
        warnungen={warnungen}
        idPraefix={idPraefix}
        aufSprung={aufSprung}
        aufBelegeOeffnen={aufBelegeOeffnen}
      />
    )
  }
  const aussage = zustand.art === 'aussage' ? zustand.aussage : null
  const feld = zustand.art === 'aussage' ? zustand.feld : null
  const angabe = zustand.angabe
  return angabe === 'geburtsort' || angabe === 'todesort' ? (
    <OrtAngabe personId={personId} angabe={angabe} aussage={aussage} feld={feld} warnungen={warnungen} idPraefix={idPraefix} aufBelegeOeffnen={aufBelegeOeffnen} />
  ) : (
    <DatumAngabe
      personId={personId}
      angabe={angabe}
      aussage={aussage}
      feld={feld}
      warnungen={warnungen}
      idPraefix={idPraefix}
      aufBelegeOeffnen={aufBelegeOeffnen}
      aufOffenHalten={aufOffenHalten}
    />
  )
}

interface BearbeitbareAngabeProps {
  readonly personId: string
  readonly angabe: LebensdatumAngabe
  readonly aussage: PersonDetailAussage | null
  readonly feld: PersonDetailGrunddatenFeld | null
  readonly warnungen: readonly BestandHinweisCode[]
  readonly idPraefix: string
  readonly aufBelegeOeffnen: (angabe: LebensdatumAngabe) => void
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
 * den gespeicherten Wert (Löschen einer Angabe gibt es hier nicht — keine stille Datenlöschung).
 *
 * U-130-9b-unlesbar (docs/80 §33 V-130-unlesbar, Entscheidung B): ein unlesbarer, ungespeicherter
 * Text meldet sich beim Editor (Speicherstatus, Nachfrage beim Verlassen); ist ein Jahr erkennbar,
 * steht unter dem Feld „Als ‚etwa JJJJ‘ mit Originaltext speichern" (Einzelschritt, ohne Koaleszenz). */
function DatumAngabe({
  personId,
  angabe,
  aussage,
  feld,
  warnungen,
  idPraefix,
  aufBelegeOeffnen,
  aufOffenHalten,
}: BearbeitbareAngabeProps & { readonly aufOffenHalten: (angabe: LebensdatumAngabe, halten: boolean) => void }) {
  const { t } = useTranslation('profil')
  const { t: tDatum } = useTranslation('datum')
  const { t: tFehler } = useTranslation('fehler')
  const schreiber = useAngabeSchreiben(personId, angabe, aussage)
  const gespeichert = aussage === null ? '' : datumText(aussageDatumAnzeige(aussage), tDatum)
  const [kalender, setKalender] = useState<Kalender>(aussage === null ? 'gregorian' : aussageKalender(aussage))
  const [kalenderErweitert, setKalenderErweitert] = useState(false)

  function datumSchreiben(text: string, mitKalender: Kalender): void {
    const datum = datumswertAusText(text, mitKalender)
    if (datum === undefined) return
    schreiber.schreiben({ aenderung: (ziel) => datumAenderung(ziel, datum), anlegen: { datum }, koaleszenz: true })
  }

  const [entwurf, setEntwurf, sofortSchreiben] = useEntwurfMitVerzoegertemCommit(gespeichert, (text) => datumSchreiben(text, kalender))
  const beschriftung = angabeBeschriftung(angabe, t)
  const feldId = editorFeldId(idPraefix, angabe)

  // Zuletzt als „etwa" gesendeter Text: bis das Lesemodell nachlädt, gilt er nicht mehr als unlesbar.
  const [etwaGesendet, setEtwaGesendet] = useState<string | null>(null)
  const istUnlesbar = (text: string) => text.trim() !== '' && text !== gespeichert && text !== etwaGesendet && datumswertAusText(text, kalender) === undefined
  const unlesbar = istUnlesbar(entwurf)
  const etwaDatum = unlesbar ? etwaDatumswertAusText(entwurf, kalender) : undefined
  // Nachreview #167 N1: war der Text während dieser Bearbeitung (Fokus) einmal unlesbar, hält das
  // Feld seine Gruppe bis zum Verlassen offen — sonst schnappte sie beim Korrigieren mitten im Tippen
  // zu. Gesetzt nur beim Tippen, gelöscht beim Verlassen: kein Zustand, der beim Rendern entsteht und
  // nach einem Wert von außen (Undo, Nachladen) verwaist stehen bliebe.
  const [haeltImFokus, setHaeltImFokus] = useState(false)
  const offenHalten = unlesbar || haeltImFokus
  const etwaJahr = etwaDatum?.wert1 === undefined ? null : Number(etwaDatum.wert1)

  function verwerfen(): void {
    setEntwurf(gespeichert)
  }

  function alsEtwaSpeichern(): void {
    if (etwaDatum === undefined) return
    schreiber.schreiben({ aenderung: (ziel) => datumAenderung(ziel, etwaDatum), anlegen: { datum: etwaDatum }, koaleszenz: false })
    setEtwaGesendet(entwurf)
  }

  useEffect(() => {
    aufOffenHalten(angabe, offenHalten)
    return () => aufOffenHalten(angabe, false)
  }, [aufOffenHalten, angabe, offenHalten])

  useUnlesbarMelden(
    unlesbar
      ? { feldId, beschriftung, text: entwurf.trim(), jahr: etwaJahr, verwerfen, alsEtwaSpeichern }
      : null,
  )

  // Ein gespeicherter Wert, dessen Wortlaut sich nicht lesen lässt (als „etwa" mit Originaltext
  // gespeichert), zeigt seine gespeicherte Deutung statt „nicht auflösbar".
  const deutung =
    aussage !== null && entwurf === gespeichert && datumsfeldInterpretation(entwurf).art === 'nicht_aufloesbar' ? gespeicherteDeutung(aussage) : undefined

  return (
    <div className={angabeKlasse(warnungen)}>
      <div className="wz-reiter-person__angabe-zeile">
        <div className="wz-reiter-person__wert wz-reiter-person__wert--datum">
          <Formularfeld beschriftung={t('lebensdatum_datum_beschriftung')} {...optionalerFehler(fehlerText(schreiber.fehler, t, tFehler))}>
            <Datumsfeld
              id={feldId}
              ariaLabel={beschriftung}
              text={entwurf}
              aufAenderung={(neu) => {
                if (unlesbar || istUnlesbar(neu)) setHaeltImFokus(true)
                setEntwurf(neu)
              }}
              aufVerlassen={() => {
                sofortSchreiben()
                if (entwurf.trim() === '') setEntwurf(gespeichert)
                setHaeltImFokus(false)
              }}
              kalender={kalender}
              aufKalenderAenderung={(neu) => {
                setKalender(neu)
                datumSchreiben(entwurf, neu)
              }}
              kalenderErweitert={kalenderErweitert}
              aufKalenderErweitertAenderung={setKalenderErweitert}
              {...feldHinweis(warnungen)}
              {...(deutung === undefined ? {} : { deutung })}
              {...(etwaJahr === null
                ? {}
                : {
                    aktionBeiNichtAufloesbar: (
                      <Schaltflaeche variante="unauffaellig" aufKlick={alsEtwaSpeichern}>
                        {t('unlesbar_als_etwa_speichern', { jahr: etwaJahr })}
                      </Schaltflaeche>
                    ),
                  })}
            />
          </Formularfeld>
        </div>
        <Sicherheit angabe={angabe} aussage={aussage} feld={feld} schreiber={schreiber} aufBelegeOeffnen={aufBelegeOeffnen} />
      </div>
    </div>
  )
}

interface KurzbeschreibungAngabeProps {
  readonly personId: string
  readonly aussage: PersonDetailAussage | null
  readonly idPraefix: string
}

/**
 * Kurzbeschreibung (PR 9c, docs/80 §33 V-130-9c E5/E9): Aussage-Prädikat `kurzbeschreibung` mit
 * Textwert, Autosave mit Koaleszenzfeld `wertText`. Das erste Tippen in ein leeres Feld legt an
 * (mit `KONFIDENZ_VORGABE`), Folgetippen ändert (K: zwei Undo-Schritte, dann koaleszierend). Leer
 * verlassen löscht die Aussage (`aussage.loeschen`, Einzelschritt, rückgängig zu machen); leer
 * getippt wird zwischendurch nichts geschrieben. Kein Sicherheits- und kein Belegwähler: eine eigene
 * Zusammenfassung ist keine belegte Angabe (V-130-9-entscheidungen, Gegenposition D2).
 */
function KurzbeschreibungAngabe({ personId, aussage, idPraefix }: KurzbeschreibungAngabeProps) {
  const { t } = useTranslation('profil')
  const { t: tFehler } = useTranslation('fehler')
  const schreiber = useAngabeSchreiben(personId, KURZBESCHREIBUNG_PRAEDIKAT, aussage)
  const gespeichert = kurzbeschreibungText(aussage)
  const [entwurf, setEntwurf, sofortSchreiben] = useEntwurfMitVerzoegertemCommit(gespeichert, (text) => {
    if (text.trim() === '') return
    schreiber.schreiben({ aenderung: (ziel) => kurzbeschreibungAenderung(ziel, text), anlegen: { wertText: text }, koaleszenz: true })
  })

  function verlassen(): void {
    sofortSchreiben()
    // Leer verlassen = entfernen — außer bei einer gespeicherten, schon leeren Altbestands-Aussage,
    // die nur fokussiert wurde (kein stilles Löschen ohne Eingabe).
    if (entwurf.trim() === '' && (gespeichert.trim() !== '' || aussage === null)) schreiber.loeschen()
  }

  return (
    <div className="wz-reiter-person__angabe">
      <Formularfeld beschriftung={angabeBeschriftung(KURZBESCHREIBUNG_PRAEDIKAT, t)} {...optionalerFehler(fehlerText(schreiber.fehler, t, tFehler))}>
        <Textfeld id={`${idPraefix}-feld-kurzbeschreibung`} wert={entwurf} aufAenderung={setEntwurf} aufVerlassen={verlassen} />
      </Formularfeld>
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
  readonly aufBelegeOeffnen: (angabe: LebensdatumAngabe) => void
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
        {feld === null ? <BelegAbzeichen anzahl={0} /> : <BelegAbzeichen anzahl={feld.belegzahl} aufKlick={() => aufBelegeOeffnen(angabe)} />}
      </div>
    </div>
  )
}

interface GesperrterWertProps {
  readonly personId: string
  readonly zustand: Extract<LebensdatumFeld, { readonly art: 'ereignis' }>
  /** Belege an der Existenz-Aussage des Ereignisses, die diese Angabe belegen (PR 9d-2); `null` = das
   * Ereignis hat keine Existenz-Aussage (kein Zähler). */
  readonly belegzahl: number | null
  readonly warnungen: readonly BestandHinweisCode[]
  readonly idPraefix: string
  readonly aufSprung: (reiter: ReiterId, feld: EditorFeld) => void
  readonly aufBelegeOeffnen: (angabe: LebensdatumAngabe) => void
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
 * mit zwei Aktionen am Feld (D3). Die Sicherheit des Ereignisses liefert das Lesemodell nicht
 * (U-130-1-ereignis-konfidenz) — darum hier keine. PR 9d-2 (V-130-9d2): der Belegzähler zählt die
 * Belege der Existenz-Aussage, die diese Angabe belegen (was die Schublade für die Angabe listet),
 * und öffnet sie; ohne Existenz-Aussage kein Zähler.
 */
function GesperrterWert({ personId, zustand, belegzahl, warnungen, idPraefix, aufSprung, aufBelegeOeffnen }: GesperrterWertProps) {
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
        {belegzahl === null ? null : <BelegAbzeichen anzahl={belegzahl} aufKlick={() => aufBelegeOeffnen(zustand.angabe)} />}
      </div>
    </div>
  )
}
