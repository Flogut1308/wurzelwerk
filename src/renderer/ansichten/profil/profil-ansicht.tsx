import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
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
import { Schaltflaeche } from '../../bausteine/schaltflaeche'
import { Seitenschublade } from '../../bausteine/seitenschublade'
import { personennameIstErsatz, personennameText } from '../../bausteine/personenname-anzeige'
import { Text } from '../../bausteine/text'
import { BelegListe } from './beleg-liste'
import { tabImContainerHalten } from './fokusfang'
import { NegativbefundAbschnitt } from './negativbefund-abschnitt'
import { PersonBearbeitenAnsicht } from './person-bearbeiten-ansicht'
import { grunddatenZeilen, type EreignisWert, type GrunddatenZeile } from './profil-lebensdaten-logik'
import { beteiligungRolleSchluessel, ereignisTypSchluessel, gesundheitArtSchluessel, kantentypSchluessel, praedikatSchluessel, richtungSchluessel } from './profil-schluessel'
import { ProfilFehler, ProfilLaedt } from './profil-zustaende'
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

/** Welche Ansicht der Personen-Überlagerung sichtbar ist (AP-1.30 PR 7b, docs/80 §33
 * V-130-7-ansicht): die Lesesicht S-07 oder der Editor als eigene Ansicht
 * (`PersonBearbeitenAnsicht`). `fokusAufBearbeiten` merkt sich, dass die Lesesicht aus dem Editor
 * zurückkommt — dann erhält der „Bearbeiten"-Knopf den Fokus statt des Dialogs. */
type PersonAnsicht = { readonly art: 'lesen'; readonly fokusAufBearbeiten: boolean } | { readonly art: 'bearbeiten' }

/**
 * `ProfilAnsicht` (S-07, C-04, B-01 bis B-04, AP-1.7 PR-B) — überlagerte Vollseite
 * (`70_UX_Konzept.md` §2: „der Kontext im Baum darf nicht verloren gehen; Schließen bringt einen
 * exakt dorthin zurück"). Seit AP-1.30 PR 7b die Hülle der Personen-Überlagerung: sie schaltet
 * zwischen Lesesicht (`ProfilLesesicht`) und Editor (`PersonBearbeitenAnsicht`) um. Beide holen
 * `abfrage:person.detail` mit demselben Schlüssel — ein Cache (ADR-016).
 *
 * **Fokusrückgabe:** die Hülle merkt sich beim ersten Rendern `document.activeElement` (die Zeile,
 * von der aus geöffnet wurde) und stellt ihn erst beim Aushängen der GANZEN Überlagerung wieder her.
 * Ein Wechsel Lesesicht ↔ Editor hängt nur das Kind aus, nie die Hülle — die Listenzeile erhält
 * dabei also keinen Zwischenfokus. Gemerkt wird im Rendern (Zustands-Initialisierer), nicht im
 * Effekt: Effekte der Kinder laufen vor denen der Eltern, der Dialog hätte den Fokus sonst schon
 * übernommen. `Escape` ist kein Plattform-Tastenkürzel (CLAUDE.md §11 gilt für `Cmd`/`Ctrl`-
 * Kombinationen über `src/main/menue/tastenkuerzel.ts`) — ein einzelner `key === 'Escape'`-Vergleich
 * braucht keine Zuordnung dort.
 */
export function ProfilAnsicht({ personId, aufSchliessen }: ProfilAnsichtProps) {
  const [ansicht, setAnsicht] = useState<PersonAnsicht>({ art: 'lesen', fokusAufBearbeiten: false })
  // `typeof document`: `renderToStaticMarkup` in den Einheitstests läuft ohne DOM.
  const [ausgangsElement] = useState<Element | null>(() => (typeof document === 'undefined' ? null : document.activeElement))

  useEffect(() => {
    return () => {
      if (ausgangsElement instanceof HTMLElement) {
        ausgangsElement.focus()
      }
    }
  }, [ausgangsElement])

  if (ansicht.art === 'bearbeiten') {
    return (
      <PersonBearbeitenAnsicht
        personId={personId}
        aufFertig={() => setAnsicht({ art: 'lesen', fokusAufBearbeiten: true })}
        aufSchliessen={aufSchliessen}
      />
    )
  }
  return (
    <ProfilLesesicht
      personId={personId}
      aufSchliessen={aufSchliessen}
      aufBearbeiten={() => setAnsicht({ art: 'bearbeiten' })}
      fokusAufBearbeiten={ansicht.fokusAufBearbeiten}
    />
  )
}

interface ProfilLesesichtProps {
  readonly personId: string
  readonly aufSchliessen: () => void
  readonly aufBearbeiten: () => void
  readonly fokusAufBearbeiten: boolean
}

