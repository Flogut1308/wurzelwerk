import { useTranslation } from 'react-i18next'
import type { Befund } from '../../shared/import/imp-codes'
import { impCodeSchluessel } from '../ansichten/import/import-schluessel'
import { Text } from './text'
import './fehlerliste-import.css'

export type FehlerlisteGruppierung = 'code' | 'ort'

export interface FehlerlisteImportProps {
  readonly befunde: readonly Befund[]
  /** Gruppierung nach IMP-Code (30× IMP-206 = ein Muster, §S-12) oder nach Ort in der Datei. */
  readonly gruppierung: FehlerlisteGruppierung
}

/** Der Ort-Schlüssel eines Befunds für die Gruppierung „nach Ort" (Datei, sekundär Zeile). */
function ortSchluessel(befund: Befund): string {
  return befund.zeile === undefined ? befund.datei : `${befund.datei}:${String(befund.zeile)}`
}

/**
 * `FehlerlisteImport` — Organismus (docs/71_Designsystem.md §2.3, 72 §S-12). Zeigt je Befund die
 * fünf Bestandteile aus 56_Import_Vertrag.md §5: Schweregrad + Code, JSON-Pfad, betroffene Kennung,
 * Datei/Zeile, „Was tun". Gruppierbar nach Code (ein Muster = eine Korrektur) oder nach Ort. Alle
 * Texte über i18n (Namespace `import`); der Befundtitel und „Was tun" kommen aus `fehler.IMP_…`.
 */
export function FehlerlisteImport({ befunde, gruppierung }: FehlerlisteImportProps) {
  const { t } = useTranslation('import')

  // Reihenfolge der Gruppen aus dem ersten Auftreten ableiten (stabil, ohne Sortierannahme).
  const gruppen = new Map<string, Befund[]>()
  for (const befund of befunde) {
    const schluessel = gruppierung === 'code' ? befund.code : ortSchluessel(befund)
    const vorhandene = gruppen.get(schluessel)
    if (vorhandene === undefined) {
      gruppen.set(schluessel, [befund])
    } else {
      vorhandene.push(befund)
    }
  }

  return (
    <div className="wz-fehlerliste">
      {[...gruppen.entries()].map(([schluessel, gruppe]) => (
        <section key={schluessel} className="wz-fehlerliste__gruppe">
          <Text rolle="beschriftung" farbe="sekundaer" als="h3">
            {gruppierung === 'code' ? `${schluessel} · ${t('zaehler', { anzahl: gruppe.length })}` : schluessel}
          </Text>
          <ul className="wz-fehlerliste__eintraege">
            {gruppe.map((befund, index) => (
              <li key={`${befund.code}-${befund.pfad}-${String(index)}`} className={`wz-fehlerliste__eintrag wz-fehlerliste__eintrag--${befund.schweregrad}`}>
                <Text rolle="koerper" als="p">
                  <Text rolle="technisch" als="span">
                    {`${befund.code} · ${befund.schweregrad === 'fehler' ? t('schweregrad_fehler') : t('schweregrad_hinweis')}`}
                  </Text>
                  {` ${t(`${impCodeSchluessel(befund.code)}.titel`)}`}
                </Text>
                <Text rolle="hilfe" als="p">
                  {t('fehler_pfad', { pfad: befund.pfad })}
                </Text>
                {befund.kennung !== undefined ? (
                  <Text rolle="hilfe" als="p">
                    {t('fehler_kennung', { kennung: befund.kennung })}
                  </Text>
                ) : null}
                <Text rolle="hilfe" als="p">
                  {befund.zeile === undefined ? t('fehler_datei_ohne_zeile', { datei: befund.datei }) : t('fehler_datei_zeile', { datei: befund.datei, zeile: befund.zeile })}
                </Text>
                <Text rolle="beschriftung" farbe="sekundaer" als="p">
                  {t('fehler_was_tun_titel')}
                </Text>
                <Text rolle="koerper-klein" als="p">
                  {t(`${impCodeSchluessel(befund.code)}.was_tun`)}
                </Text>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
