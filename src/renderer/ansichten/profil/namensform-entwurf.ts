// AP-1.30 PR 11c-1 (A-02, A-19, C-26; docs/80 §33 V-130-11-E1, E4, E9): der lokale Entwurf des Modals
// „Namensform bearbeiten" und seine Zielliste für `befehl:namensform.uebernehmen`. Reines TypeScript ohne
// React (Muster `reiter-namen-logik.ts`); das Modal hält den Entwurf im eigenen Zustand, KEIN Autosave-Hook
// — geschrieben wird genau einmal beim Übernehmen (E1).
//
// Was hier NICHT steht: eine eigene Zerlegung oder Prüfung der Werte. Leere Teile verwirft auch der Befehl,
// Leerraum in einem Vornamen weist der Befehl ab (E4); dieses Modul ordnet einen solchen Fehler nur dem Feld
// zu (`vornamenMitLeerraum`). Die Live-Vorschau geht über `anzeigetextVon` (keine zweite Regel).
import { anzeigetextVon } from '../../../core/name/anzeigename'
import type { NameFormReihenfolge, NameFormRolle, NamePartArt, Schrift, UmschriftNorm } from '../../../core/name/typen'
import type { GeladenerTeil } from '../../../core/name/zerlegung'
import type { NamensformUebernehmenEin, NamensformUebernehmenKopf, NamensformUebernehmenTeil } from '../../../shared/schemata/befehle'
import type { PersonDetailName, PersonDetailNamensteil } from '../../../shared/schemata/person-detail'

/** Eine Zeile im Modal. `schluessel` ist die Kennung im Entwurf (bei bestehenden Teilen die `id`, bei neuen
 * ein vom Aufrufer vergebener Schlüssel); `id` ist `null` für einen neuen Teil. Die Art ist je Zeile fest. */
export interface EntwurfTeil {
  readonly schluessel: string
  readonly id: string | null
  readonly art: NamePartArt
  readonly wert: string
}

/** Der Entwurf einer Namensform. Die Reihenfolge der Teile einer Art ist die Zielfolge (der Befehl ordnet
 * je Art); `rufname` ist der `schluessel` des markierten Vornamens. `originalText` wird nur für die
 * Vorschau gelesen, nicht bearbeitet. `rolle = null` ist eine Umschrift: das Modal bietet dann keine
 * Rollenwahl an (eine Rolle machte die Umschrift zu einer eigenständigen Form); `umschriftVon` wird nur
 * angezeigt und nie mitgeschickt („fehlt = bleibt"). */
export interface NamensformEntwurf {
  readonly formId: string | null
  readonly rolle: NameFormRolle | null
  readonly umschriftVon: string | null
  /** Nur gelesen: eine automatische Norm wird beim Korrigieren der Teile zu 'manuell' (`uebernehmenEin`). */
  readonly umschriftNorm: UmschriftNorm | null
  readonly sprache: string | null
  readonly schrift: Schrift | null
  readonly reihenfolge: NameFormReihenfolge | null
  readonly teile: readonly EntwurfTeil[]
  readonly rufname: string | null
  readonly hauptname: boolean
  readonly originalText: string | null
}

/** Rolle einer neu angelegten Form (die Vorgabe der bisherigen Maske, `NAMEN_EINTRAG_LEER`). */
export const NEUE_FORM_ROLLE: NameFormRolle = 'geburtsname'

/** Schlüssel der leeren Zeilen, die der Entwurf für Vorname und Nachname ergänzt. */
const LEER_VORNAME = 'leer-vorname'
const LEER_NACHNAME = 'leer-nachname'

function leereZeilen(teile: readonly EntwurfTeil[]): readonly EntwurfTeil[] {
  const fehlt = (art: NamePartArt): boolean => !teile.some((eintrag) => eintrag.art === art)
  return [
    ...(fehlt('vorname') ? [{ schluessel: LEER_VORNAME, id: null, art: 'vorname' as const, wert: '' }] : []),
    ...(fehlt('nachname') ? [{ schluessel: LEER_NACHNAME, id: null, art: 'nachname' as const, wert: '' }] : []),
  ]
}

