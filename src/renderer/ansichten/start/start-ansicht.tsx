import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { aufrufen } from '../../brücke/aufrufen'
import type { FehlerCode } from '../../../shared/fehler/codes'
import type { ProjektInfo, SyncAnbieter, ZuletztEintragAnzeige } from '../../../shared/ipc/vertrag'
import { projektnameGueltig } from '../../../shared/schemata/projekt'
import { Abzeichen } from '../../bausteine/abzeichen'
import { Eingabekoerper } from '../../bausteine/eingabekoerper'
import { Schaltflaeche } from '../../bausteine/schaltflaeche'
import { Text } from '../../bausteine/text'
import './start-ansicht.css'

interface SyncWarnung {
  readonly anbieter: SyncAnbieter
  readonly pfad: string
}

/**
 * i18n-Schlüssel je Anbieter (§4: keine Zeichenkettenliterale in JSX, react/jsx-no-literals).
 * Ein `switch` mit vollständiger `SyncAnbieter`-Abdeckung statt einer Lookup-Tabelle, damit ein
 * neuer Anbieter in `src/shared/ipc/vertrag.ts` hier einen Typfehler erzeugt, keinen stillen Fall.
 */
function anbieterSchluessel(anbieter: SyncAnbieter): string {
  switch (anbieter) {
    case 'dropbox':
      return 'start_sync_anbieter_dropbox'
    case 'icloud':
      return 'start_sync_anbieter_icloud'
    case 'onedrive':
      return 'start_sync_anbieter_onedrive'
  }
}

export interface StartAnsichtProps {
  /** Aufgerufen, sobald ein Projekt erfolgreich angelegt oder geöffnet wurde (AP-1.6 Stufe 4:
   * `App` wechselt daraufhin auf die Listenansicht — diese Ansicht kennt die Listenansicht nicht,
   * sie meldet nur „ein Projekt ist jetzt offen" nach oben). */
  readonly aufProjektGeoeffnet: (projekt: ProjektInfo) => void
}

/**
 * Start-Ansicht (S-01, AP-1.26 — vormals AP-0.4 unverdrahtet ohne Gestaltung, `72_Screens_und_
 * Flows.md` S-01, `70_UX_Konzept.md` „Pfade wählt man nie durch Tippen"). Neues Projekt anlegen,
 * ein bestehendes öffnen, zuletzt geöffnete Projekte erneut öffnen — beide Ordnerwahlen laufen
 * über den nativen Systemdialog (`befehl:projekt.elternordnerWaehlen`/`befehl:projekt.ordnerWaehlen`,
 * `src/main/dialoge.ts`), **kein Pfadtextfeld mehr**. Nur über
 * `aufrufen('befehl:projekt.*' | 'abfrage:projekt.zuletzt', …)` — kein `fs`/`path`/DB im Renderer (§2).
 *
 * ABWEICHUNG (CLAUDE.md §14 Fall 1): Das Design-Mockup (`72` S-01) zeigt kein Eingabefeld für den
 * Projektnamen — „Neues Projekt" ist dort nur eine Schaltfläche. Die Abnahme aus AP-1.26 verlangt
 * ausdrücklich, dass das Namensfeld bleibt („ein Name ist kein Pfad"). Aus dem vorhandenen
 * `Eingabekoerper`-Baustein ergänzt, direkt neben der Schaltfläche — vermerkt in
 * `docs/80_Offene_Fragen.md`.
 *
 * AP-1.6 Stufe 4: Diese Ansicht zeigt nur noch den Startzustand — der „Projekt offen"-Zustand lebt
 * jetzt in `App` (Start ↔ Liste), das dann `ListenAnsicht` statt dieser Komponente rendert.
 */
