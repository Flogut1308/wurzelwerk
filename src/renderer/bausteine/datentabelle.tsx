import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { PersonListeZeile } from '../../shared/schemata/person-liste'
import { ALLE_DATENTABELLE_SPALTEN, spaltenRasterVorlage, type DatentabelleSpalte } from './datentabelle-spalten'
import { ariaSortWert, sortierungUmschalten, type PersonListeRichtungWert, type PersonListeSortierungWert } from './datentabelle-sortierung'
import { Ladeschimmer } from './ladeschimmer'
import { LeerzustandBlock } from './leerzustand-block'
import { Tabellenzeile } from './tabellenzeile'
import { Text } from './text'
import './datentabelle.css'

export type DatentabelleLadezustand = 'laedt' | 'bereit' | 'fehler'

/** Nur Spalten mit einem Eintrag sind über die Kopfzelle sortierbar (S-05 „Sortierung über
 * Suchnormalform"). `geburtsort`/`konfidenz` haben keine eigene Spalte in `PersonListeSortierungEnum`
 * (src/shared/schemata/person-liste.ts) — nicht vorgreifen (CLAUDE.md §10). */
const SPALTE_SORTIERSCHLUESSEL: Readonly<Partial<Record<DatentabelleSpalte, PersonListeSortierungWert>>> = {
  name: 'nachname',
  lebensdaten: 'geburt',
}

/** i18n-Schlüssel je Spalte — ein `switch` mit vollständiger Abdeckung statt einer dynamisch
 * zusammengesetzten Zeichenkette, damit eine künftige fünfte Spalte hier einen Typfehler erzeugt.
 * Benannt exportiert (AP-1.6 Stufe 4): `listen-ansicht.tsx` braucht dieselbe Zuordnung für die
 * Spaltenwahl-Zeile, keine zweite Kopie dieses Schalters. */
export function spaltenSchluessel(spalte: DatentabelleSpalte): string {
  switch (spalte) {
    case 'name':
      return 'spalte_name'
    case 'lebensdaten':
      return 'spalte_lebensdaten'
    case 'geburtsort':
      return 'spalte_geburtsort'
    case 'konfidenz':
      return 'spalte_konfidenz'
  }
}

const ANZAHL_LADE_ZEILEN = 8

export interface DatentabelleProps {
  readonly zeilen: readonly PersonListeZeile[]
  readonly gesamt: number
  readonly spalten: readonly DatentabelleSpalte[]
  readonly sortierung: PersonListeSortierungWert
  readonly richtung: PersonListeRichtungWert
  readonly aufSortierungGeaendert: (sortierung: PersonListeSortierungWert, richtung: PersonListeRichtungWert) => void
  readonly ladezustand: DatentabelleLadezustand
  /** Ob mindestens ein Filter von der Vorgabe abweicht — entscheidet zwischen „kein Projekt-Inhalt"
   * und „Filter ohne Treffer" im leeren Zustand (S-05). */
  readonly hatAktivenFilter: boolean
  readonly aufFilterZuruecksetzen?: () => void
  readonly ausgewaehltePersonId?: string | null
  readonly aufZeileAusgewaehlt?: (personId: string) => void
}

/**
 * `Datentabelle` — Organismus (docs/71_Designsystem.md §2.3, C-16): Kopfzeile mit sortierbaren
 * Spalten, virtualisiertes Scrollen (`@tanstack/react-virtual`), Zustände lädt·leer·Fehler·gefüllt.
 * Rein präsentations-/prop-getrieben — holt keine Daten selbst (verdrahtet in Stufe 4).
 *
 * ARIA-Tabellenmuster (`role="table"`/`"rowgroup"`/`"row"`/`"columnheader"`/`"cell"`) statt einer
 * nativen `<table>`: der Virtualizer positioniert Zeilen absolut, was eine native
 * Tabellenzeilen-Layoutberechnung durchbricht (siehe `tabellenzeile.css`). `"cell"` statt
 * `"gridcell"` (Review Stufe 3): die Zeilen sind kein pfeilnavigierbares Grid, also bleibt die Rolle
 * konsistent zu `role="table"` (nicht `role="grid"`).
 *
 * Hueter-Auflage aus dem Stufe-2-Review: `Ladeschimmer` ist selbst `aria-hidden` — die zugängliche
 * Ladeansage lebt hier, in einem eigenen `role="status"`/`aria-live="polite"`-Container, der nur im
 * Ladezustand den i18n-Text „Lädt" trägt.
 */
