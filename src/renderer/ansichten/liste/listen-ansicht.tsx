import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProjektInfo } from '../../../shared/ipc/vertrag'
import type { PersonListeFilter, PersonListeZeile } from '../../../shared/schemata/person-liste'
import type { PruefhinweisEintrag } from '../../../shared/schemata/pruefhinweise'
import { aufrufen } from '../../brücke/aufrufen'
import { usePersonListe, usePruefhinweise, useSuche } from '../../brücke/abfrage-hooks'
import { Blaetterleiste } from '../../bausteine/blaetterleiste'
import { Datentabelle, spaltenSchluessel, type DatentabelleLadezustand } from '../../bausteine/datentabelle'
import { ALLE_DATENTABELLE_SPALTEN, spalteUmschalten, type DatentabelleSpalte } from '../../bausteine/datentabelle-spalten'
import type { PersonListeRichtungWert, PersonListeSortierungWert } from '../../bausteine/datentabelle-sortierung'
import { Filterleiste } from '../../bausteine/filterleiste'
import { boolZuUmschalterZustand } from '../../bausteine/filterleiste-logik'
import { LeerzustandBlock } from '../../bausteine/leerzustand-block'
import { Schaltflaeche } from '../../bausteine/schaltflaeche'
import { Seitenschublade } from '../../bausteine/seitenschublade'
import { Suchfeld } from '../../bausteine/suchfeld'
import { Text } from '../../bausteine/text'
import { Umschalter } from '../../bausteine/umschalter'
import { ImportAssistent } from '../import/import-assistent'
import { ProfilAnsicht } from '../profil/profil-ansicht'
import { pruefhinweisCodeSchluessel, pruefhinweisWasTunSchluessel } from './pruefhinweis-schluessel'
import './listen-ansicht.css'

/** Entscheidung D (`docs/arbeitspakete.md` AP-1.6): der Renderer setzt `proSeite` fest auf 100,
 * das Schema selbst erlaubt 1..500 (`personListeEinSchema`). */
const PRO_SEITE = 100

/** Entscheidung B: `platzhalter`/`privat` starten auf `'alle'` (nichts ausgeblendet),
 * `nurWiderspruch` startet aus, `konfidenzMin` fehlt (kein Mindestwert) — das Feld ist mit
 * `exactOptionalPropertyTypes` bewusst NICHT vorhanden, nicht `undefined` gesetzt. */
const FILTER_STANDARD: PersonListeFilter = {
  platzhalter: 'alle',
  privat: 'alle',
  nurWiderspruch: false,
}

function hatAktivenFilter(filter: PersonListeFilter): boolean {
  return (
    filter.platzhalter !== 'alle' ||
    filter.privat !== 'alle' ||
    filter.nurWiderspruch ||
    filter.konfidenzMin !== undefined ||
    filter.zeitraumVon !== undefined ||
    filter.zeitraumBis !== undefined ||
    filter.ort !== undefined
  )
}

export interface ListenAnsichtProps {
  readonly projekt: ProjektInfo
  /** Aufgerufen, NACHDEM `befehl:projekt.schliessen` erfolgreich war (analog zum ursprünglichen
   * `projektSchliessen()` der Start-Ansicht, AP-0.4) — diese Ansicht löst den Kanal selbst aus,
   * der Aufrufer (App) muss nur noch zurück auf die Start-Ansicht wechseln. */
  readonly aufProjektGeschlossen: () => void
}

/**
 * Listenansicht (C-16, C-17, A-19, AP-1.6 Stufe 4, AP-1.10 PR-A): verdrahtet Suchfeld, Filterleiste,
 * Spaltenwahl, Datentabelle und Blätterleiste mit `usePersonListe`/`useSuche`
 * (`src/renderer/brücke/abfrage-hooks.ts`). Leerer Suchtext → `usePersonListe`; nicht leerer
 * Suchtext → `useSuche` — seit AP-1.10 PR-A (U-1.6-suche-ohne-filter-sortierung-seite) trägt
 * `abfrage:suche` dieselben Filter-/Sortier-/Seitenfelder wie `abfrage:person.liste`, Filterleiste,
 * Spaltenkopf-Sortierung und Blätterleiste bleiben darum auch während einer aktiven Suche wirksam
 * (kein sichtbares Sperren mehr). Keine optimistischen Aktualisierungen (CLAUDE.md §10): Neuladen
 * läuft ausschließlich über `ereignis:datenGeaendert` (`DatenGeaendertBruecke` in `app.tsx`).
 */
