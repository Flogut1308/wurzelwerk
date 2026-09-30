import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PersonDetailAussage, PersonDetailBeleg } from '../../../shared/schemata/person-detail'
import { Schaltflaeche } from '../../bausteine/schaltflaeche'
import { Text } from '../../bausteine/text'
import { useQuelleAnlegen } from '../../brücke/befehl-hooks'
import { QuelleBearbeitenAnsicht } from '../quellen/quelle-bearbeiten'
import { quelleNeuAnlegenEin } from '../quellen/quelle-bearbeiten-logik'
import { quelleTypSchluessel, unmittelbarkeitSchluessel } from './profil-schluessel'
import './beleg-liste.css'

/** Was die Liste von einem Feld braucht: je Aussage Kennung, Anzeigewert und Belege. Ein
 * `PersonDetailGrunddatenFeld` passt; der Reiter Person zeigt so auch die Belege der Existenz-Aussage
 * eines Ereignisses (AP-1.30 PR 9d-2), die kein Grunddatenfeld ist. */
export interface BelegListeFeld {
  readonly aussagen: readonly Pick<PersonDetailAussage, 'aussage_id' | 'wert' | 'belege'>[]
}

export interface BelegListeProps {
  readonly feld: BelegListeFeld
  /** AP-1.30 PR 9d (V-130-9d E10): „Verknüpfung entfernen" je Beleg — nur im Editor (Reiter Person),
   * nie in der Lesesicht. Entfernt NUR die Verknüpfung (`aussage_zitat.loeschen`), das Zitat bleibt. */
  readonly aufVerknuepfungEntfernen?: (aussageId: string, zitatId: string) => void
  /** Sperrt „Verknüpfung entfernen", solange ein Entfernen läuft. */
  readonly entfernenGesperrt?: boolean
  /** Der feste „Quelle anlegen"-Fuß (Standard: ja). Der Reiter Person zeigt ihn im Beleg-Wähler
   * statt einmal je Liste (PR 9d). */
  readonly mitQuelleAnlegen?: boolean
  /** Hinweis unter einem Beleg, `null` = keiner (AP-1.30 PR 9d-2, hueter #178 H3: ein Beleg mit
   * `feld` NULL an der Existenz-Aussage gilt für Datum UND Ort — „Verknüpfung entfernen" nimmt ihn an
   * beiden weg, das steht dann daneben). */
  readonly belegHinweis?: (beleg: PersonDetailBeleg) => string | null
}

export interface BelegEintragProps {
  readonly beleg: PersonDetailBeleg
}

/**
 * `BelegEintrag` — DREISTUFIGE Anzeige eines einzelnen Belegs (S-08, U-1.7-belegliste-zweistufig,
 * AP-1.10 PR-B, löst die vorherige zweistufige `{ quelle: string, zitat: string | null }`-Anzeige
 * ab): Stufe 1 Quelle (Typ/Titel/Archiv/Signatur, plus `unmittelbarkeit` NUR bei `typ ===
 * 'muendlich'`, §2.15) → Stufe 2 Zitat (Seite/Eintragsnummer/Zugriffsdatum/Digitalisat-Link,
 * Zeile nur sichtbar, wenn mindestens eines davon gepflegt ist) → Stufe 3 Transkript (in
 * `--wz-familie-original` über `Text rolle="original"`, wie zuvor). Exportiert, weil
 * `Widerspruchsblock` (S-09) dieselbe Beleg-Anzeige braucht — ein Beleg sieht in beiden Schubladen
 * gleich aus.
 *
 * „Quelle bearbeiten"-Link (AP-1.17 PR-C1, docs/80_Offene_Fragen.md §29): kontextueller
 * Einstiegspunkt in die Quelle/Zitat/Archiv-Pflege-Ansicht (`quelle-bearbeiten.tsx`) — es gibt
 * noch KEINEN globalen „Quellen"-Screen (S-35, Phase 2/3), analog zum „Ort bearbeiten"-Link am
 * `Ortsfeld` (AP-1.16 PR-C). Lokaler Zustand genügt, `QuelleBearbeitenAnsicht` ist eine
 * `position: fixed`-Seitenschublade (analog `OrtBearbeitenAnsicht`) und stapelt sich einfach über
 * die bereits offene Beleg-/Widerspruchs-Seitenschublade.
 */
