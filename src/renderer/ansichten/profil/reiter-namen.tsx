import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppFehler } from '../../../shared/fehler/app-fehler'
import type { PersonDetailName } from '../../../shared/schemata/person-detail'
import { Abzeichen } from '../../bausteine/abzeichen'
import { Schaltflaeche } from '../../bausteine/schaltflaeche'
import { Text } from '../../bausteine/text'
import { useHauptnameWechseln, useNameLoeschen } from '../../brücke/befehl-hooks'
import { NamensformModal } from './namensform-modal'
import { nameTypSchluessel, schriftSchluessel } from './profil-schluessel'
import {
  anzeigetextDerForm,
  artNummern,
  gueltigkeitJahre,
  istUmschrift,
  kartenFolge,
  namensteilSchluessel,
  reihenfolgeSchluessel,
  sortiertUnter,
  teileInAnzeigefolge,
  umschriftNormSchluessel,
  vorschauSpracheBeschriftung,
} from './reiter-namen-logik'
import { NamenVorschau } from './reiter-namen-vorschau'
import './reiter-namen.css'

export interface ReiterNamenProps {
  readonly personId: string
  readonly namen: readonly PersonDetailName[]
  /** Platzhalter zeigen nie einen Namen (A-17) — für die Vorschau. */
  readonly istPlatzhalter: boolean
}

/** Offenes Modal: welche Form (`null` = neu) und eine laufende Nummer, damit jedes Öffnen frisch beginnt. */
interface OffenesModal {
  readonly formId: string | null
  readonly nr: number
}

/**
 * Reiter „Namen" (AP-1.30 PR 11c-1, Artboard 2a, Vorgaben §3.5; docs/80 §33 V-130-11-E6 … E10): je
 * Namensform eine Karte — reine Anzeige (E8), bearbeitet wird allein im Modal „Namensform bearbeiten"
 * (`namensform-modal.tsx`). Ersetzt im Reiter die flache Maske `NamenBearbeitenAbschnitt` (in PR 11c-2 gelöscht).
 *
 * - Kopf „Namensformen · n · nach Sprache" mit „+ Namensform", darunter der Vorschau-Umschalter (PR 11b).
 * - Kartenfolge E10 (`kartenFolge`); die Teile in Anzeigefolge des Kerns (`teileInAnzeigefolge`).
 * - Aktionen im Kartenkopf als sichtbare Schaltflächen statt „⋯" (Design-Review): „Bearbeiten",
 *   „Als Hauptname" (`hauptname.wechseln`), „Entfernen" (`name.loeschen`; E7: auch die letzte Form).
 * - Umschriften (rolle NULL) als eigene Karte „Umschrift von …"; bearbeitbar im selben Modal (Teile und
 *   Kopf, der Bezug nur angezeigt) und entfernbar, aber nicht „Als Hauptname" (keine Regel lässt es zu).
 * - Verschwindet die Form eines offenen Modals (z. B. Undo ihres Anlegens), schließt das Modal mit Hinweis.
 */
