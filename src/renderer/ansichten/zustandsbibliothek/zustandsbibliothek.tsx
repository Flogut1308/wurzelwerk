import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Befund } from '../../../shared/import/imp-codes'
import type { Trockenlaufbericht } from '../../../shared/import/trockenlauf-bericht'
import type { PersonListeFilter, PersonListeZeile } from '../../../shared/schemata/person-liste'
import { Abzeichen, type AbzeichenVariante } from '../../bausteine/abzeichen'
import { Auswahlfeld, type AuswahlfeldOption } from '../../bausteine/auswahlfeld'
import { BelegAbzeichen } from '../../bausteine/beleg-abzeichen'
import { Blaetterleiste } from '../../bausteine/blaetterleiste'
import { ALLE_DATENTABELLE_SPALTEN } from '../../bausteine/datentabelle-spalten'
import { Datentabelle } from '../../bausteine/datentabelle'
import { Eingabekoerper } from '../../bausteine/eingabekoerper'
import { FehlerlisteImport } from '../../bausteine/fehlerliste-import'
import { FeldKonfidenz } from '../../bausteine/feld-konfidenz'
import { Filterleiste } from '../../bausteine/filterleiste'
import { Fokusring } from '../../bausteine/fokusring'
import { Fortschritt } from '../../bausteine/fortschritt'
import { Kontrollkaestchen } from '../../bausteine/kontrollkaestchen'
import { KonfidenzPunkt, type KonfidenzStufe } from '../../bausteine/konfidenz-punkt'
import { Ladeschimmer, type LadeschimmerForm } from '../../bausteine/ladeschimmer'
import { LeerzustandBlock } from '../../bausteine/leerzustand-block'
import { Optionsfeld } from '../../bausteine/optionsfeld'
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
import { Umschalter } from '../../bausteine/umschalter'
import { WiderspruchZeichen } from '../../bausteine/widerspruch-zeichen'
import { Zaehler } from '../../bausteine/zaehler'
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
    ...ueberschreibung,
  }
}

const BEISPIEL_ZEILEN: readonly PersonListeZeile[] = [
  beispielZeile(),
  beispielZeile({ person_id: 'tmp:emma-wruck', anzeigename: 'Emma Wruck', geburt_jahr: 1895, tod_jahr: 1970, konfidenz_min: 4, hat_widerspruch: true }),
  beispielZeile({ person_id: 'tmp:vater-august', anzeigename: '', geburt_jahr: null, tod_jahr: null, geburt_ort_name: null, konfidenz_min: null, ist_platzhalter: true }),
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
