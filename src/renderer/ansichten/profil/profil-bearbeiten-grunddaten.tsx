import { useTranslation } from 'react-i18next'
import { GeschlechtEnum, PlatzhalterGrundEnum } from '../../../shared/schemata/person'
import type { PersonDetailKopf } from '../../../shared/schemata/person-detail'
import { Auswahlfeld, type AuswahlfeldOption } from '../../bausteine/auswahlfeld'
import { Formularfeld } from '../../bausteine/formularfeld'
import { Kontrollkaestchen } from '../../bausteine/kontrollkaestchen'
import { Text } from '../../bausteine/text'
import { usePersonFeldSetzen } from '../../brücke/befehl-hooks'
import {
  boolZuKontrollkaestchenZustand,
  kontrollkaestchenZustandZuBool,
  personFeldGeschlechtEin,
  personFeldIstPlatzhalterEin,
  personFeldPlatzhalterGrundEin,
} from './profil-bearbeiten-logik'
import { geschlechtSchluessel, platzhalterGrundSchluessel } from './profil-schluessel'
import './profil-bearbeiten-grunddaten.css'

export interface GrunddatenBearbeitenAbschnittProps {
  readonly personId: string
  readonly kopf: PersonDetailKopf
}

/**
 * `GrunddatenBearbeitenAbschnitt` (AP-1.14a, S-20, Kernfelder): Geschlecht und
 * Platzhalter-Kennzeichen + Grund — alle über `befehl:person.feldSetzen`
 * (`PersonFeldSetzenEin`-Union, `profil-bearbeiten-logik.ts`). `platzhalter_grund` ist NUR
 * sichtbar, wenn das Kennzeichen gesetzt ist (Progressive Disclosure, wie `Schublade`
 * in `ProfilAnsicht`).
 *
 * Seit AP-1.30 PR 7b Inhalt des Reiters „Person" (Gruppe „Eckdaten" aus Artboard 1a, vorläufig);
 * die Notiz ist in den Reiter „Notizen" gezogen (`NotizBearbeitenAbschnitt`,
 * `profil-bearbeiten-notiz.tsx`).
 *
 * **Lebensdaten (Geburts-/Todesdatum mit Konfidenz+Beleg) sind NICHT Teil dieses Abschnitts** —
 * offene Datenmodellfrage zwischen `aussage.anlegen` und `ereignis.anlegen`
 * (`docs/80_Offene_Fragen.md` §26, AP-1.14a-Auftrag). Nachgezogen in AP-1.14b.
 */
export function GrunddatenBearbeitenAbschnitt({ personId, kopf }: GrunddatenBearbeitenAbschnittProps) {
  const { t } = useTranslation('profil')
  const feldSetzen = usePersonFeldSetzen()

  const geschlechtOptionen: readonly AuswahlfeldOption<(typeof GeschlechtEnum.options)[number]>[] = GeschlechtEnum.options.map((wert) => ({
    wert,
    beschriftung: t(geschlechtSchluessel(wert)),
  }))
  const platzhalterGrundOptionen: readonly AuswahlfeldOption<(typeof PlatzhalterGrundEnum.options)[number]>[] = PlatzhalterGrundEnum.options.map(
    (wert) => ({ wert, beschriftung: t(platzhalterGrundSchluessel(wert)) }),
  )

  return (
    <section className="wz-profil-ansicht__abschnitt" aria-labelledby="wz-profil-bearbeiten-grunddaten-titel">
      <Text rolle="titel-klein" als="h2" id="wz-profil-bearbeiten-grunddaten-titel">
        {t('abschnitt_grunddaten_bearbeiten')}
      </Text>

      <Formularfeld beschriftung={t('geschlecht_beschriftung')}>
        <Auswahlfeld
          wert={kopf.geschlecht ?? 'U'}
          optionen={geschlechtOptionen}
          aufAenderung={(wert) => feldSetzen.mutate(personFeldGeschlechtEin(personId, wert))}
        />
      </Formularfeld>

      {/* Wie `Umschalter`+`Text` in `filterleiste.tsx`: KEIN `<label>`-Wrapper — `Kontrollkaestchen`
          trägt seinen eigenen `aria-label`, der sichtbare Text daneben ist eine reine Verdopplung
          für sehende Nutzer, kein zweiter Screenreader-Name. */}
      <div className="wz-profil-bearbeiten-grunddaten__kennzeichen">
        <Kontrollkaestchen
          zustand={boolZuKontrollkaestchenZustand(kopf.ist_platzhalter)}
          bezeichnung={t('platzhalter_kennzeichen_beschriftung')}
          aufAenderung={(zustand) => feldSetzen.mutate(personFeldIstPlatzhalterEin(personId, kontrollkaestchenZustandZuBool(zustand)))}
        />
        <Text rolle="beschriftung" als="span">
          {t('platzhalter_kennzeichen_beschriftung')}
        </Text>
      </div>

      {kopf.ist_platzhalter ? (
        <Formularfeld beschriftung={t('platzhalter_grund_beschriftung')}>
          <Auswahlfeld
            wert={kopf.platzhalter_grund ?? 'unbekannt'}
            optionen={platzhalterGrundOptionen}
            aufAenderung={(wert) => feldSetzen.mutate(personFeldPlatzhalterGrundEin(personId, wert))}
          />
        </Formularfeld>
      ) : null}

      {/* Lebensdaten: test.todo in test/einheit/profil-bearbeiten-grunddaten.test.tsx — offene
          Datenmodellfrage, s. Funktionskommentar oben. */}
    </section>
  )
}
