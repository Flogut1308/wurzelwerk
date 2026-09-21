import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { FehlerCode } from '../../../shared/fehler/codes'
import type {
  PersonDetailAus,
  PersonDetailBeziehung,
  PersonDetailEreignis,
  PersonDetailGesundheitseintrag,
  PersonDetailGrunddatenFeld,
  PersonDetailKopf,
} from '../../../shared/schemata/person-detail'
import { usePersonDetail } from '../../brücke/abfrage-hooks'
import { FeldKonfidenz, konfidenzStufe } from '../../bausteine/feld-konfidenz'
import { KonfidenzPunkt } from '../../bausteine/konfidenz-punkt'
import { Ladeschimmer } from '../../bausteine/ladeschimmer'
import { LeerzustandBlock } from '../../bausteine/leerzustand-block'
import { Schaltflaeche } from '../../bausteine/schaltflaeche'
import { Seitenschublade } from '../../bausteine/seitenschublade'
import { Text } from '../../bausteine/text'
import { BelegListe } from './beleg-liste'
import { EreignisseBearbeitenAbschnitt } from './profil-bearbeiten-ereignisse'
import { GrunddatenBearbeitenAbschnitt } from './profil-bearbeiten-grunddaten'
import { NamenBearbeitenAbschnitt } from './profil-bearbeiten-namen'
import { beteiligungRolleSchluessel, ereignisTypSchluessel, gesundheitArtSchluessel, kantentypSchluessel, praedikatSchluessel, richtungSchluessel } from './profil-schluessel'
import { Widerspruchsblock } from './widerspruchsblock'
import './profil-ansicht.css'

export interface ProfilAnsichtProps {
  readonly personId: string
  readonly aufSchliessen: () => void
}

/** Welche der beiden Schubladen (S-08/S-09) offen ist, und für welches Grunddaten-Feld — höchstens
 * eine gleichzeitig (Progressive Disclosure, `70_UX_Konzept.md` §1: „ein Klick zeigt den Beleg, ein
 * weiterer die Widersprüche", nicht beide nebeneinander). */
type SchubladeZustand = { readonly art: 'keine' } | { readonly art: 'beleg' | 'widerspruch'; readonly feld: PersonDetailGrunddatenFeld }

const SCHUBLADE_KEINE: SchubladeZustand = { art: 'keine' }

/** ADR-026: `existenz` ist die importinterne Trägeraussage für Beleg/Konfidenz der Person selbst
 * (`docs/datenmodell.md` §2.7) — kein Feld, das ein Mensch als Fakt lesen will. Wird hier aus der
 * Grunddaten-Anzeige gefiltert, nicht aus dem Datensatz selbst (`docs/80_Offene_Fragen.md`,
 * AP-1.7-Nachtrag). */
const PRAEDIKAT_EXISTENZ = 'existenz'

const FOKUSSIERBAR_SELEKTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function fokussierbareElemente(container: HTMLElement): readonly HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOKUSSIERBAR_SELEKTOR))
}

/**
 * `ProfilAnsicht` (S-07, C-04, B-01 bis B-04, AP-1.7 PR-B) — überlagerte Vollseite
 * (`70_UX_Konzept.md` §2: „der Kontext im Baum darf nicht verloren gehen; Schließen bringt einen
 * exakt dorthin zurück"). Holt `abfrage:person.detail` selbst; die Unterabschnitte unten bekommen
 * nur die schon geladenen Daten gereicht (ADR-016).
 *
 * **Fokusfang/-rückgabe:** ein Effekt merkt sich beim Einhängen `document.activeElement` (die
 * Zeile, von der aus geöffnet wurde — noch fokussiert, weil bis dahin nichts anderes den Fokus
 * übernommen hat) und stellt ihn beim Aushängen wieder her. Das ist die „exakte Ausgangsstelle"
 * aus §2, ohne eine Personen-ID zwischen Listen- und Profilansicht hin- und herzureichen.
 * `Tab`/`Shift+Tab` werden innerhalb des Containers zyklisch gehalten (kein Fokusfang-Paket im
 * Projekt, ein einfacher selbstgebauter Fang reicht für eine einzelne Überlagerungsebene).
 * `Escape` ist kein Plattform-Tastenkürzel (CLAUDE.md §11 gilt für `Cmd`/`Ctrl`-Kombinationen über
 * `src/main/menue/tastenkuerzel.ts`) — ein einzelner `key === 'Escape'`-Vergleich braucht keine
 * Zuordnung dort.
 */
