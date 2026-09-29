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
import { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AUTOSAVE_DEBOUNCE_MS } from '../../../shared/autosave'
import { NachladenKontext, wartetAufRuecknahme } from '../../brücke/nachladen-stand'

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
 * ersetzt den Entwurf sofort — mit EINER Ausnahme (U-130-fix-ablauf07-nachladen, docs/80 §33):
 * das Echo des eigenen Schreibens. Nach `aufCommit` lädt der Renderer den gespeicherten Stand
 * asynchron nach; ein Anschlag, der in dieses Fenster fällt, ist NEUER als das Echo. Früher legte
 * der Sync-Zweig das Echo darüber, der Timer fand danach `entwurf === wert` und schrieb nichts —
 * der Anschlag war still verloren (`test/einheit/autosave-nachladen-entwurf.test.tsx`,
 * `test/e2e/ablauf-12-nachladen-entwurf.spec.ts`). `bekannt` hält darum den Stand, den der Hook
 * zuletzt vom Speicher kennt: den zuletzt übernommenen `wert` oder den zuletzt gesendeten Entwurf.
 * Ein neuer `wert` wird übernommen, WENN kein ungesendeter Entwurf aussteht (`entwurf === bekannt`)
 * ODER er sich inhaltlich von `bekannt` unterscheidet (fremde Änderung: Undo, anderes Fenster).
 * Nur ein inhaltsgleiches Echo über einem ungesendeten Entwurf wird verworfen; der Entwurf wird
 * danach regulär geschrieben. Der Inhaltsvergleich ist strukturell (`strukturGleich`), weil ein
 * Objekt-`wert` beim Nachladen in neuer Referenz ankommt. Ein normalisiertes Echo (der Speicher gibt
 * anders zurück, als gesendet wurde) gilt als fremd und wird übernommen — dort bleibt das alte
 * Verhalten.
 *
 * **Undo, während ein ungesendeter Entwurf aussteht: Undo gewinnt** (der ungesendete Anschlag wird
 * verworfen). Das Menü-Undo läuft im Hauptprozess und kennt den Entwurf nicht; behielte der Hook
 * den Entwurf, schriebe der Timer ihn Sekundenbruchteile später zurück — das Undo wirkte scheinbar
 * gar nicht und leerte obendrein den Redo-Stapel. Gegenposition: der ungesendete Anschlag ist
 * ebenfalls Nutzereingabe und geht verloren. Das nehmen wir in Kauf: er liegt höchstens
 * `verzoegerungMs` zurück, verschwindet sichtbar mit dem Undo (nicht still), und „Rückgängig nimmt
 * das Tippen zurück" ist genau die Erwartung an Undo.
 *
 * **Undo, bevor das Echo des eigenen Schreibens ankommt (U-130-nachladen-undo-vor-echo, docs/80 §33):**
 * dann liefert der Speicher wieder den Stand von vor dem Schreiben — denselben, den der Cache noch
 * hält; `wert` ändert sich nicht, und der Vergleich oben sähe nichts (Feld zeigt den geschriebenen
 * Entwurf, gespeichert ist der alte Stand; ein ausstehender Entwurf überschriebe das Undo). Darum
 * hört der Hook zusätzlich auf den Nachladen-Stand (`NachladenKontext`, `brücke/nachladen-stand.ts`):
 * Solange eine Rücknahme (Undo/Redo) gemeldet, ihr Stand aber noch nicht im Cache ist, schreibt der
 * Hook NICHT (weder Timer noch Verlassen des Felds; der Entwurf bleibt ausstehend). Ist der Cache
 * danach frisch, wird `wert` gegen `bekannt` geprüft wie bei einem neuen `wert` — auch wenn er sich
 * nicht geändert hat: weicht er vom zuletzt Gesendeten ab, war es eine Rücknahme DIESES Felds und
 * sie wird übernommen (Undo gewinnt, wie oben); gleicht er ihm, nahm das Undo etwas anderes zurück,
 * und der ausstehende Entwurf wird danach regulär geschrieben. Gegenposition: der Hook könnte beim
 * Undo sofort auf den Cache zurückfallen, ohne auf das Nachladen zu warten — einfacher, aber er
 * verwürfe dann auch Entwürfe, deren Feld das Undo gar nicht betraf. Nicht abgedeckt: der
 * Unmount-Flush unten schreibt einen ausstehenden Entwurf auch während des Wartens (sonst ginge er
 * beim Aus-Hängen still verloren).
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
 *
 * **Sofort schreibende Auswahl (U-130-nachladen-sofortaendern, docs/80 §33):** der vierte Rückgabewert
 * `sofortSetzen(naechster)` gehört an Felder ohne Tippgeschwindigkeit (Auswahlfeld, Konfidenzwähler):
 * er setzt den Entwurf, schreibt ihn sofort und zieht `bekannt` nach — wie Tippen plus
 * `sofortSchreiben` in einem Schritt. Früher riefen die Aufrufer `setEntwurf` und ihren Befehl
 * direkt auf, am Hook vorbei: `bekannt` blieb auf dem alten Stand, der Timer hielt den Entwurf für
 * ungeschrieben und schrieb ihn nach der Frist ein zweites Mal, und ein Anschlag in einem Textfeld
 * derselben Zeile vor dem Echo ging verloren (das Echo sah fremd aus;
 * `test/einheit/autosave-auswahl-sofort.test.tsx`, `test/e2e/ablauf-14-auswahl-vor-echo.spec.ts`).
 * Während eine Rücknahme nachlädt, schreibt auch `sofortSetzen` nicht; die Auswahl bleibt als
 * ausstehender Entwurf stehen und folgt danach den Regeln oben. Gegenposition: die Auswahl könnte
 * ihren eigenen Schreibweg behalten und der Hook nur `bekannt` von außen gesetzt bekommen — das ließe
 * aber zwei Schreibwege nebeneinander stehen, und jeder neue Aufrufer müsste das Nachziehen wieder
 * selbst wissen; genau das war der Fehler.
 */
