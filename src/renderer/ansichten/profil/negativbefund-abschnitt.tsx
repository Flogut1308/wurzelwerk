// AP-1.17 PR-C2 (S-23, docs/57_Phase0_Arbeitspakete.md AP-1.17): der Negativbefund-Abschnitt des
// Profils — der Befund „an Ort X im Zeitraum Y wurde Person Z gesucht und NICHT gefunden" (§
// Auftrag). Personengebunden (`gesuchte_person_id` NOT NULL, docs/schema/0002_kern.sql §2.7) —
// darum ein fester Abschnitt IM Profil, kein eigener globaler Screen (analog zum „Quelle
// bearbeiten"-Einstieg am Belegapparat, AP-1.17 PR-C1). Zustandsbasiert wie
// `NamenBearbeitenAbschnitt`/`quelle-bearbeiten.tsx`: eine Liste bestehender Negativbefunde, jeder
// sofort über `befehl:negativbefund.aendern`/`.loeschen` bearbeitbar (Textfelder debounced über
// `useEntwurfMitVerzoegertemCommit`, „Entfernen" sofort), plus ein festes „Negativbefund
// hinzufügen"-Formular. KEIN Speichern-Knopf — jede Eingabe committet automatisch. KEIN zweiter
// Schreibweg: JEDE Änderung läuft über genau EINEN der drei `befehl:negativbefund*`-Kanäle aus
// `befehl-hooks.ts`.
//
// Lädt `abfrage:negativbefund.liste` selbst (wie `BelegListe`/`QuelleBearbeitenAnsicht` ihre
// jeweilige Abfrage selbst laden) — dieser Abschnitt ist unabhängig vom Bearbeiten-Umschalter der
// übrigen Profilseite immer editierbar, weil er (anders als Namen/Grunddaten/Ereignisse) keine
// importierte Aussage mit Konfidenz/Beleg trägt, sondern eine eigenständige Fachtabelle.
import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { NegativbefundEintrag } from '../../../shared/schemata/negativbefund-liste'
import { Formularfeld } from '../../bausteine/formularfeld'
import { Langtextfeld } from '../../bausteine/langtextfeld'
import { Schaltflaeche } from '../../bausteine/schaltflaeche'
import { Text } from '../../bausteine/text'
import { Textfeld } from '../../bausteine/textfeld'
import { Zahlfeld } from '../../bausteine/zahlfeld'
import { useNegativbefundListe, useQuelleDetail } from '../../brücke/abfrage-hooks'
import { useNegativbefundAendern, useNegativbefundAnlegen, useNegativbefundLoeschen } from '../../brücke/befehl-hooks'
import { useEntwurfMitVerzoegertemCommit } from './profil-bearbeiten-debounce'
import {
  NEGATIVBEFUND_ENTWURF_LEER,
  ganzzahlTextIstGueltig,
  negativbefundAendernEinAusEntwurf,
  negativbefundAnlegenEinAusEntwurf,
  negativbefundEntwurfAusEintrag,
  negativbefundEntwurfHatInhalt,
  type NegativbefundEntwurfWerte,
} from './negativbefund-abschnitt-logik'
import './negativbefund-abschnitt.css'

export interface NegativbefundAbschnittProps {
  readonly personId: string
}

/**
 * `NegativbefundAbschnitt` — Organismus (docs/71_Designsystem.md §2.3, S-23, AP-1.17 PR-C2): fester
 * Profilabschnitt, IMMER sichtbar (anders als die übrigen adaptiven Profilabschnitte, die bei
 * fehlenden Daten `null` rendern, `profil-ansicht.tsx`-Kopfkommentar zu `ProfilInhalt`) — das feste
 * „Negativbefund hinzufügen"-Formula am Fuß ist ein dauerhaftes Angebot, kein Ergebnis vorhandener
 * Daten.
 */