/** Die Lesesicht S-07 — seit AP-1.30 PR 7b ohne Bearbeiten-Zweig; „Bearbeiten" öffnet den Editor.
 * `Tab`/`Shift+Tab` bleiben im Dialog (`tabImContainerHalten`), Escape schließt die Überlagerung. */
function ProfilLesesicht({ personId, aufSchliessen, aufBearbeiten, fokusAufBearbeiten }: ProfilLesesichtProps) {
  const { t } = useTranslation('profil')
  const abfrage = usePersonDetail({ personId })
  const [schublade, setSchublade] = useState<SchubladeZustand>(SCHUBLADE_KEINE)
  const containerRef = useRef<HTMLDivElement | null>(null)
  // `Schaltflaeche` reicht keinen Ref durch — der Knopf wird über seine Hülle gefunden.
  const bearbeitenRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    const bearbeitenKnopf = fokusAufBearbeiten ? bearbeitenRef.current?.querySelector<HTMLButtonElement>('button') : null
    ;(bearbeitenKnopf ?? containerRef.current)?.focus()
    // `fokusAufBearbeiten` ist je Instanz fest (die Hülle hängt die Lesesicht bei jedem Wechsel neu
    // ein) — der Effekt läuft also genau einmal beim Einhängen.
  }, [fokusAufBearbeiten])

  function tastendruck(ereignis: KeyboardEvent<HTMLDivElement>) {
    if (ereignis.key === 'Escape') {
      ereignis.stopPropagation()
      aufSchliessen()
      return
    }
    tabImContainerHalten(ereignis, containerRef.current)
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
            <span ref={bearbeitenRef}>
              <Schaltflaeche variante="unauffaellig" aufKlick={aufBearbeiten}>
                {t('bearbeiten')}
              </Schaltflaeche>
            </span>
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
          <ProfilInhalt
            personId={personId}
            daten={abfrage.data}
            aufBelegOeffnen={(feld) => setSchublade({ art: 'beleg', feld })}
            aufWiderspruchOeffnen={(feld) => setSchublade({ art: 'widerspruch', feld })}
          />
        ) : null}
      </div>

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

interface ProfilInhaltProps {
  readonly personId: string
  readonly daten: PersonDetailAus
  readonly aufBelegOeffnen: (feld: PersonDetailGrunddatenFeld) => void
  readonly aufWiderspruchOeffnen: (feld: PersonDetailGrunddatenFeld) => void
}

/** Adaptiver Umfang (C-04, S-07): jeder Abschnitt entscheidet selbst, ob er etwas zu zeigen hat,
 * und rendert sonst `null` — eine datenarme Person ergibt eine kurze Seite, kein Formular voller
 * leerer Felder. `NegativbefundAbschnitt` (AP-1.17 PR-C2) ist die bewusste Ausnahme: er trägt ein
 * dauerhaftes „hinzufügen"-Formular und zeigt darum immer mindestens dieses, unabhängig vom
 * Datenbestand (s. dortiger Kopfkommentar). */
function ProfilInhalt({ personId, daten, aufBelegOeffnen, aufWiderspruchOeffnen }: ProfilInhaltProps) {
  return (
    <>
      <ProfilKopf kopf={daten.kopf} />
      <GrunddatenAbschnitt
        zeilen={grunddatenZeilen({ grunddaten: daten.grunddaten, lebensdaten: daten.lebensdaten, lebendStatus: daten.kopf.lebend_status })}
        aufBelegOeffnen={aufBelegOeffnen}
        aufWiderspruchOeffnen={aufWiderspruchOeffnen}
      />
      <EreignisAbschnitt ereignisse={daten.ereignisse} />
      <BeziehungenAbschnitt beziehungen={daten.beziehungen} />
      <GesundheitAbschnitt gesundheit={daten.gesundheit} />
      <NotizAbschnitt notiz={daten.notiz} />
      <NegativbefundAbschnitt personId={personId} />
    </>
  )
}

/** `Profilkopf` (docs/71_Designsystem.md §2.3, C-04): Anzeigename, Konfidenz-Gesamtlage,
 * Platzhalter-/Privat-Kennzeichnung (nur Anzeige, kein Umschalter — AP-1.7 ist lesend). */
function ProfilKopf({ kopf }: { readonly kopf: PersonDetailKopf }) {
  const { t } = useTranslation('profil')
  const { t: tAllgemein } = useTranslation('allgemein')
  const stufe = konfidenzStufe(kopf.konfidenz_min)
  const name = personennameText(kopf, tAllgemein)

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
  readonly zeilen: readonly GrunddatenZeile[]
  readonly aufBelegOeffnen: (feld: PersonDetailGrunddatenFeld) => void
  readonly aufWiderspruchOeffnen: (feld: PersonDetailGrunddatenFeld) => void
}

