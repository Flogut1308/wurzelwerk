import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { aufrufen } from '../../brücke/aufrufen'
import type { FehlerCode } from '../../../shared/fehler/codes'
import type { ProjektInfo, SyncAnbieter, ZuletztEintrag } from '../../../shared/ipc/vertrag'

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

/**
 * Start-Ansicht (AP-0.4): Neues Projekt anlegen, ein bestehendes öffnen, zuletzt geöffnete
 * Projekte erneut öffnen. Nur über `aufrufen('befehl:projekt.*' | 'abfrage:projekt.zuletzt', …)`
 * — kein `fs`/`path`/DB im Renderer (§2). Pragmatische Vereinfachung: Pfade werden als Text
 * eingegeben statt über einen nativen Dateidialog, um AP-0.4 nicht um einen zusätzlichen
 * IPC-Kanal zu erweitern, der außerhalb des vereinbarten Umfangs liegt.
 */
export function StartAnsicht() {
  const { t } = useTranslation('allgemein')
  const { t: tFehler } = useTranslation('fehler')

  const [zuletzt, setZuletzt] = useState<readonly ZuletztEintrag[]>([])
  const [neuElternordner, setNeuElternordner] = useState('')
  const [neuName, setNeuName] = useState('')
  const [oeffnenPfad, setOeffnenPfad] = useState('')
  const [syncWarnung, setSyncWarnung] = useState<SyncWarnung | null>(null)
  const [aktuellesProjekt, setAktuellesProjekt] = useState<ProjektInfo | null>(null)
  const [fehlerCode, setFehlerCode] = useState<FehlerCode | null>(null)

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
      void aufrufen('befehl:projekt.oeffnen', syncBestaetigt === undefined ? { pfad } : { pfad, syncBestaetigt }).then(
        (ergebnis) => {
          if (!ergebnis.ok) {
            setFehlerCode(ergebnis.fehler.code)
            return
          }
          if (ergebnis.daten.status === 'sync_warnung') {
            setSyncWarnung({ anbieter: ergebnis.daten.anbieter, pfad: ergebnis.daten.pfad })
            return
          }
          setSyncWarnung(null)
          setAktuellesProjekt(ergebnis.daten.projekt)
          zuletztLaden()
        },
      )
    },
    [zuletztLaden],
  )

  const neuesProjektAnlegen = useCallback(() => {
    setFehlerCode(null)
    void aufrufen('befehl:projekt.anlegen', { elternordner: neuElternordner, name: neuName }).then((ergebnis) => {
      if (!ergebnis.ok) {
        setFehlerCode(ergebnis.fehler.code)
        return
      }
      setAktuellesProjekt(ergebnis.daten)
      zuletztLaden()
    })
  }, [neuElternordner, neuName, zuletztLaden])

  const projektSchliessen = useCallback(() => {
    void aufrufen('befehl:projekt.schliessen', null).then(() => {
      setAktuellesProjekt(null)
    })
  }, [])

  if (aktuellesProjekt !== null) {
    return (
      <div>
        <p>{t('start_projekt_geoeffnet', { name: aktuellesProjekt.name })}</p>
        <button type="button" onClick={projektSchliessen}>
          {t('start_projekt_schliessen_button')}
        </button>
      </div>
    )
  }

  return (
    <div>
      <h1>{t('app_titel')}</h1>

      {fehlerCode !== null ? (
        <div role="alert">
          <strong>{tFehler(`${fehlerCode}.titel`)}</strong>
          <p>{tFehler(`${fehlerCode}.was_tun`)}</p>
        </div>
      ) : null}

      <section>
        <h2>{t('start_neues_projekt_titel')}</h2>
        <input
          value={neuElternordner}
          onChange={(ereignis) => setNeuElternordner(ereignis.target.value)}
          placeholder={t('start_neues_projekt_elternordner_platzhalter')}
        />
        <input
          value={neuName}
          onChange={(ereignis) => setNeuName(ereignis.target.value)}
          placeholder={t('start_neues_projekt_name_platzhalter')}
        />
        <button type="button" onClick={neuesProjektAnlegen} disabled={neuElternordner === '' || neuName === ''}>
          {t('start_neues_projekt_button')}
        </button>
      </section>

      <section>
        <h2>{t('start_projekt_oeffnen_titel')}</h2>
        <input
          value={oeffnenPfad}
          onChange={(ereignis) => setOeffnenPfad(ereignis.target.value)}
          placeholder={t('start_projekt_oeffnen_platzhalter')}
        />
        <button type="button" onClick={() => projektOeffnenAufrufen(oeffnenPfad)} disabled={oeffnenPfad === ''}>
          {t('start_projekt_oeffnen_button')}
        </button>
      </section>

      <section>
        <h2>{t('start_zuletzt_titel')}</h2>
        {zuletzt.length === 0 ? (
          <p>{t('start_zuletzt_leer')}</p>
        ) : (
          <ul>
            {zuletzt.map((eintrag) => (
              <li key={eintrag.pfad}>
                <button type="button" onClick={() => projektOeffnenAufrufen(eintrag.pfad)}>
                  {eintrag.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {syncWarnung !== null ? (
        <div role="alertdialog">
          <p>{t('start_sync_warnung_text', { anbieter: t(anbieterSchluessel(syncWarnung.anbieter)) })}</p>
          <button type="button" onClick={() => projektOeffnenAufrufen(syncWarnung.pfad, true)}>
            {t('start_sync_warnung_trotzdem_oeffnen')}
          </button>
          <button type="button" onClick={() => setSyncWarnung(null)}>
            {t('start_sync_warnung_abbrechen')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
