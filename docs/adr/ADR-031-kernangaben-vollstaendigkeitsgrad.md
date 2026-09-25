## ADR-031 — Kernangaben und Vollständigkeitsgrad einer Person

**Status:** entschieden (Eigentümer, 24.09.2026: Nenner E7, `80_Offene_Fragen.md` §31
U-1.34-E7; Einzelregeln D1–D11 nach Autonomie des Eigentümers, 25.09.2026, U-1.34-D1…D11;
D1 und D9 geändert, D3 bestätigt durch den Eigentümer am 25.09.2026 — siehe Nachtrag unten)

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
   Geschlecht (nur vorhanden, E7). Eine Datums-Aussage „hat einen Wert", wenn `wert_text`,
   `wert_zahl`, `wert_ref_id` oder `datum_wert1` nicht NULL ist. Eine Orts-Aussage (`geburtsort`,
   `todesort`) „trägt einen Ort" genau dann, wenn `wert_ref_id` oder `wert_text` nicht NULL ist
   (`traegtOrt`, `src/core/person/ort-wert.ts`) — dieselbe Wahrheit wie `sterbeortAufloesen`; eine
   Orts-Aussage nur mit `wert_zahl` trägt keinen Ort (hueter #123, H1).
2. **Kernangaben** (Reihenfolge = Reihenfolge in `fehlend`):

   | Id | Quelle | anwendbar | erfüllt, wenn |
   |---|---|---|---|
   | `name` | Hauptform (`name_form.ist_bevorzugt = 1`) | immer | eine Aussage `subjekt_typ = 'name'` über die Hauptform (beliebiges Prädikat) hat ≥ 1 Beleg |
   | `geschlecht` | `person.geschlecht` | immer | M, F oder X (nicht U, nicht NULL) |
   | `geburtsdatum` | Aussagen `geburtsdatum` | immer | eine Aussage mit Wert und ≥ 1 Beleg |
   | `geburtsort` | Aussagen `geburtsort` | immer | eine Aussage, die einen Ort trägt, mit ≥ 1 Beleg (auch nur `wert_text`); kein Ereignis-Rückfall |
   | `todesdatum` | Aussagen `todesdatum` | nur `lebend_status = 'verstorben'` | wie `geburtsdatum` |
   | `todesort` | Aussagen `todesort`, Tod-Ereignis (E5) | nur `verstorben` | gibt es eine `todesort`-Aussage, die einen Ort trägt, entscheidet allein sie (belegt ⇒ erfüllt); sonst ein Tod-Ereignis (Rolle `verstorbener`) mit `ort_id`, dessen Existenz-Aussage einen Beleg mit `feld` NULL oder `ort` hat |
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
- **Nicht monoton beim Hinzufügen:** ein zusätzlicher Beleg senkt `erfuellt` nie, eine zusätzliche
  Aussage aber schon — eine neue unbelegte `todesort`-Aussage verdrängt einen belegten Ereignisort
  (E5, D6), der Grad sinkt. Das ist gewollt (die Aussage führt) und muss im Text von AP-1.30
  verständlich sein, etwa über die Aufschlüsselung „Sterbeort: Angabe ohne Beleg".
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

### Nachtrag (Vorarbeiten AP-1.30, 25.09.2026): Name nach Vorhandensein, Ereignis-Rückfall für Geburt und Tod

**Anlass:** Eigentümer-Entscheidungen vom 25.09.2026 (`80_Offene_Fragen.md` §31 U-1.34-D1/D3/D9,
Einzelheiten §32): **D1 geändert** — der Name zählt als Kernangabe, sobald er vorhanden ist (wie
das Geschlecht), alle anderen weiter nur mit Beleg; **D3 bleibt** — als „belegt" angezeigt wird
der Name nur bei einem Beleg an der Hauptform; **D9 geändert** — fehlt die Aussage, ist ein
Geburts- bzw. Todesereignis Rückfall für Datum und Ort, auch ohne Beleg (bewusste Ausnahme zu D1).
Kernangaben, Sterbeort und offene Punkte nutzen dafür dasselbe Prädikat.

**Geänderte Zeilen der Tabelle (Entscheidung 2):**

| Id | erfüllt, wenn (neu) |
|---|---|
| `name` | die Hauptform hat einen nicht-leeren Anzeigetext (dieselbe Textregel wie `anzeigenameFuer`); ein Beleg ist nicht nötig (§32 V-D1-name-vorhanden) |
| `geburtsdatum`, `todesdatum` | **Aussage führt:** gibt es eine Aussage mit Wert, entscheidet allein sie (≥ 1 belegt ⇒ erfüllt). **Sonst Ereignis:** ein passendes Ereignis mit Datum (`datum_wert1` oder `datum_originaltext`), auch ohne Beleg |
| `geburtsort`, `todesort` | **Aussage führt:** gibt es eine Aussage, die einen Ort trägt (`traegtOrt`), entscheidet allein sie (≥ 1 belegt ⇒ erfüllt). **Sonst Ereignis:** ein passendes Ereignis mit `ort_id`, auch ohne Beleg |

„Passendes Ereignis" (§32 V-D9-rollen): Geburt = `typ = 'geburt'` mit der Person in Rolle
`hauptperson` oder `kind`; Tod = `typ = 'tod'` mit der Person in Rolle `verstorbener` oder
`hauptperson` (die Oberfläche legt jedes Ereignis mit der Profilperson als `hauptperson` an; das
ersetzt U-1.34-C2a-rolle-hauptperson). Taufe und Beerdigung sind kein Ersatz. Datum und Ort werden
**je Angabe getrennt** aufgelöst: das Datum kann aus einer Aussage, der Ort aus dem Ereignis kommen.

**Eine Auflösung für alle Leser:** Die Regel „Aussage führt, sonst Ereignis" steht einmal im Kern
(`src/core/person/lebensdaten.ts`) und speist `kernangabenAuswerten`, `sterbeortAufloesen` und
damit die offene-Punkte-Regel `sterbeort_fehlt`. Es gilt: `todesort` ist erfüllt ⇔ ein Sterbeort
ist aufgelöst UND (er stammt aus dem Ereignis ODER eine `todesort`-Aussage mit Ort ist belegt).

**Aufschlüsselung (D3, Vorgaben §4.1):** Das Ergebnis trägt zusätzlich
`aufschluesselung: {id, zustand}[]` in der Reihenfolge der anwendbaren Angaben, `zustand` ∈
- `belegt` — erfüllt und belegt (Aussage mit Beleg; Name mit Beleg an der Hauptform; Eltern-Kante
  mit Beleg; Ereignis-Rückfall, dessen Existenz-Aussage einen Beleg mit `feld` NULL oder dem
  passenden Feld `datum`/`ort` trägt),
- `vorhanden` — erfüllt ohne Beleg (Geschlecht; Name ohne Beleg an der Hauptform; Ereignis-Rückfall
  ohne Beleg),
- `unbelegt` — eine Angabe liegt vor, zählt aber nicht (Aussage ohne Beleg; besetzter Elternplatz
  mit unbelegter Kante),
- `fehlt` — nichts erfasst.

Randfälle (§32 V-D3-randfaelle, verbindlich): Geschlecht `U`/nicht erfasst und eine Hauptform ohne
Text sind `fehlt`, auch mit Beleg; `unbelegt` heißt nur „ein Wert liegt vor, ihm fehlt der Beleg".
`fehlend` sind genau die Ids mit `unbelegt` oder `fehlt`, in derselben Reihenfolge;
`erfuellt` = Anzahl `belegt` + `vorhanden`. Nenner, Formel und Platzhalter-Regel bleiben.

**Konsequenzen:**
- Importierte Personen erreichen `name` (U-1.34-D-import-name-unbelegt erledigt); ein Ereignis aus
  der Oberfläche zählt für Datum und Ort (U-1.34-D-ereignis-ohne-aussage erledigt).
- Nicht monoton beim Hinzufügen gilt jetzt auch für Datum und Geburtsort: eine neue unbelegte
  Aussage verdrängt ein Ereignis und senkt den Grad. Die Aufschlüsselung macht das sichtbar
  (`unbelegt`), der Text dazu entsteht in AP-1.30.
- „68 % der Kernangaben belegt" stimmt noch weniger wörtlich (U-1.34-D-design-text): Geschlecht,
  Name und Ereignis-Rückfälle zählen ohne Beleg. Der Text wird in AP-1.30 angepasst.
- Die Grunddaten-Anzeige zeigt weiter nur Aussagen; ein Datum nur am Ereignis erscheint dort nicht,
  obwohl es zählt. Das aufgelöste Feld (Datum/Ort mit Herkunft, wie `sterbeort`) baut AP-1.30 über
  dieselbe Kernfunktion (§32 V-D9-anzeige).

**Verworfen:** „Fehlt eine *belegte* Aussage, springt das Ereignis ein" (monoton, aber weicht von
der Sterbeort-Auswahl ab, bei der die Aussage führt — dann zeigte das Profil einen anderen Ort, als
der Grad zählt); Taufe/Beerdigung als Ersatz für Geburt/Tod (Taufdatum ist nicht Geburtsdatum); ein
einzelnes Flag `name_belegt` statt der Aufschlüsselung (deckte nur den Namen ab, die Oberfläche
müsste die übrigen Zustände nachrechnen).