/** Ob die Profilseite liest oder bearbeitet (AP-1.14a) — ein Zustand DIESER Seite, keine zweite
 * Ansicht mit eigener Wahrheit: derselbe `usePersonDetail`-Abruf speist beide Zweige, das
 * Bearbeiten selbst schreibt ausschließlich über die AP-1.12-Befehle
 * (`befehl:name.*`/`befehl:person.feldSetzen`), `ereignis:datenGeaendert` invalidiert danach den
 * Cache wie überall sonst — kein optimistisches Update, kein zweiter Schreibweg (CLAUDE.md §2). */
type ProfilModus = 'lesen' | 'bearbeiten'

export function ProfilAnsicht({ personId, aufSchliessen }: ProfilAnsichtProps) {
  const { t } = useTranslation('profil')
  const abfrage = usePersonDetail({ personId })
  const [schublade, setSchublade] = useState<SchubladeZustand>(SCHUBLADE_KEINE)
  const [modus, setModus] = useState<ProfilModus>('lesen')
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const vorherigesElement = document.activeElement
    containerRef.current?.focus()
    return () => {
      if (vorherigesElement instanceof HTMLElement) {
        vorherigesElement.focus()
      }
    }
    // Bewusst leere Abhängigkeitsliste: dieser Fokusfang läuft genau einmal beim Ein- und einmal
    // beim Aushängen DIESER Instanz — ein `personId`-Wechsel (kein Konsument in diesem Auftrag)
    // wäre ein neues Profil, keine Aktualisierung derselben Überlagerung. Der Effekt referenziert
    // ohnehin nur den Ref (`containerRef.current`), keine externe Variable, die hier fehlen könnte.
  }, [])

  function tastendruck(ereignis: KeyboardEvent<HTMLDivElement>) {
    if (ereignis.key === 'Escape') {
      ereignis.stopPropagation()
      aufSchliessen()
      return
    }
    if (ereignis.key !== 'Tab') return
    const knoten = containerRef.current
    if (knoten === null) return
    const fokussierbar = fokussierbareElemente(knoten)
    const erstes = fokussierbar[0]
    const letztes = fokussierbar[fokussierbar.length - 1]
    if (erstes === undefined || letztes === undefined) return
    if (ereignis.shiftKey && document.activeElement === erstes) {
      ereignis.preventDefault()
      letztes.focus()
    } else if (!ereignis.shiftKey && document.activeElement === letztes) {
      ereignis.preventDefault()
      erstes.focus()
    }
  }

  function feldLabel(praedikat: string): string {
    const schluessel = praedikatSchluessel(praedikat)
    return schluessel === undefined ? praedikat : t(schluessel)
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wz-profil-ansicht-titel"
      tabIndex={-1}
      className="wz-profil-ansicht"
      onKeyDown={tastendruck}
    >
      <header className="wz-profil-ansicht__kopfzeile">
        <Text rolle="beschriftung" als="span" id="wz-profil-ansicht-titel">
          {t('ueberschrift')}
        </Text>
        <div className="wz-profil-ansicht__kopfzeile-aktionen">
          {abfrage.isSuccess ? (
            <Schaltflaeche variante="unauffaellig" aufKlick={() => setModus(modus === 'lesen' ? 'bearbeiten' : 'lesen')}>
              {t(modus === 'lesen' ? 'bearbeiten' : 'fertig')}
            </Schaltflaeche>
          ) : null}
          <Schaltflaeche variante="unauffaellig" aufKlick={aufSchliessen}>
            {t('schliessen')}
          </Schaltflaeche>
        </div>
      </header>

      <div className="wz-profil-ansicht__inhalt">
        {abfrage.isPending ? <ProfilLaedt /> : null}
        {abfrage.isError && abfrage.error !== null ? <ProfilFehler code={abfrage.error.code} /> : null}
        {abfrage.isSuccess ? (
          modus === 'lesen' ? (
            <ProfilInhalt
              daten={abfrage.data}
              aufBelegOeffnen={(feld) => setSchublade({ art: 'beleg', feld })}
              aufWiderspruchOeffnen={(feld) => setSchublade({ art: 'widerspruch', feld })}
            />
          ) : (
            <ProfilBearbeitenInhalt personId={personId} daten={abfrage.data} />
          )
        ) : null}
      </div>

      {modus === 'bearbeiten' ? (
        <footer className="wz-profil-ansicht__fusszeile" aria-live="polite">
          <Text rolle="hilfe" als="span">
            {t('bearbeitungsstatus_hinweis')}
          </Text>
        </footer>
      ) : null}

      {schublade.art === 'keine' ? null : (
        <Seitenschublade
          titel={t(schublade.art === 'beleg' ? 'beleg_schublade_titel' : 'widerspruch_schublade_titel', { feld: feldLabel(schublade.feld.praedikat) })}
          aufSchliessen={() => setSchublade(SCHUBLADE_KEINE)}
        >
          {schublade.art === 'beleg' ? <BelegListe feld={schublade.feld} /> : <Widerspruchsblock feld={schublade.feld} />}
        </Seitenschublade>
      )}
    </div>
  )
}

