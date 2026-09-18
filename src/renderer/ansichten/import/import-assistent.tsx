import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Trockenlaufbericht } from '../../../shared/import/trockenlauf-bericht'
import { useImportAusfuehren, useImportBerichtSpeichern, useImportDateiWaehlen, useImportTrockenlauf, useJournalUndo } from '../../brücke/befehl-hooks'
import { Schrittleiste } from '../../bausteine/schrittleiste'
import { DateiWaehlen } from './datei-waehlen'
import { ErgebnisAnsicht } from './ergebnis-ansicht'
import { schrittNachTrockenlauf, type ImportSchritt } from './import-schritt-logik'
import { TrockenlaufBerichtAnsicht } from './trockenlauf-bericht-ansicht'
import './import-assistent.css'

export interface ImportAssistentProps {
  /** Schließt den Assistenten und kehrt zur Liste zurück. */
  readonly aufSchliessen: () => void
}

/** Der aktive Schritt → Index in der dreigliedrigen Schrittleiste (Datei · Prüfen · Ergebnis). */
function schrittIndex(schritt: ImportSchritt): number {
  switch (schritt) {
    case 'datei-waehlen':
      return 0
    case 'bericht':
    case 'fehlerliste':
      return 1
    case 'ergebnis':
      return 2
  }
}

/**
 * Import-Assistent (72 §S-10…S-13, T-Assistent). Hält den Flow-Zustand (gewählter Pfad,
 * Trockenlauf-Bericht, Ergebnis-Bericht) und schaltet zwischen den Schritten. Der Schritt nach dem
 * Trockenlauf und die Sperre folgen allein aus dem Bericht (`import-schritt-logik.ts`) — der
 * Assistent trifft keine eigene Entscheidung. Als überlagerte Vollseite gerendert (Muster
 * `ProfilAnsicht`); der Einstieg ist ein Knopf im Listen-Kopf (Design-Review, §S-10 nennt die
 * Affordanz nicht, U-1.4b-einstieg).
 */
export function ImportAssistent({ aufSchliessen }: ImportAssistentProps) {
  const { t } = useTranslation('import')
  const [pfad, setPfad] = useState<string | null>(null)
  const [bericht, setBericht] = useState<Trockenlaufbericht | null>(null)
  const [ergebnis, setErgebnis] = useState<Trockenlaufbericht | null>(null)

  const dateiWaehlen = useImportDateiWaehlen()
  const trockenlauf = useImportTrockenlauf()
  const ausfuehren = useImportAusfuehren()
  const berichtSpeichern = useImportBerichtSpeichern()
  const journalUndo = useJournalUndo()

  const schritt: ImportSchritt = ergebnis !== null ? 'ergebnis' : bericht !== null ? schrittNachTrockenlauf(bericht) : 'datei-waehlen'
  const aktuellerBericht = ergebnis ?? bericht

  const schritte = [{ beschriftung: t('schritt_datei') }, { beschriftung: t('schritt_bericht') }, { beschriftung: t('schritt_ergebnis') }]

  const handleWaehlen = () => {
    dateiWaehlen.mutate(undefined, {
      onSuccess: (aus) => {
        if (aus.pfad !== null) {
          setPfad(aus.pfad)
        }
      },
    })
  }

  const handlePruefen = () => {
    if (pfad !== null) {
      trockenlauf.mutate({ pfad }, { onSuccess: setBericht })
    }
  }

  const handleImportieren = () => {
    if (pfad !== null) {
      ausfuehren.mutate({ pfad }, { onSuccess: setErgebnis })
    }
  }

  const handleSpeichern = () => {
    if (aktuellerBericht !== null) {
      berichtSpeichern.mutate({ bericht: aktuellerBericht })
    }
  }

  const handleRueckgaengig = () => {
    journalUndo.mutate(undefined, { onSuccess: aufSchliessen })
  }

  return (
    <div className="wz-import-assistent" role="dialog" aria-label={t('assistent_titel')}>
      <div className="wz-import-assistent__rahmen">
        <Schrittleiste schritte={schritte} aktiv={schrittIndex(schritt)} />

        <div className="wz-import-assistent__inhalt">
          {schritt === 'datei-waehlen' ? (
            <DateiWaehlen pfad={pfad} aufWaehlen={handleWaehlen} aufPruefen={handlePruefen} waehltGerade={dateiWaehlen.isPending} prueftGerade={trockenlauf.isPending} />
          ) : null}

          {(schritt === 'bericht' || schritt === 'fehlerliste') && bericht !== null ? (
            <TrockenlaufBerichtAnsicht
              bericht={bericht}
              aufImportieren={handleImportieren}
              aufSpeichern={handleSpeichern}
              aufAbbrechen={aufSchliessen}
              importiertGerade={ausfuehren.isPending}
              speichertGerade={berichtSpeichern.isPending}
            />
          ) : null}

          {schritt === 'ergebnis' && ergebnis !== null ? (
            <ErgebnisAnsicht
              bericht={ergebnis}
              aufRueckgaengig={handleRueckgaengig}
              aufSpeichern={handleSpeichern}
              aufZurListe={aufSchliessen}
              nimmtZurueck={journalUndo.isPending}
              speichertGerade={berichtSpeichern.isPending}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
