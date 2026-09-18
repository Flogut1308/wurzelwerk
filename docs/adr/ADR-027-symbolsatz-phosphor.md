## ADR-027 — Phosphor Icons als Symbolsatz

**Status:** entschieden (18.09.2026)

**Kontext:** `71` §6 führt den Symbolsatz als **Phase-0-Asset** — „ein einziger, durchgehend;
Strichstärke passend zur Schrift; kein Emoji; vollständig genug für ~80 Symbole" — und verlangte
zusätzlich „nicht die üblichen Verdächtigen". Beschafft wurde nie einer. Die Folge steht dreifach
in `docs/80` (U-1.6-atome-scope, U-1.6-leerzustand-ohne-symbol): vier der 17 Atome fehlen,
`LeerzustandBlock` rendert ohne Symbol, Spaltenicons sind Unicode-Platzhalter. Der Nutzer hat die
Auflage „keine üblichen Verdächtigen" am 18.09.2026 ausdrücklich gelockert.

**Entscheidung: Phosphor Icons** (`phosphor-icons/core`, MIT).

**Warum:**
- **MIT** — Mitliefern in einer Desktop-Anwendung ohne Namensnennungspflicht. (Font Awesome Free
  scheidet daran aus: CC BY 4.0 verlangt Attribution in der Oberfläche.)
- **Umfang und Konsistenz:** ~1.400 Namen, alle in sechs Strichstärken, alle im selben 256er-Raster.
  Ein Satz, kein Zusammenwürfeln — genau die Forderung aus §6.
- **Technisch passend:** `fill="currentColor"` heißt, die Farbe kommt aus dem Token, das der
  umgebende Text ohnehin setzt. Kein zweiter Farbweg neben `tokens.css`.
- **Charakter ohne Eigenwilligkeit:** humanistisch-geometrisch, runde Enden, leicht eigene Note —
  passt zu Source Sans 3, ohne wie ein Systemsatz auszusehen. Lucide und Feather sind
  zurückhaltender, aber gerade deshalb die Handschrift, die §4 vermeiden will; Material Symbols
  tragen sichtbar Googles Handschrift; Tabler ist sehr uniform.
- **Fachliche Deckung ist überraschend gut:** `church`, `cross`, `baby`, `skull`, `boat`,
  `airplane-takeoff`, `medal`, `briefcase`, `archive`, `books`, `quotes`, `microphone`,
  `waveform`, `tree-structure`, `warning-diamond`, `user-focus`, `hands-praying`, `scroll`,
  `hourglass`, `arrows-merge` sind vorhanden (am 18.09.2026 einzeln geprüft).

**Konsequenzen:**
- **Kein npm-Paket.** Die benutzten SVG werden als Dateien in `src/renderer/gestaltung/symbole/`
  kopiert (MIT erlaubt es), der Lizenztext nach `docs/lizenzen/MIT-Phosphor.txt`. Gründe: die App
  ist offline, die CSP lässt ohnehin nichts nachladen, und 8.000 Dateien im Bündel wären Ballast.
  Ein nachvollziehbares Abzugsskript (`skripte/symbole-holen.ts`) hält fest, welche Datei woher
  stammt.
- **Zwei Lücken bleiben und werden gezeichnet:** für **Trauung** (kein Ringpaar) und
  **Beerdigung** (weder `grave` noch `coffin`) gibt es bei Phosphor nichts Passendes. Beide
  entstehen im selben 256er-Raster und derselben Strichstärke und werden als eigene Dateien
  geführt, erkennbar getrennt von den übernommenen — damit später niemand sie für Phosphor hält.
- Grundgewicht **Regular**, **Fill** nur für ausgewählte/aktive Zustände. Eine dritte Stärke
  braucht eine Begründung.
- `71` §6 wird nachgezogen: der Satz ist benannt, das Asset ist kein Phase-0-Rückstand mehr,
  sondern AP-1.11.

### Nachtrag (AP-1.11, 18.09.2026): gepinnter Tag, URL-Korrektur, eine Substitution

- **Gepinnter Tag:** `v2.0.8` (Commit `d42782b2abe747d904b971ccab48b182a1455f86`, geprüft
  18.09.2026 — der jüngste Tag von `phosphor-icons/core` zu diesem Zeitpunkt). `skripte/symbole-holen.ts`
  und `docs/lizenzen/MIT-Phosphor.txt` nennen ihn wortgleich.
- **URL-Korrektur gegenüber dem ursprünglichen Auftragstext:** die Fill-Gewicht-Dateien im
  Quell-Repository heißen `<name>-fill.svg`, nicht `<name>.svg` unterhalb von `assets/fill/` — eine
  rein technische Richtigstellung des Abzugspfads, keine Design- oder Scope-Entscheidung.
- **Eine Substitution:** `user-circle-dashed` (ursprünglich für „Platzhalter" vorgesehen) existiert
  bei Phosphor nicht. Ersetzt durch `user-circle` — die gestrichelte Kennzeichnung von
  Platzhalterpersonen trägt bereits `tabellenzeile.css` (A-17, CSS-`border-style: dashed`), das
  Symbol selbst muss die Gestrichelung nicht zusätzlich abbilden. Vermerkt in
  `docs/80_Offene_Fragen.md` (§14 Fall 2).
