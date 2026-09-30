import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { PersonDetailName } from '../../../shared/schemata/person-detail'
import { personennameIstErsatz, personennameText } from '../../bausteine/personenname-anzeige'
import { Text } from '../../bausteine/text'
import { OBERFLAECHENSPRACHE, herkunftSchluessel, vorschauFuer, vorschauSpracheBeschriftung, vorschauSprachen, vorschauZielIndex } from './reiter-namen-logik'
import './reiter-namen-vorschau.css'

export interface NamenVorschauProps {
  readonly namen: readonly PersonDetailName[]
  /** Platzhalter zeigen nie einen Namen (A-17) — die Vorschau sagt dasselbe wie der Kopf. */
  readonly istPlatzhalter: boolean
}

/**
 * `NamenVorschau` (AP-1.30 PR 11b, Artboard 2a „Vorschau in … · Zeigt: … · Rückfall: Sprache →
 * Umschrift → Hauptname", Entwicklungsvorgaben §3.5; docs/80 §33 V-130-11b): zeigt, wie die Person für
 * eine gewählte Sprache heißt, und aus welcher Stufe der Rückfallkette der Text kommt. Reine Anzeige,
 * schreibt nichts; die gewählte Sprache lebt nur in dieser Instanz (Start: Oberflächensprache).
 *
 * **Optionsgruppe statt Segment [Design-Review]:** einen Segment-Baustein gibt es nicht; gebaut ist das
 * WAI-ARIA-Muster „Radio Group" (Roving-Tabindex, Pfeile wählen und fokussieren, Pos1/Ende) in der Optik
 * des Entwurfs: verbundene Segmente, das gewählte in der Akzentfläche. Die Ziffern 1…8 wählen im Editor
 * den Reiter (`darfKontexttasteWirken`: ein Optionsknopf ist kein Eingabeelement) — die Gruppe beansprucht
 * sie nicht, darum keine Kollision.
 *
 * **Herkunft sichtbar statt Tooltip:** der Entwurf nennt sie „im Tooltip" (§5.1); ein Tooltip ist mit der
 * Tastatur und für Screenreader nicht verlässlich erreichbar (WCAG 1.4.13), darum steht sie als Text neben
 * dem Namen.
 */
export function NamenVorschau({ namen, istPlatzhalter }: NamenVorschauProps) {
  const { t } = useTranslation('profil')
  const { t: tAllgemein } = useTranslation('allgemein')
  const beschriftungId = useId()
  const [gewaehlt, setGewaehlt] = useState(OBERFLAECHENSPRACHE)
  const knoepfe = useRef(new Map<string, HTMLButtonElement>())
  const sprachen = useMemo(() => vorschauSprachen(namen), [namen])
  // Verschwindet die gewählte Sprache (ihre letzte Form wurde gelöscht oder umgestellt), gilt wieder die
  // Oberflächensprache — ohne Effekt, weil der Zustand sonst einen Rendervorgang lang ungültig wäre.
  const aktiv = sprachen.includes(gewaehlt) ? gewaehlt : OBERFLAECHENSPRACHE
  const ergebnis = useMemo(() => vorschauFuer(namen, aktiv), [namen, aktiv])
  if (ergebnis === null) return null

  const person = { anzeigename: ergebnis.text, ist_platzhalter: istPlatzhalter }

  function tastendruck(ereignis: KeyboardEvent<HTMLButtonElement>, index: number) {
    const ziel = vorschauZielIndex(ereignis.key, index, sprachen.length)
    if (ziel === null) return
    const sprache = sprachen[ziel]
    if (sprache === undefined) return
    ereignis.preventDefault()
    setGewaehlt(sprache)
    knoepfe.current.get(sprache)?.focus()
  }

  return (
    <div className="wz-namen-vorschau">
      <Text rolle="beschriftung" als="span" id={beschriftungId}>
        {t('vorschau_beschriftung')}
      </Text>
      <div role="radiogroup" aria-labelledby={beschriftungId} className="wz-namen-vorschau__gruppe">
        {sprachen.map((sprache, index) => {
          const istAktiv = sprache === aktiv
          return (
            <button
              key={sprache}
              ref={(element) => {
                if (element === null) knoepfe.current.delete(sprache)
                else knoepfe.current.set(sprache, element)
              }}
              type="button"
              role="radio"
              aria-checked={istAktiv}
              tabIndex={istAktiv ? 0 : -1}
              lang={sprache}
              className={`wz-namen-vorschau__option${istAktiv ? ' wz-namen-vorschau__option--aktiv' : ''}`}
              onClick={() => setGewaehlt(sprache)}
              onKeyDown={(ereignis) => tastendruck(ereignis, index)}
            >
              {vorschauSpracheBeschriftung(sprache, t)}
            </button>
          )
        })}
      </div>
      <p className="wz-namen-vorschau__ergebnis" aria-live="polite">
        <Text rolle="koerper-klein" farbe="sekundaer" als="span">
          {t('vorschau_zeigt')}
        </Text>
        <span className={`wz-namen-vorschau__name${personennameIstErsatz(person) ? ' wz-namen-vorschau__name--ersatz' : ''}`}>
          {personennameText(person, tAllgemein)}
        </span>
        <span className="wz-namen-vorschau__herkunft">{t(herkunftSchluessel(ergebnis.quelle))}</span>
      </p>
      <span className="wz-namen-vorschau__regel">
        <Text rolle="hilfe" als="span">
          {t('vorschau_rueckfall')}
        </Text>
      </span>
    </div>
  )
}
