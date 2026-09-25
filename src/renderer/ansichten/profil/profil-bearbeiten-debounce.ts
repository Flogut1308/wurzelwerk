// AP-1.14a: „kein Speichern-Knopf — Notiz/Textfelder committen bei Blur/Debounce" (Auftrag §
// Umfang). Ein React-Hook, darum bewusst NICHT in `profil-bearbeiten-logik.ts` (das Modul bleibt
// React-/DOM-frei, analog `filterleiste-logik.ts`).
//
// hueter-Auflage AP-1.14a #1 (stiller Datenverlust): der Debounce-Effekt selbst bleibt bewusst
// NICHT über Vitest getestet (s. `befehl-hooks.ts`-Modulkommentar — Hook-Regeln, keine
// DOM-Testbibliothek im Projekt), aber der Flush-beim-Unmount UNTEN braucht eine echte
// Mount-/Unmount-Lebensdauer, die kein `renderToStaticMarkup` liefert — dafür
// `test/einheit/profil-bearbeiten-debounce.test.tsx` (jsdom nur in dieser einen Testdatei, s.
// dortiger Kopfkommentar).
import { useCallback, useEffect, useRef, useState } from 'react'
import { AUTOSAVE_DEBOUNCE_MS } from '../../../shared/autosave'

/**
 * Hält einen lokalen Entwurfswert (jeder Tastendruck/jede Feldänderung aktualisiert ihn sofort,
 * für ein reaktionsschnelles Feld) und committet ihn erst nach einer kurzen Ruhephase über
 * `aufCommit` (typischerweise ein Befehlsbus-Aufruf). Generisch über `T`: ein einzelnes Textfeld
 * (`string`) UND eine ganze Namenszeile (`NamenEintragWerte`, EIN `name.aendern`-`UPDATE` für alle
 * Spalten zugleich, s. `name-repo.ts::aktualisieren`) teilen sich denselben Mechanismus — die
 * Gleichheitsprüfung `entwurf === wert` bleibt bei einem Objekt-`T` absichtlich eine
 * Referenzprüfung: der Sync-Zweig unten übernimmt bei einer externen Änderung IMMER dieselbe
 * `wert`-Referenz in den Entwurf, ein frischer Tastendruck erzeugt dagegen immer ein neues Objekt —
 * die Unterscheidung "von außen" vs. "vom Nutzer geändert" braucht darum keinen tiefen Vergleich.
 *
 * Ein von außen geänderter `wert` (z. B. nach `ereignis:datenGeaendert`, etwa durch ein Undo)
 * ersetzt den Entwurf sofort — AP-1.14a kennt keine gleichzeitige Mehrbearbeitung
 * (`docs/architektur.md` §10), ein Wettlauf zwischen Server- und Tippzustand ist darum kein Fall,
 * den dieser Hook auflösen muss.
 *
 * Synchronisation OHNE Effekt: „Adjusting some state when a prop changes" (React-Dokumentation,
 * `react-hooks/set-state-in-effect`) — ein `useEffect`, der bei jeder `wert`-Änderung `setEntwurf`
 * aufruft, wäre eine kaskadierende Zustandsänderung; stattdessen wird der Entwurf noch WÄHREND des
 * Renderns zurückgesetzt, sobald sich `wert` gegenüber dem zuletzt gesehenen Wert unterscheidet
 * (kein sichtbares Zwischenbild mit dem alten Entwurf).
 *
 * **Flush beim Unmount (hueter-Auflage AP-1.14a #1):** ohne Fix committete diese Funktion NUR über
 * den `setTimeout`-Ablauf; die Effekt-Aufräumung war ein reines `clearTimeout` OHNE Commit. Wer
 * tippt und binnen `verzoegerungMs` „Fertig"/„Schließen" klickt (`ProfilAnsicht` hängt den
 * Bearbeiten-Zweig dabei aus), verlor die letzte Eingabe still — die Fußzeile verspricht aber
 * „sofort gespeichert". `ausstehendRef` trägt darum den zuletzt GEPLANTEN (noch nicht committeten)
 * Entwurf; ein zweiter Effekt mit LEERER Abhängigkeitsliste läuft nur beim echten Aus-Hängen dieser
 * Hook-Instanz (nicht bei jeder Debounce-Zurücksetzung zwischen Tastendrücken, die ihre eigene
 * Cleanup im ERSTEN Effekt hat) und committet einen noch offenen Entwurf nach.
 *
 * **`aufCommit` über einen Ref (Nebenbefund des hueter-Reviews):** der Aufrufer reicht typischerweise
 * eine bei jedem Render neu erzeugte Inline-Funktion (`(wert) => feldSetzen.mutate(...)`,
 * `profil-bearbeiten-grunddaten.tsx`). Stünde `aufCommit` in der Abhängigkeitsliste des
 * Debounce-Effekts, würde JEDES Elternrerender während der Wartezeit (z. B. eine fremde
 * Query-Invalidierung) den laufenden Timer verwerfen und einen neuen `verzoegerungMs`-Timer
 * starten — im ungünstigen Fall verschiebt sich der Commit immer weiter nach hinten. Der Ref hält
 * stattdessen nur die JEWEILS aktuelle Funktion vor, ohne den Timer zurückzusetzen.
 *
 * **AP-1.30 PR 4 — „Blur oder 400 ms Debounce schreibt":** die Frist ist `AUTOSAVE_DEBOUNCE_MS`
 * (`src/shared/autosave.ts`, dieselbe Konstante nutzen die Tests). Der dritte Rückgabewert
 * `sofortSchreiben` gehört an das Verlassen des Felds (`aufVerlassen` an `Textfeld`/`Langtextfeld`):
 * ein ausstehender Entwurf wird sofort geschrieben, der laufende Timer findet danach nichts mehr vor
 * (`ausstehendRef` ist dann `null`) und schreibt nicht doppelt. Ohne ausstehenden Entwurf tut er
 * nichts. Der Blur beendet die Koaleszenz im Bus NICHT — die entscheidet allein das Zeitfenster
 * (`src/main/journal/koaleszenz.ts`).
 */
