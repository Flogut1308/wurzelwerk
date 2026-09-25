import type { ReactNode } from 'react'
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
  /** AP-1.30 PR 9b: Lebensstatus (Reiter „Person", `reiter-person.tsx`) — steht nach dem Geschlecht,
   * wie im Entwurf (Gruppe „Eckdaten": Geschlecht, Lebensstatus). */
  readonly lebensstatus?: ReactNode
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
 * Geburt und Tod (Datum, Ort, Sicherheit, Belege) stehen seit AP-1.30 PR 9b als eigene Gruppen im
 * Reiter „Person" (`ReiterPerson`, `reiter-person.tsx`), nicht in diesem Abschnitt.
 */
export function GrunddatenBearbeitenAbschnitt({ personId, kopf, lebensstatus }: GrunddatenBearbeitenAbschnittProps) {
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

      {lebensstatus}

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
    </section>
  )
}