/** Grunddaten-Feldliste (S-07 Punkt 2, E21): je Aussage-Feld `FeldKonfidenz` (die zwei E21-Zeichen).
 * Ohne die importinterne `existenz`-Aussage (ADR-026). Seit AP-1.30 PR 1 (V-D9-anzeige) steht ein
 * Geburts-/Todesdatum oder -ort aus einem Ereignis in der Zeile seines Prädikats, wenn keine Aussage
 * führt — nur lesend, mit Herkunft „aus dem Ereignis …" statt der E21-Zeichen (Muster „aus Beziehung
 * abgeleitet", Entwicklungsvorgaben §1). Die Zeilen bildet `grunddatenZeilen`
 * (./profil-lebensdaten-logik.ts). */
function GrunddatenAbschnitt({ zeilen, aufBelegOeffnen, aufWiderspruchOeffnen }: GrunddatenAbschnittProps) {
  const { t } = useTranslation('profil')
  if (zeilen.length === 0) return null

  return (
    <section className="wz-profil-ansicht__abschnitt" aria-labelledby="wz-profil-grunddaten-titel">
      <Text rolle="titel-klein" als="h2" id="wz-profil-grunddaten-titel">
        {t('abschnitt_grunddaten')}
      </Text>
      <dl className="wz-profil-ansicht__grunddaten">
        {zeilen.map((zeile) => {
          const schluessel = praedikatSchluessel(zeile.praedikat)
          const label = schluessel === undefined ? zeile.praedikat : t(schluessel)
          return (
            <div key={zeile.praedikat} className="wz-profil-ansicht__grunddaten-zeile">
              <Text rolle="beschriftung" als="dt">
                {label}
              </Text>
              {zeile.art === 'aussage' ? (
                <>
                  {zeile.wert === null ? (
                    <Text rolle="hilfe" als="dd">
                      {t('wert_unbekannt')}
                    </Text>
                  ) : (
                    <Text rolle="koerper" als="dd">
                      {zeile.wert}
                    </Text>
                  )}
                  <dd className="wz-profil-ansicht__grunddaten-zeichen">
                    <FeldKonfidenz
                      konfidenz={zeile.feld.konfidenz}
                      belegzahl={zeile.feld.belegzahl}
                      hatKonkurrierende={zeile.feld.hatKonkurrierende}
                      hatWiderspruch={zeile.feld.hat_widerspruch}
                      aufBelegKlick={() => aufBelegOeffnen(zeile.feld)}
                      aufWiderspruchKlick={() => aufWiderspruchOeffnen(zeile.feld)}
                    />
                  </dd>
                </>
              ) : (
                <>
                  <EreignisWertAnzeige wert={zeile.wert} />
                  <Text rolle="hilfe" als="dd">
                    {t(zeile.herkunftSchluessel)}
                  </Text>
                </>
              )}
            </div>
          )
        })}
      </dl>
    </section>
  )
}

/** Wert einer Ereignis-Zeile: Datum über den Formatierer (Namensraum `datum`), Originaltext
 * gekennzeichnet (Rolle `original`), Ortsname, sonst „unbekannt". */
function EreignisWertAnzeige({ wert }: { readonly wert: EreignisWert }) {
  const { t } = useTranslation('profil')
  const { t: tDatum } = useTranslation('datum')
  switch (wert.art) {
    case 'datum':
      return (
        <Text rolle="koerper" als="dd">
          {tDatum(wert.ergebnis.schluessel, wert.ergebnis.werte)}
        </Text>
      )
    case 'originaltext':
      return (
        <Text rolle="original" als="dd">
          {t('wert_originaltext', { text: wert.text })}
        </Text>
      )
    case 'text':
      return (
        <Text rolle="koerper" als="dd">
          {wert.text}
        </Text>
      )
    case 'unbekannt':
      return (
        <Text rolle="hilfe" als="dd">
          {t('wert_unbekannt')}
        </Text>
      )
  }
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
 * `allgemein:person_platzhalter` + gestrichelter Rahmen (`.wz-profil-ansicht__beziehung--platzhalter`,
 * analog `.wz-tabellenzeile--platzhalter`) — die gedämpfte Farbe ist eine dritte, zusätzliche
 * Zusicherung, nie die einzige. Eine echte Person ohne Namensform zeigt „(ohne Namen)" ohne
 * gestrichelten Rahmen (AP-1.30 PR 2, §32 V-4-ohne-namen, `personenname-anzeige.ts`). */
function BeziehungenAbschnitt({ beziehungen }: { readonly beziehungen: readonly PersonDetailBeziehung[] }) {
  const { t } = useTranslation('profil')
  const { t: tAllgemein } = useTranslation('allgemein')
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
            <Text rolle="koerper" farbe={personennameIstErsatz(beziehung) ? 'tertiaer' : 'primaer'} als="span">
              {personennameText(beziehung, tAllgemein)}
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
