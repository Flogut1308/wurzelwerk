import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppFehler } from '../../../shared/fehler/app-fehler'
import { ElternschaftTypEnum } from '../../../shared/schemata/elternschaft'
import type { PersonDetailKopf } from '../../../shared/schemata/person-detail'
import { Abzeichen } from '../../bausteine/abzeichen'
import { Auswahlfeld, type AuswahlfeldOption } from '../../bausteine/auswahlfeld'
import { Modal } from '../../bausteine/modal'
import { personennameIstErsatz, personennameText } from '../../bausteine/personenname-anzeige'
import { Schaltflaeche } from '../../bausteine/schaltflaeche'
import { Text } from '../../bausteine/text'
import { useElternschaftAendern, useElternschaftLoeschen, usePartnerschaftLoeschen } from '../../brücke/befehl-hooks'
import { editorFeldId } from './editor-feld-id'
import { kantentypSchluessel } from './profil-schluessel'
import {
  ELTERN_PLATZ_SCHLUESSEL,
  GESCHWISTER_ART_SCHLUESSEL,
  WEITERE_GESCHWISTER_SCHLUESSEL,
  beziehungenAnsicht,
  kinderDerVerbindungText,
  type BeziehungKante,
  type BeziehungenEingabe,
  type ElternPlatz,
} from './reiter-beziehungen-logik'
import './reiter-beziehungen.css'

export interface ReiterBeziehungenProps {
  /** Der Kopf der bearbeiteten Person (Name im Bestätigungstext). */
  readonly kopf: PersonDetailKopf
  readonly daten: BeziehungenEingabe
  /** Präfix der Sprungziel-IDs (`editorFeldId`): der Editor springt von „Elternteil nicht zugeordnet" und
   * „Kind ohne Partnerschaft" auf `eltern` bzw. `kinder`. */
  readonly idPraefix: string
}

/** Was „Trennen" bestätigen lässt: die Kante (`elternschaft`/`partnerschaft`), ihre ID und der Name der Gegenseite. */
interface TrennenAnfrage {
  readonly art: 'elternschaft' | 'partnerschaft'
  readonly id: string
  /** `null`: Partnerschaft ohne erfassten Partner. */
  readonly gegenueber: string | null
}

/**
 * Reiter „Beziehungen" (AP-1.30 PR 12c, Artboard „Beziehungen", Vorgaben §2.5/§3.2; docs/80 §33 V-130-12-*):
 * Eltern nach Platz (Vater, Mutter, offener Platz sichtbar), Partnerschaften mit den Kindern aus der
 * jeweiligen Verbindung darunter, Kinder ohne Partnerschaft mit Hinweis und die abgeleiteten Geschwister.
 *
 * Schreiben kann der Reiter genau zweierlei, beides über bestehende Befehle (kein neuer Befehl):
 * den Typ einer Elternkante ändern (`elternschaft.aendern`, die Notiz der Kante geht IMMER mit, `feld`
 * fehlt — jeder Wechsel ist ein Undo-Schritt) und eine Verbindung trennen (`elternschaft.loeschen`,
 * `partnerschaft.loeschen`) — erst nach Bestätigung, die sagt, dass nur die Verbindung getrennt wird.
 * Anlegen und Verknüpfen kommt mit AP-1.32 („+ Beziehung" ist gesperrt), „Zuordnen", „Öffnen" und das
 * Bearbeiten einer Partnerschaft sind offen (docs/80 §33 U-130-12-*).
 *
 * Geschwister sind abgeleitet (keine Kante): gesperrt beschriftet, ohne Knöpfe, nicht fokussierbar.
 */
