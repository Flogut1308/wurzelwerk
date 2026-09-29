// AP-1.30 U-130-9b-unlesbar (docs/80 §33 V-130-unlesbar, Entscheidung B): ein nicht auflösbares
// Datum wird nicht gespeichert — aber auch nicht still verloren. Jedes Datumsfeld, das einen solchen
// ungespeicherten Text hält, meldet sich über `UnlesbareEingabenKontext` beim Editor; der Editor
// zeigt dann „Nicht gespeichert — Datum nicht lesbar" im Speicherstatus und fragt vor dem Verlassen
// (Fertig, Reiterwechsel, Schließen) nach. Muster wie `SchreibBeobachterKontext`: der Umfang ist der
// React-Baum dieses Editors, ohne Anbieter (Lesesicht) meldet ein Feld nichts.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

export interface UnlesbareEingabe {
  /** Element-ID des Eingabefelds (`editorFeldId`) — Ziel von „Zurück zum Feld". */
  readonly feldId: string
  /** Sichtbare Beschriftung des Felds (z. B. „Geburtsdatum") für die Nachfrage. */
  readonly beschriftung: string
  /** Der getippte, nicht auflösbare Text. */
  readonly text: string
  /** Erkennbares Jahr für „als ‚etwa JJJJ‘ speichern"; `null` = kein Angebot. */
  readonly jahr: number | null
  /** Setzt das Feld auf den gespeicherten Wert (schreibt nichts). */
  readonly verwerfen: () => void
  /** Speichert „etwa JJJJ" mit dem Text als Originaltext; nur bei `jahr !== null` wirksam. */
  readonly alsEtwaSpeichern: () => void
}

export interface UnlesbareEingabenMelder {
  /** `null` = das Feld hält keinen unlesbaren Text (mehr). */
  readonly melden: (feldId: string, eingabe: UnlesbareEingabe | null) => void
  /**
   * Eine Aktion im Reiter, die die Felder `feldIds` aushängt (z. B. „Tod-Angaben ausblenden", hueter
   * #167 H1): hält eines davon einen unlesbaren Text, fragt der Editor zuerst nach (dieselbe
   * Nachfrage wie beim Verlassen), sonst läuft `aktion` sofort.
   */
  readonly nachfragen: (feldIds: readonly string[], aktion: () => void) => void
}

/** Vom Editor: führt `aktion` aus oder öffnet die Nachfrage für die gemeldeten `feldIds`. */
export type Nachfragen = UnlesbareEingabenMelder['nachfragen']

export const UnlesbareEingabenKontext = createContext<UnlesbareEingabenMelder | null>(null)

/** Editorseite: die gemeldeten Felder in Meldereihenfolge und der Melder für den Kontext. */
export function useUnlesbareEingaben(nachfragen: Nachfragen): { readonly melder: UnlesbareEingabenMelder; readonly eingaben: readonly UnlesbareEingabe[] } {
  const [eingaben, setEingaben] = useState<readonly UnlesbareEingabe[]>([])
  const melden = useCallback((feldId: string, eingabe: UnlesbareEingabe | null) => {
    setEingaben((bisher) => {
      const ohne = bisher.filter((eintrag) => eintrag.feldId !== feldId)
      if (eingabe === null) return ohne.length === bisher.length ? bisher : ohne
      const index = bisher.findIndex((eintrag) => eintrag.feldId === feldId)
      if (index === -1) return [...bisher, eingabe]
      return bisher.map((eintrag) => (eintrag.feldId === feldId ? eingabe : eintrag))
    })
  }, [])
  // Über einen Ref: der Melder bleibt stabil (sonst meldeten sich alle Felder bei jedem Rendern neu),
  // aufgerufen wird trotzdem die neueste Fassung des Editors.
  const nachfragenRef = useRef(nachfragen)
  useEffect(() => {
    nachfragenRef.current = nachfragen
  })
  const melder = useMemo<UnlesbareEingabenMelder>(
    () => ({ melden, nachfragen: (feldIds, aktion) => nachfragenRef.current(feldIds, aktion) }),
    [melden],
  )
  return { melder, eingaben }
}

/**
 * Feldseite: meldet `meldung` (oder `null`) an den Editor, solange das Feld eingehängt ist. Die
 * Aktionen werden über einen Ref immer in ihrer neuesten Fassung aufgerufen — eine neue Meldung
 * entsteht nur, wenn sich Feld, Text, Jahr oder Beschriftung ändern.
 */
export function useUnlesbarMelden(meldung: UnlesbareEingabe | null): void {
  const melder = useContext(UnlesbareEingabenKontext)
  const aktionenRef = useRef<Pick<UnlesbareEingabe, 'verwerfen' | 'alsEtwaSpeichern'> | null>(meldung)
  useEffect(() => {
    aktionenRef.current = meldung
  })
  const feldId = meldung?.feldId ?? null
  const beschriftung = meldung?.beschriftung ?? ''
  const text = meldung?.text ?? ''
  const jahr = meldung?.jahr ?? null
  useEffect(() => {
    if (melder === null || feldId === null) return
    melder.melden(feldId, {
      feldId,
      beschriftung,
      text,
      jahr,
      verwerfen: () => aktionenRef.current?.verwerfen(),
      alsEtwaSpeichern: () => aktionenRef.current?.alsEtwaSpeichern(),
    })
    return () => melder.melden(feldId, null)
  }, [melder, feldId, beschriftung, text, jahr])
}
