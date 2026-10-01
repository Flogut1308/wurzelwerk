import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Abzeichen } from '../../bausteine/abzeichen'
import { konfidenzStufe } from '../../bausteine/feld-konfidenz'
import { KonfidenzPunkt } from '../../bausteine/konfidenz-punkt'
import { Schaltflaeche } from '../../bausteine/schaltflaeche'
import { Text } from '../../bausteine/text'
import { WiderspruchZeichen } from '../../bausteine/widerspruch-zeichen'
import { useBeteiligungLoeschen, useEreignisLoeschen } from '../../brücke/befehl-hooks'
import { editorFeldId } from './editor-feld-id'
import { EreignisNeuFormular } from './profil-bearbeiten-ereignisse'
import { beteiligungRolleSchluessel, ereignisTypSchluessel, praedikatSchluessel } from './profil-schluessel'
import { angabenZielStationId, lebenAnsicht, type LebenEingabe, type LebenStation, type StationZeitraum } from './reiter-leben-logik'
import './reiter-leben.css'

export interface ReiterLebenProps {
  readonly personId: string
  readonly daten: LebenEingabe
  /** Präfix der Sprungziel-IDs (`editorFeldId`): der Editor springt auf `ereignisse` (die Liste) und `angaben`. */
  readonly idPraefix: string
}

type Uebersetzer = (schluessel: string, werte: Readonly<Record<string, string | number>>) => string

function zeitraumText(zeitraum: StationZeitraum, t: Uebersetzer, tDatum: Uebersetzer): string {
  switch (zeitraum.art) {
    case 'datum':
      return tDatum(zeitraum.ergebnis.schluessel, zeitraum.ergebnis.werte)
    case 'text':
      return zeitraum.text
    case 'nicht_darstellbar':
      return t('reiter_leben_zeitraum_nicht_darstellbar', {})
    case 'ohne':
      return t('reiter_leben_ohne_zeitangabe', {})
  }
}

/** Lage der Spur auf der Achse als Prozentwerte; ein Zeitpunkt behält eine Mindestbreite (Variable in der CSS). */
function spurStil(anfang: number, ende: number): { readonly left: string; readonly width: string } {
  return {
    left: `min(${anfang * 100}%, calc(100% - var(--wz-reiter-leben-punkt-min)))`,
    width: `${(ende - anfang) * 100}%`,
  }
}

/**
 * Reiter „Leben" (AP-1.30 PR 13c, Artboard „Leben", Vorgaben §2.6/§3.2; docs/80 §33 V-130-13-*): Lebensstationen
 * nach Zeit mit einer Zeitspur relativ zur Lebenszeit. Eine Station ist jede Beteiligung an einem Ereignis und jede
 * Personen-Aussage außer Lebensdaten, Kurzbeschreibung und Existenz (`istStationsPraedikat`); undatierte stehen am
 * Ende ohne Spur. Die Spur ist reine Anzeige (aria-hidden); Zeitraum, offene und unscharfe Ränder stehen auch als Text.
 *
 * Schreiben kann der Reiter nur, was es gibt: „Beteiligung entfernen" und „Ereignis löschen" je Ereignis-Station
 * sowie das Formular „Neues Ereignis erfassen" darunter. Aussage-Stationen sind nur lesbar („+ Angabe mit Zeitraum"
 * ist gesperrt, §33 U-130-13-station-anlegen); die Sicherheit je Station ist nur Anzeige.
 */
