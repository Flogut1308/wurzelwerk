import { useTranslation } from 'react-i18next'
import { blaetterleisteBerechnen, type BlaetterleisteZustand } from './blaetterleiste-logik'
import { Schaltflaeche } from './schaltflaeche'
import { Text } from './text'
import './blaetterleiste.css'

export interface BlaetterleisteProps extends BlaetterleisteZustand {
  readonly aufSeiteGeaendert: (seite: number) => void
}

/**
 * `Blaetterleiste` — Molekül (docs/71_Designsystem.md §2.2), seitenweise: „{{von}}–{{bis}} von
 * {{gesamt}}" plus Vor/Zurück. Die Anzeigewerte kommen aus `blaetterleisteBerechnen()`
 * (`blaetterleiste-logik.ts`) — hier steht nur die Darstellung.
 */
export function Blaetterleiste({ seite, proSeite, gesamt, aufSeiteGeaendert }: BlaetterleisteProps) {
  const { t } = useTranslation('liste')
  const anzeige = blaetterleisteBerechnen({ seite, proSeite, gesamt })

  return (
    <div className="wz-blaetterleiste">
      <Schaltflaeche variante="unauffaellig" gesperrt={!anzeige.zurueckMoeglich} aufKlick={() => aufSeiteGeaendert(seite - 1)}>
        {t('blaettern_zurueck')}
      </Schaltflaeche>

      <Text rolle="hilfe" als="span">
        {t('blaettern_bereich', { von: anzeige.von, bis: anzeige.bis, gesamt })}
      </Text>

      <Text rolle="hilfe" als="span">
        {t('blaettern_seite', { seite, gesamtSeiten: anzeige.gesamtSeiten })}
      </Text>

      <Schaltflaeche variante="unauffaellig" gesperrt={!anzeige.vorMoeglich} aufKlick={() => aufSeiteGeaendert(seite + 1)}>
        {t('blaettern_vor')}
      </Schaltflaeche>
    </div>
  )
}
