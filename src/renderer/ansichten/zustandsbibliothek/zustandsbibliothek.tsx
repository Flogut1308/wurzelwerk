import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Befund } from '../../../shared/import/imp-codes'
import type { Trockenlaufbericht } from '../../../shared/import/trockenlauf-bericht'
import type { PersonListeDatumsgruppe, PersonListeFilter, PersonListeZeile, SucheTreffer } from '../../../shared/schemata/person-liste'
import type { ArchivTreffer } from '../../../shared/schemata/archiv-suche'
import type { OrtTreffer } from '../../../shared/schemata/ort-suche'
import { Abzeichen, type AbzeichenVariante } from '../../bausteine/abzeichen'
import { Archivfeld } from '../../bausteine/archivfeld'
import { Auswahlfeld, type AuswahlfeldOption } from '../../bausteine/auswahlfeld'
import { BelegAbzeichen } from '../../bausteine/beleg-abzeichen'
import { Blaetterleiste } from '../../bausteine/blaetterleiste'
import { ALLE_DATENTABELLE_SPALTEN } from '../../bausteine/datentabelle-spalten'
import { Datentabelle } from '../../bausteine/datentabelle'
import { Datumsfeld } from '../../bausteine/datumsfeld'
import { Eingabekoerper } from '../../bausteine/eingabekoerper'
import { FehlerlisteImport } from '../../bausteine/fehlerliste-import'
import { FeldKonfidenz } from '../../bausteine/feld-konfidenz'
import { Filterleiste } from '../../bausteine/filterleiste'
import { Fokusring } from '../../bausteine/fokusring'
import { Formularfeld } from '../../bausteine/formularfeld'
import { Fortschritt } from '../../bausteine/fortschritt'
import { Konfidenzwaehler } from '../../bausteine/konfidenzwaehler'
import { Kontrollkaestchen } from '../../bausteine/kontrollkaestchen'
import { KonfidenzPunkt, type KonfidenzStufe } from '../../bausteine/konfidenz-punkt'
import { Ladeschimmer, type LadeschimmerForm } from '../../bausteine/ladeschimmer'
import { Langtextfeld } from '../../bausteine/langtextfeld'
import { LeerzustandBlock } from '../../bausteine/leerzustand-block'
import { Optionsfeld } from '../../bausteine/optionsfeld'
import { Ortsfeld } from '../../bausteine/ortsfeld'
import { Personenwaehler } from '../../bausteine/personenwaehler'
import { Reiterleiste, reiterElementId, reiterInhaltId, type ReiterleisteReiter } from '../../bausteine/reiterleiste'
import { Schaltflaeche, type SchaltflaecheVariante } from '../../bausteine/schaltflaeche'
import { SchaltflaecheSymbol } from '../../bausteine/schaltflaeche-symbol'
import { Schrittleiste } from '../../bausteine/schrittleiste'
import { Seitenschublade } from '../../bausteine/seitenschublade'
import { Suchfeld } from '../../bausteine/suchfeld'
import { Symbol } from '../../bausteine/symbol'
import { Tabellenzeile } from '../../bausteine/tabellenzeile'
import { TastenKappe } from '../../bausteine/tastenkappe'
import { Text, type TextRolle } from '../../bausteine/text'
import { TrockenlaufBericht } from '../../bausteine/trockenlauf-bericht'
import { Trennlinie } from '../../bausteine/trennlinie'
import { Textfeld } from '../../bausteine/textfeld'
import { Umschalter } from '../../bausteine/umschalter'
import { Vorschlagskarte } from '../../bausteine/vorschlagskarte'
import { WiderspruchZeichen } from '../../bausteine/widerspruch-zeichen'
import { Zaehler } from '../../bausteine/zaehler'
import { Zahlfeld } from '../../bausteine/zahlfeld'
import { ZUSTANDSBIBLIOTHEK_EINTRAEGE } from './registrierung'
import './zustandsbibliothek.css'

export interface ZustandsbibliothekProps {
  readonly aufSchliessen: () => void
}

const KONFIDENZ_STUFEN: readonly KonfidenzStufe[] = [1, 2, 3, 4]
const SCHALTFLAECHE_VARIANTEN: readonly SchaltflaecheVariante[] = ['primaer', 'sekundaer', 'unauffaellig', 'gefaehrlich']
const ABZEICHEN_VARIANTEN: readonly AbzeichenVariante[] = ['neutral', 'info', 'erfolg', 'warnung', 'fehler']
const LADESCHIMMER_FORMEN: readonly LadeschimmerForm[] = ['zeile', 'block', 'kreis']
const TEXT_ROLLEN: readonly TextRolle[] = [
  'titel-gross',
  'titel',
  'titel-klein',
  'koerper',
  'koerper-klein',
  'beschriftung',
  'hilfe',
  'original',
  'technisch',
  'zahl-tabelle',
]

/** AP-1.10 PR-A: Beispiel-Datumsgruppe „etwa {{jahr}}" (Modifikator `etwa`, S-05-Beispielzeile
 * „etwa 1890 – 1961"). `sortVon`/`sortBis` sind für die Anzeige irrelevant (der Formatierer liest
 * sie nicht) — hier plausible, aber nicht exakt berechnete Platzhalterwerte. */
function beispielDatumEtwa(jahr: string): PersonListeDatumsgruppe {
  return { kalender: 'gregorian', modifikator: 'etwa', praezision: 'jahr', wert1: jahr, wert2: null, originaltext: null, sortVon: 0, sortBis: 0 }
}

