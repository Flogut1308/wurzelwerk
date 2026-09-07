# Wurzelwerk — Design-Briefing

> **Dieses Dokument wird Claude Design als Kontext angehängt.** Es ist absichtlich
> selbsterklärend: Es setzt kein Wissen aus den übrigen Projektdokumenten voraus. Alles, was
> Claude Design für eine Entwurfsentscheidung braucht, steht hier oder in `71_Designsystem.md`
> und `72_Screens_und_Flows.md`.

**Stand:** 24.08.2026 (überarbeitet) · **Für:** Claude Design · **Zusammen anhängen mit:**
`71_Designsystem.md` und `72_Screens_und_Flows.md` — **nur diese drei Dateien, alle Markdown.**

> **Warum nur drei Markdown-Dateien:** Claude Design verarbeitet keine JSON-Dateien. Alle
> Beispieldaten, die für die Entwürfe gebraucht werden — Interviewmaterial, Trockenlauf-Bericht,
> Fehlermeldungen — stehen deshalb im **Anhang A** dieses Dokuments im Klartext. Es muss keine
> weitere Datei angehängt werden.

---

## 1. Der Steckbrief

| | |
|---|---|
| **Produkt** | Wurzelwerk — Desktop-Anwendung für Ahnenforschung. Windows und macOS, vollständig offline, kein Konto, keine Cloud. |
| **Nutzer** | Ein einzelner privater Forscher. Fortgeschritten in der Sache, kein Profi-Genealoge. Arbeitet abends eine bis zwei Stunden, nicht ganztägig. Deutschsprachig. |
| **Datenlage** | Der Bestand entsteht aus **Erinnerungen, Gesprächen mit Verwandten und privaten Papieren** — nicht aus Kirchenbüchern und nicht aus vorhandenen Dateien. Fast nichts ist gesichert. |
| **Zielgröße** | rund 2.000 Personen, Architektur bis 20.000 |
| **Fenstergröße für den Entwurf** | 1440 × 900. Mindestgröße 1024 × 700. |
| **Sprache in der Oberfläche** | Deutsch |
| **Themen** | hell **und** dunkel, gleichrangig entworfen |
| **Dichten** | komfortabel und kompakt |

**Das Kernversprechen des Produkts:** Jede Aussage geht nachvollziehbar auf eine Quelle zurück,
und der Zusammenhang zwischen hunderten Menschen ist tatsächlich zu sehen.

---

## 2. Die Aufgabe

Es gibt keine bestehende Gestaltung und kein Design-System. **Erarbeite die Designsprache** —
Farbpalette, Typografie, Formensprache, Symbolik — und wende sie auf die Bildschirme aus
`72_Screens_und_Flows.md` an.

Die Tokennamen, Komponentennamen und Bildschirmnummern sind **gesetzt** und dürfen nicht
umbenannt werden (`71_Designsystem.md` §0). Die Werte hinter den Tokennamen sind offen und
deine Entscheidung. Diese Trennung existiert, damit die Gestaltung mehrfach überarbeitet werden
kann, ohne dass im späteren Code eine Zeile angepasst werden muss.

---

## 3. Die Marktlücke, die die Gestaltung schließen soll

Es gibt zwei Sorten Ahnenforschungs-Software, und beide haben ein Problem:

- **Die fachlich präzisen** — Gramps, Family Historian, Legacy — sind sperrig, hässlich und haben eine hohe Einstiegshürde. Sie behandeln Genealogie ernst und ihre Nutzer nicht.
- **Die gut gestalteten** — MacFamilyTree, diverse Web-Tools — sind fachlich flach: schwaches Quellenmodell, keine Ortshistorie, keine Widerspruchsfähigkeit.

Wurzelwerk soll dazwischen liegen: **die fachliche Präzision der Forscherprogramme mit der
Gestaltungsqualität moderner Software.** Das ist der Auftrag an die Gestaltung, und er heißt
nicht „mach es hübsch", sondern: Mach die Präzision benutzbar, ohne sie zu verstecken.

