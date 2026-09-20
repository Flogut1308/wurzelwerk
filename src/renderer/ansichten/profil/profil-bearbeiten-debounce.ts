// AP-1.14a: „kein Speichern-Knopf — Notiz/Textfelder committen bei Blur/Debounce" (Auftrag §
// Umfang). Ein React-Hook, darum bewusst NICHT in `profil-bearbeiten-logik.ts` (das Modul bleibt
// React-/DOM-frei, analog `filterleiste-logik.ts`) — wie `befehl-hooks.ts` selbst hängt dieser
// Code an React-Hook-Regeln und braucht eine echte Render-Umgebung, ist darum bewusst NICHT über
// Vitest getestet (Modul-Kommentar `befehl-hooks.ts`), nur über `pnpm typen`/`pnpm lint`.
import { useEffect, useState } from 'react'

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
 */
export function useEntwurfMitVerzoegertemCommit<T>(
  wert: T,
  aufCommit: (wert: T) => void,
  verzoegerungMs = 600,
): readonly [T, (wert: T) => void] {
  const [entwurf, setEntwurf] = useState(wert)
  const [vorherigerWert, setVorherigerWert] = useState(wert)

  if (wert !== vorherigerWert) {
    setVorherigerWert(wert)
    setEntwurf(wert)
  }

  useEffect(() => {
    if (entwurf === wert) return
    const timer = setTimeout(() => aufCommit(entwurf), verzoegerungMs)
    return () => clearTimeout(timer)
  }, [entwurf, wert, verzoegerungMs, aufCommit])

  return [entwurf, setEntwurf] as const
}
