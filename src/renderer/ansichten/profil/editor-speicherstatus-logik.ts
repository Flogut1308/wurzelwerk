// AP-1.30 PR 7c (docs/80 §33 V-130-7-speicherfehler): Zustand des Speicherstatus im Kopf von
// „Person bearbeiten". Reine Übergänge über die Schreibvorgänge DIESES Editors (React-/DOM-frei,
// Muster `negativbefund-abschnitt-logik.ts`); die Verdrahtung liegt in `editor-speicherstatus.ts`.
//
// Ein Schreibvorgang trägt eine fortlaufende Nummer (`nr`, je Editor-Instanz) und einen
// Feldschlüssel (`feld`: Befehl + Subjekt + Feld, s. `schreib-beobachter.ts`). Regeln:
// - Ein Fehler bleibt stehen, bis DASSELBE Feld mit einer neueren Nummer erfolgreich geschrieben
//   ist. Ein Erfolg an einem anderen Feld hebt ihn nicht auf — sonst meldete „Gespeichert"
//   fälschlich Datensicherheit, ein verlorener Wert fiele nicht auf.
// - Je Feld zählt nur der neueste Fehlschlag (eine Wiederholung schreibt den neuesten Wert, nie
//   einen älteren über einen neueren).
// - Ein Fehlschlag, der nach einem neueren Erfolg desselben Felds eintrifft, ist überholt.

export interface EditorSchreibvorgang {
  readonly nr: number
  readonly feld: string
}

export interface EditorSpeicherZustand {
  readonly laufend: readonly EditorSchreibvorgang[]
  /** Höchstens ein Eintrag je Feld (der neueste Fehlschlag), in Reihenfolge des Auftretens. */
  readonly fehler: readonly EditorSchreibvorgang[]
  /** Höchste erfolgreich geschriebene Nummer je Feld. */
  readonly erfolgNr: Readonly<Record<string, number>>
  /** Zeitpunkt des letzten Erfolgs (ms seit Epoche) oder `null` vor dem ersten Erfolg. */
  readonly gespeichertUm: number | null
}

export type EditorSpeicherEreignis =
  | { readonly art: 'gestartet'; readonly nr: number; readonly feld: string }
  | { readonly art: 'erfolgreich'; readonly nr: number; readonly feld: string; readonly um: number }
  | { readonly art: 'fehlgeschlagen'; readonly nr: number; readonly feld: string }

/** Was der Kopf zeigt. `ruhe` = vor dem ersten Schreiben, der Baustein wird nicht gerendert. */
export type EditorSpeicherAnzeige =
  | { readonly zustand: 'ruhe' }
  | { readonly zustand: 'speichert' }
  | { readonly zustand: 'gespeichert'; readonly gespeichertUm: number }
  | { readonly zustand: 'fehler'; readonly felder: readonly string[] }

export const EDITOR_SPEICHER_ANFANG: EditorSpeicherZustand = { laufend: [], fehler: [], erfolgNr: {}, gespeichertUm: null }

export function editorSpeicherUebergang(zustand: EditorSpeicherZustand, ereignis: EditorSpeicherEreignis): EditorSpeicherZustand {
  switch (ereignis.art) {
    case 'gestartet':
      return { ...zustand, laufend: [...zustand.laufend, { nr: ereignis.nr, feld: ereignis.feld }] }
    case 'erfolgreich': {
      const bisher = zustand.erfolgNr[ereignis.feld]
      return {
        laufend: zustand.laufend.filter((vorgang) => vorgang.nr !== ereignis.nr),
        fehler: zustand.fehler.filter((vorgang) => !(vorgang.feld === ereignis.feld && vorgang.nr < ereignis.nr)),
        erfolgNr: { ...zustand.erfolgNr, [ereignis.feld]: bisher === undefined ? ereignis.nr : Math.max(bisher, ereignis.nr) },
        gespeichertUm: ereignis.um,
      }
    }
    case 'fehlgeschlagen': {
      const laufend = zustand.laufend.filter((vorgang) => vorgang.nr !== ereignis.nr)
      const erfolg = zustand.erfolgNr[ereignis.feld]
      const vorhanden = zustand.fehler.find((vorgang) => vorgang.feld === ereignis.feld)
      const ueberholt = (erfolg !== undefined && erfolg > ereignis.nr) || (vorhanden !== undefined && vorhanden.nr > ereignis.nr)
      if (ueberholt) return { ...zustand, laufend }
      const neu = { nr: ereignis.nr, feld: ereignis.feld }
      const fehler =
        vorhanden === undefined ? [...zustand.fehler, neu] : zustand.fehler.map((vorgang) => (vorgang.feld === ereignis.feld ? neu : vorgang))
      return { ...zustand, laufend, fehler }
    }
  }
}

/**
 * Anzeige: ein offener Fehler hat Vorrang (auch während an einem anderen Feld geschrieben wird).
 * Ein Fehler, dessen Feld gerade mit einer neueren Nummer erneut geschrieben wird, gilt als „in
 * Wiederholung" und zeigt „speichert"; scheitert die Wiederholung, steht er wieder da.
 */
export function editorSpeicherAnzeige(zustand: EditorSpeicherZustand): EditorSpeicherAnzeige {
  const offen = zustand.fehler.filter((fehler) => !zustand.laufend.some((vorgang) => vorgang.feld === fehler.feld && vorgang.nr > fehler.nr))
  if (offen.length > 0) return { zustand: 'fehler', felder: offen.map((fehler) => fehler.feld) }
  if (zustand.laufend.length > 0) return { zustand: 'speichert' }
  if (zustand.gespeichertUm !== null) return { zustand: 'gespeichert', gespeichertUm: zustand.gespeichertUm }
  return { zustand: 'ruhe' }
}
