import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { EditorFeld } from '../../../core/person/offene-punkte'
import type { ReiterId } from '../../../core/person/reiter'
import type { BeschreibungUebersetzer } from '../../../shared/i18n/transaktions-beschreibung'
import type { PersonDetailAus } from '../../../shared/schemata/person-detail'
import { Fortschritt } from '../../bausteine/fortschritt'
import { Text } from '../../bausteine/text'
import { Zaehler } from '../../bausteine/zaehler'
import { useJournalVerlauf } from '../../brücke/abfrage-hooks'
import {
  offenePunkteZeilen,
  verlaufTextUebersetzen,
  verlaufZeilen,
  verlaufZeitUebersetzen,
  vollstaendigkeitAnzeige,
  VERLAUF_ABFRAGE_GRENZE,
  type OffenerPunktZeile,
} from './editor-rechte-spalte-logik'
import { useMinutentakt } from './editor-speicherstatus'
import { reiterSchluessel } from './profil-schluessel'
import './editor-rechte-spalte.css'

export interface EditorRechteSpalteProps {
  readonly personId: string
  readonly daten: PersonDetailAus
  /** Sprung zu einem offenen Punkt: Reiter wählen, Feld (sonst Inhaltsbereich) fokussieren. */
  readonly aufSprung: (reiter: ReiterId, feld: EditorFeld) => void
}

/**
 * Rechte Spalte von „Person bearbeiten" (AP-1.30 PR 8, Artboard 1a): Vollständigkeit, offene
 * Punkte, zuletzt geändert. Alle Zahlen kommen aus `abfrage:person.detail` bzw.
 * `abfrage:journal.verlauf` — hier wird nichts berechnet (ADR-031), nur dargestellt
 * (`editor-rechte-spalte-logik.ts`). Sichtbar ab 1100 px Fensterbreite (CSS); darunter ausgeblendet,
 * bis das Overlay „Zustand" kommt (Vorgaben §3.4, AP-1.30 PR 15).
 */
export function EditorRechteSpalte({ personId, daten, aufSprung }: EditorRechteSpalteProps) {
  const { t } = useTranslation('profil')
  return (
    <aside className="wz-editor-rechte-spalte" aria-label={t('rechte_spalte_beschriftung')}>
      <Vollstaendigkeit daten={daten} />
      <OffenePunkte daten={daten} aufSprung={aufSprung} />
      <Verlauf personId={personId} />
    </aside>
  )
}

