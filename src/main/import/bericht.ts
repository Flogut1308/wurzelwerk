// AP-1.4a, 56_Import_Vertrag.md §6.2: baut den strukturierten Trockenlaufbericht aus den bereits
// ermittelten Rohdaten (`baueBericht`) und formatiert ihn als Klartext in den acht Berichtsblöcken
// aus §6.2 (`alsText`). Kopfloses Textartefakt (kein JSX, keine i18n-Anbindung, kein Speicherdialog)
// — die deutschen Blocklabels sind hier als Konstanten hinterlegt, NICHT über `i18next`; die
// endgültige Renderer-Anzeige (Übersetzungsschlüssel, Speicherdialog "Bericht exportieren") ist
// AP-1.4b (§14/CLAUDE.md — vermerkt in `docs/80_Offene_Fragen.md`, analog zu `datum.json`
// vor AP-1.1/AP-1.2).
import type { Befund } from '../../shared/import/imp-codes'
import { RUECKNAHME_SCHWELLE_ZEILEN } from '../../shared/import/trockenlauf-bericht'
import type {
  Trockenlaufbericht,
  TrockenlaufAngelegtEintrag,
  TrockenlaufDublettenEintrag,
  TrockenlaufErgaenzungEintrag,
  TrockenlaufGesundheitsdaten,
  TrockenlaufNotizEintrag,
} from '../../shared/import/trockenlauf-bericht'

/** Rohdaten für `baueBericht()` — bereits ermittelt von `src/main/import/trockenlauf.ts` (DB-Lesen,
 * `schreibeImport()`-Ergebnis, Stufe-3/4-Funde). `baueBericht()` selbst greift auf nichts anderes
 * zu als diese Werte — reine Zusammensetzung, kein weiterer DB-Zugriff. */
export interface RohBerichtsdaten {
  readonly datei: string
  readonly vertragErzeugtAm: string | null
  readonly vertragWerkzeug: string | null
  readonly pruefsummeQuelltext: string | null
  /** Zeitpunkt (Unix-ms) eines früheren Laufs mit identischer Prüfsumme, `undefined` ohne Treffer. */
  readonly bereitsImportiertAmMs: number | undefined
  readonly fehler: readonly Befund[]
  readonly hinweise: readonly Befund[]
  readonly wirdAngelegt: readonly TrockenlaufAngelegtEintrag[]
  readonly wirdErgaenzt: readonly TrockenlaufErgaenzungEintrag[]
  readonly moeglicheDubletten: readonly TrockenlaufDublettenEintrag[]
  readonly geaenderteZeilenAnzahl: number
  readonly nichtVerarbeitetesMaterial: readonly TrockenlaufNotizEintrag[]
  readonly gesundheitsdaten: TrockenlaufGesundheitsdaten
}

/**
 * Baut den strukturierten `Trockenlaufbericht` (56_Import_Vertrag.md §6.2) aus den Rohdaten.
 * `importGesperrt = fehler.length > 0` (§6.2 Gestaltungsentscheidung, ZUSAMMENFASSUNG-Zeile
 * "N Fehler → Import nicht möglich") — die einzige Stelle, die diese Regel auswertet.
 */
export function baueBericht(roh: RohBerichtsdaten): Trockenlaufbericht {
  return {
    zusammenfassung: {
      datei: roh.datei,
      vertragErzeugtAm: roh.vertragErzeugtAm,
      vertragWerkzeug: roh.vertragWerkzeug,
      pruefsummeQuelltext: roh.pruefsummeQuelltext,
      bereitsImportiertAm: roh.bereitsImportiertAmMs !== undefined ? new Date(roh.bereitsImportiertAmMs).toISOString() : null,
      fehlerAnzahl: roh.fehler.length,
      hinweisAnzahl: roh.hinweise.length,
      geaenderteZeilenAnzahl: roh.geaenderteZeilenAnzahl,
      ruecknahmeArt: roh.geaenderteZeilenAnzahl > RUECKNAHME_SCHWELLE_ZEILEN ? 'schnappschuss' : 'undo',
    },
    wirdAngelegt: roh.wirdAngelegt,
    wirdErgaenzt: roh.wirdErgaenzt,
    moeglicheDubletten: roh.moeglicheDubletten,
    fehler: roh.fehler,
    hinweise: roh.hinweise,
    nichtVerarbeitetesMaterial: roh.nichtVerarbeitetesMaterial,
    gesundheitsdaten: roh.gesundheitsdaten,
    importGesperrt: roh.fehler.length > 0,
  }
}

// ---------------------------------------------------------------------------------------------
// Klartextformatierung (§6.2) — acht Blocklabels, deutsch, kopflos (s. Kopfkommentar).
// ---------------------------------------------------------------------------------------------

const BLOCK_ZUSAMMENFASSUNG = 'ZUSAMMENFASSUNG'
const BLOCK_WIRD_ANGELEGT = 'WIRD ANGELEGT'
const BLOCK_WIRD_ERGAENZT = 'WIRD ERGÄNZT'
const BLOCK_MOEGLICHE_DUBLETTEN = 'MÖGLICHE DUBLETTEN'
const BLOCK_FEHLER = 'FEHLER'
const BLOCK_HINWEISE = 'HINWEISE'
const BLOCK_NICHT_VERARBEITETES_MATERIAL = 'NICHT VERARBEITETES MATERIAL'
const BLOCK_GESUNDHEITSDATEN = 'GESUNDHEITSDATEN'