export function Datentabelle({
  zeilen,
  gesamt,
  spalten,
  sortierung,
  richtung,
  aufSortierungGeaendert,
  ladezustand,
  hatAktivenFilter,
  aufFilterZuruecksetzen,
  ausgewaehltePersonId,
  aufZeileAusgewaehlt,
}: DatentabelleProps) {
  const { t } = useTranslation('liste')
  const scrollElementRef = useRef<HTMLDivElement | null>(null)

  const sichtbareSpalten = ALLE_DATENTABELLE_SPALTEN.filter((spalte) => spalten.includes(spalte))
  const rasterVorlage = spaltenRasterVorlage(sichtbareSpalten)

  const zeigeInhalt = ladezustand === 'bereit' && zeilen.length > 0

  // `estimateSize` ist eine grobe erste Schätzung, nicht die tatsächliche Höhe (CLAUDE.md §11: keine
  // Annahme über Schriftmetriken/Layoutmaße) — `measureElement` unten misst jede Zeile zur Laufzeit
  // nach, damit Dichte (komfortabel/kompakt) und Schriftgröße die Virtualisierung nicht sprengen.
  const virtualizer = useVirtualizer({
    count: zeigeInhalt ? zeilen.length : 0,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => 40,
    overscan: 8,
  })

  function kopfzelleKlick(spalte: DatentabelleSpalte) {
    const sortierschluessel = SPALTE_SORTIERSCHLUESSEL[spalte]
    if (sortierschluessel === undefined) return
    const naechster = sortierungUmschalten({ sortierung, richtung }, sortierschluessel)
    aufSortierungGeaendert(naechster.sortierung, naechster.richtung)
  }

  return (
    <div className="wz-datentabelle">
      <div className="wz-datentabelle__statusregion" role="status" aria-live="polite">
        {ladezustand === 'laedt' ? t('laedt') : null}
      </div>

      <div role="table" className="wz-datentabelle__tabelle" aria-rowcount={gesamt + 1} aria-colcount={sichtbareSpalten.length}>
        <div role="rowgroup">
          <div role="row" className="wz-datentabelle__kopfzeile" style={{ gridTemplateColumns: rasterVorlage }}>
            {sichtbareSpalten.map((spalte) => {
              const sortierschluessel = SPALTE_SORTIERSCHLUESSEL[spalte]
              if (sortierschluessel === undefined) {
                return (
                  <span key={spalte} role="columnheader" className="wz-datentabelle__kopfzelle">
                    <Text rolle="beschriftung" als="span">
                      {t(spaltenSchluessel(spalte))}
                    </Text>
                  </span>
                )
              }
              return (
                <span key={spalte} role="columnheader" aria-sort={ariaSortWert({ sortierung, richtung }, sortierschluessel)}>
                  <button type="button" className="wz-datentabelle__kopfzelle wz-datentabelle__kopfzelle--sortierbar" onClick={() => kopfzelleKlick(spalte)}>
                    <Text rolle="beschriftung" als="span">
                      {t(spaltenSchluessel(spalte))}
                    </Text>
                  </button>
                </span>
              )
            })}
          </div>
        </div>

        <div role="rowgroup" className="wz-datentabelle__koerper" ref={scrollElementRef}>
          {ladezustand === 'fehler' ? (
            <div role="row">
              <span role="cell" className="wz-datentabelle__leerzelle">
                <LeerzustandBlock titel={t('fehler_titel')} text={t('fehler_text')} />
              </span>
            </div>
          ) : null}

          {ladezustand === 'laedt'
            ? Array.from({ length: ANZAHL_LADE_ZEILEN }, (_wert, index) => (
                <div role="row" key={index} className="wz-datentabelle__ladezeile" style={{ gridTemplateColumns: rasterVorlage }}>
                  {sichtbareSpalten.map((spalte) => (
                    <span role="cell" key={spalte}>
                      <Ladeschimmer form="zeile" />
                    </span>
                  ))}
                </div>
              ))
            : null}

          {ladezustand === 'bereit' && zeilen.length === 0 ? (
            <div role="row">
              <span role="cell" className="wz-datentabelle__leerzelle">
                {hatAktivenFilter ? (
                  <LeerzustandBlock
                    titel={t('leer_gefiltert_titel')}
                    text={t('leer_gefiltert_text')}
                    aktion={aufFilterZuruecksetzen === undefined ? undefined : { beschriftung: t('filter_zuruecksetzen'), aufKlick: aufFilterZuruecksetzen }}
                  />
                ) : (
                  <LeerzustandBlock titel={t('leer_keinInhalt_titel')} text={t('leer_keinInhalt_text')} />
                )}
              </span>
            </div>
          ) : null}

          {zeigeInhalt ? (
            <div role="presentation" className="wz-datentabelle__virtualisierer" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((virtuelleZeile) => {
                const zeile = zeilen[virtuelleZeile.index]
                if (zeile === undefined) return null
                return (
                  <div
                    key={zeile.person_id}
                    role="presentation"
                    data-index={virtuelleZeile.index}
                    ref={virtualizer.measureElement}
                    className="wz-datentabelle__zeilenposition"
                    style={{ transform: `translateY(${virtuelleZeile.start}px)` }}
                  >
                    <Tabellenzeile
                      zeile={zeile}
                      spalten={sichtbareSpalten}
                      ausgewaehlt={ausgewaehltePersonId === zeile.person_id}
                      aufAusgewaehlt={aufZeileAusgewaehlt}
                      ariaRowIndex={virtuelleZeile.index + 2}
                    />
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
