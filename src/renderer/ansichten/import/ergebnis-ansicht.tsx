import { useTranslation } from 'react-i18next'
import type { Trockenlaufbericht } from '../../../shared/import/trockenlauf-bericht'
import { Schaltflaeche } from '../../bausteine/schaltflaeche'
import { Text } from '../../bausteine/text'
import { TrockenlaufBericht } from '../../bausteine/trockenlauf-bericht'

export interface ErgebnisAnsichtProps {
  readonly bericht: Trockenlaufbericht
  /** Nimmt den kleinen Import als einzelnen Undo-Schritt zurück (befehl:journal.undo). */
  readonly aufRueckgaengig: () => void
  readonly aufSpeichern: () => void
  readonly aufZurListe: () => void
  readonly nimmtZurueck: boolean
  readonly speichertGerade: boolean
}

/**
 * S-13 „Import: Ergebnis" (72 §S-13, T-Assistent Schritt 3). Derselbe Bericht wie der Trockenlauf,
 * jetzt als Vollzug (die sichtbare Seite der Invariante „Trockenlauf == Import", AP-1.5) — plus die
 * Rücknahme und „Zur Liste". Alle Texte über i18n.
 *
 * ABWEICHUNG (CLAUDE.md §14 Fall 2): Bei `ruecknahmeArt === 'schnappschuss'` (großer Import) fehlt
 * der Ansicht die Schnappschuss-ID, um `befehl:schnappschuss.wiederherstellen` gezielt aufzurufen —
 * `befehl:import.ausfuehren` gibt sie im Bericht nicht zurück (das wäre eine Backend-Änderung
 * außerhalb dieses Ansichtspakets). Statt eines toten Knopfs steht hier der ehrliche Hinweis, dass
 * die Rücknahme über die Schnappschuss-Liste läuft. Vermerkt in docs/offene-fragen.md
 * (U-1.4b-schnappschuss).
 */
export function ErgebnisAnsicht({ bericht, aufRueckgaengig, aufSpeichern, aufZurListe, nimmtZurueck, speichertGerade }: ErgebnisAnsichtProps) {
  const { t } = useTranslation('import')
  const kleinerImport = bericht.zusammenfassung.ruecknahmeArt === 'undo'

  return (
    <div className="wz-import-ergebnis">
      <Text rolle="titel" als="h1">
        {t('ergebnis_titel')}
      </Text>
      <TrockenlaufBericht bericht={bericht} />

      <div className="wz-import-ergebnis__fuss">
        {kleinerImport ? (
          <Schaltflaeche variante="sekundaer" aufKlick={aufRueckgaengig} ladend={nimmtZurueck}>
            {t('knopf_rueckgaengig')}
          </Schaltflaeche>
        ) : (
          <Text rolle="hilfe" als="span">
            {t('knopf_schnappschuss_wiederherstellen')}
          </Text>
        )}
        <Schaltflaeche variante="unauffaellig" aufKlick={aufSpeichern} ladend={speichertGerade}>
          {t('knopf_bericht_speichern')}
        </Schaltflaeche>
        <Schaltflaeche variante="primaer" aufKlick={aufZurListe}>
          {t('knopf_zur_liste')}
        </Schaltflaeche>
      </div>
    </div>
  )
}
