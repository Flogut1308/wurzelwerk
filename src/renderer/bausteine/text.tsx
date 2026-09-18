import type { ReactNode } from 'react'
import './text.css'

/** Die zehn Schriftrollen aus docs/71_Designsystem.md §1.3 — der Code setzt nie `font-size` direkt. */
export type TextRolle =
  | 'titel-gross'
  | 'titel'
  | 'titel-klein'
  | 'koerper'
  | 'koerper-klein'
  | 'beschriftung'
  | 'hilfe'
  | 'original'
  | 'technisch'
  | 'zahl-tabelle'

/** Textfarbrollen aus §1.1. */
export type TextFarbe = 'primaer' | 'sekundaer' | 'tertiaer' | 'invers' | 'gesperrt' | 'akzent' | 'original'

/** Nur die Elemente, die eine Textrolle in dieser Ansicht realistisch trägt (Überschrift, Absatz, Inline). */
export type TextElement = 'span' | 'p' | 'div' | 'h1' | 'h2' | 'h3' | 'dt' | 'dd'

export interface TextProps {
  readonly rolle: TextRolle
  /** Ohne Angabe leitet sich die Farbe aus der Rolle ab (§1.3-Verwendungszweck, s. u.). */
  readonly farbe?: TextFarbe
  readonly als?: TextElement
  readonly children: ReactNode
  readonly id?: string
}

/**
 * Vorgabefarbe je Rolle, aus der in §1.3 beschriebenen Verwendung abgeleitet: „Beschriftung,
 * Metadaten" → sekundär, „Hilfetext, Zähler, Platzhaltertexte" → tertiär, „Originalzitate" →
 * original, alles andere (Titel, Körper, Zahlen, IDs) → primär. Ein expliziter `farbe`-Prop
 * überschreibt das jederzeit (z. B. eine Beschriftung in `--wz-text-gesperrt` bei einem
 * deaktivierten Formularfeld).
 */
function vorgabeFarbe(rolle: TextRolle): TextFarbe {
  switch (rolle) {
    case 'original':
      return 'original'
    case 'hilfe':
      return 'tertiaer'
    case 'beschriftung':
    case 'technisch':
      return 'sekundaer'
    default:
      return 'primaer'
  }
}

/**
 * `Text` — Atom (docs/71_Designsystem.md §2.1). Kein eigener Zustand, keine Fachlogik, kein
 * Datenzugriff — reine Typografie über Rollen aus `tokens.css`. Sichtbarer Inhalt kommt immer vom
 * Aufrufer (i18n-Schlüssel, ADR-011); dieses Atom selbst hat keine Zeichenkettenliterale.
 */
export function Text({ rolle, farbe, als, children, id }: TextProps) {
  const Element = als ?? 'span'
  const aufgeloesteFarbe = farbe ?? vorgabeFarbe(rolle)
  return (
    <Element id={id} className={`wz-text wz-text--${rolle} wz-text--farbe-${aufgeloesteFarbe}`}>
      {children}
    </Element>
  )
}