/**
 * Entwurf aus einer gespeicherten Form. Die Teile kommen in der Folge des Lesemodells (je Art nach
 * `sortier_index`); fehlt ein Vorname oder Nachname, steht eine leere Zeile dafür bereit. Auch eine
 * Umschrift (`rolle = null`) ist bearbeitbar (Teile und Kopf wie jede Form; E6 betrifft nur das Erzeugen
 * einer Umschrift, nicht das Bearbeiten einer vorhandenen). Rückgabe `NamensformEntwurf | null` bleibt als
 * Vertrag für künftig nicht bearbeitbare Formen; heute ist sie nie `null`.
 */
export function entwurfAusForm(name: PersonDetailName): NamensformEntwurf | null {
  const teile: readonly EntwurfTeil[] = name.teile.map((eintrag) => ({ schluessel: eintrag.id, id: eintrag.id, art: eintrag.art, wert: eintrag.wert }))
  return {
    formId: name.id,
    rolle: name.rolle,
    umschriftVon: name.umschrift_von,
    umschriftNorm: name.umschrift_norm,
    sprache: name.sprache,
    schrift: name.schrift,
    reihenfolge: name.reihenfolge,
    teile: [...teile, ...leereZeilen(teile)],
    rufname: name.teile.find((eintrag) => eintrag.ist_rufname)?.id ?? null,
    hauptname: name.ist_bevorzugt,
    originalText: name.original_text,
  }
}

/** Leerer Entwurf für „+ Namensform". `istErsteForm`: die erste Form einer Person wird Hauptname
 * (`namensformAnlegen`), jede weitere nicht, außer der Nutzer schaltet es ein. */
export function neuerEntwurf(istErsteForm: boolean): NamensformEntwurf {
  return {
    formId: null,
    rolle: NEUE_FORM_ROLLE,
    umschriftVon: null,
    umschriftNorm: null,
    sprache: null,
    schrift: null,
    reihenfolge: null,
    teile: leereZeilen([]),
    rufname: null,
    hauptname: istErsteForm,
    originalText: null,
  }
}

/** Einen leeren Teil der Art `art` anlegen — hinter dem letzten Teil derselben Art, sonst am Ende. */
export function teilHinzufuegen(entwurf: NamensformEntwurf, art: NamePartArt, schluessel: string): NamensformEntwurf {
  const neu: EntwurfTeil = { schluessel, id: null, art, wert: '' }
  const letzter = entwurf.teile.findLastIndex((eintrag) => eintrag.art === art)
  const teile = letzter < 0 ? [...entwurf.teile, neu] : [...entwurf.teile.slice(0, letzter + 1), neu, ...entwurf.teile.slice(letzter + 1)]
  return { ...entwurf, teile }
}

export function teilWertSetzen(entwurf: NamensformEntwurf, schluessel: string, wert: string): NamensformEntwurf {
  return { ...entwurf, teile: entwurf.teile.map((eintrag) => (eintrag.schluessel === schluessel ? { ...eintrag, wert } : eintrag)) }
}

/** Rufname auf den Vornamen `schluessel` setzen; `null` entfernt die Markierung. */
export function rufnameSetzen(entwurf: NamensformEntwurf, schluessel: string | null): NamensformEntwurf {
  return { ...entwurf, rufname: schluessel }
}

/** Ein Teil ohne Inhalt (nur Leerraum) — er wird beim Übernehmen verworfen. */
export function istLeer(teil: Pick<EntwurfTeil, 'wert'>): boolean {
  return teil.wert.trim() === ''
}

/** Die Zielliste: leere Teile verworfen (neue wie geleerte bestehende), bestehende mit ihrer `id`, der Wert
 * unverändert (ein unveränderter Altbestandswert trifft die No-op-Prüfung des Befehls, E4). */
function zielTeile(entwurf: NamensformEntwurf): readonly NamensformUebernehmenTeil[] {
  return entwurf.teile
    .filter((eintrag) => !istLeer(eintrag))
    .map((eintrag) => ({
      ...(eintrag.id === null ? {} : { id: eintrag.id }),
      art: eintrag.art,
      wert: eintrag.wert,
      istRufname: eintrag.art === 'vorname' && eintrag.schluessel === entwurf.rufname,
    }))
}

type KopfFeld = 'rolle' | 'sprache' | 'schrift' | 'reihenfolge'
const KOPF_FELDER: readonly KopfFeld[] = ['rolle', 'sprache', 'schrift', 'reihenfolge']

/** Kopf einer bestehenden Form: nur die Felder, die sich gegenüber dem geöffneten Stand ändern (fehlt =
 * bleibt) — so überschreibt „Übernehmen" nichts, was der Nutzer nicht angefasst hat. */
