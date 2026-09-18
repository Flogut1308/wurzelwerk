import { useTranslation } from 'react-i18next'
import { Schaltflaeche } from '../../bausteine/schaltflaeche'
import { Text } from '../../bausteine/text'

export interface DateiWaehlenProps {
  /** Der bereits gewählte Pfad, oder `null` (noch keiner). */
  readonly pfad: string | null
  /** Öffnet den nativen Datei-Öffnen-Dialog (befehl:import.dateiWaehlen). */
  readonly aufWaehlen: () => void
  /** Startet den Trockenlauf mit dem gewählten Pfad (befehl:import.trockenlauf). */
  readonly aufPruefen: () => void
  readonly waehltGerade: boolean
  readonly prueftGerade: boolean
}

/**
 * S-10 „Import: Datei wählen" (72 §S-10, T-Assistent Schritt 1). Ablagefeld/Wähl-Knopf, Erklärung
 * des Vertrags und Verweis auf den Skill. Alle Texte über i18n (Namespace `import`).
 *
 * ABWEICHUNG (CLAUDE.md §14 Fall 1): Die in §S-10 vorgesehene „Liste der letzten Importe mit
 * Prüfsumme" braucht eine Abfrage über `import_lauf`, die es noch nicht gibt (kein Kanal in
 * AP-1.4a/1.5). Sie ist hier als Leerzustand angelegt und in docs/offene-fragen.md (U-1.4b-laeufe)
 * vermerkt — ein erfundener Datenweg wäre schlimmer als ein ehrlicher Leerzustand.
 */
export function DateiWaehlen({ pfad, aufWaehlen, aufPruefen, waehltGerade, prueftGerade }: DateiWaehlenProps) {
  const { t } = useTranslation('import')

  return (
    <div className="wz-import-datei">
      <Text rolle="titel" als="h1">
        {t('datei_titel')}
      </Text>
      <Text rolle="koerper" als="p">
        {t('datei_erklaerung')}
      </Text>
      <Text rolle="hilfe" als="p">
        {t('datei_skill_hinweis')}
      </Text>

      <div className="wz-import-datei__wahl">
        <Schaltflaeche variante="sekundaer" aufKlick={aufWaehlen} ladend={waehltGerade}>
          {t('datei_waehlen_knopf')}
        </Schaltflaeche>
        {pfad !== null ? (
          <Text rolle="technisch" als="span">
            {t('datei_gewaehlt', { pfad })}
          </Text>
        ) : null}
      </div>

      <section className="wz-import-datei__letzte">
        <Text rolle="beschriftung" farbe="sekundaer" als="h2">
          {t('datei_letzte_titel')}
        </Text>
        <Text rolle="hilfe" als="p">
          {t('datei_letzte_leer')}
        </Text>
      </section>

      <div className="wz-import-datei__fuss">
        <Schaltflaeche variante="primaer" aufKlick={aufPruefen} gesperrt={pfad === null} ladend={prueftGerade}>
          {t('datei_pruefen_knopf')}
        </Schaltflaeche>
      </div>
    </div>
  )
}
