// AP-1.30 PR 7c (docs/80 §33 V-130-7-speicherfehler): Verdrahtung des Speicherstatus im Kopf von
// „Person bearbeiten". Die Übergänge sind rein (`editor-speicherstatus-logik.ts`); dieser Hook
// liefert den Beobachter für `SchreibBeobachterKontext`, die Anzeige, den Bezugszeitpunkt für die
// relative Zeit (Minutentakt) und „erneut versuchen".
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { SchreibBeobachter } from '../../brücke/schreib-beobachter'
import { EDITOR_SPEICHER_ANFANG, editorSpeicherAnzeige, editorSpeicherUebergang, type EditorSpeicherAnzeige } from './editor-speicherstatus-logik'

/** Takt der relativen Zeitangabe („vor n Minuten"): feiner zeigt der Baustein ohnehin nicht. */
const MINUTENTAKT_MS = 60_000

export interface EditorSpeicherstatus {
  readonly beobachter: SchreibBeobachter
  readonly anzeige: EditorSpeicherAnzeige
  /** Bezugszeitpunkt für `Speicherstatus.jetzt` — nie vor dem letzten Erfolg. */
  readonly jetzt: number
  /** Wiederholt je offenem Fehler den neuesten gescheiterten Schreibvorgang dieses Felds. */
  readonly erneutVersuchen: () => void
}

/**
 * `uhr` ist nur für Tests austauschbar (feste Zeit); im Renderer ist es `Date.now` — die
 * Determinismus-Regel gilt für `src/core`, die relative Zeit selbst rechnet der Baustein rein aus
 * zwei übergebenen Zeitpunkten (`speicherstatus-logik.ts`).
 */
export function useEditorSpeicherstatus(uhr: () => number = Date.now): EditorSpeicherstatus {
  const [zustand, melden] = useReducer(editorSpeicherUebergang, EDITOR_SPEICHER_ANFANG)
  const [takt, setTakt] = useState(uhr)
  const naechsteNrRef = useRef(1)
  const uhrRef = useRef(uhr)
  useEffect(() => {
    uhrRef.current = uhr
  })
  /** Je Feld die Wiederholung des neuesten Fehlschlags (Nummer, um ältere nicht darüberzulegen). */
  const wiederholungenRef = useRef(new Map<string, { readonly nr: number; readonly ausfuehren: () => Promise<unknown> }>())

  const beobachter = useMemo<SchreibBeobachter>(() => {
    function beobachten<T>(feld: string, ausfuehren: () => Promise<T>): Promise<T> {
      const nr = naechsteNrRef.current
      naechsteNrRef.current += 1
      melden({ art: 'gestartet', nr, feld })
      return ausfuehren().then(
        (ergebnis) => {
          melden({ art: 'erfolgreich', nr, feld, um: uhrRef.current() })
          const gemerkt = wiederholungenRef.current.get(feld)
          if (gemerkt !== undefined && gemerkt.nr < nr) wiederholungenRef.current.delete(feld)
          return ergebnis
        },
        (fehler: unknown) => {
          const gemerkt = wiederholungenRef.current.get(feld)
          if (gemerkt === undefined || gemerkt.nr < nr) wiederholungenRef.current.set(feld, { nr, ausfuehren })
          melden({ art: 'fehlgeschlagen', nr, feld })
          // Unverändert weiterreichen: die Mutation des Aufrufers bekommt ihren Fehler wie ohne Beobachter.
          throw fehler
        },
      )
    }
    return { beobachten }
  }, [])

  const anzeige = editorSpeicherAnzeige(zustand)

  const erneutVersuchen = useCallback(() => {
    if (anzeige.zustand !== 'fehler') return
    for (const feld of anzeige.felder) {
      const gemerkt = wiederholungenRef.current.get(feld)
      if (gemerkt === undefined) continue
      // Der Ausgang steht im Zustand (Erfolg hebt den Fehler auf, Fehlschlag lässt ihn stehen);
      // die Ablehnung hier aufzufangen verhindert nur ein unbehandeltes Promise.
      beobachter.beobachten(feld, gemerkt.ausfuehren).catch(() => undefined)
    }
  }, [anzeige, beobachter])

  const gespeichert = anzeige.zustand === 'gespeichert'
  useEffect(() => {
    if (!gespeichert) return
    const intervall = setInterval(() => setTakt(uhrRef.current()), MINUTENTAKT_MS)
    return () => clearInterval(intervall)
  }, [gespeichert])

  const jetzt = anzeige.zustand === 'gespeichert' ? Math.max(takt, anzeige.gespeichertUm) : takt
  return { beobachter, anzeige, jetzt, erneutVersuchen }
}