function kopfDifferenz(basis: NamensformEntwurf, entwurf: NamensformEntwurf): NamensformUebernehmenKopf {
  const geaendert = (feld: KopfFeld): boolean => basis[feld] !== entwurf[feld]
  return {
    ...(geaendert('rolle') ? { rolle: entwurf.rolle } : {}),
    ...(geaendert('sprache') ? { sprache: entwurf.sprache } : {}),
    ...(geaendert('schrift') ? { schrift: entwurf.schrift } : {}),
    ...(geaendert('reihenfolge') ? { reihenfolge: entwurf.reihenfolge } : {}),
  }
}

/**
 * Nutzlast von `befehl:namensform.uebernehmen` (E1): die VOLLSTÄNDIGE Zielliste der Teile. Bei einer neuen
 * Form (`formId = null`) der volle Kopf (`null` heißt dort „nicht gesetzt"), bei einer bestehenden nur die
 * geänderten Kopf-Felder. `hauptname: true` nur, wenn der Entwurf die Form neu zum Hauptnamen macht.
 */
export function uebernehmenEin(personId: string, basis: NamensformEntwurf, entwurf: NamensformEntwurf): NamensformUebernehmenEin {
  const kopf: NamensformUebernehmenKopf =
    entwurf.formId === null
      ? { rolle: entwurf.rolle, sprache: entwurf.sprache, schrift: entwurf.schrift, reihenfolge: entwurf.reihenfolge }
      : { ...kopfDifferenz(basis, entwurf), ...(umschriftKorrigiert(basis, entwurf) ? { umschriftNorm: 'manuell' as const } : {}) }
  return {
    personId,
    formId: entwurf.formId,
    kopf,
    teile: zielTeile(entwurf),
    ...(entwurf.hauptname && !basis.hauptname ? { hauptname: true } : {}),
  }
}

/** Review #207 3b (A-19): werden die Teile einer AUTOMATISCH erzeugten Umschrift (`iso9`, `din1460`) geändert,
 * ist sie von Hand korrigiert — docs/datenmodell.md kennzeichnet das mit `umschrift_norm = 'manuell'`, damit
 * eine spätere automatische Umschrift sie nicht überschreibt und die Karte nicht mehr „automatisch" sagt. Ohne
 * Norm oder schon 'manuell' bleibt der Kopf, ebenso bei einer Änderung nur am Kopf. */
function umschriftKorrigiert(basis: NamensformEntwurf, entwurf: NamensformEntwurf): boolean {
  if (basis.rolle !== null || (basis.umschriftNorm !== 'iso9' && basis.umschriftNorm !== 'din1460')) return false
  // H2 (PR 11c-1b, entschieden): eine reine Rufname-Markierung korrigiert die Transliteration nicht.
  return !zielTeileGleich(zielTeile(basis), zielTeile(entwurf), false)
}

/**
 * Gleiche Zielliste? Werte werden GETRIMMT verglichen, genau wie der Handler (`teil.wert.trim() === vorher.wert`,
 * `namensform-uebernehmen.ts`): ein angehängtes Leerzeichen ist dort keine Änderung, also auch hier keine
 * (PR 11c-1b H1) — sonst meldete das Modal „geändert" (E9) bzw. „korrigiert" und schriebe einen Undo-Schritt,
 * der nur die Norm setzt. `mitRufname`: ob die Rufname-Markierung mitzählt.
 */
function zielTeileGleich(vorher: readonly NamensformUebernehmenTeil[], nachher: readonly NamensformUebernehmenTeil[], mitRufname: boolean): boolean {
  return (
    vorher.length === nachher.length &&
    vorher.every((teil, index) => {
      const gegen = nachher[index]
      return (
        gegen !== undefined &&
        gegen.id === teil.id &&
        gegen.art === teil.art &&
        gegen.wert.trim() === teil.wert.trim() &&
        (!mitRufname || gegen.istRufname === teil.istRufname)
      )
    })
  )
}

/** Hat der Entwurf etwas, das „Übernehmen" schreiben würde? Vergleicht die Zielliste, den Kopf und den
 * Hauptnamen — ein leer angelegter Teil oder ein zurückgetippter Wert ändert nichts (E9: nur dann die
 * Nachfrage beim Abbrechen). */