export function StartAnsicht({ aufProjektGeoeffnet }: StartAnsichtProps) {
  const { t } = useTranslation('allgemein')
  const { t: tFehler } = useTranslation('fehler')

  const [zuletzt, setZuletzt] = useState<readonly ZuletztEintragAnzeige[]>([])
  const [neuName, setNeuName] = useState('')
  const [syncWarnung, setSyncWarnung] = useState<SyncWarnung | null>(null)
  const [fehlerCode, setFehlerCode] = useState<FehlerCode | null>(null)
  const [elternordnerWirdGewaehlt, setElternordnerWirdGewaehlt] = useState(false)
  const [neuLaedt, setNeuLaedt] = useState(false)
  const [ordnerWirdGewaehlt, setOrdnerWirdGewaehlt] = useState(false)
  const [oeffnenLaedt, setOeffnenLaedt] = useState(false)

  const zuletztLaden = useCallback(() => {
    void aufrufen('abfrage:projekt.zuletzt', null).then((ergebnis) => {
      if (ergebnis.ok) {
        setZuletzt(ergebnis.daten)
      }
    })
  }, [])

  useEffect(() => {
    zuletztLaden()
  }, [zuletztLaden])

  const projektOeffnenAufrufen = useCallback(
    (pfad: string, syncBestaetigt?: boolean) => {
      setFehlerCode(null)
      setOeffnenLaedt(true)
      void aufrufen('befehl:projekt.oeffnen', syncBestaetigt === undefined ? { pfad } : { pfad, syncBestaetigt }).then(
        (ergebnis) => {
          setOeffnenLaedt(false)
          if (!ergebnis.ok) {
            setFehlerCode(ergebnis.fehler.code)
            return
          }
          if (ergebnis.daten.status === 'sync_warnung') {
            setSyncWarnung({ anbieter: ergebnis.daten.anbieter, pfad: ergebnis.daten.pfad })
            return
          }
          setSyncWarnung(null)
          zuletztLaden()
          aufProjektGeoeffnet(ergebnis.daten.projekt)
        },
      )
    },
    [aufProjektGeoeffnet, zuletztLaden],
  )

  const neuesProjektAnlegen = useCallback(() => {
    setFehlerCode(null)
    setElternordnerWirdGewaehlt(true)
    void aufrufen('befehl:projekt.elternordnerWaehlen', null).then((ordnerErgebnis) => {
      setElternordnerWirdGewaehlt(false)
      if (!ordnerErgebnis.ok) {
        setFehlerCode(ordnerErgebnis.fehler.code)
        return
      }
      if (ordnerErgebnis.daten === null) {
        return // Abbruch im Dialog ist kein Fehler — die Ansicht bleibt einfach stehen.
      }
      setNeuLaedt(true)
      void aufrufen('befehl:projekt.anlegen', { elternordner: ordnerErgebnis.daten, name: neuName }).then((ergebnis) => {
        setNeuLaedt(false)
        if (!ergebnis.ok) {
          setFehlerCode(ergebnis.fehler.code)
          return
        }
        zuletztLaden()
        aufProjektGeoeffnet(ergebnis.daten)
      })
    })
  }, [aufProjektGeoeffnet, neuName, zuletztLaden])

  const projektUeberDialogOeffnen = useCallback(() => {
    setFehlerCode(null)
    setOrdnerWirdGewaehlt(true)
    void aufrufen('befehl:projekt.ordnerWaehlen', null).then((ergebnis) => {
      setOrdnerWirdGewaehlt(false)
      if (!ergebnis.ok) {
        setFehlerCode(ergebnis.fehler.code)
        return
      }
      if (ergebnis.daten !== null) {
        projektOeffnenAufrufen(ergebnis.daten)
      }
    })
  }, [projektOeffnenAufrufen])

  const nameGueltig = projektnameGueltig(neuName)

  return (
    <div className="wz-start">
      <div className="wz-start__spalte">
        <div className="wz-start__kopf">
          <Text rolle="titel-gross" als="h1">
            {t('app_titel')}
          </Text>
          <Text rolle="koerper" farbe="sekundaer" als="p">
            {t('start_tagline')}
          </Text>
        </div>

        {fehlerCode !== null ? (
          <div className="wz-start__fehler" role="alert">
            <Text rolle="titel-klein" als="p">
              {tFehler(`${fehlerCode}.titel`)}
            </Text>
            <Text rolle="koerper-klein" als="p">
              {tFehler(`${fehlerCode}.was_tun`)}
            </Text>
          </div>
        ) : null}

        <div className="wz-start__aktionen">
          <Eingabekoerper
            wert={neuName}
            aufAenderung={setNeuName}
            platzhalter={t('start_neues_projekt_name_platzhalter')}
            ariaLabel={t('start_neues_projekt_name_aria')}
          />
          <Schaltflaeche
            variante="primaer"
            aufKlick={neuesProjektAnlegen}
            gesperrt={!nameGueltig}
            ladend={elternordnerWirdGewaehlt || neuLaedt}
          >
            {t('start_neues_projekt_button')}
          </Schaltflaeche>
          <Schaltflaeche variante="sekundaer" aufKlick={projektUeberDialogOeffnen} ladend={ordnerWirdGewaehlt || oeffnenLaedt}>
            {t('start_projekt_oeffnen_button')}
          </Schaltflaeche>
        </div>

        <section className="wz-start__zuletzt">
          <Text rolle="beschriftung" farbe="sekundaer" als="h2">
            {t('start_zuletzt_titel')}
          </Text>
          {zuletzt.length === 0 ? (
            <Text rolle="hilfe" als="p">
              {t('start_zuletzt_leer')}
            </Text>
          ) : (
            <div className="wz-start__zuletzt-liste" role="list">
              {zuletzt.map((eintrag) => (
                <button
                  key={eintrag.pfad}
                  type="button"
                  role="listitem"
                  className={`wz-start__zuletzt-zeile${eintrag.existiert ? '' : ' wz-start__zuletzt-zeile--fehlend'}`}
                  onClick={() => projektOeffnenAufrufen(eintrag.pfad)}
                >
                  <span className="wz-start__zuletzt-name">
                    <Text rolle="koerper" farbe={eintrag.existiert ? 'primaer' : 'tertiaer'}>
                      {eintrag.name}
                    </Text>
                    {eintrag.existiert ? null : <Abzeichen variante="warnung">{t('start_zuletzt_nicht_gefunden')}</Abzeichen>}
                  </span>
                  <Text rolle="technisch" farbe="sekundaer">
                    {eintrag.pfad}
                  </Text>
                </button>
              ))}
            </div>
          )}
        </section>

        {syncWarnung !== null ? (
          <div className="wz-start__sync-warnung" role="alertdialog">
            <Text rolle="koerper" als="p">
              {t('start_sync_warnung_text', { anbieter: t(anbieterSchluessel(syncWarnung.anbieter)) })}
            </Text>
            <div className="wz-start__sync-warnung-aktionen">
              <Schaltflaeche variante="primaer" aufKlick={() => projektOeffnenAufrufen(syncWarnung.pfad, true)} ladend={oeffnenLaedt}>
                {t('start_sync_warnung_trotzdem_oeffnen')}
              </Schaltflaeche>
              <Schaltflaeche variante="unauffaellig" aufKlick={() => setSyncWarnung(null)}>
                {t('start_sync_warnung_abbrechen')}
              </Schaltflaeche>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