function beispielDatumExakt(jahr: string): PersonListeDatumsgruppe {
  return { kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', wert1: jahr, wert2: null, originaltext: null, sortVon: 0, sortBis: 0 }
}

/** Feste Beispielperson (71 §2.5: „echte Daten, keine Blindtexte") — dieselben Personen aus dem
 * Design-Briefing, hier nur als Anzeigedaten für die Bibliothek, keine Fachlogik. */
function beispielZeile(ueberschreibung: Partial<PersonListeZeile> = {}): PersonListeZeile {
  return {
    person_id: 'tmp:karl-friedrich-gutnoff',
    anzeigename: 'Karl Friedrich Gutnoff',
    geburt_jahr: 1890,
    tod_jahr: 1961,
    geburt_ort_name: 'Marienwerder',
    konfidenz_min: 3,
    hat_widerspruch: false,
    ist_platzhalter: false,
    beruf: 'Schreinermeister',
    belegzahl: 3,
    kinderzahl: 2,
    geburt_datum: beispielDatumEtwa('1890'),
    tod_datum: beispielDatumExakt('1961'),
    ...ueberschreibung,
  }
}

const BEISPIEL_ZEILEN: readonly PersonListeZeile[] = [
  beispielZeile(),
  beispielZeile({
    person_id: 'tmp:emma-wruck',
    anzeigename: 'Emma Wruck',
    geburt_jahr: 1895,
    tod_jahr: 1970,
    konfidenz_min: 4,
    hat_widerspruch: true,
    beruf: 'Hebamme',
    belegzahl: 1,
    kinderzahl: 4,
    geburt_datum: beispielDatumExakt('1895'),
    tod_datum: beispielDatumExakt('1970'),
  }),
  beispielZeile({
    person_id: 'tmp:vater-august',
    anzeigename: '',
    geburt_jahr: null,
    tod_jahr: null,
    geburt_ort_name: null,
    konfidenz_min: null,
    ist_platzhalter: true,
    beruf: null,
    belegzahl: 0,
    kinderzahl: 0,
    geburt_datum: null,
    tod_datum: null,
  }),
]

/** `abfrage:suche`-Treffer (§3.3) — dieselben Beispielpersonen wie `BEISPIEL_ZEILEN`, nur mit der
 * zusätzlichen `quelle` (Volltext/Phonetik, `src/shared/schemata/person-liste.ts`). */
const BEISPIEL_SUCHTREFFER: readonly SucheTreffer[] = [
  { ...beispielZeile(), quelle: 'volltext' },
  {
    ...beispielZeile({
      person_id: 'tmp:emma-wruck',
      anzeigename: 'Emma Wruck',
      geburt_jahr: 1895,
      tod_jahr: 1970,
      konfidenz_min: 4,
      beruf: 'Hebamme',
      belegzahl: 1,
      kinderzahl: 4,
      geburt_datum: beispielDatumExakt('1895'),
      tod_datum: beispielDatumExakt('1970'),
    }),
    quelle: 'phonetik',
  },
]

/** `abfrage:ort.suche`-Treffer (§3.2, AP-1.13 PR-C) — bewusst NUR `id`/`anzeigename` (die minimale
 * Ortssuche fürs `Ortsfeld`, s. Kopfkommentar `ortsfeld-logik.ts`). `politischeKette: []` (AP-1.16
 * PR-C) hält dieses erfasste Motiv (`zustandsbibliothek-*.png`) bewusst UNVERÄNDERT — die neue
 * Hierarchiezeile im `Ortsfeld` rendert nur bei einer NICHT-leeren Kette. */
const BEISPIEL_ORT_TREFFER: readonly OrtTreffer[] = [
  { id: 'tmp:marienwerder', anzeigename: 'Marienwerder', politischeKette: [] },
  { id: 'tmp:kwidzyn', anzeigename: 'Kwidzyn', politischeKette: [] },
]

/** `abfrage:archiv.suche`-Treffer (AP-1.17 PR-C1, `Archivfeld`) — analog `BEISPIEL_ORT_TREFFER`. */
const BEISPIEL_ARCHIV_TREFFER: readonly ArchivTreffer[] = [
  { id: 'tmp:landesarchiv-berlin', name: 'Landesarchiv Berlin' },
  { id: 'tmp:staatsarchiv-danzig', name: 'Staatsarchiv Danzig' },
]

const BEISPIEL_FILTER: PersonListeFilter = { platzhalter: 'alle', privat: 'alle', nurWiderspruch: false }

const BEISPIEL_BEFUND: Befund = {
  schweregrad: 'fehler',
  code: 'IMP-206',
  pfad: '$.personen[3].name',
  kennung: 'db:example-1',
  datei: 'beispiel.json',
  zeile: 42,
}

const BEISPIEL_BERICHT: Trockenlaufbericht = {
  zusammenfassung: {
    datei: 'beispiel.json',
    vertragErzeugtAm: '2026-09-18T10:00:00.000Z',
    vertragWerkzeug: 'wurzelwerk-import-beispiel',
    pruefsummeQuelltext: 'sha256:abcdef',
    bereitsImportiertAm: null,
    fehlerAnzahl: 1,
    hinweisAnzahl: 1,
    geaenderteZeilenAnzahl: 12,
    ruecknahmeArt: 'undo',
  },
  wirdAngelegt: [{ tabelle: 'person', anzahl: 2 }],
  wirdErgaenzt: [{ subjektKennung: 'db:example-1', praedikat: 'beruf', wertText: 'Schmied', wertZahl: null, istKonflikt: false }],
  moeglicheDubletten: [{ neueKennung: 'tmp:emma-wruck', bestehendeKennung: 'db:example-1', punktwert: 0.8, begruendung: 'Name und Geburtsjahr stimmen überein' }],
  fehler: [BEISPIEL_BEFUND],
  hinweise: [{ ...BEISPIEL_BEFUND, schweregrad: 'hinweis', code: 'IMP-301' }],
  nichtVerarbeitetesMaterial: [{ text: 'Zettel mit unleserlicher Notiz', warum: 'Kein erkennbares Feld' }],
  gesundheitsdaten: { diagnosenAnzahl: 0, risikofaktorenAnzahl: 0 },
  importGesperrt: true,
}

/** Ein Abschnitt mit Überschrift — reine Gliederung, keine eigene Fachlogik. */
function Abschnitt({ name, children }: { readonly name: string; readonly children: ReactNode }) {
  const { t } = useTranslation('zustandsbibliothek')
  return (
    <section className="wz-zb__abschnitt" aria-labelledby={`wz-zb-${name}`}>
      <Text rolle="titel-klein" als="h3" id={`wz-zb-${name}`}>
        {t(`bausteine.${name}`)}
      </Text>
      <div className="wz-zb__reihe">{children}</div>
    </section>
  )
}

/**
 * `Zustandsbibliothek` — Entwicklerseite (72_Screens_und_Flows.md S-19, AP-1.11): zeigt jedes Atom
 * und Molekül aus `ZUSTANDSBIBLIOTHEK_EINTRAEGE` in seinen dokumentierten Varianten/Zuständen, dazu
 * die fünf Leerzustände, drei Ladeschimmer und vier Fehlerzustände aus S-19. Werkzeug, kein
 * Feature: keine Übersetzung der Beispieltexte nötig (Auftragstext), aber JSX-Text-Literale sind
 * trotzdem über i18n geführt (ADR-011/`react/jsx-no-literals` kennt keine Ausnahme für Werkzeuge).
 * Nur erreichbar über den `!app.isPackaged`-Menüpunkt „Entwicklung → Zustandsbibliothek"
 * (`src/main/menue/menue.ts`) — im ausgelieferten Paket existiert diese Ansicht nicht.
 */
export function Zustandsbibliothek({ aufSchliessen }: ZustandsbibliothekProps) {
  const { t } = useTranslation('zustandsbibliothek')
  // AP-1.30 PR 6 — Zustandsfolge wie Artboard 1a: aktiv ohne Zähler, zwei mit Zähler, einer mit
  // Zähler UND Punkt, einer nur mit Punkt.
  const beispielReiter: readonly ReiterleisteReiter[] = [
    { id: 'person', beschriftung: t('beispiel_reiter_person') },
    { id: 'namen', beschriftung: t('beispiel_reiter_namen'), anzahl: 3 },
    { id: 'leben', beschriftung: t('beispiel_reiter_leben'), anzahl: 4 },
    { id: 'beziehungen', beschriftung: t('beispiel_reiter_beziehungen'), anzahl: 5, offenerPunkt: true },
    { id: 'notizen', beschriftung: t('beispiel_reiter_notizen'), offenerPunkt: true },
  ]

  return (
    <div className="wz-zb" data-testid="wz-zustandsbibliothek">
      <header className="wz-zb__kopf">
        <Text rolle="titel" als="h1">
          {t('titel')}
        </Text>
        <Text rolle="hilfe" als="p">
          {t('untertitel')}
        </Text>
        <Schaltflaeche variante="sekundaer" aufKlick={aufSchliessen}>
          {t('schliessen')}
        </Schaltflaeche>
      </header>

      <Text rolle="titel-klein" als="h2">
        {t('abschnitt_atome')}
      </Text>

      <Abschnitt name="text">
        {TEXT_ROLLEN.map((rolle) => (
          <Text key={rolle} rolle={rolle}>
            {t(`bausteine.text`)}
          </Text>
        ))}
      </Abschnitt>

      <Abschnitt name="symbol">
        {(['geburt', 'trauung', 'widerspruch', 'caret-up'] as const).map((name) => (
          <span key={name} className="wz-zb__symbolProbe">
            <Symbol name={name} groesse={16} />
            <Symbol name={name} groesse={20} />
            <Symbol name={name} groesse={24} />
            <Symbol name={name} gewicht="fill" groesse={24} />
          </span>
        ))}
      </Abschnitt>

      <Abschnitt name="schaltflaeche">
        {SCHALTFLAECHE_VARIANTEN.map((variante) => (
          <Schaltflaeche key={variante} variante={variante}>
            {t(`variante_${variante}`)}
          </Schaltflaeche>
        ))}
        <Schaltflaeche variante="sekundaer" gesperrt>
          {t('zustand_gesperrt')}
        </Schaltflaeche>
        <Schaltflaeche variante="sekundaer" ladend>
          {t('zustand_ladend')}
        </Schaltflaeche>
      </Abschnitt>

      <Abschnitt name="schaltflaeche-symbol">
        {SCHALTFLAECHE_VARIANTEN.map((variante) => (
          <SchaltflaecheSymbol key={variante} name="funnel" variante={variante} beschriftung={t(`variante_${variante}`)} />
        ))}
        <SchaltflaecheSymbol name="funnel" beschriftung={t('zustand_gesperrt')} gesperrt />
        <SchaltflaecheSymbol name="funnel" beschriftung={t('zustand_ladend')} ladend />
      </Abschnitt>

      <Abschnitt name="eingabekoerper">
        <Eingabekoerper wert="" aufAenderung={() => {}} platzhalter={t('beispiel_suchfeld_platzhalter')} />
        <Eingabekoerper wert={t('beispiel_person_karl')} aufAenderung={() => {}} />
        <Eingabekoerper wert={t('beispiel_person_karl')} aufAenderung={() => {}} ungueltig />
        <Eingabekoerper wert={t('beispiel_person_karl')} aufAenderung={() => {}} gesperrt />
        <Eingabekoerper wert={t('beispiel_person_karl')} aufAenderung={() => {}} nurLesen />
      </Abschnitt>

      <Abschnitt name="abzeichen">
        {ABZEICHEN_VARIANTEN.map((variante) => (
          <Abzeichen key={variante} variante={variante}>
            {t(`variante_${variante}`)}
          </Abzeichen>
        ))}
      </Abschnitt>

      <Abschnitt name="konfidenz-punkt">
        {KONFIDENZ_STUFEN.map((stufe) => (
          <KonfidenzPunkt key={stufe} stufe={stufe} />
        ))}
      </Abschnitt>

      <Abschnitt name="widerspruch-zeichen">
        <WiderspruchZeichen />
        <WiderspruchZeichen ungeloest />
      </Abschnitt>

      <Abschnitt name="trennlinie">
        <Trennlinie ausrichtung="waagerecht" />
        <span className="wz-zb__senkrecht">
          <Trennlinie ausrichtung="senkrecht" />
        </span>
      </Abschnitt>

      <Abschnitt name="fokusring">
        <Fokusring />
      </Abschnitt>

      <Abschnitt name="ladeschimmer">
        {LADESCHIMMER_FORMEN.map((form) => (
          <Ladeschimmer key={form} form={form} />
        ))}
      </Abschnitt>

      <Abschnitt name="tastenkappe">
        <TastenKappe segmente={['⌘', 'K']} />
        <TastenKappe segmente={['Ctrl', 'K']} />
      </Abschnitt>

      <Abschnitt name="zaehler">
        <Zaehler anzahl={0} />
        <Zaehler anzahl={12} />
        <Zaehler anzahl={1284} />
      </Abschnitt>

      <Abschnitt name="umschalter">
        <Umschalter zustand="ein" bezeichnung={t('zustand_ein')} aufZustandGeaendert={() => {}} />
        <Umschalter zustand="aus" bezeichnung={t('zustand_aus')} aufZustandGeaendert={() => {}} />
        <Umschalter zustand="unbestimmt" bezeichnung={t('zustand_unbestimmt')} aufZustandGeaendert={() => {}} />
        <Umschalter zustand="aus" bezeichnung={t('zustand_gesperrt')} gesperrt aufZustandGeaendert={() => {}} />
      </Abschnitt>

      <Abschnitt name="kontrollkaestchen">
        <Kontrollkaestchen zustand="ein" bezeichnung={t('zustand_ein')} aufAenderung={() => {}} />
        <Kontrollkaestchen zustand="aus" bezeichnung={t('zustand_aus')} aufAenderung={() => {}} />
        <Kontrollkaestchen zustand="unbestimmt" bezeichnung={t('zustand_unbestimmt')} aufAenderung={() => {}} />
        <Kontrollkaestchen zustand="aus" bezeichnung={t('zustand_gesperrt')} gesperrt aufAenderung={() => {}} />
      </Abschnitt>

      <Abschnitt name="optionsfeld">
        <Optionsfeld zustand="ein" bezeichnung={t('zustand_ein')} aufAenderung={() => {}} />
        <Optionsfeld zustand="aus" bezeichnung={t('zustand_aus')} aufAenderung={() => {}} />
        <Optionsfeld zustand="unbestimmt" bezeichnung={t('zustand_unbestimmt')} aufAenderung={() => {}} />
        <Optionsfeld zustand="aus" bezeichnung={t('zustand_gesperrt')} gesperrt aufAenderung={() => {}} />
      </Abschnitt>

      <Abschnitt name="fortschritt">
        <Fortschritt art="bestimmt" prozent={30} bezeichnung={t('bausteine.fortschritt')} />
        <Fortschritt art="unbestimmt" bezeichnung={t('bausteine.fortschritt')} />
      </Abschnitt>

      <Text rolle="titel-klein" als="h2">
        {t('abschnitt_molekuele')}
      </Text>

      <Abschnitt name="formularfeld">
        <Formularfeld beschriftung={t('beispiel_formularfeld_beschriftung')} hilfetext={t('beispiel_formularfeld_hilfetext')}>
          <Textfeld wert="" aufAenderung={() => {}} />
        </Formularfeld>
        <Formularfeld beschriftung={t('beispiel_formularfeld_beschriftung')} fehlertext={t('beispiel_formularfeld_fehlertext')}>
          <Textfeld wert={t('beispiel_geburtsjahr')} aufAenderung={() => {}} ungueltig />
        </Formularfeld>
        <Formularfeld
          beschriftung={t('beispiel_formularfeld_beschriftung')}
          konfidenzwaehler={<Konfidenzwaehler wert={3} aufAenderung={() => {}} ariaLabel={t('beispiel_konfidenzwaehler_beschriftung')} />}
          belegabzeichen={<BelegAbzeichen anzahl={2} />}
        >
          <Textfeld wert={t('beispiel_geburtsjahr')} aufAenderung={() => {}} />
        </Formularfeld>
        <Formularfeld beschriftung={t('beispiel_formularfeld_beschriftung')} gesperrt belegabzeichen={<BelegAbzeichen anzahl={2} />}>
          <Textfeld wert={t('beispiel_geburtsjahr')} aufAenderung={() => {}} gesperrt />
        </Formularfeld>
      </Abschnitt>

      <Abschnitt name="konfidenzwaehler">
        <Konfidenzwaehler wert={null} aufAenderung={() => {}} ariaLabel={t('beispiel_konfidenzwaehler_beschriftung')} />
        <Konfidenzwaehler wert={1} aufAenderung={() => {}} ariaLabel={t('beispiel_konfidenzwaehler_beschriftung')} />
        <Konfidenzwaehler wert={4} aufAenderung={() => {}} ariaLabel={t('beispiel_konfidenzwaehler_beschriftung')} />
        <Konfidenzwaehler wert={2} aufAenderung={() => {}} ariaLabel={t('beispiel_konfidenzwaehler_beschriftung')} gesperrt />
      </Abschnitt>

      <Abschnitt name="textfeld">
        <Textfeld wert="" aufAenderung={() => {}} platzhalter={t('beispiel_suchfeld_platzhalter')} ariaLabel={t('beispiel_person_karl')} />
        <Textfeld wert={t('beispiel_person_karl')} aufAenderung={() => {}} ariaLabel={t('beispiel_person_karl')} />
        <Textfeld wert={t('beispiel_person_karl')} aufAenderung={() => {}} ariaLabel={t('beispiel_person_karl')} ungueltig />
        <Textfeld wert={t('beispiel_person_karl')} aufAenderung={() => {}} ariaLabel={t('beispiel_person_karl')} gesperrt />
        <Textfeld wert={t('beispiel_person_karl')} aufAenderung={() => {}} ariaLabel={t('beispiel_person_karl')} nurLesen />
      </Abschnitt>

      <Abschnitt name="zahlfeld">
        <Zahlfeld wert={t('beispiel_geburtsjahr')} aufAenderung={() => {}} ariaLabel={t('beispiel_geburtsjahr')} />
        <Zahlfeld wert={t('beispiel_geburtsjahr')} aufAenderung={() => {}} ariaLabel={t('beispiel_geburtsjahr')} ungueltig />
        <Zahlfeld wert={t('beispiel_geburtsjahr')} aufAenderung={() => {}} ariaLabel={t('beispiel_geburtsjahr')} gesperrt />
      </Abschnitt>

      <Abschnitt name="langtextfeld">
        <Langtextfeld wert={t('beispiel_notiz')} aufAenderung={() => {}} ariaLabel={t('beispiel_notiz')} />
        <Langtextfeld wert={t('beispiel_notiz')} aufAenderung={() => {}} ariaLabel={t('beispiel_notiz')} gesperrt />
      </Abschnitt>

      <Abschnitt name="datumsfeld">
        <Datumsfeld
          text=""
          aufAenderung={() => {}}
          kalender="gregorian"
          aufKalenderAenderung={() => {}}
          kalenderErweitert={false}
          aufKalenderErweitertAenderung={() => {}}
          ariaLabel={t('beispiel_formularfeld_beschriftung')}
        />
        <Datumsfeld
          text="um 1890"
          aufAenderung={() => {}}
          kalender="gregorian"
          aufKalenderAenderung={() => {}}
          kalenderErweitert={false}
          aufKalenderErweitertAenderung={() => {}}
          ariaLabel={t('beispiel_formularfeld_beschriftung')}
        />
        <Datumsfeld
          text="zwischen 1750 und 1760"
          aufAenderung={() => {}}
          kalender="gregorian"
          aufKalenderAenderung={() => {}}
          kalenderErweitert={false}
          aufKalenderErweitertAenderung={() => {}}
          ariaLabel={t('beispiel_formularfeld_beschriftung')}
        />
        <Datumsfeld
          text="31.02.1900"
          aufAenderung={() => {}}
          kalender="gregorian"
          aufKalenderAenderung={() => {}}
          kalenderErweitert={false}
          aufKalenderErweitertAenderung={() => {}}
          ariaLabel={t('beispiel_formularfeld_beschriftung')}
        />
        <Datumsfeld
          text="1750/51"
          aufAenderung={() => {}}
          kalender="gregorian"
          aufKalenderAenderung={() => {}}
          kalenderErweitert
          aufKalenderErweitertAenderung={() => {}}
          ariaLabel={t('beispiel_formularfeld_beschriftung')}
        />
        <Datumsfeld
          text={t('beispiel_geburtsjahr')}
          aufAenderung={() => {}}
          kalender="gregorian"
          aufKalenderAenderung={() => {}}
          kalenderErweitert={false}
          aufKalenderErweitertAenderung={() => {}}
          ariaLabel={t('beispiel_formularfeld_beschriftung')}
          gesperrt
        />
      </Abschnitt>

      <Abschnitt name="auswahlfeld">
        <Auswahlfeld
          wert="alle"
          optionen={
            [
              { wert: 'alle', beschriftung: t('beispiel_filter_konfidenz_alle') },
              { wert: '1', beschriftung: t('beispiel_filter_konfidenz_ab_1') },
            ] satisfies readonly AuswahlfeldOption<'alle' | '1'>[]
          }
          aufAenderung={() => {}}
          ariaLabel={t('beispiel_konfidenzwaehler_beschriftung')}
        />
        <Auswahlfeld
          wert="alle"
          optionen={
            [{ wert: 'alle', beschriftung: t('beispiel_filter_konfidenz_alle') }] satisfies readonly AuswahlfeldOption<'alle'>[]
          }
          aufAenderung={() => {}}
          ariaLabel={t('beispiel_konfidenzwaehler_beschriftung')}
          gesperrt
        />
      </Abschnitt>

      <Abschnitt name="beleg-abzeichen">
        <BelegAbzeichen anzahl={0} />
        <BelegAbzeichen anzahl={3} aufKlick={() => {}} />
      </Abschnitt>

      <Abschnitt name="blaetterleiste">
        <Blaetterleiste seite={2} proSeite={20} gesamt={284} aufSeiteGeaendert={() => {}} />
      </Abschnitt>

      <Abschnitt name="feld-konfidenz">
        <FeldKonfidenz konfidenz={3} belegzahl={2} hatKonkurrierende={false} hatWiderspruch={false} aufBelegKlick={() => {}} aufWiderspruchKlick={() => {}} />
        <FeldKonfidenz konfidenz={2} belegzahl={1} hatKonkurrierende aufWiderspruchKlick={() => {}} hatWiderspruch={false} aufBelegKlick={() => {}} />
        <FeldKonfidenz konfidenz={1} belegzahl={0} hatKonkurrierende hatWiderspruch aufBelegKlick={() => {}} aufWiderspruchKlick={() => {}} />
      </Abschnitt>

      <Abschnitt name="filterleiste">
        <Filterleiste filter={BEISPIEL_FILTER} aufFilterGeaendert={() => {}} aufZuruecksetzen={() => {}} />
      </Abschnitt>

      <Abschnitt name="suchfeld">
        <Suchfeld wert="" aufAenderung={() => {}} treffer={null} />
        <Suchfeld wert="Wruck" aufAenderung={() => {}} treffer={4} />
        <Suchfeld wert="Wruck" aufAenderung={() => {}} treffer={4} gesperrt />
      </Abschnitt>

      <Abschnitt name="tabellenzeile">
        <div role="table">
          <div role="rowgroup">
            <Tabellenzeile zeile={BEISPIEL_ZEILEN[0] ?? beispielZeile()} spalten={ALLE_DATENTABELLE_SPALTEN} />
            <Tabellenzeile zeile={BEISPIEL_ZEILEN[1] ?? beispielZeile()} spalten={ALLE_DATENTABELLE_SPALTEN} ausgewaehlt aufAusgewaehlt={() => {}} />
            <Tabellenzeile zeile={BEISPIEL_ZEILEN[2] ?? beispielZeile()} spalten={ALLE_DATENTABELLE_SPALTEN} />
          </div>
        </div>
      </Abschnitt>

      <Abschnitt name="leerzustand-block">
        <LeerzustandBlock symbol="tray" titel={t('leer_keinInhalt_titel')} text={t('leer_keinInhalt_text')} />
        <LeerzustandBlock
          symbol="funnel"
          titel={t('leer_gefiltert_titel')}
          text={t('leer_gefiltert_text')}
          aktion={{ beschriftung: t('leer_gefiltert_aktion'), aufKlick: () => {} }}
        />
      </Abschnitt>

      <Abschnitt name="schrittleiste">
        <Schrittleiste
          aktiv={1}
          schritte={[{ beschriftung: t('beispiel_schritt_1') }, { beschriftung: t('beispiel_schritt_2') }, { beschriftung: t('beispiel_schritt_3') }]}
        />
      </Abschnitt>

      <Abschnitt name="seitenschublade">
        <div className="wz-zb__seitenschubladeProbe">
          <Seitenschublade titel={t('beispiel_seitenschublade_titel')} aufSchliessen={() => {}}>
            <Text rolle="koerper">{t('beispiel_seitenschublade_inhalt')}</Text>
          </Seitenschublade>
        </div>
      </Abschnitt>

      <Abschnitt name="fehlerliste-import">
        <FehlerlisteImport befunde={[BEISPIEL_BEFUND]} gruppierung="code" />
      </Abschnitt>

      <Abschnitt name="trockenlauf-bericht">
        <TrockenlaufBericht bericht={BEISPIEL_BERICHT} />
      </Abschnitt>

      <Abschnitt name="datentabelle">
        <div className="wz-zb__datentabelleProbe">
          <Datentabelle
            zeilen={BEISPIEL_ZEILEN}
            gesamt={BEISPIEL_ZEILEN.length}
            spalten={ALLE_DATENTABELLE_SPALTEN}
            sortierung="nachname"
            richtung="auf"
            aufSortierungGeaendert={() => {}}
            ladezustand="bereit"
            hatAktivenFilter={false}
          />
        </div>
        <div className="wz-zb__datentabelleProbe">
          <Datentabelle
            zeilen={[]}
            gesamt={0}
            spalten={ALLE_DATENTABELLE_SPALTEN}
            sortierung="nachname"
            richtung="auf"
            aufSortierungGeaendert={() => {}}
            ladezustand="laedt"
            hatAktivenFilter={false}
          />
        </div>
        <div className="wz-zb__datentabelleProbe">
          <Datentabelle
            zeilen={[]}
            gesamt={0}
            spalten={ALLE_DATENTABELLE_SPALTEN}
            sortierung="nachname"
            richtung="auf"
            aufSortierungGeaendert={() => {}}
            ladezustand="fehler"
            hatAktivenFilter={false}
          />
        </div>
      </Abschnitt>

      <Abschnitt name="vorschlagskarte">
        <Vorschlagskarte zustand="vorschlag" originalwortlaut={t('beispiel_vorschlagskarte_original')} aufBestaetigen={() => {}} aufVerwerfen={() => {}}>
          <Text rolle="koerper">{t('beispiel_vorschlagskarte_inhalt')}</Text>
        </Vorschlagskarte>
        <Vorschlagskarte zustand="bestaetigt" originalwortlaut={t('beispiel_vorschlagskarte_original')}>
          <Text rolle="koerper">{t('beispiel_vorschlagskarte_inhalt')}</Text>
        </Vorschlagskarte>
        <Vorschlagskarte zustand="verworfen" originalwortlaut={t('beispiel_vorschlagskarte_original')} aufWiederherstellen={() => {}}>
          <Text rolle="koerper">{t('beispiel_vorschlagskarte_inhalt')}</Text>
        </Vorschlagskarte>
      </Abschnitt>

      {/* AP-1.13 PR-B (docs/71 §3.3): leer · tippend (lädt) · Treffer (mit hervorgehobener Zeile) ·
          kein Treffer · Platzhalter-Zeile (letzte Zeile "als Platzhalter anlegen" hervorgehoben). */}
      <Abschnitt name="personenwaehler">
        <Personenwaehler
          text=""
          zustand="leer"
          treffer={[]}
          hervorgehobenerIndex={null}
          aufAenderung={() => {}}
          aufAusgewaehlt={() => {}}
          aufNeuAnlegen={() => {}}
          aufPlatzhalterAnlegen={() => {}}
          ariaLabel={t('beispiel_personenwaehler_beschriftung')}
        />
        <Personenwaehler
          text="Wr"
          zustand="laedt"
          treffer={[]}
          hervorgehobenerIndex={null}
          aufAenderung={() => {}}
          aufAusgewaehlt={() => {}}
          aufNeuAnlegen={() => {}}
          aufPlatzhalterAnlegen={() => {}}
          ariaLabel={t('beispiel_personenwaehler_beschriftung')}
        />
        <Personenwaehler
          text="Wr"
          zustand="bereit"
          treffer={BEISPIEL_SUCHTREFFER}
          hervorgehobenerIndex={0}
          aufAenderung={() => {}}
          aufAusgewaehlt={() => {}}
          aufNeuAnlegen={() => {}}
          aufPlatzhalterAnlegen={() => {}}
          ariaLabel={t('beispiel_personenwaehler_beschriftung')}
        />
        <Personenwaehler
          text="Xyz"
          zustand="bereit"
          treffer={[]}
          hervorgehobenerIndex={null}
          aufAenderung={() => {}}
          aufAusgewaehlt={() => {}}
          aufNeuAnlegen={() => {}}
          aufPlatzhalterAnlegen={() => {}}
          ariaLabel={t('beispiel_personenwaehler_beschriftung')}
        />
        <Personenwaehler
          text="Wr"
          zustand="bereit"
          treffer={BEISPIEL_SUCHTREFFER}
          hervorgehobenerIndex={BEISPIEL_SUCHTREFFER.length + 1}
          aufAenderung={() => {}}
          aufAusgewaehlt={() => {}}
          aufNeuAnlegen={() => {}}
          aufPlatzhalterAnlegen={() => {}}
          ariaLabel={t('beispiel_personenwaehler_beschriftung')}
        />
      </Abschnitt>

      {/* AP-1.13 PR-C (docs/71 §3.2): leer · tippend (lädt) · Treffer (mit hervorgehobener Zeile) ·
          kein Treffer (nur die Schlusszeile "neu anlegen") — dieselben vier Zustände wie
          `personenwaehler` oben, ohne das Platzhalter-Äquivalent (Orte kennen keine Platzhalter). */}
      <Abschnitt name="ortsfeld">
        <Ortsfeld
          text=""
          zustand="leer"
          treffer={[]}
          hervorgehobenerIndex={null}
          aufAenderung={() => {}}
          aufAusgewaehlt={() => {}}
          aufNeuAnlegen={() => {}}
          ariaLabel={t('beispiel_ortsfeld_beschriftung')}
        />
        <Ortsfeld
          text="Marienw"
          zustand="laedt"
          treffer={[]}
          hervorgehobenerIndex={null}
          aufAenderung={() => {}}
          aufAusgewaehlt={() => {}}
          aufNeuAnlegen={() => {}}
          ariaLabel={t('beispiel_ortsfeld_beschriftung')}
        />
        <Ortsfeld
          text="Marienw"
          zustand="bereit"
          treffer={BEISPIEL_ORT_TREFFER}
          hervorgehobenerIndex={0}
          aufAenderung={() => {}}
          aufAusgewaehlt={() => {}}
          aufNeuAnlegen={() => {}}
          ariaLabel={t('beispiel_ortsfeld_beschriftung')}
        />
        <Ortsfeld
          text="Xyz"
          zustand="bereit"
          treffer={[]}
          hervorgehobenerIndex={null}
          aufAenderung={() => {}}
          aufAusgewaehlt={() => {}}
          aufNeuAnlegen={() => {}}
          ariaLabel={t('beispiel_ortsfeld_beschriftung')}
        />
        <Ortsfeld
          text="Marienw"
          zustand="bereit"
          treffer={BEISPIEL_ORT_TREFFER}
          hervorgehobenerIndex={BEISPIEL_ORT_TREFFER.length}
          aufAenderung={() => {}}
          aufAusgewaehlt={() => {}}
          aufNeuAnlegen={() => {}}
          ariaLabel={t('beispiel_ortsfeld_beschriftung')}
        />
      </Abschnitt>

      {/* AP-1.17 PR-C1: dieselben vier Zustände wie `ortsfeld` oben — dritte Instanz desselben
          Musters (Eingabekörper + Vorschlagsliste + feste Schlusszeile), hier an `Archiv` statt
          `Ort` gebunden. */}
      <Abschnitt name="archivfeld">
        <Archivfeld
          text=""
          zustand="leer"
          treffer={[]}
          hervorgehobenerIndex={null}
          aufAenderung={() => {}}
          aufAusgewaehlt={() => {}}
          aufNeuAnlegen={() => {}}
          ariaLabel={t('beispiel_archivfeld_beschriftung')}
        />
        <Archivfeld
          text="Landesar"
          zustand="laedt"
          treffer={[]}
          hervorgehobenerIndex={null}
          aufAenderung={() => {}}
          aufAusgewaehlt={() => {}}
          aufNeuAnlegen={() => {}}
          ariaLabel={t('beispiel_archivfeld_beschriftung')}
        />
        <Archivfeld
          text="Landesar"
          zustand="bereit"
          treffer={BEISPIEL_ARCHIV_TREFFER}
          hervorgehobenerIndex={0}
          aufAenderung={() => {}}
          aufAusgewaehlt={() => {}}
          aufNeuAnlegen={() => {}}
          ariaLabel={t('beispiel_archivfeld_beschriftung')}
        />
        <Archivfeld
          text="Xyz"
          zustand="bereit"
          treffer={[]}
          hervorgehobenerIndex={null}
          aufAenderung={() => {}}
          aufAusgewaehlt={() => {}}
          aufNeuAnlegen={() => {}}
          ariaLabel={t('beispiel_archivfeld_beschriftung')}
        />
        <Archivfeld
          text="Landesar"
          zustand="bereit"
          treffer={BEISPIEL_ARCHIV_TREFFER}
          hervorgehobenerIndex={BEISPIEL_ARCHIV_TREFFER.length}
          aufAenderung={() => {}}
          aufAusgewaehlt={() => {}}
          aufNeuAnlegen={() => {}}
          ariaLabel={t('beispiel_archivfeld_beschriftung')}
        />
      </Abschnitt>

      {/* AP-1.30 PR 6: `Reiterleiste` (71 §2.2 „Reiter", Artboard 1a). Eine Leiste zeigt alle
          Reiterzustände nebeneinander: aktiv („Person"), inaktiv, mit Zähler („Namen", „Leben"),
          mit Zähler und Punkt („Beziehungen"), nur mit Punkt („Notizen"). Die zweite Leiste zeigt
          den Fokuszustand als Anschauungsstück (wie `Fokusring`: ein Screenshot hat keinen echten
          Fokus) — `wz-zb__fokusProbe` legt denselben Ring an den aktiven Reiter. */}
      <Abschnitt name="reiterleiste">
        <div className="wz-zb__reiterProbe">
          <Reiterleiste
            idPraefix="wz-zb-reiter"
            beschriftung={t('beispiel_reiterleiste_beschriftung')}
            reiter={beispielReiter}
            aktiv="person"
            aufWechsel={() => {}}
          />
          <div role="tabpanel" id={reiterInhaltId('wz-zb-reiter', 'person')} aria-labelledby={reiterElementId('wz-zb-reiter', 'person')}>
            <Text rolle="hilfe">{t('beispiel_reiter_inhalt')}</Text>
          </div>
        </div>
        <div className="wz-zb__reiterProbe wz-zb__fokusProbe">
          <Reiterleiste
            idPraefix="wz-zb-reiter-fokus"
            beschriftung={t('beispiel_reiterleiste_fokus')}
            reiter={beispielReiter}
            aktiv="namen"
            aufWechsel={() => {}}
          />
          <div role="tabpanel" id={reiterInhaltId('wz-zb-reiter-fokus', 'namen')} aria-labelledby={reiterElementId('wz-zb-reiter-fokus', 'namen')}>
            <Text rolle="hilfe">{t('beispiel_reiterleiste_fokus')}</Text>
          </div>
        </div>
      </Abschnitt>

      <Text rolle="titel-klein" als="h2" id="wz-zb-leerzustaende">
        {t('abschnitt_leerzustaende')}
      </Text>
      <div className="wz-zb__reihe">
        <LeerzustandBlock symbol="tray" titel={t('leer_keinInhalt_titel')} text={t('leer_keinInhalt_text')} />
        <LeerzustandBlock
          symbol="funnel"
          titel={t('leer_gefiltert_titel')}
          text={t('leer_gefiltert_text')}
          aktion={{ beschriftung: t('leer_gefiltert_aktion'), aufKlick: () => {} }}
        />
        <LeerzustandBlock symbol="warning-circle" titel={t('leer_fehler_titel')} text={t('leer_fehler_text')} />
        <LeerzustandBlock symbol="tray" titel={t('leer_zuVieleDaten_titel')} text={t('leer_zuVieleDaten_text')} />
        <LeerzustandBlock symbol="warning-circle" titel={t('leer_nichtGefunden_titel')} text={t('leer_nichtGefunden_text')} />
      </div>

      <Text rolle="titel-klein" als="h2" id="wz-zb-ladezustaende">
        {t('abschnitt_ladezustaende')}
      </Text>
      <div className="wz-zb__reihe">
        <Ladeschimmer form="zeile" />
        <Ladeschimmer form="block" />
        <Ladeschimmer form="kreis" />
      </div>

      <Text rolle="titel-klein" als="h2" id="wz-zb-fehlerzustaende">
        {t('abschnitt_fehlerzustaende')}
      </Text>
      <div className="wz-zb__reihe wz-zb__reihe--spalte">
        <div>
          <Eingabekoerper wert="1850" aufAenderung={() => {}} ungueltig ariaLabel={t('fehler_feld_titel')} />
          <Text rolle="hilfe" farbe="akzent">
            {t('fehler_feld_hilfetext')}
          </Text>
        </div>
        <LeerzustandBlock symbol="warning-circle" titel={t('fehler_bereich_titel')} text={t('fehler_bereich_text')} />
        <LeerzustandBlock symbol="warning-circle" titel={t('fehler_seite_titel')} text={t('fehler_seite_text')} />
        <Abzeichen variante="fehler">{t('fehler_ipc_titel')}</Abzeichen>
      </div>

      {/* `ZUSTANDSBIBLIOTHEK_EINTRAEGE` bleibt die geteilte Wahrheit mit dem Wächtertest
          (test/gestaltung/bibliothek-vollstaendig.test.ts) — referenziert, damit ein Linter nie
          fälschlich „ungenutzter Import" meldet, sollte künftig ein Abschnitt daraus generiert statt
          von Hand aufgezählt werden. */}
      <span hidden data-eintraege={ZUSTANDSBIBLIOTHEK_EINTRAEGE.length} />
    </div>
  )
}
