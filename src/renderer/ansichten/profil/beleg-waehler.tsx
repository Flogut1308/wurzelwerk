import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LebensdatumAngabe } from '../../../core/person/lebensdaten'
import type { AppFehler } from '../../../shared/fehler/app-fehler'
import type { PersonDetailBeleg } from '../../../shared/schemata/person-detail'
import { Abzeichen } from '../../bausteine/abzeichen'
import { Eingabekoerper } from '../../bausteine/eingabekoerper'
import { Formularfeld } from '../../bausteine/formularfeld'
import { Kontrollkaestchen } from '../../bausteine/kontrollkaestchen'
import { Schaltflaeche } from '../../bausteine/schaltflaeche'
import { Text } from '../../bausteine/text'
import { Textfeld } from '../../bausteine/textfeld'
import { useQuelleDetail, useQuelleSuche } from '../../brücke/abfrage-hooks'
import { useAussageZitatAnlegen, useQuelleAnlegen, useZitatAnlegen } from '../../brücke/befehl-hooks'
import { QuelleBearbeitenAnsicht } from '../quellen/quelle-bearbeiten'
import { quelleNeuAnlegenEin } from '../quellen/quelle-bearbeiten-logik'
import {
  aktiveZiele,
  chipAngabenZeigen,
  neuesZitatEin,
  verknuepfungsBefehle,
  zitatBeschriftung,
  zitatWaehlbar,
  type BelegChip,
  type BelegZeileZustand,
  type VerknuepfungsPaar,
  type ZitatBeschriftung,
} from './beleg-waehler-logik'
import { praedikatSchluessel, quelleTypSchluessel } from './profil-schluessel'
import './beleg-waehler.css'

type Uebersetzer = (schluessel: string, werte: Readonly<Record<string, string | number>>) => string

/** Beschriftung einer Angabe (Geburtsdatum, Sterbeort, …) — wie `angabeBeschriftung` im Reiter. */
function angabeText(angabe: LebensdatumAngabe, t: Uebersetzer): string {
  const schluessel = praedikatSchluessel(angabe)
  return schluessel === undefined ? angabe : t(schluessel, {})
}

/** i18n-Schlüssel und Werte der Zitat-Beschriftung (Seite, Eintragsnummer) im Wähler. */
function zitatText(beschriftung: ZitatBeschriftung, t: Uebersetzer): string {
  switch (beschriftung.art) {
    case 'seite_eintrag':
      return t('beleg_waehler_zitat_seite_eintrag', { seite: beschriftung.seite, eintragsnummer: beschriftung.eintragsnummer })
    case 'seite':
      return t('beleg_waehler_zitat_seite', { seite: beschriftung.seite })
    case 'eintrag':
      return t('beleg_waehler_zitat_eintrag', { eintragsnummer: beschriftung.eintragsnummer })
    case 'ohne':
      return t('beleg_waehler_zitat_ohne', {})
  }
}

/** Text eines Chips: Quellentitel (sonst „ohne Titel") mit Seite/Eintragsnummer. */
function chipText(beleg: PersonDetailBeleg, t: Uebersetzer): string {
  const quelle = beleg.quelle.titel ?? t('beleg_chip_ohne_titel', {})
  const beschriftung = zitatBeschriftung(beleg.zitat.seite, beleg.zitat.eintragsnummer)
  switch (beschriftung.art) {
    case 'seite_eintrag':
      return t('beleg_chip_text_seite_eintrag', { quelle, seite: beschriftung.seite, eintragsnummer: beschriftung.eintragsnummer })
    case 'seite':
      return t('beleg_chip_text_seite', { quelle, seite: beschriftung.seite })
    case 'eintrag':
      return t('beleg_chip_text_eintrag', { quelle, eintragsnummer: beschriftung.eintragsnummer })
    case 'ohne':
      return t('beleg_chip_text_ohne', { quelle })
  }
}

function fehlerText(fehler: AppFehler | null, t: Uebersetzer, tFehler: (schluessel: string) => string): string | null {
  if (fehler === null) return null
  return t('lebensdatum_fehler', { titel: tFehler(`${fehler.code}.titel`), was_tun: tFehler(`${fehler.code}.was_tun`) })
}

export interface BelegZeileProps {
  readonly zustand: BelegZeileZustand
  readonly chips: readonly BelegChip[]
  /** Öffnet die Belegschublade der Gruppe (mit dem Wähler im Kopf, E11). */
  readonly aufOeffnen: () => void
}