export function entwurfGeaendert(basis: NamensformEntwurf, entwurf: NamensformEntwurf): boolean {
  if (KOPF_FELDER.some((feld) => basis[feld] !== entwurf[feld])) return true
  if (basis.hauptname !== entwurf.hauptname) return true
  return !zielTeileGleich(zielTeile(basis), zielTeile(entwurf), true)
}

/** Hat der Entwurf eine neue Form mit mindestens einem nicht leeren Teil? Eine neue Form ohne Teile legt
 * „Übernehmen" nicht an. */
export function hatInhalt(entwurf: NamensformEntwurf): boolean {
  return entwurf.teile.some((eintrag) => !istLeer(eintrag))
}

/**
 * E4: der Befehl weist Leerraum in einem NEUEN oder GEÄNDERTEN Vornamen ab (`VALIDIERUNG_NAMENSTEIL_LEERRAUM`,
 * ohne Angabe des Teils). Die Zeilen, an die dieser Fehler gehört: neue oder geänderte Vornamen, deren
 * getrimmter Wert Leerraum enthält. Nur die Zuordnung zum Feld — geprüft und abgewiesen hat der Befehl.
 */
export function vornamenMitLeerraum(basis: NamensformEntwurf, entwurf: NamensformEntwurf): readonly string[] {
  const vorher = new Map(basis.teile.map((eintrag) => [eintrag.schluessel, eintrag.wert] as const))
  return entwurf.teile
    .filter((eintrag) => eintrag.art === 'vorname' && (eintrag.id === null || vorher.get(eintrag.schluessel)?.trim() !== eintrag.wert.trim()) && /\s/.test(eintrag.wert.trim()))
    .map((eintrag) => eintrag.schluessel)
}

function teilGleich(a: PersonDetailNamensteil, b: PersonDetailNamensteil): boolean {
  return a.id === b.id && a.art === b.art && a.wert === b.wert && a.ist_rufname === b.ist_rufname && a.sortier_index === b.sortier_index && a.feminine_variante === b.feminine_variante
}

/** Die gespeicherten Felder einer Form, die das Modal zeigt oder beim Übernehmen voraussetzt. */
const FORM_FELDER = [
  'ist_bevorzugt',
  'rolle',
  'rollen_notiz',
  'sprache',
  'schrift',
  'reihenfolge',
  'umschrift_von',
  'umschrift_norm',
  'konfidenz',
  'sortier_index',
  'gueltig_von',
  'gueltig_bis',
  'original_text',
] as const

/**
 * Undo bei offenem Modal: hat sich die bearbeitete Form seit dem Öffnen von außen geändert? `basis` ist die
 * Form beim Öffnen (`null` = neue Form, die es noch nicht gibt), `live` die Form im aktuellen Lesemodell.
 * Verglichen wird der Inhalt, nicht die Referenz — ein fremdes Nachladen mit gleichem Inhalt ist keine
 * Änderung. `'entfernt'`: die Form gibt es nicht mehr (z. B. Undo ihres Anlegens).
 */
export function formVonAussen(basis: PersonDetailName | null, live: PersonDetailName | undefined): 'gleich' | 'geaendert' | 'entfernt' {
  if (basis === null) return 'gleich'
  if (live === undefined) return 'entfernt'
  if (FORM_FELDER.some((feld) => basis[feld] !== live[feld])) return 'geaendert'
  if (basis.teile.length !== live.teile.length) return 'geaendert'
  return basis.teile.every((teil, index) => {
    const gegen = live.teile[index]
    return gegen !== undefined && teilGleich(teil, gegen)
  })
    ? 'gleich'
    : 'geaendert'
}

/** Live-Vorschau des Anzeigetexts: dieselbe Regel wie Liste und Kopf (`anzeigetextVon`), über die nicht
 * leeren Teile des Entwurfs mit ihrer Stelle je Art und der Reihenfolge des Entwurfs. */
export function entwurfVorschau(entwurf: NamensformEntwurf): string {
  const stelle = new Map<NamePartArt, number>()
  const teile: GeladenerTeil[] = []
  for (const eintrag of entwurf.teile) {
    if (istLeer(eintrag)) continue
    const index = stelle.get(eintrag.art) ?? 0
    stelle.set(eintrag.art, index + 1)
    teile.push({ art: eintrag.art, wert: eintrag.wert.trim(), istRufname: eintrag.schluessel === entwurf.rufname, sortierIndex: index })
  }
  return anzeigetextVon({ teile, originalText: entwurf.originalText, reihenfolge: entwurf.reihenfolge })
}