---

## 4. Was dieses Produkt gestalterisch eigenständig macht

Es gibt genau eine Sache, die kein anderes Werkzeug und keine der Referenzen unten löst:

> **Eine visuelle Sprache für Unsicherheit.**

Weil die Daten aus Erinnerungen kommen, ist der Normalfall nicht „geboren am 14.03.1901",
sondern „so um 1890 rum, sagt Erna". Vier Dinge müssen konsistent über **alle** Ansichten hinweg
anders aussehen als gesicherte Fakten:

| Was | Fachlicher Hintergrund |
|---|---|
| **Unscharfe Datumsangaben** | „etwa 1890", „vor 1750", „zwischen 1750 und 1760" — mit dem Originalwortlaut als eigentlichem Beleg |
| **Konfidenzstufen** | vier Stufen: gesichert · wahrscheinlich · unsicher · Vermutung |
| **Widersprüche** | Zwei Quellen nennen unterschiedliche Werte. **Beide bleiben stehen.** Eine ist als bevorzugt markiert, mit einer Begründung im Klartext. |
| **Platzhalterpersonen** | „Vater unbekannt" — existiert als Knoten im Baum, hat keinen Namen, wird aus Statistiken und Exporten ausgeschlossen |

Und einer, der davon getrennt bleiben muss:

> **Konfidenz und Widerspruch sind zwei verschiedene Dinge und brauchen zwei verschiedene
> Zeichen.** Konfidenz ist eine Eigenschaft der einzelnen Aussage („wie sicher ist dieser
> Wert"). „Widersprüchlich" ist eine Eigenschaft der Menge („es gibt konkurrierende Angaben").
> Wer daraus eine fünfte Konfidenzstufe macht, zementiert einen fachlichen Fehler in der
> Oberfläche.

Dazu die typografische Entsprechung: **Originalzitate und Transkripte tragen eine andere
Schrift als die Oberfläche.** Der Nutzer muss auf einen Blick sehen, was in der Quelle steht und
was seine eigene Schlussfolgerung ist. Das ist keine Zierde — es ist das Leitprinzip des
Produkts in typografischer Form.

---

## 5. Gestaltungsrichtung

### 5.1 Was übernommen wird

Referenzrahmen des Auftraggebers: **Notion, Obsidian, Claude, Figma, Apple-Software.** Was diese
fünf teilen und was gilt:

- **Sehr wenig Chrom.** Keine schweren Werkzeugleisten, keine Rahmen um alles. Gliederung durch Weißraum und feine 1-px-Linien, nicht durch Kästen.
- **Inhalt dominiert, Werkzeuge treten zurück** bis zur Interaktion.
- **Ruhige, fast neutrale Grundpalette** mit *einem* Akzent. Farbe bedeutet etwas.
- **Typografie trägt die Hierarchie.** Kleine Schriftgradskala, klare Sprünge, viel Zeilenabstand — keine Rahmen und Schatten zur Gliederung.
- **Weiche, kleine Radien** (Richtwert 6–10 px), sehr zurückhaltende Schatten, ausschließlich zur Ebenentrennung bei Überlagerungen.
- **Tastaturzentrik.** Alles ist ohne Maus erreichbar.

### 5.2 Was ausdrücklich nicht übernommen wird

- **Notions Blockeditor-Paradigma.** Die Daten sind strukturiert, nicht dokumentartig. Ein „alles ist ein Block"-Modell würde die Präzision verschleiern, die das Datenmodell mühsam herstellt.
- **Figmas dichte Werkzeugleisten.** Das ist die Sprache eines Produktionswerkzeugs für ganztägige Arbeit. Für eine App, die man abends eine Stunde benutzt, zu kalt und zu voll.
- **Apples Grafitgrau-Fensterrahmen als Vorbild.** Plattformspezifisch; die Gestaltung soll auf Windows und macOS identisch sein.

### 5.3 Die konkrete Richtung

| Aspekt | Vorgabe |
|---|---|
| Grundton hell | warmes, sehr leicht getöntes Papierweiß — **nicht** reines Weiß |
| Grundton dunkel | neutrales Anthrazit — **nicht** reines Schwarz |
| **Akzent** | **gedecktes Petrol / Blaugrün, Anker etwa `#35726E`.** Gesetzt. Du bestimmst die Abstufungen und darfst den Farbwinkel um bis zu 15° verschieben, wenn die Palette dadurch besser zusammenhält — die Farbfamilie bleibt. |
| Warum Petrol | Er muss auf Papierweiß *und* auf Anthrazit funktionieren und darf nicht mit den Datenfarben kollidieren: die brauchen Rot, Orange, Gelb und Grün für die Konfidenzstufen. |
| Datenfarben | eigene, vom Akzent klar getrennte Paletten. Immer mit Legende, immer nur **eine** Ebene gleichzeitig aktiv. |
| Schrift | drei Familien: Oberfläche (humanistische Sans) · Originalzitate (abgesetzt, Serif oder ähnlich) · Technisches (IDs, Fehlercodes). Auswahlkriterien in §6. |
| Dichte | zwei Stufen. Die kompakte ist für Tabellen und den Interview-Modus, **nicht** „die App kleiner machen". |
| Bewegung | 120–200 ms, nur für fünf Fälle: Ein-/Ausklappen, Zoom, Zeitregler, Überlagerung, Seitenschublade. Sonst statisch. Nichts pulsiert, nichts hüpft. |
| Tonfall | sachlich, in Substantiven. „Person anlegen", nicht „Legen Sie eine Person an". Keine Ausrufezeichen, kein „Ups", keine Marketingsprache. |

---

## 6. Sperrliste — was ausdrücklich nicht entstehen soll

Wurzelwerk soll nicht aussehen wie ein KI-Startup-Dashboard von 2026. Die folgende Liste ist
keine Geschmacksfrage, sondern eine Abgrenzung.

### Schriften — gesperrt

Inter · Roboto · Open Sans · Lato · Montserrat · Poppins · Nunito · Nunito Sans · Manrope ·
Space Grotesk · DM Sans · Plus Jakarta Sans · Geist · Figtree · Outfit · Sora · Urbanist ·
Work Sans · Rubik · Karla · Mulish · Raleway · JetBrains Mono · Fira Code · Source Code Pro ·
Nachbauten von SF Pro oder Segoe UI.

**Kriterien für die Auswahl** — alle fünf sind hart:

1. **Lizenz erlaubt das Mitliefern in einer Desktop-Anwendung** (SIL Open Font License oder vergleichbar). Die App ist offline und darf keine Schriften nachladen.
2. **Kyrillisch vollständig** und polnische Diakritika vollständig (`ą ć ę ł ń ó ś ź ż`). Der Forschungsraum umfasst Deutschland, Polen, Russland, das Baltikum und Kanada; Original und Umschrift stehen nebeneinander (`Щербаков · Ščerbakov`). Eine Schrift ohne Kyrillisch macht die Hälfte des Bestands unlesbar.
3. **Ziffern gleicher Breite** verfügbar — Jahreszahlen stehen in Tabellenspalten.
4. **Echte Kursive**, keine mechanisch geneigte. Originalzitate werden kursiv gesetzt.
5. Mindestens die Stärken 400, 500, 600. Variable Schrift bevorzugt.

Humanistisch statt geometrisch. Etwas Eigencharakter ist erwünscht — eine Anwendung, die man
abends benutzt, darf einen Klang haben.

### Farbe — gesperrt

- Indigo-Violett `#6366F1` und die ganze KI-Produkt-Familie ringsherum
- Violett-nach-Blau- und Blau-nach-Cyan-Verläufe; überhaupt Verläufe als Flächenfarbe
- Tailwinds Standardpaletten Stufe für Stufe übernommen
- Neonakzente auf dunklem Grund
- reines `#FFFFFF` oder reines `#000000` als Grundfläche
- Rosa und Hellblau für Geschlecht
- Farbe als Dekoration. Außer dem Akzent bedeutet **jede** Farbe etwas, und was sie bedeutet, steht in einer Legende.

### Form und Effekt — gesperrt

Glasmorphismus und Weichzeichnung hinter Flächen · Neumorphismus · Radien über 12 px ·
Schatten zur Gliederung von Inhalt · Emoji als Oberflächensymbole · Illustrationen im flachen
Firmenstil · Rahmen um jeden Kasten · mehr als eine Akzentfarbe · Aufmerksamkeitsanimationen ·
abgerundete „Pill"-Schaltflächen als Standardform.

### Inhalt — gesperrt

**Keine Blindtexte.** Kein „Lorem ipsum", kein „John Doe", kein „Beispielstraße 1". Die echten
Beispieldaten stehen in §7 und in **Anhang A**. Der Grund ist nicht Ästhetik: Die Frage
ist, ob `Щербаков · Ščerbakov` in eine Tabellenzeile passt und ob
`zwischen 1750 und 1760, verstanden als etwa 1755` das Datumsfeld sprengt. Mit Blindtext ist
diese Frage nicht beantwortbar.

---

## 7. Die Beispieldaten

Jeder Entwurf benutzt diese Personen und Werte. Sie sind so gewählt, dass sie die schwierigen
Fälle enthalten.

**Karl Friedrich Gutnoff** · männlich · Rufname Karl · geboren 14.03.1901 in Marienwerder
(exakt, Konfidenz 4, Quelle: Familienstammbuch) · Schmied · verheiratet 09.05.1925 mit
**Emma Wruck** (Ehename Gutnoff ab 1925) · Kind: **Helene Martha Gutnoff**, geboren 03.02.1927.
→ Der einfache Fall. Ein vollständiger, gut belegter Datensatz.

**August Wruck** · männlich · geboren **etwa 1890** in Marienwerder, Originaltext
„so um 1890 rum, sagt Erna" · Konfidenz 2 · Schmied ·
**zwei konkurrierende Todesdaten:** 1961 laut Grabstein (Konfidenz 3, **bevorzugt**, Begründung
„der Grabstein ist die stärkere Quelle") und etwa 1958 laut Erna, Originaltext „der ist
gestorben, als ich in die Schule kam, das war 58 oder 59" (Konfidenz 2).
→ Der Widerspruchsfall. **Beide Werte bleiben stehen.**

**Vater von August** · **Platzhalterperson**, Grund „unbekannt", kein Name, Konfidenz 1,
Unsicherheit: „Erna weiß nur, dass Augusts Vater auch schon Schmied war. Kein Name."
→ Der Platzhalterfall.

**Walter Wruck** · Bergmann auf Zeche Zollverein · gestorben **etwa 1974**, Originaltext
„kurz nach meiner Hochzeit, das muss 74 gewesen sein" · **Diagnose 1:** „Staublunge",
Kategorie Atemwege, mit etwa 55, Konfidenz 2, Originalzitat „Der hatte die Staublunge, wie alle
da unten. Mit fünfundfünfzig ging nichts mehr." · **Diagnose 2:** „was mit dem Herzen",
Kategorie Herz-Kreislauf, Status Todesursache, Konfidenz 1 — **bewusst nicht als „Herzinfarkt"**
· **Risikofaktoren:** berufliche Exposition „Bergbau, Steinkohle, Zeche Zollverein", Intensität
hoch, Konfidenz 3 (aus dem Beruf erschlossen) und Rauchen, Intensität unbekannt, Konfidenz 2.
→ Der Gesundheitsfall. Die Laienbezeichnung ist der Wert und wird nicht in Fachsprache übersetzt.

**Erna Wruck** · weiblich · **lebend**, als `privat` gekennzeichnet · Informantin aller
mündlichen Quellen.
→ Der Datenschutzfall.

**Marienwerder / Kwidzyn** · Stadt · Name „Marienwerder" (deutsch) gültig bis 1945, Name
„Kwidzyn" (polnisch) gültig ab 1945, bevorzugt · politische Zugehörigkeit: Westpreußen bis 1945,
Polen ab 1945.
→ Der Ortsfall. Derselbe Punkt, zwei Namen, abhängig vom Datum.

**Щербаков · Ščerbakov** · ein Nachname in kyrillischem Original mit automatischer Umschrift
nach ISO 9 als **zusätzlichem** Namenseintrag. Suchnormalform `scerbakov`.
→ Der Schriftsystemfall. Beide müssen nebeneinander in eine Zeile passen.

**Unverarbeitete Notiz** (aus dem Interview-Modus): „Und dann war da noch der Bruder, der nach
Kanada gegangen ist, der Otto oder Ottokar, das weiß ich nicht mehr genau." Grund für
Nichtverarbeitung: „Zwei mögliche Vornamen, keine weiteren Angaben."
→ Der Fall, in dem die Software bewusst nichts anlegt.

---

## 8. Barrierefreiheit — die Schwellen

| Prüfpunkt | Schwelle |
|---|---|
| Text auf Fläche | 4,5:1 · große Grade 3:1 |
| Bedienelementrahmen gegen Umgebung | 3:1 |
| Fokusring gegen beide Nachbarflächen | 3:1 — **immer sichtbar, nie entfernt** |
| Datenfarben als Fläche | 3:1 |
| Trefferfläche | ≥ 32 × 32 px, in **beiden** Dichten |
| Bedeutung durch Farbe allein | verboten. Immer eine zweite Kodierung: Form, Muster, Symbol oder Beschriftung |
| Konfidenzpalette | muss auch in **Graustufen** als Reihenfolge lesbar sein — es gibt einen Druckpfad |
| Schriftvergrößerung | Layout hält bis 200 % ohne Funktionsverlust |
| Bewegung | `prefers-reduced-motion` schaltet alle Übergänge ab |

---

## 9. Abnahmeprüfliste

Der Entwurf ist fertig, wenn jede dieser Fragen mit einem Bildschirm beantwortet ist:

- [ ] Sieht ein **Vorschlag** im Interview-Modus zweifelsfrei anders aus als ein bestätigter Datensatz?
- [ ] Erkennt man auf einen Blick, was **Originalzitat** und was Interpretation ist?
- [ ] Sind **Konfidenz** und **Widerspruch** zwei unterscheidbare Zeichen und nicht eine Skala?
- [ ] Passt `Щербаков · Ščerbakov` in eine Tabellenzeile, ohne dass sie bricht?
- [ ] Sprengt `zwischen 1750 und 1760` das Datumsfeld?
- [ ] Ist ein **Platzhalter** ohne Text als solcher erkennbar?
- [ ] Hat dieselbe Personenkarte mit voller und mit lückenhafter Datenlage die **gleiche Höhe**?
- [ ] Funktioniert die Konfidenzpalette in **Graustufen**?
- [ ] Ist der **Fokusring** auf jeder Fläche sichtbar, auch auf der Akzentfläche?
- [ ] Hält das Layout bei **200 %** Schriftgröße und in kompakter Dichte?
- [ ] Ist jeder Bildschirm in **hell und dunkel** entworfen — nicht nur umgefärbt?
- [ ] Steht der **Exportsperrhinweis** überall, wo Gesundheitsdaten erscheinen?
- [ ] Gibt es irgendwo einen **Speichern-Knopf**? (Dann ist etwas falsch — die App speichert jede Änderung sofort.)
- [ ] Sind **Leer-, Lade- und Fehlerzustände** entworfen, nicht nur die schönen Fälle?
- [ ] Ist eine gesperrte Schrift, Farbe oder Form aus §6 verwendet worden?

---

## 10. Was Claude Design hier **nicht** entscheidet

Damit keine Reibung entsteht: Diese Dinge sind entschieden und stehen nicht zur Debatte.

| Festgelegt | Wo begründet |
|---|---|
| Tokennamen, Komponentennamen, Bildschirmnummern | `71_Designsystem.md` §0 |
| Akzentfarbfamilie (Petrol) | §5.3 |
| Vier Konfidenzstufen, „widersprüchlich" ist keine Stufe | Datenmodell |
| Kein Speichern-Knopf | Architektur |
| Getrennte Schrift für Originalzitate | Leitprinzip des Produkts |
| Nur **eine** Datenebene gleichzeitig aktiv | UX-Konzept §5 |
| Gesundheitsdaten sind aus jedem Export gesperrt | DSGVO Art. 9 |
| Profilseite ist eine Überlagerung, keine eigene Ansicht | UX-Konzept §2 |
| Einheitliche Kartengröße im Baum | UX-Konzept §4 |
| Windows und macOS sehen im Fenster identisch aus | ADR-013 |

Wenn dir eine dieser Festlegungen im Weg steht, **sag es** und begründe es — dann wird sie
geprüft. Umgehe sie nicht stillschweigend.

---

## Anhang A — Rohmaterial für die Entwürfe

Alles, was die Prompts aus `74_Prompts_Claude_Design.md` an konkreten Texten brauchen. Wörtlich
zu übernehmen, nicht zu erfinden und nicht zu glätten.

### A.1 Interview-Rohmaterial für S-14

**Sitzungskopf:** Informant Erna Wruck · 12.09.2026 · Form: Audio ·
Datei `2026-09-12-erna-wruck.m4a` · Umschalter auf **Selbsterlebtes** (Erna spricht über ihren
eigenen Vater) · Dauer 58 Minuten.

**Der getippte Text in der linken Spalte** (die Schreibmarke steht am Ende, mitten im Satz):

> Mein Vater, der Walter, der war Bergmann auf Zollverein. Der hatte die Staublunge, wie alle da
> unten. Mit fünfundfünfzig ging nichts mehr. Geraucht hat er auch, aber nicht so viel wie der
> Onkel Paul. Gestorben ist er kurz nach meiner Hochzeit, das muss 74 gewesen sein. Am Ende war
> es dann was mit dem Herzen, glaube ich.█

**Die Vorschlagskarten in der rechten Spalte**, je mit ihrem Originalwortlaut und ihrer Konfidenz:

| Art | Inhalt | Originalwortlaut | Konfidenz | Zeitmarke |
|---|---|---|---|---|
| Person | Walter Wruck, männlich, verstorben | „Mein Vater, der Walter" | 4 gesichert | 00:01:35 |
| Elternschaft | Walter Wruck → Erna Wruck, biologisch | „Mein Vater, der Walter" | 4 gesichert | 00:01:35 |
| Aussage | Beruf: Bergmann | „der war Bergmann auf Zollverein" | 4 gesichert | 00:01:35 |
| Risikofaktor | berufliche Exposition: Bergbau, Steinkohle, Zeche Zollverein · Intensität hoch | „der war Bergmann auf Zollverein" | 3 wahrscheinlich | 00:01:35 |
| Diagnose | Staublunge · Atemwege · mit etwa 55 · bestehend | „Der hatte die Staublunge, wie alle da unten. Mit fünfundfünfzig ging nichts mehr." | 2 unsicher | 00:10:10 |
| Risikofaktor | Rauchen · Intensität unbekannt | „Geraucht hat er auch, aber nicht so viel wie der Onkel Paul." | 2 unsicher | 00:10:18 |
| Ereignis | Tod, etwa 1974 | „kurz nach meiner Hochzeit, das muss 74 gewesen sein" | 3 wahrscheinlich | 00:10:40 |
| Diagnose | „was mit dem Herzen" · Herz-Kreislauf · Todesursache | „Am Ende war es dann was mit dem Herzen, glaube ich." | 1 Vermutung | 00:10:55 |

Zur letzten Zeile: Sie steht bewusst als **„was mit dem Herzen"** und nicht als „Herzinfarkt".
Jede Präzisierung wäre erfunden. Der Entwurf soll zeigen, dass die Oberfläche diesen Wortlaut
trägt, ohne ihn zu korrigieren.

**Zwei unverarbeitete Notizen** — Material, das die Software bewusst **nicht** anlegt:

| Wortlaut | Grund, warum nichts angelegt wurde |
|---|---|
| „Der Onkel Paul, der hat gequalmt wie ein Schlot, der ist aber trotzdem neunzig geworden." | Onkel Paul ist im Bestand nicht vorhanden, und es gibt keinen Nachnamen. Eine Person nur aus „Onkel Paul" anzulegen erzeugt einen Platzhalter ohne Zweck. |
| „Und in der Familie gab es auch Krebs, aber ich weiß nicht mehr, bei wem. Irgendwer auf der Seite von meiner Mutter." | Keine Person zuordenbar. Eine Diagnose ohne Person ist nicht darstellbar, und eine geratene Zuordnung wäre genau der Fehler, den die Software verhindern soll. |

**Für die Konfliktkarte** (zwei Informanten nennen verschiedene Jahre, beide Werte bleiben):
Tante Erna sagt „der Karl war zwei Jahre jünger als ich, also 23er Jahrgang" → 1923, Konfidenz 2.
Onkel Fritz sagt „der Karl ist 25 geboren, da bin ich mir sicher" → 1925, Konfidenz 2.
Keiner von beiden ist bevorzugt. Die Karte muss zeigen: **beide bleiben stehen**, und es ist eine
Entscheidung offen — nicht ein Fehler.

**Für den Umschalter auf „Vom Hörensagen":** Danach schlägt die Software für alle folgenden
Karten Konfidenz **2** statt **3** vor, und die Datumsgenauigkeit „etwa" statt „exakt". Das muss
im Entwurf sichtbar sein — der Umschalter ändert etwas, was man sieht.

### A.2 Trockenlauf-Bericht für S-11

Der vollständige Beispielbericht, in genau dieser Reihenfolge und mit diesen Zahlen:

```
Trockenlauf: interview-tante-erna.json
Vertrag wurzelwerk-import/v1 · erzeugt 12.09.2026 von claude-skill:wurzelwerk-import-vertrag
Prüfsumme des Quelltexts: sha256-a1b2c3… (nicht im Projekt bekannt — erster Import)

  ZUSAMMENFASSUNG
    3 Fehler      → Import nicht möglich
    7 Hinweise
    Rücknahme:    als einzelner Undo-Schritt (24 geänderte Zeilen, Schwelle 500)

  WIRD ANGELEGT                                             12
    Personen         3    tmp:august-wruck, tmp:vater-august, tmp:erna
    Orte             3    Marienwerder/Kwidzyn, Westpreußen, Polen
    Ereignisse       1    Geburt (etwa 1890)
    Elternschaften   2
    Aussagen         3

  WIRD ERGÄNZT                                               2
    Erna Wruck (db:018f2c44…)
      + Aussage  beruf = "Näherin"     Konfidenz 3   NEU, kein Konflikt
      + Beleg    zu bestehendem Geburtsdatum          NEU
      Keine bestehenden bevorzugten Werte werden ersetzt.

  MÖGLICHE DUBLETTEN                                         1
    tmp:august-wruck  ~  August Wruck (db:018f…)  Punktwert 0,72
      Name gleich · Geburtsjahr 1890 vs. etwa 1890 · Ort gleich
      → Wird getrennt angelegt. Zusammenführen später im Merge-Werkzeug.

  FEHLER                                                     3
    IMP-206  personen[1].unsicherheit          Konfidenz 2 ohne Begründung
    IMP-201  aussagen[2].belege[0].quelle      tmp:q-lotte nicht definiert
    IMP-106  ereignisse[0].datum               "etwa" ohne Originaltext

  HINWEISE                                                   7
    IMP-302  elternschaften[1]     Elternteil wäre 6 Jahre alt gewesen
    IMP-303  orte[0].koordinaten   ohne Herkunftsangabe
    IMP-307  personen[0]           Lebensdauer 112 Jahre
    IMP-309  personen[2]           Person ohne Beziehung und ohne Ereignis
    …

  NICHT VERARBEITETES MATERIAL                               2   ← immer sichtbar
    „Und dann war da noch der Bruder, der nach Kanada gegangen ist…"
      Grund: Zwei mögliche Vornamen, keine weiteren Angaben.
    „…seit dem Unglück in der Werkstatt war er nicht mehr derselbe."
      Grund: Unklar, wer gemeint ist.

  GESUNDHEITSDATEN                                            0
    (Diagnosen und Risikofaktoren werden nie exportiert)
```

Für die fehlerfreie Fassung desselben Berichts: 0 Fehler, 2 Hinweise, „Importieren" freigegeben.

### A.3 Fehlermeldungen für S-12

Das verbindliche Format, mit fünf Bestandteilen: Schweregrad und Code · JSON-Pfad · betroffene
Kennung · Datei und Zeile · „Was tun" mit **allen** Auswegen.

```
FEHLER   IMP-206   personen[3].unsicherheit
         Bei Konfidenz 2 ("unsicher") muss stehen, was unklar ist.
         Betroffen: tmp:august-wruck
         Datei: interview-tante-erna.json, Zeile 84
         Was tun: Feld "unsicherheit" ergänzen — ein Satz genügt.
                  Oder, wenn die Angabe doch gesichert ist: konfidenz auf 4 setzen.

FEHLER   IMP-201   aussagen[2].belege[0].quelle
         Verweist auf eine Quelle, die in dieser Datei nicht definiert ist.
         Betroffen: tmp:q-lotte
         Datei: interview-tante-erna.json, Zeile 203
         Was tun: Quelle unter "quellen" anlegen — oder den Beleg auf eine
                  vorhandene Quelle umhängen.

HINWEIS  IMP-302   elternschaften[1]
         Elternteil wäre bei der Geburt des Kindes 6 Jahre alt gewesen.
         Betroffen: tmp:august (geb. etwa 1890) → tmp:erna (geb. 1896)
         Datei: interview-tante-erna.json, Zeile 191
         Häufige Ursache: In Gesprächen sind Verwandtschaftsangaben relativ
                  zum Erzähler. "Mein Großvater" ist nicht der Vater des Erzählers.
         Was tun: Prüfen, ob hier eine Generation fehlt.
```

Für das Artboard mit 40 Meldungen: **gruppiert nach Fehlercode**, weil 30 Meldungen desselben
Codes ein Muster und eine einzige Korrektur sind, nicht 30 Probleme. Verwendbare Verteilung:
28 × IMP-206, 6 × IMP-303, 3 × IMP-201, 2 × IMP-106, 1 × IMP-302.

### A.4 Wenn Anhänge nicht funktionieren

`[unverified]` — welche Dateiformate Claude Design als Projektkontext annimmt, ist von außen
nicht zuverlässig dokumentiert; JSON nachweislich nicht. Fallbacks, in dieser Reihenfolge:

1. **Markdown anhängen** — der Regelfall, wie oben beschrieben.
2. **Inhalt in den ersten Chat einfügen.** Nachteil: gilt nur für diesen einen Chat, nicht für das ganze Projekt. Dann muss zu Beginn jeder Welle der Kern erneut eingefügt werden — mindestens §4 (Unsicherheitssprache), §5.3 (Richtung) und §6 (Sperrliste) dieses Dokuments.
3. **Als DOCX oder PDF umwandeln.** Diese Formate sind ausdrücklich als Upload genannt. Bei der Umwandlung gehen Tabellen selten verloren, Codeblöcke schon eher — der Trockenlauf-Bericht in A.2 ist der empfindliche Teil.
4. **Als Bild.** Für einzelne Tabellen und den Trockenlauf-Bericht eine gangbare Notlösung; Claude Design liest Bildschirmfotos.