function ProfilLaedt() {
  const { t } = useTranslation('profil')
  return (
    <div className="wz-profil-ansicht__laedt">
      <div role="status" aria-live="polite" className="wz-profil-ansicht__statusregion">
        {t('laedt')}
      </div>
      <Ladeschimmer form="block" />
      <Ladeschimmer form="block" />
      <Ladeschimmer form="block" />
    </div>
  )
}

function ProfilFehler({ code }: { readonly code: FehlerCode }) {
  const { t } = useTranslation('profil')
  if (code === 'NICHT_GEFUNDEN_PERSON') {
    return <LeerzustandBlock titel={t('nicht_gefunden_titel')} text={t('nicht_gefunden_text')} />
  }
  return <LeerzustandBlock titel={t('fehler_titel')} text={t('fehler_text')} />
}

interface ProfilInhaltProps {
  readonly daten: PersonDetailAus
  readonly aufBelegOeffnen: (feld: PersonDetailGrunddatenFeld) => void
  readonly aufWiderspruchOeffnen: (feld: PersonDetailGrunddatenFeld) => void
}

/** Adaptiver Umfang (C-04, S-07): jeder Abschnitt entscheidet selbst, ob er etwas zu zeigen hat,
 * und rendert sonst `null` — eine datenarme Person ergibt eine kurze Seite, kein Formular voller
 * leerer Felder. */
function ProfilInhalt({ daten, aufBelegOeffnen, aufWiderspruchOeffnen }: ProfilInhaltProps) {
  return (
    <>
      <ProfilKopf kopf={daten.kopf} />
      <GrunddatenAbschnitt felder={daten.grunddaten} aufBelegOeffnen={aufBelegOeffnen} aufWiderspruchOeffnen={aufWiderspruchOeffnen} />
      <EreignisAbschnitt ereignisse={daten.ereignisse} />
      <BeziehungenAbschnitt beziehungen={daten.beziehungen} />
      <GesundheitAbschnitt gesundheit={daten.gesundheit} />
      <NotizAbschnitt notiz={daten.notiz} />
    </>
  )
}

interface ProfilBearbeitenInhaltProps {
  readonly personId: string
  readonly daten: PersonDetailAus
}

