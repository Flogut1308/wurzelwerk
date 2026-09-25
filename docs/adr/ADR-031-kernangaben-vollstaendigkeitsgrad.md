## ADR-031 — Kernangaben und Vollständigkeitsgrad einer Person

**Status:** entschieden (Eigentümer, 24.09.2026: Nenner E7, `80_Offene_Fragen.md` §31
U-1.34-E7; Einzelregeln D1–D11 nach Autonomie des Eigentümers, 25.09.2026, U-1.34-D1…D11)

**Kontext:** Die Bearbeitungsansicht zeigt in der rechten Spalte „68 % der Kernangaben belegt"
(Entwicklungsvorgaben Person bearbeiten & Medien §3.1: „Anteil Kernfakten (Name, Geschlecht,
Geburtsdatum, Geburtsort, ggf. Todesdatum/-ort, Eltern) mit ≥1 Citation"); §4.1 sieht dafür
„Prozent + Aufschlüsselung" vor. AP-1.34 verlangt, diese Zahl **einmal** festzulegen: eine Zahl,
die Profil, Personenliste, Statistik und später der Export je selbst ausrechnen, driftet
auseinander, und eine Vollständigkeit, die niemand nachprüfen kann, ist Unsicherheits-Sprache ohne
Grundlage. Der Eigentümer hat den Nenner entschieden (E7): Name belegt über die Hauptform,
Geschlecht nur vorhanden, Geburtsdatum/-ort, Todesdatum/-ort nur bei `verstorben`, Vater und
Mutter getrennt, Platzhalter ausgenommen, abrunden.

**Entscheidung:**

1. **Begriffe.** „Erfüllt" heißt **belegt** (mindestens ein `aussage_zitat`), einzige Ausnahme das
   Geschlecht (nur vorhanden, E7). Eine Aussage „hat einen Wert", wenn `wert_text`, `wert_zahl`,
   `wert_ref_id` oder `datum_wert1` nicht NULL ist.
2. **Kernangaben** (Reihenfolge = Reihenfolge in `fehlend`):

   | Id | Quelle | anwendbar | erfüllt, wenn |
   |---|---|---|---|
   | `name` | Hauptform (`name_form.ist_bevorzugt = 1`) | immer | eine Aussage `subjekt_typ = 'name'` über die Hauptform (beliebiges Prädikat) hat ≥ 1 Beleg |
   | `geschlecht` | `person.geschlecht` | immer | M, F oder X (nicht U, nicht NULL) |
   | `geburtsdatum` | Aussagen `geburtsdatum` | immer | eine Aussage mit Wert und ≥ 1 Beleg |
   | `geburtsort` | Aussagen `geburtsort` | immer | wie `geburtsdatum` (auch nur `wert_text`); kein Ereignis-Rückfall |
   | `todesdatum` | Aussagen `todesdatum` | nur `lebend_status = 'verstorben'` | wie `geburtsdatum` |
   | `todesort` | Aussagen `todesort`, Tod-Ereignis (E5) | nur `verstorben` | gibt es eine `todesort`-Aussage mit Wert, entscheidet allein sie (belegt ⇒ erfüllt); sonst ein Tod-Ereignis (Rolle `verstorbener`) mit `ort_id`, dessen Existenz-Aussage einen Beleg mit `feld` NULL oder `ort` hat |
   | `vater`, `mutter` | `elternPlaetze` (U-1.34-C2-O2) | immer, zwei Angaben | Platz besetzt UND eine Kante zu diesem Elternteil hat an einer ihrer Aussagen einen Beleg; bei Doppelkanten genügt eine |
   | `elternteil` | `elternPlaetze.unbestimmt` | statt `vater`/`mutter` | der unbestimmbar zugeordnete Elternteil ist eine Angabe (erfüllt, wenn belegt), der leere Platz die zweite (nie erfüllt) |

3. **Formel.** Nenner 6, bei `verstorben` 8. `prozent = Math.floor(erfuellt * 100 / anwendbar)`.
   `fehlend` ist eine Multimenge in fester Reihenfolge mit `fehlend.length = anwendbar − erfuellt`.
   Überzählige Eltern (mehr als zwei Plätze) zählen nicht.
4. **Platzhalter** (A-17): kein Ergebnis (`null`), nicht 0 %; es wird nichts nachgeladen.
5. **Einzige Stelle** der Berechnung ist `kernangabenAuswerten`
   (`src/core/person/kernangaben.ts`, rein). `abfrage:person.detail` liefert das Ergebnis als
   `kernangaben` (`erfuellt`, `anwendbar`, `prozent`, `fehlend`); ohne Text, der Renderer übersetzt
   die Ids.

**Konsequenzen:**
- Renderer, Personenliste, Statistik und Export rechnen den Vollständigkeitsgrad **nie** selbst;
  sie lesen ihn aus dem Kern bzw. aus `person.detail`. Braucht die Liste ihn später für viele
  Personen, bekommt sie eine Sammelabfrage, die dieselbe Kernfunktion speist, keine zweite Formel.
- Nichts wird gespeichert (keine Spalte, keine abgeleitete Tabelle): die Zahl entsteht beim Lesen
  aus Aussagen und Belegen und kann darum nicht veralten.
- Eine Änderung an Tabelle oder Formel geht nur über einen Nachtrag zu diesem ADR.
- Kosten: eine zusätzliche Anweisung je `person.detail` (ein Durchlauf über `aussage`, kein Index
  auf `aussage(subjekt_typ, subjekt_id)`, §31 U-1.34-C2b-aussage-index). Gemessen bei 2000 Personen:
  Median ≈ 2,0 ms statt ≈ 1,5 ms, Budget 50 ms.
- Bekannte Lücken (je ein Folgepunkt in §31): der Import schreibt keine Aussage über Namen, darum
  erreichen importierte Personen `name` nie (U-1.34-D-import-name-unbelegt); Ereignisse aus der
  Oberfläche schreiben keine Datums-Aussagen, ein Datum nur am Ereignis gilt als fehlend
  (U-1.34-D-ereignis-ohne-aussage).

**Verworfen:**
- **Spalte in `person_flach`** (oder eigene abgeleitete Tabelle): hielte die Zahl zwar für die
  Liste bereit, bräuchte aber eine Migration und Trigger auf `aussage_zitat`, `name_form`,
  `elternschaft`, `beteiligung` und `ereignis` — viel Schreibpfad für eine Anzeigezahl, und jede
  Regeländerung wäre eine Migration.
- **Geschlecht nur mit Beleg:** widerspricht E7 („nur vorhanden").
- **Todesangaben auch bei `vermutet_verstorben`:** „vermutet" ist keine Feststellung; eine Person
  ohne erfassten oder mit vermutetem Tod würde sonst dauerhaft für Angaben bestraft, die es
  vielleicht nicht gibt. Gespeicherte Todesaussagen ändern den Nenner dort nicht.
- **„Die bevorzugte Aussage muss belegt sein":** wäre strenger, weicht aber von der Belegzahl je
  Feld (AP-1.7: Summe über alle Aussagen eines Prädikats) ab; eine belegte Nebenaussage ist ein
  Beleg für die Angabe, ein Widerspruch wird über die offenen Punkte gemeldet, nicht über die
  Vollständigkeit.