function formatiereBefund(befund: Befund): string {
  const kennungText = befund.kennung !== undefined ? `  Betroffen: ${befund.kennung}` : ''
  return `  ${befund.code}  ${befund.pfad}${kennungText}`
}

function zeile(label: string, inhalt: string): string {
  return `  ${label}${inhalt}`
}

/**
 * Formatiert den Bericht als Klartext, in der Blockreihenfolge aus §6.2: ZUSAMMENFASSUNG → WIRD
 * ANGELEGT → WIRD ERGÄNZT → MÖGLICHE DUBLETTEN → FEHLER → HINWEISE → NICHT VERARBEITETES MATERIAL
 * (immer sichtbar, auch leer, Gestaltungsentscheidung 5) → GESUNDHEITSDATEN (nennt IMMER die
 * Exportsperre M-08, §7/§8 — nie Inhalte). KEIN Speicherdialog hier (das ist AP-1.4b/Renderer).
 */
export function alsText(bericht: Trockenlaufbericht): string {
  const z = bericht.zusammenfassung
  const abschnitte: string[] = []

  abschnitte.push(
    [
      `Trockenlauf: ${z.datei}`,
      z.vertragErzeugtAm !== null && z.vertragWerkzeug !== null ? `erzeugt ${z.vertragErzeugtAm} von ${z.vertragWerkzeug}` : undefined,
      z.pruefsummeQuelltext !== null
        ? z.bereitsImportiertAm !== null
          ? `ACHTUNG: Dieses Material wurde am ${z.bereitsImportiertAm} schon importiert (Prüfsumme ${z.pruefsummeQuelltext}).`
          : `Prüfsumme des Quelltexts: ${z.pruefsummeQuelltext} (nicht im Projekt bekannt — erster Import)`
        : undefined,
    ]
      .filter((teil): teil is string => teil !== undefined)
      .join('\n'),
  )

  abschnitte.push(
    [
      BLOCK_ZUSAMMENFASSUNG,
      zeile(`${z.fehlerAnzahl} Fehler`, z.fehlerAnzahl > 0 ? '      → Import nicht möglich' : ''),
      zeile(`${z.hinweisAnzahl} Hinweise`, ''),
      zeile('Rücknahme: ', z.ruecknahmeArt === 'undo' ? `als einzelner Undo-Schritt (${z.geaenderteZeilenAnzahl} geänderte Zeilen, Schwelle ${RUECKNAHME_SCHWELLE_ZEILEN})` : `als Schnappschuss (${z.geaenderteZeilenAnzahl} geänderte Zeilen, Schwelle ${RUECKNAHME_SCHWELLE_ZEILEN} überschritten)`),
    ].join('\n'),
  )

  abschnitte.push(
    [BLOCK_WIRD_ANGELEGT, ...bericht.wirdAngelegt.map((eintrag) => zeile(`${eintrag.tabelle}  `, String(eintrag.anzahl)))].join('\n'),
  )

  abschnitte.push(
    [
      BLOCK_WIRD_ERGAENZT,
      ...bericht.wirdErgaenzt.map((eintrag) => {
        const wert = eintrag.wertText ?? (eintrag.wertZahl !== null ? String(eintrag.wertZahl) : '')
        const konfliktText = eintrag.istKonflikt ? '  KONFLIKT mit bestehendem bevorzugten Wert' : ''
        return zeile(`${eintrag.subjektKennung}  + Aussage ${eintrag.praedikat} = "${wert}"`, konfliktText)
      }),
      bericht.wirdErgaenzt.length > 0 ? '  Keine bestehenden bevorzugten Werte werden ersetzt.' : '',
    ]
      .filter((teil) => teil !== '')
      .join('\n'),
  )

  abschnitte.push(
    [
      BLOCK_MOEGLICHE_DUBLETTEN,
      ...bericht.moeglicheDubletten.map((eintrag) => zeile(`${eintrag.neueKennung}  ~  ${eintrag.bestehendeKennung}`, `  Punktwert ${eintrag.punktwert}  ${eintrag.begruendung}`)),
    ].join('\n'),
  )

  abschnitte.push([BLOCK_FEHLER, ...bericht.fehler.map(formatiereBefund)].join('\n'))
  abschnitte.push([BLOCK_HINWEISE, ...bericht.hinweise.map(formatiereBefund)].join('\n'))

  abschnitte.push(
    [
      BLOCK_NICHT_VERARBEITETES_MATERIAL,
      ...bericht.nichtVerarbeitetesMaterial.map((notiz) => `  „${notiz.text}"\n    Grund: ${notiz.warum}`),
    ].join('\n'),
  )

  abschnitte.push(
    [
      BLOCK_GESUNDHEITSDATEN,
      zeile(`${bericht.gesundheitsdaten.diagnosenAnzahl + bericht.gesundheitsdaten.risikofaktorenAnzahl}`, ''),
      '  (Diagnosen und Risikofaktoren werden nie exportiert — M-08)',
    ].join('\n'),
  )

  return abschnitte.join('\n\n')
}