/**
 * Bearbeiten-Zweig der Profilseite (AP-1.14a S-20 Kernfelder + AP-1.15 PR-A Ereignisse) — Namen,
 * Grunddaten (Geschlecht/Notiz/Platzhalter-Kennzeichen+Grund) und Ereignisse (Variante A: NUR
 * `beteiligung.loeschen`/`ereignis.loeschen` an bestehenden Zeilen, ein festes Formular schreibt
 * neue Ereignisse MIT allen Beteiligten in einem `ereignis.anlegen`-Aufruf), alle über die
 * AP-1.12/AP-1.15-Befehle. **Lebensdaten (Geburts-/Todesdatum) sind bewusst NICHT Teil der
 * Grunddaten** — offene Datenmodellfrage, s. `GrunddatenBearbeitenAbschnitt`-Kopfkommentar und
 * `docs/80_Offene_Fragen.md` §26. Beziehungen/Gesundheit bleiben lesend (spätere Arbeitspakete) —
 * der Kopf zeigt weiterhin den Anzeigenamen, damit „wen bearbeite ich gerade" nie aus dem Blick
 * gerät.
 */
function ProfilBearbeitenInhalt({ personId, daten }: ProfilBearbeitenInhaltProps) {
  return (
    <>
      <ProfilKopf kopf={daten.kopf} />
      <NamenBearbeitenAbschnitt personId={personId} namen={daten.namen} />
      <GrunddatenBearbeitenAbschnitt personId={personId} kopf={daten.kopf} notiz={daten.notiz} />
      <EreignisseBearbeitenAbschnitt personId={personId} ereignisse={daten.ereignisse} />
    </>
  )
}

/** `Profilkopf` (docs/71_Designsystem.md §2.3, C-04): Anzeigename, Konfidenz-Gesamtlage,
 * Platzhalter-/Privat-Kennzeichnung (nur Anzeige, kein Umschalter — AP-1.7 ist lesend). */
function ProfilKopf({ kopf }: { readonly kopf: PersonDetailKopf }) {
  const { t } = useTranslation('profil')
  const stufe = konfidenzStufe(kopf.konfidenz_min)
  const name = kopf.ist_platzhalter ? t('platzhalter_bezeichnung') : kopf.anzeigename

  return (
    <header className="wz-profil-ansicht__profilkopf">
      <Text rolle="titel-gross" als="h1">
        {name}
      </Text>
      <div className="wz-profil-ansicht__profilkopf-zeichen">
        {stufe !== null ? <KonfidenzPunkt stufe={stufe} /> : null}
        {kopf.privat ? (
          <Text rolle="beschriftung" farbe="akzent" als="span">
            {t('privat_kennzeichnung')}
          </Text>
        ) : null}
      </div>
    </header>
  )
}

interface GrunddatenAbschnittProps {
  readonly felder: readonly PersonDetailGrunddatenFeld[]
  readonly aufBelegOeffnen: (feld: PersonDetailGrunddatenFeld) => void
  readonly aufWiderspruchOeffnen: (feld: PersonDetailGrunddatenFeld) => void
}

/** Grunddaten-Feldliste (S-07 Punkt 2, E21): je Feld `FeldKonfidenz` (die zwei E21-Zeichen). Ohne
 * die importinterne `existenz`-Aussage (s. Kopfkommentar `PRAEDIKAT_EXISTENZ`). */