/**
 * Beleg-Zeile einer Gruppe (Artboard 1a „Beleg (Chip mit Typ + Titel, ‚Beleg verknüpfen')",
 * AP-1.30 PR 9d): die Belege der Ziel-Aussagen als Chips (Klick öffnet die Belegschublade) und
 * „Beleg verknüpfen". Ohne Wert gesperrt mit Hinweis (E4); stammt jeder Wert aus einem Ereignis,
 * steht statt des Knopfs „am Ereignis belegen" (E3).
 *
 * §14 [Design-Review]: das Chip-Etikett ist der Quellentyp statt „PDF" (Medien erst mit AP-1.31);
 * der Entwurf zeigt die Zeile nur an „Geburt", hier steht sie an „Tod" genauso.
 */
export function BelegZeile({ zustand, chips, aufOeffnen }: BelegZeileProps) {
  const { t } = useTranslation('profil')
  const anzahlZiele = zustand.art === 'waehlbar' ? zustand.ziele.length : 0
  return (
    <div className="wz-beleg-zeile">
      {chips.length === 0 ? null : (
        <ul className="wz-beleg-zeile__chips" aria-label={t('beleg_zeile_beschriftung')}>
          {chips.map((chip) => {
            const typ = t(quelleTypSchluessel(chip.beleg.quelle.typ))
            const text = chipText(chip.beleg, t)
            const angaben = chipAngabenZeigen(chip, anzahlZiele) ? chip.angaben.map((angabe) => angabeText(angabe, t)).join(t('beleg_chip_angaben_trenner')) : null
            return (
              <li key={chip.zitatId}>
                <button type="button" className="wz-beleg-zeile__chip" onClick={aufOeffnen}>
                  <Abzeichen>{typ}</Abzeichen>
                  <span className="wz-beleg-zeile__chip-text">{text}</span>
                  {angaben === null ? null : <span className="wz-beleg-zeile__chip-angaben">{t('beleg_chip_angaben', { angaben })}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {zustand.art === 'nur_ereignis' ? (
        <Text rolle="hilfe" als="p">
          {t('beleg_am_ereignis_belegen')}
        </Text>
      ) : (
        <Schaltflaeche variante="unauffaellig" gesperrt={zustand.art === 'ohne_wert'} aufKlick={aufOeffnen}>
          {t('beleg_verknuepfen')}
        </Schaltflaeche>
      )}
      {zustand.art === 'ohne_wert' ? (
        <Text rolle="hilfe" als="p">
          {t('beleg_verknuepfen_ohne_wert')}
        </Text>
      ) : null}
    </div>
  )
}

/** Ergebnis der letzten Aktion im Wähler: verknüpft oder der Schritt, der gescheitert ist. */
type Meldung = 'verknuepft' | 'fehler_verknuepfen' | 'fehler_zitat' | 'fehler_quelle'

export interface BelegWaehlerProps {
  readonly zustand: Extract<BelegZeileZustand, { readonly art: 'waehlbar' }>
  /** Der Lesestand, aus dem `zustand` stammt (Referenz des Lesemodells). Wechselt er, gilt wieder
   * allein das Lesemodell dafür, was schon verknüpft ist (s. `unterwegs`). */
  readonly stand: unknown
}

/**
 * `BelegWaehler` (AP-1.30 PR 9d, B-01/B-02/S-08; docs/80 §33 V-130-9d) — Kopf der Belegschublade
 * (E11, kein Modal): „belegt: Datum ☑ Ort ☑" (E1), Quelle suchen (E7: nur mit Text, kein „zuletzt
 * verwendet"), bestehendes Zitat wählen oder ein neues mit Seite/Eintragsnummer anlegen.
 *
 * - Ein Klick auf ein Zitat schreibt sofort, ohne Bestätigen (E9); je angekreuztem Ziel ein eigener
 *   `aussage_zitat.anlegen` (E2). „Neues Zitat" = `zitat.anlegen` + Verknüpfung = zwei Undo-Schritte
 *   (dokumentiert wie Entscheidung K). Kein Sammelbefehl, `src/main`/`src/shared` unverändert.
 * - Die Verknüpfung ist kein Autosave-Wert eines Felds, sondern eine Mutation. Ein laufender
 *   Datums-Debounce ist beim Klick schon geschrieben: „Beleg verknüpfen" nimmt dem Datumsfeld den
 *   Fokus, und die Schublade holt ihn beim Öffnen zu sich (`Seitenschublade`) — beides ist das
 *   Verlassen des Felds, das den Entwurf per `sofortSchreiben` schreibt.
 * - Während geschrieben wird, ist der Wähler gesperrt; bereits verknüpfte Zitate sind ausgeblendet
 *   (E9). Ein eben geschriebenes Paar gilt als verknüpft, bis ein neuer Lesestand kommt (`unterwegs`)
 *   — sonst könnte ein zweiter Klick vor dem Nachladen `KONFLIKT_BEREITS_VORHANDEN` auslösen.
 * - Sicherheit wird NICHT aus den Belegen abgeleitet (E8, B-03): sie bleibt die Einschätzung der
 *   Forscherin; ein Hinweis sagt das (§14 [Design-Review]).
 * - Ein halb getipptes neues Zitat (Seite/Eintragsnummer) ist ein lokaler Entwurf, kein
 *   gespeicherter Wert: Schließen der Schublade oder Reiterwechsel verwirft ihn ohne Nachfrage.
 *   Begründung: ein automatisch angelegtes Zitat ohne Verknüpfung wäre ein verwaister Datensatz, und
 *   das Kurzformular hat (wie das Ereignisformular im Reiter Leben, V-130-9b2 H2) einen
 *   ausdrücklichen Knopf — verloren gehen höchstens zwei kurze Felder, nichts Gespeichertes.
 */
export function BelegWaehler({ zustand, stand }: BelegWaehlerProps) {
  const { t } = useTranslation('profil')
  const { t: tFehler } = useTranslation('fehler')
  const [abgewaehlt, setAbgewaehlt] = useState<ReadonlySet<LebensdatumAngabe>>(new Set())
  const [suchtext, setSuchtext] = useState('')
  const [quelleId, setQuelleId] = useState<string | null>(null)
  const [neueQuelleId, setNeueQuelleId] = useState<string | null>(null)
  const [seite, setSeite] = useState('')
  const [eintragsnummer, setEintragsnummer] = useState('')
  const [schreibt, setSchreibt] = useState(false)
  // Meldung der LETZTEN Aktion (hueter #176 H1): welcher Schritt gescheitert ist bzw. ob verknüpft
  // wurde. Nicht `a.error ?? b.error`: `useMutation.error` bleibt stehen, bis dieselbe Mutation erneut
  // läuft — ein alter Fehler verdeckte sonst die Meldung einer späteren, gelungenen Aktion.
  const [meldung, setMeldung] = useState<Meldung | null>(null)
  const [unterwegs, setUnterwegs] = useState<{ readonly stand: unknown; readonly paare: readonly VerknuepfungsPaar[] }>({ stand: null, paare: [] })
  const schreibtRef = useRef(false)
  const standRef = useRef(stand)
  useEffect(() => {
    standRef.current = stand
  })

  const verknuepfen = useAussageZitatAnlegen()
  const zitatAnlegen = useZitatAnlegen()
  const quelleAnlegen = useQuelleAnlegen()

  const sucheAktiv = quelleId === null && suchtext.trim() !== ''
  const suche = useQuelleSuche({ text: suchtext }, { enabled: sucheAktiv })
  const detail = useQuelleDetail({ quelleId: quelleId ?? '' }, { enabled: quelleId !== null })

  const ziele = aktiveZiele(zustand.ziele, abgewaehlt)
  const paareUnterwegs = unterwegs.stand === stand ? unterwegs.paare : []
  const gesperrt = schreibt || ziele.length === 0
  const fehler = meldung === null || meldung === 'verknuepft' ? null : fehlerText(fehlerDer(meldung), t, tFehler)

  function fehlerDer(schritt: Exclude<Meldung, 'verknuepft'>): AppFehler | null {
    switch (schritt) {
      case 'fehler_verknuepfen':
        return verknuepfen.error
      case 'fehler_zitat':
        return zitatAnlegen.error
      case 'fehler_quelle':
        return quelleAnlegen.error
    }
  }

  function zielUmschalten(angabe: LebensdatumAngabe, an: boolean): void {
    const naechste = new Set(abgewaehlt)
    if (an) naechste.delete(angabe)
    else naechste.add(angabe)
    setAbgewaehlt(naechste)
  }

  /** Schreibt die Verknüpfungen nacheinander (je ein Undo-Schritt) und sperrt so lange. */
  async function schreiben(zitatIdHolen: () => Promise<string>): Promise<void> {
    if (schreibtRef.current) return
    schreibtRef.current = true
    setSchreibt(true)
    setMeldung(null)
    const geschrieben: VerknuepfungsPaar[] = []
    let schritt: Exclude<Meldung, 'verknuepft'> = 'fehler_zitat'
    try {
      const zitatId = await zitatIdHolen()
      schritt = 'fehler_verknuepfen'
      for (const ein of verknuepfungsBefehle(zitatId, ziele, paareUnterwegs)) {
        await verknuepfen.mutateAsync(ein)
        geschrieben.push(ein)
      }
      setMeldung('verknuepft')
    } catch {
      // Der Text kommt aus `error` der gescheiterten Mutation; Geschriebenes bleibt geschrieben.
      setMeldung(schritt)
    } finally {
      if (geschrieben.length > 0) setUnterwegs({ stand: standRef.current, paare: [...paareUnterwegs, ...geschrieben] })
      schreibtRef.current = false
      setSchreibt(false)
    }
  }

  function zitatWaehlen(zitatId: string): void {
    void schreiben(() => Promise.resolve(zitatId))
  }

  function neuesZitatVerknuepfen(id: string): void {
    void schreiben(async () => {
      const ergebnis = await zitatAnlegen.mutateAsync(neuesZitatEin(id, seite, eintragsnummer))
      setSeite('')
      setEintragsnummer('')
      return ergebnis.id
    })
  }

  function quelleNeuAnlegen(): void {
    setMeldung(null)
    quelleAnlegen.mutateAsync(quelleNeuAnlegenEin()).then(
      (ergebnis) => setNeueQuelleId(ergebnis.id),
      // Der Text kommt aus `quelleAnlegen.error`.
      () => setMeldung('fehler_quelle'),
    )
  }

  const treffer = suche.data?.treffer ?? []
  const zitate = (detail.data?.zitate ?? []).filter((zitat) => zitatWaehlbar(zitat.id, ziele, paareUnterwegs))
  const kopf = detail.data?.kopf

  return (
    <section className="wz-beleg-waehler" aria-labelledby="wz-beleg-waehler-titel">
      <Text rolle="titel-klein" als="h3" id="wz-beleg-waehler-titel">
        {t('beleg_verknuepfen')}
      </Text>

      <div className="wz-beleg-waehler__ziele">
        <Text rolle="beschriftung" als="span">
          {t('beleg_waehler_ziele')}
        </Text>
        {zustand.ziele.length === 1 ? (
          zustand.ziele.map((ziel) => (
            <Text key={ziel.angabe} rolle="koerper-klein" als="span">
              {angabeText(ziel.angabe, t)}
            </Text>
          ))
        ) : (
          zustand.ziele.map((ziel) => (
            <span key={ziel.angabe} className="wz-beleg-waehler__ziel">
              <Kontrollkaestchen
                zustand={abgewaehlt.has(ziel.angabe) ? 'aus' : 'ein'}
                bezeichnung={angabeText(ziel.angabe, t)}
                gesperrt={schreibt}
                aufAenderung={(neu) => zielUmschalten(ziel.angabe, neu === 'ein')}
              />
              <Text rolle="koerper-klein" als="span">
                {angabeText(ziel.angabe, t)}
              </Text>
            </span>
          ))
        )}
      </div>
      {zustand.ereignisAngaben.map((angabe) => (
        <Text key={angabe} rolle="hilfe" als="p">
          {t('beleg_waehler_ziel_ereignis', { angabe: angabeText(angabe, t) })}
        </Text>
      ))}
      {ziele.length === 0 ? (
        <Text rolle="hilfe" als="p">
          {t('beleg_waehler_keine_ziele')}
        </Text>
      ) : null}

      {quelleId === null ? (
        <div className="wz-beleg-waehler__schritt">
          <Formularfeld beschriftung={t('beleg_waehler_quelle_suchen')} hilfetext={t('beleg_waehler_quelle_suchhinweis')}>
            <Eingabekoerper id="wz-beleg-waehler-suche" typ="search" wert={suchtext} aufAenderung={setSuchtext} platzhalter={t('beleg_waehler_quelle_platzhalter')} />
          </Formularfeld>
          {sucheAktiv ? (
            suche.isPending ? (
              <Text rolle="hilfe" als="p">
                {t('beleg_waehler_laedt')}
              </Text>
            ) : treffer.length === 0 ? (
              <Text rolle="hilfe" als="p">
                {t('beleg_waehler_quelle_keine_treffer')}
              </Text>
            ) : (
              <ul className="wz-beleg-waehler__liste" aria-label={t('beleg_waehler_quellen_liste')}>
                {treffer.map((quelle) => (
                  <li key={quelle.id}>
                    <button type="button" className="wz-beleg-waehler__zeile" onClick={() => setQuelleId(quelle.id)}>
                      <span className="wz-beleg-waehler__zeile-titel">{quelle.titel ?? t('beleg_chip_ohne_titel')}</span>
                      <span className="wz-beleg-waehler__zeile-meta">
                        {quelle.autor === null ? t(quelleTypSchluessel(quelle.typ)) : t('beleg_waehler_quelle_meta', { typ: t(quelleTypSchluessel(quelle.typ)), autor: quelle.autor })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
          <div>
            <Schaltflaeche variante="unauffaellig" ladend={quelleAnlegen.isPending} aufKlick={quelleNeuAnlegen}>
              {t('beleg_quelle_anlegen')}
            </Schaltflaeche>
          </div>
        </div>
      ) : (
        <div className="wz-beleg-waehler__schritt">
          <div className="wz-beleg-waehler__quelle">
            <Text rolle="beschriftung" als="span">
              {kopf === undefined ? t('beleg_waehler_laedt') : t('beleg_waehler_quelle_gewaehlt', { quelle: kopf.titel ?? t(quelleTypSchluessel(kopf.typ)) })}
            </Text>
            <Schaltflaeche variante="unauffaellig" gesperrt={schreibt} aufKlick={() => setQuelleId(null)}>
              {t('beleg_waehler_andere_quelle')}
            </Schaltflaeche>
          </div>

          <Text rolle="beschriftung" als="span">
            {t('beleg_waehler_zitat_waehlen')}
          </Text>
          {detail.isPending ? (
            <Text rolle="hilfe" als="p">
              {t('beleg_waehler_laedt')}
            </Text>
          ) : zitate.length === 0 ? (
            <Text rolle="hilfe" als="p">
              {t('beleg_waehler_keine_zitate')}
            </Text>
          ) : (
            <ul className="wz-beleg-waehler__liste" aria-label={t('beleg_waehler_zitate_liste')}>
              {zitate.map((zitat) => (
                <li key={zitat.id}>
                  <button type="button" className="wz-beleg-waehler__zeile" disabled={gesperrt} onClick={() => zitatWaehlen(zitat.id)}>
                    <span className="wz-beleg-waehler__zeile-titel">{zitatText(zitatBeschriftung(zitat.seite, zitat.eintragsnummer), t)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="wz-beleg-waehler__neu">
            <Text rolle="beschriftung" als="span">
              {t('beleg_waehler_neues_zitat')}
            </Text>
            <div className="wz-beleg-waehler__neu-felder">
              <Formularfeld beschriftung={t('beleg_waehler_seite')}>
                <Textfeld id="wz-beleg-waehler-seite" wert={seite} aufAenderung={setSeite} gesperrt={schreibt} />
              </Formularfeld>
              <Formularfeld beschriftung={t('beleg_waehler_eintragsnummer')}>
                <Textfeld id="wz-beleg-waehler-eintragsnummer" wert={eintragsnummer} aufAenderung={setEintragsnummer} gesperrt={schreibt} />
              </Formularfeld>
            </div>
            <div>
              <Schaltflaeche variante="sekundaer" gesperrt={gesperrt} ladend={schreibt} aufKlick={() => neuesZitatVerknuepfen(quelleId)}>
                {t('beleg_waehler_neues_zitat_verknuepfen')}
              </Schaltflaeche>
            </div>
          </div>
        </div>
      )}

      <Text rolle="hilfe" als="p">
        {t('beleg_waehler_sicherheit_hinweis')}
      </Text>
      {/* `aria-live` statt `role="status"`: der Editor hat schon einen Speicherstatus mit dieser Rolle. */}
      <div aria-live="polite" className="wz-beleg-waehler__status">
        {fehler !== null ? (
          <Text rolle="hilfe" als="p">
            {fehler}
          </Text>
        ) : meldung === 'verknuepft' ? (
          <Text rolle="hilfe" als="p">
            {t('beleg_waehler_verknuepft')}
          </Text>
        ) : null}
      </div>

      {neueQuelleId === null ? null : (
        <QuelleBearbeitenAnsicht
          quelleId={neueQuelleId}
          aufSchliessen={() => {
            setQuelleId(neueQuelleId)
            setNeueQuelleId(null)
          }}
        />
      )}
    </section>
  )
}