export function NegativbefundAbschnitt({ personId }: NegativbefundAbschnittProps) {
  const { t } = useTranslation('negativbefund')
  const abfrage = useNegativbefundListe({ gesuchtePersonId: personId })

  return (
    <section className="wz-profil-ansicht__abschnitt" aria-labelledby="wz-negativbefund-abschnitt-titel">
      <Text rolle="titel-klein" als="h2" id="wz-negativbefund-abschnitt-titel">
        {t('ueberschrift')}
      </Text>

      {abfrage.isPending ? (
        <Text rolle="hilfe" als="p">
          {t('laedt')}
        </Text>
      ) : null}
      {abfrage.isError ? (
        <Text rolle="hilfe" als="p">
          {t('fehler')}
        </Text>
      ) : null}
      {abfrage.isSuccess ? (
        abfrage.data.eintraege.length === 0 ? (
          <Text rolle="hilfe" als="p">
            {t('liste_leer')}
          </Text>
        ) : (
          <ul className="wz-negativbefund-abschnitt__liste">
            {abfrage.data.eintraege.map((eintrag) => (
              <li key={eintrag.id} className="wz-negativbefund-abschnitt__zeile">
                <NegativbefundFelder personId={personId} eintrag={eintrag} />
              </li>
            ))}
          </ul>
        )
      ) : null}

      <NegativbefundNeuFormular personId={personId} />
    </section>
  )
}

/** Zeigt den Titel der verknüpften Quelle einer BESTEHENDEN Negativbefund-Zeile (§ Auftrag: „…
 * optional die verknüpfte Quelle"). Lädt `abfrage:quelle.detail` NUR, wenn `quelleId` gesetzt ist —
 * die einzige vorhandene Abfrage für eine Quelle ist der Einzelabruf über eine bekannte ID, es gibt
 * (noch) kein `quelle.suche` (s. Kopfkommentar `negativbefund-abschnitt-logik.ts`), darum bleibt
 * dies eine reine Anzeige, kein Auswahlfeld. */
function NegativbefundVerknuepfteQuelle({ quelleId }: { readonly quelleId: string }) {
  const { t } = useTranslation('negativbefund')
  const abfrage = useQuelleDetail({ quelleId })
  if (!abfrage.isSuccess) return null

  const titel = abfrage.data.kopf.titel ?? t('quelle_verknuepft_ohne_titel')
  return (
    <Text rolle="koerper-klein" als="span">
      {t('quelle_verknuepft_label', { titel })}
    </Text>
  )
}

interface NegativbefundFelderProps {
  readonly personId: string
  readonly eintrag: NegativbefundEintrag
}

/** Inline-Bearbeiten EINES bestehenden Negativbefunds — dieselbe Debounce-Commit-Form wie
 * `NamenFelder`/`ZitatFelder`: `befehl:negativbefund.aendern` patcht ALLE editierbaren Spalten in
 * einem `UPDATE` (`negativbefund-repo.ts::negativbefundAktualisieren`), der Entwurf wird darum als
 * EIN Objekt geführt und als Ganzes debounced committet. */
function NegativbefundFelder({ personId, eintrag }: NegativbefundFelderProps) {
  const { t } = useTranslation('negativbefund')
  const negativbefundAendern = useNegativbefundAendern()
  const negativbefundLoeschen = useNegativbefundLoeschen()

  const wert = useMemo(() => negativbefundEntwurfAusEintrag(eintrag), [eintrag])
  const [entwurf, setEntwurf] = useEntwurfMitVerzoegertemCommit<NegativbefundEntwurfWerte>(wert, (naechster) =>
    negativbefundAendern.mutate(negativbefundAendernEinAusEntwurf(eintrag.id, personId, naechster)),
  )

  return (
    <>
      <div className="wz-negativbefund-abschnitt__felder">
        <Formularfeld beschriftung={t('praedikat_beschriftung')}>
          <Textfeld wert={entwurf.gesuchtesPraedikat} aufAenderung={(wert) => setEntwurf({ ...entwurf, gesuchtesPraedikat: wert })} />
        </Formularfeld>
        <Formularfeld
          beschriftung={t('zeitraum_von_beschriftung')}
          {...(ganzzahlTextIstGueltig(entwurf.zeitraumVonText) ? {} : { fehlertext: t('zeitraum_ungueltig') })}
        >
          <Zahlfeld
            wert={entwurf.zeitraumVonText}
            aufAenderung={(wert) => setEntwurf({ ...entwurf, zeitraumVonText: wert })}
            ungueltig={!ganzzahlTextIstGueltig(entwurf.zeitraumVonText)}
          />
        </Formularfeld>
        <Formularfeld
          beschriftung={t('zeitraum_bis_beschriftung')}
          {...(ganzzahlTextIstGueltig(entwurf.zeitraumBisText) ? {} : { fehlertext: t('zeitraum_ungueltig') })}
        >
          <Zahlfeld
            wert={entwurf.zeitraumBisText}
            aufAenderung={(wert) => setEntwurf({ ...entwurf, zeitraumBisText: wert })}
            ungueltig={!ganzzahlTextIstGueltig(entwurf.zeitraumBisText)}
          />
        </Formularfeld>
        <Formularfeld beschriftung={t('datum_der_pruefung_beschriftung')}>
          <Textfeld wert={entwurf.datumDerPruefung} aufAenderung={(wert) => setEntwurf({ ...entwurf, datumDerPruefung: wert })} />
        </Formularfeld>
        <Schaltflaeche variante="gefaehrlich" aufKlick={() => negativbefundLoeschen.mutate({ id: eintrag.id })}>
          {t('entfernen')}
        </Schaltflaeche>
      </div>
      <Formularfeld beschriftung={t('beschreibung_beschriftung')}>
        <Langtextfeld wert={entwurf.beschreibung} aufAenderung={(wert) => setEntwurf({ ...entwurf, beschreibung: wert })} />
      </Formularfeld>
      {eintrag.quelleId === null ? null : <NegativbefundVerknuepfteQuelle quelleId={eintrag.quelleId} />}
    </>
  )
}