export function ReiterLeben({ personId, daten, idPraefix }: ReiterLebenProps) {
  const { t } = useTranslation('profil')
  const { t: tDatum } = useTranslation('datum')
  const ansicht = lebenAnsicht(daten)
  const beteiligungLoeschen = useBeteiligungLoeschen()
  const ereignisLoeschen = useEreignisLoeschen()
  const titelId = useId()
  const grundId = useId()
  const angabenZiel = angabenZielStationId(ansicht.stationen)
  const abschnittId = editorFeldId(idPraefix, 'ereignisse')

  function aufAbschnittFokussieren(): void {
    document.getElementById(abschnittId)?.focus()
  }

  function station(eintrag: LebenStation) {
    const ereignis = eintrag.ereignis
    const angabe = eintrag.angabe
    const art =
      ereignis !== null
        ? t(ereignisTypSchluessel(ereignis.typ))
        : angabe === null
          ? ''
          : (() => {
              const schluessel = praedikatSchluessel(angabe.praedikat)
              return schluessel === undefined ? angabe.praedikat : t(schluessel)
            })()
    const titel =
      ereignis !== null
        ? (ereignis.beschreibung ?? '')
        : angabe === null
          ? ''
          : (angabe.aussage.wert ?? angabe.aussage.wert_text ?? t('wert_unbekannt'))
    const ort = ereignis?.ort_name ?? null
    const zeitText = zeitraumText(eintrag.zeitraum, t, tDatum)
    const stufe = konfidenzStufe(eintrag.konfidenz)
    const stationName = eintrag.zeitraum.art === 'ohne' ? art : t('reiter_leben_station_aria', { art, zeitraum: zeitText })
    const hinweise: string[] = []
    if (eintrag.lage === 'vor_geburt') hinweise.push(t('reiter_leben_vor_geburt'))
    if (eintrag.lage === 'nach_tod') hinweise.push(t('reiter_leben_nach_tod'))
    if (eintrag.spur?.offenAnfang === true) hinweise.push(t('reiter_leben_beginn_offen'))
    if (eintrag.spur?.offenEnde === true) hinweise.push(t('reiter_leben_ende_offen'))
    if (eintrag.spur?.unscharf === true) hinweise.push(t('reiter_leben_ungefaehr'))
    const istZiel = eintrag.id === angabenZiel
    const spur = eintrag.spur
    return (
      <li key={eintrag.id} id={istZiel ? editorFeldId(idPraefix, 'angaben') : undefined} tabIndex={istZiel ? -1 : undefined} className="wz-reiter-leben__station">
        <div className="wz-reiter-leben__kopf">
          <Abzeichen>{art}</Abzeichen>
          {titel === '' ? null : <span className="wz-reiter-leben__titel">{titel}</span>}
          {ort === null ? null : (
            <Text rolle="koerper-klein" farbe="sekundaer" als="span">
              {ort}
            </Text>
          )}
          {ereignis === null ? null : (
            <Text rolle="beschriftung" als="span">
              {t(beteiligungRolleSchluessel(ereignis.rolle))}
            </Text>
          )}
          {stufe === null ? null : <KonfidenzPunkt stufe={stufe} />}
          {angabe?.feld.hatKonkurrierende === true ? <WiderspruchZeichen ungeloest={angabe.feld.hat_widerspruch} /> : null}
          <span className={`wz-reiter-leben__zeitraum${eintrag.zeitraum.art === 'datum' || eintrag.zeitraum.art === 'text' ? '' : ' wz-reiter-leben__zeitraum--leer'}`}>{zeitText}</span>
        </div>
        {hinweise.length === 0 ? null : (
          <Text rolle="hilfe" als="p">
            {hinweise.join(' · ')}
          </Text>
        )}
        {spur === null ? null : (
          <div className="wz-reiter-leben__spur" aria-hidden="true">
            <span
              className={`wz-reiter-leben__balken${spur.unscharf ? ' wz-reiter-leben__balken--unscharf' : ''}${spur.offenAnfang ? ' wz-reiter-leben__balken--offen-anfang' : ''}${spur.offenEnde ? ' wz-reiter-leben__balken--offen-ende' : ''}`}
              style={spurStil(spur.anfang, spur.ende)}
            />
          </div>
        )}
        {ereignis === null ? null : (
          <div className="wz-reiter-leben__aktionen">
            <Schaltflaeche
              variante="unauffaellig"
              ariaLabel={t('reiter_leben_beteiligung_entfernen_aria', { station: stationName })}
              aufKlick={() => beteiligungLoeschen.mutate({ id: ereignis.beteiligung_id }, { onSuccess: aufAbschnittFokussieren })}
            >
              {t('ereignis_zeile_beteiligung_entfernen')}
            </Schaltflaeche>
            <Schaltflaeche
              variante="gefaehrlich"
              ariaLabel={t('reiter_leben_ereignis_loeschen_aria', { station: stationName })}
              aufKlick={() => ereignisLoeschen.mutate({ id: ereignis.ereignis_id }, { onSuccess: aufAbschnittFokussieren })}
            >
              {t('ereignis_zeile_loeschen')}
            </Schaltflaeche>
          </div>
        )}
      </li>
    )
  }

  const achse = ansicht.achse
  return (
    // Ohne Aussage-Station trägt die Hülle das Sprungziel `angaben` (Fallback: der Reiter statt einer Zeile).
    <div className="wz-reiter-leben" id={angabenZiel === null ? editorFeldId(idPraefix, 'angaben') : undefined} tabIndex={angabenZiel === null ? -1 : undefined}>
      <section id={abschnittId} tabIndex={-1} className="wz-reiter-leben__abschnitt" aria-labelledby={titelId}>
        <div className="wz-reiter-leben__abschnitt-kopf">
          <Text rolle="titel-klein" als="h2" id={titelId}>
            {t('reiter_leben_titel')}
          </Text>
          <Text rolle="hilfe" als="span">
            {t('reiter_leben_kopf_anzahl', { anzahl: ansicht.stationen.length })}
          </Text>
          <span className="wz-reiter-leben__hinzufuegen">
            <Text rolle="hilfe" als="span" id={grundId}>
              {t('reiter_leben_angabe_hinzufuegen_grund')}
            </Text>
            <Schaltflaeche variante="primaer" gesperrt ariaBeschriebenDurch={grundId}>
              {t('reiter_leben_angabe_hinzufuegen')}
            </Schaltflaeche>
          </span>
        </div>

        {achse === null ? null : (
          <p className="wz-reiter-leben__achse">
            {achse.grenzeVon === 'geburt' && achse.grenzeBis === 'tod'
              ? t('reiter_leben_achse', { von: achse.von, bis: achse.bis })
              : t('reiter_leben_achse_aus_stationen', { von: achse.von, bis: achse.bis })}
          </p>
        )}
        {ansicht.achseFehlt ? (
          <p className="wz-reiter-leben__achse-hinweis">{t('reiter_leben_achse_fehlt')}</p>
        ) : null}

        {ansicht.stationen.length === 0 ? (
          <Text rolle="hilfe" als="p">
            {t('reiter_leben_leer')}
          </Text>
        ) : (
          <ul className="wz-reiter-leben__liste">{ansicht.stationen.map(station)}</ul>
        )}

        {achse === null ? null : (
          <Text rolle="hilfe" als="p">
            {t('reiter_leben_zeitspur_hilfe')}
          </Text>
        )}
      </section>

      <EreignisNeuFormular personId={personId} />
    </div>
  )
}