export function useEntwurfMitVerzoegertemCommit<T>(
  wert: T,
  aufCommit: (wert: T) => void,
  verzoegerungMs: number = AUTOSAVE_DEBOUNCE_MS,
): readonly [T, (wert: T) => void, () => void] {
  const [entwurf, setEntwurf] = useState(wert)
  const [vorherigerWert, setVorherigerWert] = useState(wert)

  const aufCommitRef = useRef(aufCommit)
  // Zuweisung NACH dem Rendern (Effekt statt Render-Körper) — ein Ref-Schreibzugriff während des
  // Renderns ist ein Lint-/Compiler-Fehler (`react-hooks/refs`, `pnpm lint`); ohne Abhängigkeitsliste
  // läuft dieser Effekt nach JEDEM Commit, lange bevor der `setTimeout` unten fällig wird.
  useEffect(() => {
    aufCommitRef.current = aufCommit
  })

  // Zuletzt GEPLANTER, noch nicht committeter Entwurf — `null`, solange kein Timer aussteht.
  // Gelesen ausschließlich vom Unmount-Flush-Effekt unten, geschrieben vom Debounce-Effekt.
  const ausstehendRef = useRef<{ entwurf: T } | null>(null)

  if (wert !== vorherigerWert) {
    setVorherigerWert(wert)
    setEntwurf(wert)
  }

  useEffect(() => {
    if (entwurf === wert) {
      ausstehendRef.current = null
      return
    }
    ausstehendRef.current = { entwurf }
    const timer = setTimeout(() => {
      // Ein Blur-Commit (`sofortSchreiben`) kann den Entwurf bereits geschrieben haben.
      if (ausstehendRef.current === null) return
      ausstehendRef.current = null
      aufCommitRef.current(entwurf)
    }, verzoegerungMs)
    return () => clearTimeout(timer)
  }, [entwurf, wert, verzoegerungMs])

  useEffect(() => {
    return () => {
      const ausstehend = ausstehendRef.current
      if (ausstehend !== null) {
        ausstehendRef.current = null
        aufCommitRef.current(ausstehend.entwurf)
      }
    }
    // Bewusst leere Abhängigkeitsliste: dieser Effekt soll NUR beim Aus-Hängen DIESER
    // Hook-Instanz aufräumen (der Flush-Fall), nicht bei jeder `entwurf`/`wert`-Änderung
    // zwischendurch — die läuft bereits über den ERSTEN Effekt. `ausstehendRef`/`aufCommitRef`
    // sind Refs (stabile Identität), kein Zustand, der hier fehlen könnte.
  }, [])

  const sofortSchreiben = useCallback((): void => {
    const ausstehend = ausstehendRef.current
    if (ausstehend !== null) {
      ausstehendRef.current = null
      aufCommitRef.current(ausstehend.entwurf)
    }
  }, [])

  return [entwurf, setEntwurf, sofortSchreiben] as const
}