function NegativbefundNeuFormular({ personId }: { readonly personId: string }) {
  const { t } = useTranslation('negativbefund')
  const negativbefundAnlegen = useNegativbefundAnlegen()
  const [entwurf, setEntwurf] = useState<NegativbefundEntwurfWerte>(NEGATIVBEFUND_ENTWURF_LEER)

  function absenden(ereignis: FormEvent<HTMLFormElement>): void {
    ereignis.preventDefault()
    if (!negativbefundEntwurfHatInhalt(entwurf)) return
    negativbefundAnlegen.mutate(negativbefundAnlegenEinAusEntwurf(personId, entwurf))
    setEntwurf(NEGATIVBEFUND_ENTWURF_LEER)
  }

  return (
    <form className="wz-negativbefund-abschnitt__neu" onSubmit={absenden} aria-labelledby="wz-negativbefund-abschnitt-neu-titel">
      <Text rolle="beschriftung" als="p" id="wz-negativbefund-abschnitt-neu-titel">
        {t('neu_ueberschrift')}
      </Text>
      <div className="wz-negativbefund-abschnitt__felder">
        <Formularfeld beschriftung={t('praedikat_beschriftung')}>
          <Textfeld wert={entwurf.gesuchtesPraedikat} aufAenderung={(wert) => setEntwurf({ ...entwurf, gesuchtesPraedikat: wert })} />
        </Formularfeld>
        <Formularfeld
          beschriftung={t('zeitraum_von_beschriftung')}
          {...(ganzzahlTextIstGueltig(entwurf.zeitraumVonText) ? {} : { fehlertext: t('zeitraum_ungueltig') })}
        >
          <Zahlfeld
            wert={entwurf.zeitraumVonText}
            aufAenderung={(wert) => setEntwurf({ ...entwurf, zeitraumVonText: wert })}
            ungueltig={!ganzzahlTextIstGueltig(entwurf.zeitraumVonText)}
          />
        </Formularfeld>
        <Formularfeld
          beschriftung={t('zeitraum_bis_beschriftung')}
          {...(ganzzahlTextIstGueltig(entwurf.zeitraumBisText) ? {} : { fehlertext: t('zeitraum_ungueltig') })}
        >
          <Zahlfeld
            wert={entwurf.zeitraumBisText}
            aufAenderung={(wert) => setEntwurf({ ...entwurf, zeitraumBisText: wert })}
            ungueltig={!ganzzahlTextIstGueltig(entwurf.zeitraumBisText)}
          />
        </Formularfeld>
        <Formularfeld beschriftung={t('datum_der_pruefung_beschriftung')}>
          <Textfeld wert={entwurf.datumDerPruefung} aufAenderung={(wert) => setEntwurf({ ...entwurf, datumDerPruefung: wert })} />
        </Formularfeld>
      </div>
      <Formularfeld beschriftung={t('beschreibung_beschriftung')}>
        <Langtextfeld wert={entwurf.beschreibung} aufAenderung={(wert) => setEntwurf({ ...entwurf, beschreibung: wert })} />
      </Formularfeld>
      <Schaltflaeche variante="sekundaer" typ="submit" gesperrt={!negativbefundEntwurfHatInhalt(entwurf)}>
        {t('hinzufuegen')}
      </Schaltflaeche>
    </form>
  )
}