function Vollstaendigkeit({ daten }: { readonly daten: PersonDetailAus }) {
  const { t } = useTranslation('profil')
  const anzeige = vollstaendigkeitAnzeige(daten.kernangaben)
  return (
    <section className="wz-editor-rechte-spalte__abschnitt" aria-labelledby="wz-editor-rechte-spalte-vollstaendigkeit">
      <Text rolle="beschriftung" als="h2" id="wz-editor-rechte-spalte-vollstaendigkeit">
        {t('vollstaendigkeit_titel')}
      </Text>
      {anzeige === null ? (
        <Text rolle="hilfe" als="p">
          {t('vollstaendigkeit_platzhalter')}
        </Text>
      ) : (
        <>
          <div className="wz-editor-rechte-spalte__prozent" title={t('vollstaendigkeit_erklaerung')} data-prozent={anzeige.prozent}>
            <Text rolle="titel" als="span">
              {t('vollstaendigkeit_prozent', { prozent: anzeige.prozent })}
            </Text>
          </div>
          <Fortschritt art="bestimmt" prozent={anzeige.prozent} bezeichnung={t('vollstaendigkeit_titel')} />
          <Text rolle="koerper-klein" farbe="sekundaer" als="p">
            {t('vollstaendigkeit_zeile', { erfuellt: anzeige.erfuellt, anwendbar: anzeige.anwendbar, belegt: anzeige.belegt })}
          </Text>
          <Text rolle="hilfe" als="p">
            {t('vollstaendigkeit_erklaerung')}
          </Text>
          <ul className="wz-editor-rechte-spalte__kernangaben">
            {anzeige.zeilen.map((zeile, index) => (
              // Index im Schlüssel: `elternteil` kann zweimal vorkommen, die Reihenfolge ist fest.
              <li key={`${zeile.id}-${String(index)}`} className="wz-editor-rechte-spalte__kernangabe" data-kernangabe={zeile.id} data-zustand={zeile.zustand}>
                <Text rolle="koerper-klein" als="span">
                  {t(zeile.nameSchluessel)}
                </Text>
                <span className={`wz-editor-rechte-spalte__zustand wz-editor-rechte-spalte__zustand--${zeile.zustand}`}>{t(zeile.zustandSchluessel)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function OffenePunkte({ daten, aufSprung }: { readonly daten: PersonDetailAus; readonly aufSprung: EditorRechteSpalteProps['aufSprung'] }) {
  const { t } = useTranslation('profil')
  const zeilen = offenePunkteZeilen(daten.offene_punkte, daten.beziehungen)
  return (
    <section className="wz-editor-rechte-spalte__abschnitt" aria-labelledby="wz-editor-rechte-spalte-offene-punkte">
      <div className="wz-editor-rechte-spalte__kopfzeile">
        <Text rolle="beschriftung" als="h2" id="wz-editor-rechte-spalte-offene-punkte">
          {t('offene_punkte_titel')}
        </Text>
        <Zaehler anzahl={zeilen.length} />
      </div>
      {zeilen.length === 0 ? (
        <Text rolle="hilfe" als="p">
          {t('offene_punkte_leer')}
        </Text>
      ) : (
        <ul className="wz-editor-rechte-spalte__punkte">
          {zeilen.map((zeile, index) => (
            // Index im Schlüssel: Mehrfachpunkte derselben Regel ohne Bezug sind sonst gleich.
            <li key={`${zeile.meldungsschluessel}-${zeile.feld}-${String(index)}`}>
              <button type="button" className="wz-editor-rechte-spalte__punkt" onClick={() => aufSprung(zeile.reiter, zeile.feld)}>
                <span className="wz-editor-rechte-spalte__punkt-meldung">{punktMeldung(zeile, (schluessel, optionen) => (optionen === undefined ? t(schluessel) : t(schluessel, optionen)))}</span>
                <span className="wz-editor-rechte-spalte__punkt-reiter">{t('offener_punkt_reiter', { reiter: t(reiterSchluessel(zeile.reiter)) })}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Meldung eines offenen Punkts, mit Namen der betroffenen Person, wenn bekannt. */
function punktMeldung(zeile: OffenerPunktZeile, t: BeschreibungUebersetzer): string {
  const meldung = t(zeile.meldungsschluessel)
  return zeile.bezugName === null ? meldung : t('offener_punkt_mit_bezug', { meldung, name: zeile.bezugName })
}

function Verlauf({ personId }: { readonly personId: string }) {
  const { t, i18n } = useTranslation('profil')
  const abfrage = useJournalVerlauf({ grenze: VERLAUF_ABFRAGE_GRENZE, personId })
  // Adapter auf die einfache Übersetzerform (s. `menueUebersetzen` in `src/main/menue/menue.ts`).
  const uebersetzen: BeschreibungUebersetzer = (schluessel, optionen) => (optionen === undefined ? i18n.t(schluessel) : i18n.t(schluessel, optionen))
  // Minutentakt nur, solange ein Eintrag relativ angezeigt wird (unter 24 h).
  const [mitRelativerZeit, setMitRelativerZeit] = useState(false)
  const jetzt = useMinutentakt(mitRelativerZeit)
  const zeilen = abfrage.isSuccess ? verlaufZeilen(abfrage.data, jetzt) : []
  const relativ = zeilen.some((zeile) => zeile.zeit.art === 'relativ')
  if (relativ !== mitRelativerZeit) setMitRelativerZeit(relativ)
  return (
    <section className="wz-editor-rechte-spalte__abschnitt" aria-labelledby="wz-editor-rechte-spalte-verlauf">
      <Text rolle="beschriftung" als="h2" id="wz-editor-rechte-spalte-verlauf">
        {t('verlauf_titel')}
      </Text>
      {abfrage.isError ? (
        <Text rolle="hilfe" als="p">
          {t('verlauf_fehler')}
        </Text>
      ) : abfrage.isSuccess && zeilen.length === 0 ? (
        <Text rolle="hilfe" als="p">
          {t('verlauf_leer')}
        </Text>
      ) : (
        <ol className="wz-editor-rechte-spalte__verlauf">
          {zeilen.map((zeile) => (
            <li key={zeile.id} className="wz-editor-rechte-spalte__verlauf-eintrag">
              <span className="wz-editor-rechte-spalte__zeit">{verlaufZeitUebersetzen(zeile.zeit, uebersetzen)}</span>
              <span className="wz-editor-rechte-spalte__verlauf-text">{verlaufTextUebersetzen(zeile.text, uebersetzen)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