export function ReiterNamen({ personId, namen, istPlatzhalter }: ReiterNamenProps) {
  const { t } = useTranslation('profil')
  const titelId = useId()
  const [offen, setOffen] = useState<OffenesModal | null>(null)
  const [naechsteNr, setNaechsteNr] = useState(1)
  const [entfernt, setEntfernt] = useState(false)
  const neuKnopf = useRef<HTMLDivElement | null>(null)

  // Zustand während des Renderns anpassen (wie im Modal): die bearbeitete Form gibt es nicht mehr.
  if (offen !== null && offen.formId !== null && !namen.some((name) => name.id === offen.formId)) {
    setOffen(null)
    setEntfernt(true)
  }

  function oeffnen(formId: string | null): void {
    setEntfernt(false)
    setOffen({ formId, nr: naechsteNr })
    setNaechsteNr(naechsteNr + 1)
  }

  const karten = kartenFolge(namen)
  const hauptnameId = namen.find((name) => name.ist_bevorzugt)?.id ?? null

  // Review #207 H5: „Entfernen" hängt die Karte samt fokussiertem Knopf aus, der Fokus fiele auf `body`.
  // Vor dem Löschen wird das Ziel gemerkt (nächste Karte, bei der letzten die vorige, sonst „+ Namensform");
  // sobald die Form aus dem Lesemodell verschwunden ist, bekommt es den Fokus. Ein Ref, kein Zustand: der
  // Merker löst kein Rendern aus und wird nur im Effekt gelesen.
  const fokusNachEntfernen = useRef<{ readonly entfernt: string; readonly ziel: string | null } | null>(null)
  useEffect(() => {
    const merker = fokusNachEntfernen.current
    if (merker === null || namen.some((name) => name.id === merker.entfernt)) return
    fokusNachEntfernen.current = null
    const karte = merker.ziel === null ? null : document.querySelector(`[data-namensform-id="${CSS.escape(merker.ziel)}"]`)
    const ziel = karte?.querySelector('button') ?? neuKnopf.current?.querySelector('button') ?? null
    if (ziel instanceof HTMLElement) ziel.focus()
  }, [namen])

  function entfernenVorgemerkt(id: string): void {
    const index = karten.findIndex((name) => name.id === id)
    const ziel = karten[index + 1] ?? karten[index - 1]
    fokusNachEntfernen.current = { entfernt: id, ziel: ziel?.id ?? null }
  }

  /** PR 11c-1b H3: scheitert das Löschen, gilt der Merker nicht mehr — sonst risse ein späteres Verschwinden
   * derselben Form (z. B. Undo ihres Anlegens) den Fokus unvermittelt an sich. */
  function entfernenFehlgeschlagen(id: string): void {
    if (fokusNachEntfernen.current?.entfernt === id) fokusNachEntfernen.current = null
  }

  return (
    <section className="wz-reiter-namen" aria-labelledby={titelId}>
      <div className="wz-reiter-namen__kopf">
        <Text rolle="titel-klein" als="h2" id={titelId}>
          {t('namensformen_titel')}
        </Text>
        <Text rolle="hilfe" als="span">
          {t('namensformen_anzahl', { anzahl: namen.length })}
        </Text>
        <div className="wz-reiter-namen__kopf-aktion" ref={neuKnopf}>
          <Schaltflaeche variante="primaer" aufKlick={() => oeffnen(null)}>
            {t('namensform_neu')}
          </Schaltflaeche>
        </div>
      </div>

      <NamenVorschau namen={namen} istPlatzhalter={istPlatzhalter} />

      {entfernt ? (
        <p className="wz-namensform-modal__hinweis" role="status">
          {t('namensform_entfernt_hinweis')}
        </p>
      ) : null}

      {karten.length === 0 ? (
        <Text rolle="hilfe" als="p">
          {t('namensformen_leer')}
        </Text>
      ) : (
        <ul className="wz-reiter-namen__liste">
          {karten.map((name) => (
            <li key={name.id}>
              <NamensformKarte
                personId={personId}
                name={name}
                namen={namen}
                hauptnameId={hauptnameId}
                aufBearbeiten={() => oeffnen(name.id)}
                aufEntfernen={() => entfernenVorgemerkt(name.id)}
                aufEntfernenFehlgeschlagen={() => entfernenFehlgeschlagen(name.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {offen === null ? null : (
        <NamensformModal
          key={offen.nr}
          personId={personId}
          formId={offen.formId}
          namen={namen}
          aufSchliessen={() => setOffen(null)}
          fokusNachSchliessen={() => neuKnopf.current?.querySelector('button') ?? null}
        />
      )}
    </section>
  )
}

interface NamensformKarteProps {
  readonly personId: string
  readonly name: PersonDetailName
  readonly namen: readonly PersonDetailName[]
  readonly hauptnameId: string | null
  readonly aufBearbeiten: () => void
  /** Vor dem Löschen: das Fokusziel danach vormerken (Review #207 H5). */
  readonly aufEntfernen: () => void
  /** Das Löschen ist gescheitert: den Merker verwerfen (PR 11c-1b H3). */
  readonly aufEntfernenFehlgeschlagen: () => void
}

/** Fehler einer Kartenaktion mit Titel und Handlungsanweisung (Muster `name_fehler`). */
function aktionsFehler(fehler: AppFehler | null, t: (schluessel: string, werte: Readonly<Record<string, string>>) => string, tFehler: (schluessel: string) => string): string | null {
  return fehler === null ? null : t('name_fehler', { titel: tFehler(`${fehler.code}.titel`), was_tun: tFehler(`${fehler.code}.was_tun`) })
}

/** Eine Karte je Namensform (Artboard 2a): Kopf mit Sprache, Schrift, Reihenfolge, Hauptname und Aktionen;
 * Teile in Anzeigefolge mit markiertem Rufnamen; Rolle mit Notiz, Gültigkeit, Genusform, „Sortiert unter". */
function NamensformKarte({ personId, name, namen, hauptnameId, aufBearbeiten, aufEntfernen, aufEntfernenFehlgeschlagen }: NamensformKarteProps) {
  const { t } = useTranslation('profil')
  const { t: tFehler } = useTranslation('fehler')
  const titelId = useId()
  const hauptnameWechseln = useHauptnameWechseln()
  const nameLoeschen = useNameLoeschen()
  const umschrift = istUmschrift(name)
  const text = anzeigetextDerForm(name)
  const teile = teileInAnzeigefolge(name)
  const nummern = artNummern(teile)
  const gueltig = gueltigkeitJahre(name)
  const ursprung = umschrift && name.umschrift_von !== null ? namen.find((form) => form.id === name.umschrift_von) : undefined
  const genusformen = teile.filter((teil) => teil.art === 'nachname' && teil.feminine_variante !== null)
  const fehler = aktionsFehler(hauptnameWechseln.error ?? nameLoeschen.error ?? null, t, tFehler)

  return (
    <article className={`wz-namensform-karte${name.ist_bevorzugt ? ' wz-namensform-karte--hauptname' : ''}`} aria-labelledby={titelId} data-namensform-id={name.id}>
      <div className="wz-namensform-karte__kopf">
        <span className="wz-namensform-karte__titel" id={titelId} lang={name.sprache ?? undefined}>
          {text === '' ? t('namensform_ohne_text') : text}
        </span>
        {name.sprache === null ? null : <Abzeichen variante={name.ist_bevorzugt ? 'info' : 'neutral'}>{vorschauSpracheBeschriftung(name.sprache, t)}</Abzeichen>}
        {name.schrift === null ? null : <span className="wz-namensform-karte__etikett">{t(schriftSchluessel(name.schrift))}</span>}
        {name.reihenfolge === null ? null : <span className="wz-namensform-karte__etikett">{t(reihenfolgeSchluessel(name.reihenfolge))}</span>}
        {name.ist_bevorzugt ? <span className="wz-namensform-karte__hauptname">{t('namensform_hauptname')}</span> : null}
        <span className="wz-namensform-karte__aktionen">
          <Schaltflaeche variante="unauffaellig" aufKlick={aufBearbeiten}>
            {t('namensform_bearbeiten')}
          </Schaltflaeche>
          {umschrift || name.ist_bevorzugt || hauptnameId === null ? null : (
            <Schaltflaeche variante="unauffaellig" gesperrt={hauptnameWechseln.isPending} aufKlick={() => hauptnameWechseln.mutate({ personId, alt: hauptnameId, neu: name.id })}>
              {t('namensform_als_hauptname')}
            </Schaltflaeche>
          )}
          <Schaltflaeche
            variante="gefaehrlich"
            gesperrt={nameLoeschen.isPending}
            aufKlick={() => {
              aufEntfernen()
              nameLoeschen.mutate({ id: name.id }, { onError: aufEntfernenFehlgeschlagen })
            }}
          >
            {t('namensform_entfernen')}
          </Schaltflaeche>
        </span>
      </div>

      <div className="wz-namensform-karte__inhalt">
        {umschrift ? (
          <div className="wz-namensform-karte__zeile">
            <Abzeichen variante={ursprung === undefined ? 'warnung' : 'neutral'}>
              {ursprung === undefined ? t('namensform_umschrift_ohne_ursprung') : t('namensform_umschrift_von', { name: anzeigetextDerForm(ursprung) })}
            </Abzeichen>
            {name.umschrift_norm === null ? null : <Abzeichen variante="info">{t(umschriftNormSchluessel(name.umschrift_norm))}</Abzeichen>}
          </div>
        ) : null}

        {teile.length === 0 ? null : (
          <dl className="wz-namensform-karte__teile">
            {teile.map((teil, index) => {
              const nummer = nummern[index] ?? null
              const art = t(namensteilSchluessel(teil.art))
              return (
                <div key={teil.id} className="wz-namensform-karte__teil">
                  <dt>
                    <Text rolle="beschriftung" als="span">
                      {nummer === null ? art : t('namensteil_nummeriert', { art, nummer: String(nummer) })}
                    </Text>
                  </dt>
                  <dd className={`wz-namensform-karte__wert${teil.ist_rufname ? ' wz-namensform-karte__wert--rufname' : ''}`} lang={name.sprache ?? undefined}>
                    {teil.wert}
                    {teil.ist_rufname ? <span className="wz-namensform-karte__rufname">{t('namensform_rufname')}</span> : null}
                  </dd>
                </div>
              )
            })}
          </dl>
        )}

        {umschrift && name.rollen_notiz === null && gueltig.von === undefined && gueltig.bis === undefined ? null : (
          <div className="wz-namensform-karte__zeile">
            {name.rolle === null ? null : <Abzeichen>{t(nameTypSchluessel(name.rolle))}</Abzeichen>}
            {name.rollen_notiz === null ? null : <Abzeichen>{name.rollen_notiz}</Abzeichen>}
            {gueltig.von !== undefined && gueltig.bis !== undefined ? (
              <Text rolle="koerper-klein" farbe="sekundaer" als="span">
                {t('namensform_gueltig_zwischen', { von: String(gueltig.von), bis: String(gueltig.bis) })}
              </Text>
            ) : gueltig.von !== undefined ? (
              <Text rolle="koerper-klein" farbe="sekundaer" als="span">
                {t('namensform_gueltig_ab', { jahr: String(gueltig.von) })}
              </Text>
            ) : gueltig.bis !== undefined ? (
              <Text rolle="koerper-klein" farbe="sekundaer" als="span">
                {t('namensform_gueltig_bis', { jahr: String(gueltig.bis) })}
              </Text>
            ) : null}
          </div>
        )}

        {genusformen.map((teil) => (
          <div key={teil.id} className="wz-namensform-karte__zeile">
            <Text rolle="koerper-klein" farbe="sekundaer" als="span">
              {t('namensform_genusform')}
            </Text>
            <span className="wz-namensform-karte__genusform" lang={name.sprache ?? undefined}>
              {teil.feminine_variante}
            </span>
          </div>
        ))}

        <div className="wz-namensform-karte__fuss">
          <Text rolle="koerper-klein" farbe="sekundaer" als="span">
            {t('namensform_sortiert_unter')}
          </Text>
          <Text rolle="technisch" als="span">
            {sortiertUnter(name)}
          </Text>
        </div>

        {fehler === null ? null : (
          <p className="wz-namensform-modal__fehler" role="alert">
            {fehler}
          </p>
        )}
      </div>
    </article>
  )
}