function GrunddatenAbschnitt({ felder, aufBelegOeffnen, aufWiderspruchOeffnen }: GrunddatenAbschnittProps) {
  const { t } = useTranslation('profil')
  const sichtbareFelder = felder.filter((feld) => feld.praedikat !== PRAEDIKAT_EXISTENZ)
  if (sichtbareFelder.length === 0) return null

  return (
    <section className="wz-profil-ansicht__abschnitt" aria-labelledby="wz-profil-grunddaten-titel">
      <Text rolle="titel-klein" als="h2" id="wz-profil-grunddaten-titel">
        {t('abschnitt_grunddaten')}
      </Text>
      <dl className="wz-profil-ansicht__grunddaten">
        {sichtbareFelder.map((feld) => {
          const schluessel = praedikatSchluessel(feld.praedikat)
          const label = schluessel === undefined ? feld.praedikat : t(schluessel)
          return (
            <div key={feld.praedikat} className="wz-profil-ansicht__grunddaten-zeile">
              <Text rolle="beschriftung" als="dt">
                {label}
              </Text>
              {feld.wert === null ? (
                <Text rolle="hilfe" als="dd">
                  {t('wert_unbekannt')}
                </Text>
              ) : (
                <Text rolle="koerper" als="dd">
                  {feld.wert}
                </Text>
              )}
              <dd className="wz-profil-ansicht__grunddaten-zeichen">
                <FeldKonfidenz
                  konfidenz={feld.konfidenz}
                  belegzahl={feld.belegzahl}
                  hatKonkurrierende={feld.hatKonkurrierende}
                  hatWiderspruch={feld.hat_widerspruch}
                  aufBelegKlick={() => aufBelegOeffnen(feld)}
                  aufWiderspruchKlick={() => aufWiderspruchOeffnen(feld)}
                />
              </dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}

/** `EreignisZeitstrahl` (docs/71_Designsystem.md §2.3, C-15): chronologisch — die Sortierung
 * selbst kommt bereits aus `abfrage:person.detail` (`src/main/abfragen/person-detail.ts`,
 * `ereignisseSortierenUndWandeln`), hier nur Anzeige. */
function EreignisAbschnitt({ ereignisse }: { readonly ereignisse: readonly PersonDetailEreignis[] }) {
  const { t } = useTranslation('profil')
  if (ereignisse.length === 0) return null

  return (
    <section className="wz-profil-ansicht__abschnitt" aria-labelledby="wz-profil-ereignisse-titel">
      <Text rolle="titel-klein" als="h2" id="wz-profil-ereignisse-titel">
        {t('abschnitt_ereignisse')}
      </Text>
      <ol className="wz-profil-ansicht__zeitstrahl">
        {ereignisse.map((ereignis) => (
          <li key={ereignis.ereignis_id} className="wz-profil-ansicht__zeitstrahl-eintrag">
            <Text rolle="koerper" als="span">
              {t(ereignisTypSchluessel(ereignis.typ))}
            </Text>
            <Text rolle="beschriftung" als="span">
              {t(beteiligungRolleSchluessel(ereignis.rolle))}
            </Text>
            <Text rolle="koerper-klein" als="span">
              {ereignis.datum_wert1 ?? t('wert_unbekannt')}
            </Text>
            {ereignis.ort_name === null ? null : (
              <Text rolle="koerper-klein" als="span">
                {ereignis.ort_name}
              </Text>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** `Beziehungsliste` (docs/71_Designsystem.md §2.3, A-13): Eltern/Kinder/Partner mit Kantentyp.
 * KEIN „hinzufügen" (S-07 nennt das, aber AP-1.7 PR-B ist lesend — Bearbeiten kommt im zweiten
 * Teil der Phase 1, s. Auftrag).
 *
 * U-1.7-beziehung-platzhalter (AP-1.10 PR-B, A-17, `docs/80_Offene_Fragen.md` §19 — behebt BEIDE
 * dort benannten Fehlrichtungen): Platzhalter werden über das ECHTE `beziehung.ist_platzhalter`-
 * Flag erkannt (der jetzt erweiterte `PersonDetailBeziehung`-Vertrag), NICHT mehr über einen
 * leeren `anzeigename` erraten — ein leerer Name allein hätte auch eine echte, noch namenlose
 * Person fälschlich als Platzhalter beschriftet. Die Kennzeichnung ist außerdem FARBUNABHÄNGIG
 * (A-17/`docs/datenmodell.md` §2.14 „gestrichelte Umrandung, kein Name"): Text
 * `platzhalter_bezeichnung` + gestrichelter Rahmen (`.wz-profil-ansicht__beziehung--platzhalter`,
 * analog `.wz-tabellenzeile--platzhalter`) — die gedämpfte Farbe ist eine dritte, zusätzliche
 * Zusicherung, nie die einzige. */
function BeziehungenAbschnitt({ beziehungen }: { readonly beziehungen: readonly PersonDetailBeziehung[] }) {
  const { t } = useTranslation('profil')
  if (beziehungen.length === 0) return null

  return (
    <section className="wz-profil-ansicht__abschnitt" aria-labelledby="wz-profil-beziehungen-titel">
      <Text rolle="titel-klein" als="h2" id="wz-profil-beziehungen-titel">
        {t('abschnitt_beziehungen')}
      </Text>
      <ul className="wz-profil-ansicht__beziehungen">
        {beziehungen.map((beziehung, index) => (
          <li
            key={`${beziehung.richtung}-${beziehung.person_id}-${index}`}
            className={`wz-profil-ansicht__beziehung${beziehung.ist_platzhalter ? ' wz-profil-ansicht__beziehung--platzhalter' : ''}`}
          >
            <Text rolle="beschriftung" als="span">
              {t(richtungSchluessel(beziehung.richtung))}
            </Text>
            <Text rolle="koerper" farbe={beziehung.ist_platzhalter ? 'tertiaer' : 'primaer'} als="span">
              {beziehung.ist_platzhalter ? t('platzhalter_bezeichnung') : beziehung.anzeigename}
            </Text>
            <Text rolle="koerper-klein" als="span">
              {t(kantentypSchluessel(beziehung.kantentyp))}
            </Text>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** `GesundheitsBlock` (docs/71_Designsystem.md §2.3, M-08): fester, nicht ausblendbarer
 * Exportsperrhinweis — diese lesende Profilanzeige selbst ist KEIN Export (s. Kopfkommentar
 * `src/shared/schemata/person-detail.ts`), der Hinweis steht trotzdem immer da, weil er über den
 * Bildschirm hinaus gilt. */
function GesundheitAbschnitt({ gesundheit }: { readonly gesundheit: readonly PersonDetailGesundheitseintrag[] }) {
  const { t } = useTranslation('profil')
  if (gesundheit.length === 0) return null

  return (
    <section className="wz-profil-ansicht__abschnitt" aria-labelledby="wz-profil-gesundheit-titel">
      <Text rolle="titel-klein" als="h2" id="wz-profil-gesundheit-titel">
        {t('abschnitt_gesundheit')}
      </Text>
      <Text rolle="hilfe" als="p">
        {t('gesundheit_exportsperre_hinweis')}
      </Text>
      <ul className="wz-profil-ansicht__gesundheit">
        {gesundheit.map((eintrag) => (
          <li key={eintrag.id} className="wz-profil-ansicht__gesundheit-eintrag">
            <Text rolle="beschriftung" als="span">
              {t(gesundheitArtSchluessel(eintrag.art))}
            </Text>
            <Text rolle="koerper" als="span">
              {eintrag.bezeichnung ?? t('wert_unbekannt')}
            </Text>
            {eintrag.status === null ? null : (
              <Text rolle="koerper-klein" als="span">
                {eintrag.status}
              </Text>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function NotizAbschnitt({ notiz }: { readonly notiz: string | null }) {
  const { t } = useTranslation('profil')
  if (notiz === null || notiz.trim() === '') return null

  return (
    <section className="wz-profil-ansicht__abschnitt" aria-labelledby="wz-profil-notiz-titel">
      <Text rolle="titel-klein" als="h2" id="wz-profil-notiz-titel">
        {t('abschnitt_notiz')}
      </Text>
      <Text rolle="koerper" als="p">
        {notiz}
      </Text>
    </section>
  )
}