export function ReiterBeziehungen({ kopf, daten, idPraefix }: ReiterBeziehungenProps) {
  const { t } = useTranslation('profil')
  const { t: tAllgemein } = useTranslation('allgemein')
  const { t: tFehler } = useTranslation('fehler')
  const ansicht = beziehungenAnsicht(daten)
  const elternschaftAendern = useElternschaftAendern()
  const elternschaftLoeschen = useElternschaftLoeschen()
  const partnerschaftLoeschen = usePartnerschaftLoeschen()
  const [trennen, setTrennen] = useState<TrennenAnfrage | null>(null)
  const [trennenFehler, setTrennenFehler] = useState<AppFehler | null>(null)
  const elternTitelId = useId()
  const partnerschaftenTitelId = useId()
  const geschwisterTitelId = useId()
  const gesperrtId = useId()
  const hinzufuegenHinweisId = useId()

  const typOptionen: readonly AuswahlfeldOption<(typeof ElternschaftTypEnum.options)[number]>[] = ElternschaftTypEnum.options.map((typ) => ({
    wert: typ,
    beschriftung: t(kantentypSchluessel(typ)),
  }))
  const name = (person: { readonly anzeigename: string; readonly istPlatzhalter: boolean }): string =>
    personennameText({ anzeigename: person.anzeigename, ist_platzhalter: person.istPlatzhalter }, tAllgemein)
  const eigenerName = personennameText(kopf, tAllgemein)

  const aendernFehler = elternschaftAendern.error ?? null
  const fehler = aendernFehler === null ? null : t('reiter_beziehungen_fehler', { titel: tFehler(`${aendernFehler.code}.titel`), was_tun: tFehler(`${aendernFehler.code}.was_tun`) })
  const trennenFehlertext = trennenFehler === null ? null : t('reiter_beziehungen_fehler', { titel: tFehler(`${trennenFehler.code}.titel`), was_tun: tFehler(`${trennenFehler.code}.was_tun`) })

  function typWechseln(kante: BeziehungKante, typ: BeziehungKante['typ']): void {
    // `elternschaft.aendern` ersetzt die ganze Zeile: die Notiz geht mit, sonst ginge sie still verloren.
    // Bewusst OHNE `feld`: jeder Wechsel ist ein eigener Undo-Schritt, nie mit einem vorigen zusammengefasst.
    elternschaftAendern.mutate({ id: kante.kanteId, typ, ...(kante.notiz === null ? {} : { notiz: kante.notiz }) })
  }

  function schliessen(): void {
    setTrennen(null)
    setTrennenFehler(null)
  }

  function bestaetigen(): void {
    if (trennen === null) return
    const optionen = { onSuccess: schliessen, onError: (grund: AppFehler) => setTrennenFehler(grund) }
    if (trennen.art === 'elternschaft') elternschaftLoeschen.mutate({ id: trennen.id }, optionen)
    else partnerschaftLoeschen.mutate({ id: trennen.id }, optionen)
  }

  const trennenLaeuft = elternschaftLoeschen.isPending || partnerschaftLoeschen.isPending

  function kantenZeile(kante: BeziehungKante, platz: string | null) {
    const anzeige = name(kante)
    return (
      <li key={kante.kanteId} className={`wz-reiter-beziehungen__zeile${kante.istPlatzhalter ? ' wz-reiter-beziehungen__zeile--platzhalter' : ''}`}>
        {platz === null ? null : (
          <Text rolle="koerper-klein" farbe="sekundaer" als="span">
            {platz}
          </Text>
        )}
        <span className={`wz-reiter-beziehungen__name${personennameIstErsatz({ anzeigename: kante.anzeigename, ist_platzhalter: kante.istPlatzhalter }) ? ' wz-reiter-beziehungen__name--ersatz' : ''}`}>{anzeige}</span>
        <span className="wz-reiter-beziehungen__aktionen">
          <Auswahlfeld
            wert={kante.typ}
            optionen={typOptionen}
            ariaLabel={t('reiter_beziehungen_typ_aria', { name: anzeige })}
            gesperrt={elternschaftAendern.isPending}
            aufAenderung={(typ) => typWechseln(kante, typ)}
          />
          <Schaltflaeche
            variante="unauffaellig"
            ariaLabel={t('reiter_beziehungen_trennen_aria', { name: anzeige })}
            aufKlick={() => setTrennen({ art: 'elternschaft', id: kante.kanteId, gegenueber: anzeige })}
          >
            {t('reiter_beziehungen_trennen')}
          </Schaltflaeche>
        </span>
      </li>
    )
  }

  const platzText = (platz: ElternPlatz): string => t(ELTERN_PLATZ_SCHLUESSEL[platz])

  return (
    <div className="wz-reiter-beziehungen">
      <div className="wz-reiter-beziehungen__kopf">
        <Text rolle="hilfe" als="span" id={hinzufuegenHinweisId}>
          {t('reiter_beziehungen_hinzufuegen_spaeter')}
        </Text>
        <Schaltflaeche variante="primaer" gesperrt ariaBeschriebenDurch={hinzufuegenHinweisId}>
          {t('reiter_beziehungen_hinzufuegen')}
        </Schaltflaeche>
      </div>

      {fehler === null ? null : (
        <p className="wz-reiter-beziehungen__fehler" role="alert">
          {fehler}
        </p>
      )}

      <section id={editorFeldId(idPraefix, 'eltern')} tabIndex={-1} className="wz-reiter-beziehungen__abschnitt" aria-labelledby={elternTitelId}>
        <Text rolle="beschriftung" als="h2" id={elternTitelId}>
          {t('reiter_beziehungen_eltern_titel')}
        </Text>
        <ul className="wz-reiter-beziehungen__liste">
          {ansicht.eltern.map((zeile) =>
            zeile.art === 'besetzt' ? (
              kantenZeile(zeile.kante, platzText(zeile.platz))
            ) : (
              <li key={`offen-${zeile.platz}`} className="wz-reiter-beziehungen__zeile wz-reiter-beziehungen__zeile--offen">
                <Text rolle="koerper-klein" farbe="sekundaer" als="span">
                  {platzText(zeile.platz)}
                </Text>
                <span className="wz-reiter-beziehungen__offen-text">{t('reiter_beziehungen_platz_offen')}</span>
              </li>
            ),
          )}
        </ul>
      </section>

      <section id={editorFeldId(idPraefix, 'kinder')} tabIndex={-1} className="wz-reiter-beziehungen__abschnitt" aria-labelledby={partnerschaftenTitelId}>
        <div className="wz-reiter-beziehungen__abschnitt-kopf">
          <Text rolle="beschriftung" als="h2" id={partnerschaftenTitelId}>
            {t('reiter_beziehungen_partnerschaften_titel')}
          </Text>
          <Text rolle="hilfe" als="span">
            {t('reiter_beziehungen_partnerschaften_untertitel')}
          </Text>
        </div>

        {ansicht.partnerschaften.length === 0 && ansicht.kinderOhne.length === 0 ? (
          <Text rolle="hilfe" als="p">
            {t('reiter_beziehungen_partnerschaften_leer')}
          </Text>
        ) : null}

        {ansicht.partnerschaften.length === 0 ? null : (
          <ul className="wz-reiter-beziehungen__liste">
            {ansicht.partnerschaften.map((karte) => {
              const partnerNamen = karte.partner.map(name)
              const gegenueber = partnerNamen.length === 0 ? t('reiter_beziehungen_partner_nicht_erfasst') : partnerNamen.join(', ')
              const kinderAnzahl = new Set(karte.kinder.map((kind) => kind.personId)).size
              return (
                <li key={karte.id} className="wz-reiter-beziehungen__karte">
                  <div className="wz-reiter-beziehungen__karte-kopf">
                    <span className={`wz-reiter-beziehungen__name${partnerNamen.length === 0 ? ' wz-reiter-beziehungen__name--ersatz' : ''}`}>{gegenueber}</span>
                    <Abzeichen>{t(kantentypSchluessel(karte.typ))}</Abzeichen>
                    <span className="wz-reiter-beziehungen__aktionen">
                      <Schaltflaeche
                        variante="unauffaellig"
                        ariaLabel={t('reiter_beziehungen_trennen_aria', { name: gegenueber })}
                        aufKlick={() => setTrennen({ art: 'partnerschaft', id: karte.id, gegenueber: partnerNamen.length === 0 ? null : gegenueber })}
                      >
                        {t('reiter_beziehungen_trennen')}
                      </Schaltflaeche>
                    </span>
                  </div>
                  {kinderAnzahl === 0 ? null : (
                    <div className="wz-reiter-beziehungen__karte-kinder">
                      <Text rolle="beschriftung" als="h3">
                        {kinderDerVerbindungText(kinderAnzahl, t)}
                      </Text>
                      <ul className="wz-reiter-beziehungen__liste">{karte.kinder.map((kind) => kantenZeile(kind, null))}</ul>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {ansicht.kinderOhne.length === 0 ? null : (
          <div className="wz-reiter-beziehungen__kinder-ohne">
            <Text rolle="beschriftung" als="h3">
              {t('reiter_beziehungen_kinder_ohne_titel')}
            </Text>
            <ul className="wz-reiter-beziehungen__liste">{ansicht.kinderOhne.map((kind) => kantenZeile(kind, null))}</ul>
            {ansicht.kinderOhneHinweise.map((hinweis) => (
              <p key={hinweis.personId} className="wz-reiter-beziehungen__hinweis">
                {t('reiter_beziehungen_kind_ohne_hinweis', { name: hinweis.anzeigename === '' ? tAllgemein('person_ohne_namen') : hinweis.anzeigename })}
              </p>
            ))}
          </div>
        )}
      </section>

      <section className="wz-reiter-beziehungen__abschnitt" aria-labelledby={geschwisterTitelId}>
        <div className="wz-reiter-beziehungen__abschnitt-kopf">
          <Text rolle="beschriftung" als="h2" id={geschwisterTitelId}>
            {t('reiter_beziehungen_geschwister_titel')}
          </Text>
          <Text rolle="hilfe" als="span" id={gesperrtId}>
            {t('reiter_beziehungen_geschwister_gesperrt')}
          </Text>
        </div>
        {ansicht.geschwister.length === 0 && ansicht.weitereGeschwisterPlaetze.length === 0 ? (
          <Text rolle="hilfe" als="p">
            {t('reiter_beziehungen_geschwister_leer')}
          </Text>
        ) : null}
        {ansicht.geschwister.length === 0 ? null : (
          <ul className="wz-reiter-beziehungen__geschwister" aria-describedby={gesperrtId}>
            {ansicht.geschwister.map((eintrag) => (
              <li key={eintrag.personId} className={`wz-reiter-beziehungen__geschwister-eintrag${eintrag.istPlatzhalter ? ' wz-reiter-beziehungen__zeile--platzhalter' : ''}`}>
                <span className={`wz-reiter-beziehungen__name${eintrag.istPlatzhalter ? ' wz-reiter-beziehungen__name--ersatz' : ''}`}>{name(eintrag)}</span>
                <Abzeichen>{t(GESCHWISTER_ART_SCHLUESSEL[eintrag.art])}</Abzeichen>
              </li>
            ))}
          </ul>
        )}
        {ansicht.weitereGeschwisterPlaetze.map((platz) => (
          <Text key={platz} rolle="hilfe" als="p">
            {t(WEITERE_GESCHWISTER_SCHLUESSEL[platz])}
          </Text>
        ))}
      </section>

      {trennen === null ? null : (
        <Modal
          titel={t('reiter_beziehungen_trennen_titel')}
          offen
          breite="schmal"
          beiSchliessen={schliessen}
          fokusNachSchliessen={() => document.getElementById(editorFeldId(idPraefix, 'eltern'))}
          fussaktionen={
            <>
              <Schaltflaeche variante="sekundaer" aufKlick={schliessen}>
                {t('reiter_beziehungen_trennen_abbrechen')}
              </Schaltflaeche>
              <Schaltflaeche variante="gefaehrlich" ladend={trennenLaeuft} aufKlick={bestaetigen}>
                {t('reiter_beziehungen_trennen_bestaetigen')}
              </Schaltflaeche>
            </>
          }
        >
          <Text rolle="koerper" als="p">
            {trennen.gegenueber === null
              ? t('reiter_beziehungen_trennen_text_ohne_partner', { a: eigenerName })
              : t('reiter_beziehungen_trennen_text', { a: eigenerName, b: trennen.gegenueber })}
          </Text>
          {trennenFehlertext === null ? null : (
            <p className="wz-reiter-beziehungen__fehler" role="alert">
              {trennenFehlertext}
            </p>
          )}
        </Modal>
      )}
    </div>
  )
}
