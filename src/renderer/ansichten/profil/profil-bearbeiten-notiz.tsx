import { useTranslation } from 'react-i18next'
import { Formularfeld } from '../../bausteine/formularfeld'
import { Langtextfeld } from '../../bausteine/langtextfeld'
import { usePersonFeldSetzen } from '../../brücke/befehl-hooks'
import { useEntwurfMitVerzoegertemCommit } from './profil-bearbeiten-debounce'
import { personFeldNotizEin } from './profil-bearbeiten-logik'

export interface NotizBearbeitenAbschnittProps {
  readonly personId: string
  readonly notiz: string | null
}

/**
 * `NotizBearbeitenAbschnitt` (AP-1.30 PR 7b): die Freitext-Notiz der Person, Inhalt des Reiters
 * „Notizen" — abgespalten aus `GrunddatenBearbeitenAbschnitt` (AP-1.14a), Schreibweg unverändert
 * `befehl:person.feldSetzen` mit Feld `notiz` (Koaleszenzschlüssel aus AP-0.15). Blur schreibt
 * sofort, sonst der Debounce; hängt der Reiter aus (Reiterwechsel), schreibt der Unmount-Flush des
 * Debounce den ausstehenden Entwurf (`profil-bearbeiten-debounce.ts`) — „Reiterwechsel speichert".
 *
 * Keine eigene Überschrift: der Inhaltsbereich des Reiters ist über `aria-labelledby` bereits nach
 * dem Reiter benannt, eine zweite Überschrift „Notiz" über dem Feld „Notiz" wäre dreifach.
 */
export function NotizBearbeitenAbschnitt({ personId, notiz }: NotizBearbeitenAbschnittProps) {
  const { t } = useTranslation('profil')
  const feldSetzen = usePersonFeldSetzen()

  const [notizEntwurf, setNotizEntwurf, notizSofortSchreiben] = useEntwurfMitVerzoegertemCommit(notiz ?? '', (wert) =>
    feldSetzen.mutate(personFeldNotizEin(personId, wert)),
  )

  return (
    <div className="wz-profil-ansicht__abschnitt">
      <Formularfeld beschriftung={t('notiz_beschriftung')}>
        <Langtextfeld wert={notizEntwurf} aufAenderung={setNotizEntwurf} aufVerlassen={notizSofortSchreiben} />
      </Formularfeld>
    </div>
  )
}