export function useEntwurfMitVerzoegertemCommit<T>(
  wert: T,
  aufCommit: (wert: T) => void,
  verzoegerungMs: number = AUTOSAVE_DEBOUNCE_MS,
): readonly [T, (wert: T) => void, () => void, (wert: T) => void] {
  const [entwurf, setEntwurf] = useState(wert)
  const [vorherigerWert, setVorherigerWert] = useState(wert)
  // Zuletzt vom Speicher bekannter Stand: übernommener `wert` oder gesendeter Entwurf (s. oben).
  const [bekannt, setBekannt] = useState(wert)

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

  // Rücknahmen (Undo/Redo) und ob ihr Stand schon im Cache ist (s. Kopfkommentar).
  const nachladen = useContext(NachladenKontext)
  // Dritter Parameter: `renderToStaticMarkup` (Einheitstests der Abschnitte) verlangt einen Server-Schnappschuss.
  const stand = useSyncExternalStore(nachladen.abonnieren, nachladen.lesen, nachladen.lesen)
  const wartet = wartetAufRuecknahme(stand)
  const [verarbeitetNr, setVerarbeitetNr] = useState(stand.geladenNr)

  const wertNeu = wert !== vorherigerWert
  const nachRuecknahmeGeladen = !wartet && stand.geladenNr !== verarbeitetNr
  if (wertNeu || nachRuecknahmeGeladen) {
    if (wertNeu) setVorherigerWert(wert)
    if (nachRuecknahmeGeladen) setVerarbeitetNr(stand.geladenNr)
    // Verworfen wird nur ein Stand, der dem zuletzt Gesendeten gleicht, während ein ungesendeter
    // Entwurf aussteht (das Echo des eigenen Schreibens); alles andere ist fremd und wird übernommen.
    const echoUeberUngesendetem = entwurf !== bekannt && strukturGleich(wert, bekannt)
    if (!echoUeberUngesendetem) {
      setEntwurf(wert)
      setBekannt(wert)
    }
  }

  useEffect(() => {
    // Ausstehend ist nur ein Entwurf, der weder dem geladenen noch dem zuletzt gesendeten Stand gleicht.
    if (entwurf === wert || entwurf === bekannt) {
      ausstehendRef.current = null
      return
    }
    ausstehendRef.current = { entwurf }
    if (wartet) return
    const timer = setTimeout(() => {
      // Ein Blur-Commit (`sofortSchreiben`) kann den Entwurf bereits geschrieben haben.
      if (ausstehendRef.current === null) return
      // Eine Rücknahme kann gemeldet sein, bevor dieser Hook neu gerendert hat — dann nicht schreiben;
      // der Effekt läuft nach dem Nachladen erneut (`wartet` wechselt).
      if (wartetAufRuecknahme(nachladen.lesen())) return
      ausstehendRef.current = null
      setBekannt(entwurf)
      aufCommitRef.current(entwurf)
    }, verzoegerungMs)
    return () => clearTimeout(timer)
  }, [entwurf, wert, bekannt, verzoegerungMs, wartet, nachladen])

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
    // Während eine Rücknahme nachlädt, bleibt der Entwurf ausstehend (s. Kopfkommentar).
    if (ausstehend !== null && !wartetAufRuecknahme(nachladen.lesen())) {
      ausstehendRef.current = null
      setBekannt(ausstehend.entwurf)
      aufCommitRef.current(ausstehend.entwurf)
    }
  }, [nachladen])

  const sofortSetzen = useCallback(
    (naechster: T): void => {
      setEntwurf(naechster)
      // Während eine Rücknahme nachlädt, bleibt auch die Auswahl ausstehend (wie `sofortSchreiben`).
      // Sofort als ausstehend merken, nicht erst im Effekt: hängt die Ansicht im selben Zug aus,
      // schriebe der Unmount-Flush sonst den älteren Entwurf oder nichts (hueter PR #175 H1).
      if (wartetAufRuecknahme(nachladen.lesen())) {
        ausstehendRef.current = { entwurf: naechster }
        return
      }
      ausstehendRef.current = null
      setBekannt(naechster)
      aufCommitRef.current(naechster)
    },
    [nachladen],
  )

  return [entwurf, setEntwurf, sofortSchreiben, sofortSetzen] as const
}

/**
 * Inhaltsgleichheit für Entwurfswerte (Primitive, Arrays, einfache Objekte — alle `…EntwurfWerte`
 * sind solche Datensätze). Nur für die Echo-Erkennung oben; im Zweifel `false`, dann wird der
 * nachgeladene Wert wie bisher übernommen.
 */
function strukturGleich(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const schluesselA = Object.keys(a)
  if (schluesselA.length !== Object.keys(b).length) return false
  return schluesselA.every((schluessel) => Object.hasOwn(b, schluessel) && strukturGleich(Reflect.get(a, schluessel), Reflect.get(b, schluessel)))
}
