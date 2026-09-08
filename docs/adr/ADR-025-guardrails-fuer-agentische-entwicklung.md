## ADR-025 — Guardrails für agentische Entwicklung

**Status:** entschieden (06.09.2026, E48)

**Kontext:** Wurzelwerk wird vollständig agentisch in Loops entwickelt (klare Ziele, Tests/Prüfungen, die durchlaufen werden). Anfängerfreundlichkeit ist kein Kriterium mehr — das ersetzt die entsprechende Begründung in ADR-001 §3 und das Anfänger-Framing in ADR-009. Damit verschiebt sich das Hauptrisiko von der Stack-Wahl zur **Qualität der Feedback-Schleife**: Ein Agent repariert und optimiert nur, was im Feedback der Loop sichtbar und geprüft ist.

**Entscheidung — vier Guardrails, alle als CI-Gate, nicht als Vorsatz:**

1. **Reward-Hacking-Schutz** (der wichtigste). Die Loop darf einen Test nicht dadurch grün machen, dass sie die Prüfung aufweicht.
   - Invarianten (`test/invarianten/`), Golden-Baselines (`test/golden/`), Schemazusicherungen und die Migrations-Prüfsummen liegen in einem **geschützten Pfad**; Änderungen dort laufen über ein separates Gate (zweiter, adversarialer Agent oder Mensch), nie in derselben Iteration wie der geprüfte Produktivcode.
   - Bugfix-Loops folgen der eisernen Regel (ADR-009 §8): erst ein neuer, roter Test/eine Fixture, dann der Fix. Teständerungen sind additiv, nie abschwächend.
   - **Mutation-Testing** als periodisches Gate — verhindert leere Tests, die nichts fangen. Eine Invariante, die keine eingebaute Mutation fängt, ist kein Test.

2. **Gestufte Feedback-Geschwindigkeit.** Schnelle, hermetische Gates jede Iteration (Typen, `fast-check`-Invarianten, Schema, `keine-literale`); langsame Gates (`test:e2e` Playwright/Electron, `test:budget`) als Torwächter vor dem Merge, nicht pro Iteration. Kurze Iterationszeit ohne Deckungsverlust.

3. **Windows im Feedback der Loop.** Ein Agent ist blind für alles außerhalb seiner Prüfungen. Der Windows-CI-Lauf und die Screenshots der Hauptansichten (ADR-012) sind ein **Gate mit Baseline-Diff**, kein bloßes Artefakt. Sonst sammelt sich der Windows-Rückstand (DPI, Schriftmetrik, Dialoge) unbemerkt bis Phase 2 an.

4. **Doku↔Code-Drift als Gate.** Die Konzeptdokumente (40/50/55/56) sind die Wahrheit, aus der die Loop arbeitet. Abgleiche werden automatisiert (Muster aus AP-1.3: JSON-Schema ≡ Zod): DB-Schema gegen `50_Datenmodell.md`, Anforderungs-IDs gegen zugehörige Tests. Driftet die Doku, bricht das Gate.

**Konsequenzen:**
- **Determinismus ist Pflicht, nicht Kür** (schon ADR-005/ADR-023: kein `Math.random`/`Date.now` in `core`, deterministisches Layout). Eine nichtdeterministisch rote Prüfung ist für eine Loop unbrauchbar — der Agent „optimiert sie weg".
- Eine zweite, **adversariale Loop-Rolle** („prüfen statt bauen") ist vorgesehen: darf den geschützten Pfad lesen und Teständerungen freigeben, aber keinen Produktivcode schreiben.
- **Werkzeug-Neubewertung** (nicht bindend, aus dem Scope-Review): **Kysely** (typsicherer Query-Builder, verdeckt das SQL nicht, kollidiert nicht mit den Triggern) gewinnt als zusätzliches Compile-Zeit-Gate an Attraktivität; **TanStack Query** verliert an Begründung (Menschen-DX zählt agentisch weniger). Kein Wechselzwang — als Beobachtungspunkt geführt.

### Nachtrag (AP-0.7): `test/schema` ist kein Reward-Hacking-Risiko bei einer begleitenden Migration

**Beobachtung beim Bau von AP-0.7:** Eine neue Migration (`docs/schema/00NN_*.sql`) zieht in
`test/schema/` zwangsläufig additive Änderungen nach sich — neue Tabellen/Spalten in
`ERWARTETES_SCHEMA` (`vollstaendigkeit.test.ts`), neue Einträge in
`ERLAUBTE_INTEGER_PK_AUSNAHMEN` (`schluessel-typen.test.ts`) und Ähnliches. Der ursprüngliche
Guard aus §1 hätte das mit "geschützter Pfad + Produktivcode im selben Vergleich" blockiert, obwohl
hier kein Reward-Hacking-Risiko besteht: `test/schema` ist kein unabhängiges Prüfmaterial wie
`test/invarianten`/`test/golden`, sondern ein **maschinell nachvollziehbarer Spiegel** der
Migrationsdatei selbst — jede Zeile darin lässt sich Wort für Wort gegen das `CREATE TABLE` in der
begleitenden `.sql`-Datei nachprüfen (der Vergleich ist reines Review-Handwerk, kein Ermessen). Eine
Loop, die eine Prüfung "aufweicht", würde hier auffallen, weil die Migrationsdatei selbst öffentlich
im selben Diff steht.

**Entscheidung:** `skripte/pruefpfad-pruefen.ts` nimmt `test/schema/` aus der Sperre heraus, wenn
derselbe Vergleich mindestens eine neue/geänderte Datei unter `docs/schema/00NN_*.sql` enthält.
`test/invarianten/` und `test/golden/` bleiben davon **unberührt und ausnahmslos gesperrt** — sie
prüfen Fachverhalten (Bitgleichheit, Layout-Koordinaten), das sich nicht mechanisch gegen eine
einzelne begleitende Datei nachvollziehen lässt. Fehlt die begleitende Migrationsdatei im Vergleich,
gilt die ursprüngliche Sperre für `test/schema` unverändert weiter.