export function BelegEintrag({ beleg }: BelegEintragProps) {
  const { t } = useTranslation('profil')
  const { quelle, zitat, transkript } = beleg
  const zitatHatInhalt = zitat.seite !== null || zitat.eintragsnummer !== null || zitat.zugriffsdatum_wert1 !== null || zitat.digitalisat_url !== null
  const [quelleBearbeitenOffen, setQuelleBearbeitenOffen] = useState(false)

  return (
    <div className="wz-beleg-eintrag">
      <div className="wz-beleg-eintrag__quelle">
        <Text rolle="beschriftung" als="span">
          {quelle.titel ?? t(quelleTypSchluessel(quelle.typ))}
        </Text>
        {quelle.titel !== null ? (
          <Text rolle="hilfe" als="span">
            {t(quelleTypSchluessel(quelle.typ))}
          </Text>
        ) : null}
        {quelle.archiv_name !== null ? (
          <Text rolle="koerper-klein" als="span">
            {t('beleg_archiv_label', { archiv: quelle.archiv_name })}
          </Text>
        ) : null}
        {quelle.signatur !== null ? (
          <Text rolle="koerper-klein" als="span">
            {t('beleg_signatur_label', { signatur: quelle.signatur })}
          </Text>
        ) : null}
        {quelle.typ === 'muendlich' && quelle.unmittelbarkeit !== null ? (
          <Text rolle="koerper-klein" als="span">
            {t(unmittelbarkeitSchluessel(quelle.unmittelbarkeit))}
          </Text>
        ) : null}
        <Schaltflaeche variante="unauffaellig" aufKlick={() => setQuelleBearbeitenOffen(true)}>
          {t('beleg_quelle_bearbeiten')}
        </Schaltflaeche>
      </div>

      {zitatHatInhalt ? (
        <div className="wz-beleg-eintrag__zitatdetail">
          {zitat.seite !== null ? (
            <Text rolle="koerper-klein" als="span">
              {t('beleg_seite_label', { seite: zitat.seite })}
            </Text>
          ) : null}
          {zitat.eintragsnummer !== null ? (
            <Text rolle="koerper-klein" als="span">
              {t('beleg_eintragsnummer_label', { eintragsnummer: zitat.eintragsnummer })}
            </Text>
          ) : null}
          {zitat.zugriffsdatum_wert1 !== null ? (
            <Text rolle="koerper-klein" als="span">
              {t('beleg_zugriffsdatum_label', { datum: zitat.zugriffsdatum_wert1 })}
            </Text>
          ) : null}
          {zitat.digitalisat_url !== null ? (
            <a href={zitat.digitalisat_url} target="_blank" rel="noreferrer" className="wz-text wz-text--koerper-klein wz-text--farbe-akzent">
              {t('beleg_digitalisat_link')}
            </a>
          ) : null}
        </div>
      ) : null}

      {transkript !== null ? (
        <Text rolle="original" als="p">
          {transkript}
        </Text>
      ) : null}

      {quelleBearbeitenOffen ? <QuelleBearbeitenAnsicht quelleId={quelle.id} aufSchliessen={() => setQuelleBearbeitenOffen(false)} /> : null}
    </div>
  )
}

/**
 * `Belegliste` — Organismus (docs/71_Designsystem.md §2.3, B-01, S-08): Inhalt der
 * `Seitenschublade`, die `BelegAbzeichen` öffnet. Zeigt jede Aussage des Felds mit ihren Belegen
 * über `BelegEintrag` (s. o.), plus einen festen „Quelle anlegen"-Link am Fuß (AP-1.17 PR-C1) —
 * anders als `BelegEintrag`s „Quelle bearbeiten" (kontextuell, an eine bestehende Quelle
 * gebunden) legt dieser Link eine NEUE, noch unverknüpfte Quelle an (§14-Vermerk,
 * docs/80_Offene_Fragen.md §29: das Verknüpfen einer neuen Quelle mit dieser Aussage — ein
 * `aussage_zitat.anlegen`-Schreibweg — existiert noch nicht, das bleibt einem Folge-AP
 * vorbehalten; diese Quelle lässt sich trotzdem schon jetzt anlegen und pflegen). Seit AP-1.30
 * PR 9d verknüpft der Reiter Person über den `BelegWaehler` (`beleg-waehler.tsx`) im Kopf der
 * Schublade; dort steht auch „Quelle anlegen" (`mitQuelleAnlegen = false`) und je Beleg
 * „Verknüpfung entfernen". Die Lesesicht bleibt unverändert.
 */
function belegHinweisText(beleg: PersonDetailBeleg, belegHinweis: BelegListeProps['belegHinweis']) {
  const text = belegHinweis?.(beleg) ?? null
  return text === null ? null : (
    <Text rolle="hilfe" als="p">
      {text}
    </Text>
  )
}

export function BelegListe({ feld, aufVerknuepfungEntfernen, entfernenGesperrt = false, mitQuelleAnlegen = true, belegHinweis }: BelegListeProps) {
  const { t } = useTranslation('profil')
  const quelleAnlegen = useQuelleAnlegen()
  const [neueQuelleId, setNeueQuelleId] = useState<string | null>(null)

  async function quelleAnlegenUndOeffnen(): Promise<void> {
    const ergebnis = await quelleAnlegen.mutateAsync(quelleNeuAnlegenEin())
    setNeueQuelleId(ergebnis.id)
  }

  return (
    <>
      <ul className="wz-beleg-liste">
        {feld.aussagen.map((aussage) => (
          <li key={aussage.aussage_id} className="wz-beleg-liste__aussage">
            <Text rolle="koerper" als="p">
              {aussage.wert ?? t('wert_unbekannt')}
            </Text>
            {aussage.belege.length === 0 ? (
              <Text rolle="hilfe" als="p">
                {t('beleg_schublade_keine_belege')}
              </Text>
            ) : (
              <ul className="wz-beleg-liste__belege">
                {aussage.belege.map((beleg, index) => (
                  <li key={index} className="wz-beleg-liste__beleg">
                    <BelegEintrag beleg={beleg} />
                    {belegHinweisText(beleg, belegHinweis)}
                    {aufVerknuepfungEntfernen === undefined ? null : (
                      <div>
                        <Schaltflaeche variante="unauffaellig" gesperrt={entfernenGesperrt} aufKlick={() => aufVerknuepfungEntfernen(aussage.aussage_id, beleg.zitat_id)}>
                          {t('beleg_verknuepfung_entfernen')}
                        </Schaltflaeche>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {mitQuelleAnlegen ? (
        <Schaltflaeche variante="unauffaellig" aufKlick={() => void quelleAnlegenUndOeffnen()}>
          {t('beleg_quelle_anlegen')}
        </Schaltflaeche>
      ) : null}
      {neueQuelleId !== null ? <QuelleBearbeitenAnsicht quelleId={neueQuelleId} aufSchliessen={() => setNeueQuelleId(null)} /> : null}
    </>
  )
}
