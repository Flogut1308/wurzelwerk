import { useTranslation } from 'react-i18next'
import type { Trockenlaufbericht } from '../../../shared/import/trockenlauf-bericht'
import { FehlerlisteImport } from '../../bausteine/fehlerliste-import'
import { Schaltflaeche } from '../../bausteine/schaltflaeche'
import { Text } from '../../bausteine/text'
import { TrockenlaufBericht } from '../../bausteine/trockenlauf-bericht'
import { importSperrurteil } from './import-schritt-logik'

export interface TrockenlaufBerichtAnsichtProps {
  readonly bericht: Trockenlaufbericht
  readonly aufImportieren: () => void
  readonly aufSpeichern: () => void
  readonly aufAbbrechen: () => void
  readonly importiertGerade: boolean
  readonly speichertGerade: boolean
}

/**
 * S-11 „Trockenlauf-Bericht" bzw. S-12 „Fehlerliste" (72 §S-11/§S-12, T-Assistent Schritt 2). Bei
 * Fehlern zeigt die Ansicht die dedizierte Fehlerliste (Flow-„ja"-Kante), sonst den vollen Bericht;
 * der Fuß ist derselbe. „Importieren" ist **sichtbar gesperrt** bei Fehlern, mit dem Grund daneben
 * — das Urteil kommt aus `importSperrurteil(bericht)`, die Ansicht entscheidet nichts selbst
 * (Abnahme). Alle Texte über i18n.
 */
export function TrockenlaufBerichtAnsicht({ bericht, aufImportieren, aufSpeichern, aufAbbrechen, importiertGerade, speichertGerade }: TrockenlaufBerichtAnsichtProps) {
  const { t } = useTranslation('import')
  const urteil = importSperrurteil(bericht)

  return (
    <div className="wz-import-bericht">
      {urteil.gesperrt ? (
        <>
          <Text rolle="titel" als="h1">
            {t('fehlerliste_titel')}
          </Text>
          <FehlerlisteImport befunde={bericht.fehler} gruppierung="code" />
        </>
      ) : (
        <>
          <Text rolle="titel" als="h1">
            {t('bericht_titel')}
          </Text>
          <TrockenlaufBericht bericht={bericht} />
        </>
      )}

      <div className="wz-import-bericht__fuss">
        <div className="wz-import-bericht__importieren">
          <Schaltflaeche variante="primaer" aufKlick={aufImportieren} gesperrt={urteil.gesperrt} ladend={importiertGerade}>
            {t('knopf_importieren')}
          </Schaltflaeche>
          {urteil.gesperrt && urteil.grundSchluessel !== null ? (
            <Text rolle="beschriftung" farbe="akzent" als="span">
              {t(urteil.grundSchluessel, { anzahl: urteil.fehlerAnzahl })}
            </Text>
          ) : null}
        </div>
        <Schaltflaeche variante="sekundaer" aufKlick={aufSpeichern} ladend={speichertGerade}>
          {t('knopf_bericht_speichern')}
        </Schaltflaeche>
        <Schaltflaeche variante="unauffaellig" aufKlick={aufAbbrechen}>
          {t('knopf_abbrechen')}
        </Schaltflaeche>
      </div>
    </div>
  )
}