export function ListenAnsicht({ projekt, aufProjektGeschlossen }: ListenAnsichtProps) {
  const { t } = useTranslation('liste')
  const { t: tAllgemein } = useTranslation('allgemein')
  const { t: tImport } = useTranslation('import')
  const { t: tPruef } = useTranslation('pruefhinweise')

  const [suchtext, setSuchtext] = useState('')
  const [filter, setFilter] = useState<PersonListeFilter>(FILTER_STANDARD)
  const [sortierung, setSortierung] = useState<PersonListeSortierungWert>('nachname')
  const [richtung, setRichtung] = useState<PersonListeRichtungWert>('auf')
  const [seite, setSeite] = useState(1)
  const [spalten, setSpalten] = useState<readonly DatentabelleSpalte[]>(ALLE_DATENTABELLE_SPALTEN)
  // AP-1.7 PR-B (S-07): welches Profil geöffnet ist, `null` = keins. Die „exakte Ausgangsstelle"
  // beim Schließen (`70_UX_Konzept.md` §2) stellt `ProfilAnsicht` selbst über ihren eigenen
  // Fokusfang wieder her (s. Kommentar dort) — hier reicht ein einfacher Auswahlzustand.
  const [geoeffnetePersonId, setGeoeffnetePersonId] = useState<string | null>(null)
  // AP-1.4b (S-10…S-13): der Import-Assistent als überlagerte Vollseite, Einstieg über den Knopf
  // im Kopf. `false` = geschlossen. Design-Review: §S-10 nennt die Einstiegs-Affordanz nicht.
  const [importOffen, setImportOffen] = useState(false)
  // AP-1.8 PR-A (F-07): die Prüfhinweis-Liste als Seitenschublade, Einstieg über die Fußzeile
  // (70_UX_Konzept.md §2: „Fußzeile: Speicherstatus, Personenzahl, Prüfhinweise" — Speicherstatus
  // und Personenzahl sind eigene, noch nicht fällige Arbeitspakete; diese Fußzeile trägt vorerst
  // nur die Prüfhinweise, spätere Pakete ergänzen die übrigen Felder in derselben Fußzeile).
  // `false` = geschlossen.
  const [pruefhinweiseOffen, setPruefhinweiseOffen] = useState(false)

  const sucheAktiv = suchtext.trim() !== ''

  const listeAbfrage = usePersonListe({ sortierung, richtung, seite, proSeite: PRO_SEITE, filter }, { enabled: !sucheAktiv })
  // AP-1.10 PR-A (U-1.6-suche-ohne-filter-sortierung-seite): `abfrage:suche` kennt jetzt dieselben
  // Filter-/Sortier-/Seitenfelder wie `abfrage:person.liste` — Filterleiste und Spaltenkopf-
  // Sortierung bleiben darum auch während einer aktiven Suche wirksam (kein `gesperrt` mehr).
  const sucheAbfrage = useSuche({ text: suchtext, grenze: 500, filter, sortierung, richtung, seite, proSeite: PRO_SEITE }, { enabled: sucheAktiv })
  const pruefhinweiseAbfrage = usePruefhinweise()
  const pruefhinweiseAnzahl = pruefhinweiseAbfrage.data?.anzahl ?? 0

  const aktuelleAbfrage = sucheAktiv ? sucheAbfrage : listeAbfrage
  const ladezustand: DatentabelleLadezustand = aktuelleAbfrage.isError ? 'fehler' : aktuelleAbfrage.isPending ? 'laedt' : 'bereit'

  const zeilen: readonly PersonListeZeile[] = sucheAktiv ? (sucheAbfrage.data?.treffer ?? []) : (listeAbfrage.data?.zeilen ?? [])
  const gesamt = sucheAktiv ? (sucheAbfrage.data?.gesamt ?? 0) : (listeAbfrage.data?.gesamt ?? 0)

  // Suchtext/Filter/Sortierung ändern die Trefferliste — ein Wechsel resettet `seite` direkt am
  // jeweiligen Setter (statt über einen Effekt: `setState` synchron im Effektkörper erzeugt
  // Kaskaden-Rerender, s. react-hooks/set-state-in-effect), sonst bliebe eine Seite jenseits des
  // neuen Endes kommentarlos leer statt auf den (dann wieder gültigen) Anfang zurückzuspringen.
  const suchtextGeaendert = (wert: string) => {
    setSuchtext(wert)
    setSeite(1)
  }

  const filterGeaendert = (naechsterFilter: PersonListeFilter) => {
    setFilter(naechsterFilter)
    setSeite(1)
  }

  const filterZuruecksetzen = () => {
    setFilter(FILTER_STANDARD)
    setSeite(1)
  }

  const sortierungGeaendert = (naechsteSortierung: PersonListeSortierungWert, naechsteRichtung: PersonListeRichtungWert) => {
    setSortierung(naechsteSortierung)
    setRichtung(naechsteRichtung)
    setSeite(1)
  }

  const projektSchliessen = () => {
    void aufrufen('befehl:projekt.schliessen', null).then((ergebnis) => {
      if (ergebnis.ok) {
        aufProjektGeschlossen()
      }
    })
  }

  return (
    <div className="wz-listen-ansicht">
      <header className="wz-listen-ansicht__kopf">
        <Text rolle="titel" als="h1">
          {t('listen_titel')}
        </Text>
        <Text rolle="hilfe" als="span">
          {tAllgemein('start_projekt_geoeffnet', { name: projekt.name })}
        </Text>
        <Schaltflaeche variante="sekundaer" aufKlick={() => setImportOffen(true)}>
          {tImport('einstieg_knopf')}
        </Schaltflaeche>
        <Schaltflaeche variante="unauffaellig" aufKlick={projektSchliessen}>
          {tAllgemein('start_projekt_schliessen_button')}
        </Schaltflaeche>
      </header>

      <div className="wz-listen-ansicht__werkzeuge">
        <Suchfeld wert={suchtext} aufAenderung={suchtextGeaendert} treffer={sucheAktiv && ladezustand === 'bereit' ? gesamt : null} />
        <Filterleiste filter={filter} aufFilterGeaendert={filterGeaendert} aufZuruecksetzen={filterZuruecksetzen} />
      </div>

      <div className="wz-listen-ansicht__spalten" role="group" aria-label={t('spaltenwahl_titel')}>
        <Text rolle="beschriftung" als="span">
          {t('spaltenwahl_titel')}
        </Text>
        {ALLE_DATENTABELLE_SPALTEN.map((spalte) => (
          <div key={spalte} className="wz-listen-ansicht__spalte-eintrag">
            <Umschalter
              zustand={boolZuUmschalterZustand(spalten.includes(spalte))}
              bezeichnung={t(spaltenSchluessel(spalte))}
              aufZustandGeaendert={() => setSpalten((aktuell) => spalteUmschalten(aktuell, spalte))}
            />
            <Text rolle="beschriftung" als="span">
              {t(spaltenSchluessel(spalte))}
            </Text>
          </div>
        ))}
      </div>

      <div className="wz-listen-ansicht__tabelle-bereich">
        <Datentabelle
          zeilen={zeilen}
          gesamt={gesamt}
          spalten={spalten}
          sortierung={sortierung}
          richtung={richtung}
          aufSortierungGeaendert={sortierungGeaendert}
          ladezustand={ladezustand}
          hatAktivenFilter={hatAktivenFilter(filter)}
          aufFilterZuruecksetzen={filterZuruecksetzen}
          ausgewaehltePersonId={geoeffnetePersonId}
          aufZeileAusgewaehlt={setGeoeffnetePersonId}
        />
      </div>

      {/* AP-1.10 PR-A: `abfrage:suche` trägt jetzt `seite`/`proSeite`/`gesamt` wie `abfrage:person.
          liste` — die Blätterleiste bleibt darum auch während einer aktiven Suche sichtbar. */}
      <Blaetterleiste seite={seite} proSeite={PRO_SEITE} gesamt={gesamt} aufSeiteGeaendert={setSeite} />

      {/* AP-1.8 PR-A (F-07), 70_UX_Konzept.md §2: Fußzeile mit den Prüfhinweisen — Klick öffnet die
          Liste (Seitenschublade) mit Sprung zur betroffenen Person. Reine Anzeige: kein Abhaken in
          diesem Paket (Persistenz-Entscheidung offen, docs/80_Offene_Fragen.md). */}
      <footer className="wz-listen-ansicht__fusszeile">
        <Schaltflaeche variante="unauffaellig" aufKlick={() => setPruefhinweiseOffen(true)}>
          {tPruef('fusszeile_anzahl', { count: pruefhinweiseAnzahl })}
        </Schaltflaeche>
      </footer>

      {geoeffnetePersonId === null ? null : <ProfilAnsicht personId={geoeffnetePersonId} aufSchliessen={() => setGeoeffnetePersonId(null)} />}

      {importOffen ? <ImportAssistent aufSchliessen={() => setImportOffen(false)} /> : null}

      {pruefhinweiseOffen ? (
        <Seitenschublade titel={tPruef('liste_titel')} aufSchliessen={() => setPruefhinweiseOffen(false)}>
          {pruefhinweiseAbfrage.isError ? (
            <Text rolle="hilfe" als="p">
              {tPruef('fehler_text')}
            </Text>
          ) : null}
          {pruefhinweiseAbfrage.isPending ? (
            <Text rolle="hilfe" als="p">
              {t('laedt')}
            </Text>
          ) : null}
          {pruefhinweiseAbfrage.isSuccess && pruefhinweiseAbfrage.data.eintraege.length === 0 ? (
            <LeerzustandBlock titel={tPruef('leer_titel')} text={tPruef('leer_text')} />
          ) : null}
          {pruefhinweiseAbfrage.isSuccess && pruefhinweiseAbfrage.data.eintraege.length > 0 ? (
            <ul className="wz-pruefhinweis-liste">
              {pruefhinweiseAbfrage.data.eintraege.map((eintrag, index) => (
                <li key={`${eintrag.personId}-${eintrag.code}-${index}`} className="wz-pruefhinweis-liste__eintrag">
                  <div className="wz-pruefhinweis-liste__text">
                    <Text rolle="koerper" als="span">
                      {eintrag.anzeigename}
                    </Text>
                    <Text rolle="hilfe" als="span">
                      {tPruef(pruefhinweisCodeSchluessel(eintrag.code))}
                    </Text>
                    <PruefhinweisWasTun code={eintrag.code} />
                  </div>
                  <Schaltflaeche
                    variante="sekundaer"
                    aufKlick={() => {
                      setGeoeffnetePersonId(eintrag.personId)
                      setPruefhinweiseOffen(false)
                    }}
                  >
                    {tPruef('sprung_knopf')}
                  </Schaltflaeche>
                </li>
              ))}
            </ul>
          ) : null}
        </Seitenschublade>
      ) : null}
    </div>
  )
}

/** Handlungsanweisung unter dem Hinweistext, nur für Codes, die eine haben (Vorarbeiten AP-1.30
 * Teil 3, E5: `ort_mit_datum`). Gleiche Textrolle wie der Hinweis — kein neuer Baustein. */
function PruefhinweisWasTun({ code }: { readonly code: PruefhinweisEintrag['code'] }) {
  const { t } = useTranslation('pruefhinweise')
  const schluessel = pruefhinweisWasTunSchluessel(code)
  if (schluessel === null) return null
  return (
    <Text rolle="hilfe" als="span">
      {t(schluessel)}
    </Text>
  )
}
