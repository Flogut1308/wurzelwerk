// AP-1.30 PR 11-0 (A-02, A-19; docs/80 §33 V-130-11-E1, V-130-11-E4, V-130-11-0): Handler für
// `namensform.uebernehmen` — schreibt das Modal „Namensform bearbeiten" beim Übernehmen. Läuft in der vom
// Befehlsbus bereits geöffneten und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
//
// Keine zweite Schreiblogik und kein eigenes SQL: der Handler vergleicht Zielliste und Kopf mit dem
// gespeicherten Stand und ruft nur die granularen Befehlsfunktionen (`namensformAnlegen`/`Aendern`,
// `namensteilLoeschen`/`Aendern`/`Anlegen`/`Verschieben`, `namensformRufnameSetzen`, `hauptnameWechseln`) auf —
// je mit ihren eigenen Prüfungen und ihrer E1-sicheren Schrittfolge.
//
// E3 EINMAL je Aufruf (U-130-11-0b-e3-zwischenstand): ob `original_text` den Teilen folgt, wird VOR dem ersten
// Teilschritt entschieden (`originalTextFolgtDenTeilen` am Stand vor dem Befehl; eine neue Form hat `NULL` und
// folgt). Die Teilfunktionen laufen darum mit `OHNE_NACHFUEHRUNG` — je Einzelschritt entschieden, würde eine
// wortgetreue Schreibung, die einem ZWISCHENSTAND der Montage gleicht („Anna" nach dem Anlegen von „Anna" auf
// dem Weg zu [Anna, Nowak]), ab dort überschrieben. Am Ende (Schritt 6) wird genau einmal aus den Zielteilen
// montiert, wenn der Text folgt UND (die Montage der Zielteile von der Montage vor dem Befehl abweicht ODER der
// Text nach den Teilen nicht mehr als Montage erkannt würde — etwa „Karl Gutnow", wenn der angehängte Rufname
// „Hans Peter" verschoben oder entfernt wird; sonst gälte er fortan als wortgetreu, Nachreview #205); ein
// wortgetreuer bleibt, wie auch immer die Zwischenstände aussehen. Sonst wird der Text nicht angefasst
// (Review #205): `istMontierterOriginalText` erkennt auch nicht bitgleiche Texte als automatisch (normierter
// Leerraum „Anna  Nowak", Anlege-Montage ohne angehängten Rufnamen „Karl Gutnow") — ein No-op oder eine
// reine Kopfänderung darf sie nicht still „glätten".
// Grenze von E3: gleicht ein wortgetreu gemeinter Text zufällig der Montage VOR dem Befehl, ist er von einer
// automatischen Montage nicht zu unterscheiden und folgt den Teilen (wie in den Einzelbefehlen).
//
// Ein Undo-Schritt: alle Einzelschritte schreiben in DIESELBE Bus-Transaktion (eine `transaktion_id`); der
// Befehl hat bewusst keinen Koaleszenzschlüssel (kein Autosave). No-op (AP-0.22): jede aufgerufene Funktion
// wird nur bei einem tatsächlichen Unterschied aufgerufen (bzw. ist selbst ein No-op) — ein unveränderter
// Aufruf schreibt nichts, und der Bus verwirft die leere Transaktion.
//
// Prüfen VOR dem ersten Schreiben (je Eintrag mit ID, auch einem leeren): fremde/unbekannte Teil-ID, bestehende Teil-ID mit anderer Art
// (`VALIDIERUNG_NAMENSTEIL_ART_ABWEICHEND` — `namensteil.aendern` ändert die Art nie, im Modal ist sie je Zeile
// fest), leerer bzw. Vorname mit Leerraum in einem NEUEN oder GEÄNDERTEN Wert, Rufname an einem
// Nicht-Vornamen, und der Kopf einer bestehenden Form (`namensformAenderungPruefen`, dieselbe Prüfung wie in
// `namensform.aendern`: Umschrift-Bezug, E7). Den Kopf einer NEUEN Form prüft `namensformAnlegen` in Schritt 1,
// ebenfalls vor jedem anderen Schreibvorgang. Ein unveränderter Altbestandswert (etwa ein mehrwortiger
// Vorname aus Migration 0006) wird nicht geprüft und bleibt (E4). Wirft eine Funktion später doch (nur noch
// Unerreichbares oder ein Datenbankfehler), rollt der Bus die ganze Transaktion zurück.
//
// Schrittfolge (in keinem Zwischenzustand ein doppelter `sortier_index` je (Form, Art), nie zwei Rufnamen):
//   1. neue Form anlegen (nur `formId: null`; der Kopf OHNE `originalText` geht direkt in `namensformAnlegen`);
//   2. entfallene Teile löschen (`namensteilLoeschen`: DELETE, dann Nachnummerieren von vorn — doppelfrei);
//   3. geänderte Werte/Varianten (`namensteilAendern`: Stelle und Rufname bleiben unberührt);
//   4. je Art Rang für Rang einordnen: Rang 0 … k−1 stehen schon richtig; ein neuer Teil wird mit
//      `namensteilAnlegen(position: k)` eingefügt (Aufrücken von hinten), ein bestehender steht auf einem
//      Rang ≥ k und wird mit `namensteilVerschieben(position: k)` geholt (Parkwert MAX + 1). Jede Funktion
//      ist für sich doppelfrei, und keine berührt die Ränge davor;
//   5. Rufname zuletzt (`namensformRufnameSetzen`: erst alte Markierung weg, dann neue). Kein früherer
//      Schritt setzt `ist_rufname = 1` (Anlegen schreibt 0, Ändern/Verschieben lassen die Markierung) —
//      so sieht der Index `idx_name_part_ein_rufname` nie zwei;
//   6. Kopf NACH den Teilen: bei einer bestehenden Form nur die Felder, die sich gegenüber dem Stand VOR dem
//      Befehl ändern, bei einer neuen Form nur `originalText`. `originalText`: ein mitgeschickter, vom
//      gespeicherten abweichender gewinnt immer (auch wenn er zufällig wie eine Montage aussieht); sonst die
//      Montage der Zielteile, falls der Text folgt und sich die Montage geändert hat (E3, oben); sonst bleibt
//      er. Ein unverändert mitgeschickter
//      setzt die Nachführung also nicht zurück. Geschrieben wird nur bei einem Unterschied (No-op);
//   7. Hauptname (`hauptnameWechseln`), falls verlangt und die Form es noch nicht ist.
// Undo spielt das Journal der ganzen Transaktion rückwärts und durchläuft so dieselben Zwischenstände in
// umgekehrter Folge, Redo vorwärts — beide ebenfalls doppelfrei.
import type { NamensformAnlegenEin, NamensformUebernehmenEin, NamensformUebernehmenKopf, NamensformUebernehmenTeil } from '../../shared/schemata/befehle'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import type { Tx } from '../repositories/basis'
import * as nameFormRepo from '../repositories/name-form-repo'
import type { NameFormZeile } from '../repositories/name-form-repo'
import * as namePartRepo from '../repositories/name-part-repo'
import type { NamePartZeile } from '../repositories/name-part-repo'
import { hauptnameWechseln } from './hauptname-wechseln'
import { namensformAendern, namensformAenderungPruefen, namensformGeaenderteFelder } from './namensform-aendern'
import { namensformAnlegen } from './namensform-anlegen'
import { namensformRufnameSetzen } from './namensform-rufname-setzen'
import { namensteilAendern, namensteilGeaenderteFelder } from './namensteil-aendern'
import { namensteilAnlegen } from './namensteil-anlegen'
import { montageDerTeile, namensteilWertPruefen, OHNE_NACHFUEHRUNG, originalTextFolgtDenTeilen } from './namensteil-hilfen'
import { namensteilLoeschen } from './namensteil-loeschen'
import { namensteilVerschieben } from './namensteil-verschieben'

/** Ein geprüfter Eintrag der Zielliste (nicht leer, oder ein unveränderter Leerraum-Teil). `vorher` ist der gespeicherte Teil (gleiche ID und Art)
 * oder `undefined` für einen neuen Teil; `neueId` wird beim Anlegen gesetzt. */
interface Ziel {
  readonly vorher: NamePartZeile | undefined
  readonly art: NamensformUebernehmenTeil['art']
  readonly wert: string
  readonly feminineVariante: string | null | undefined
  readonly istRufname: boolean
  neueId: string | undefined
}

function zielId(ziel: Ziel): string | undefined {
  return ziel.vorher?.id ?? ziel.neueId
}

/**
 * Ist der Zielwert gleich dem gespeicherten (ein unveränderter Altbestandswert bleibt, E4)? Gleich, wenn der
 * getrimmte Zielwert dem UNGETRIMMTEN gespeicherten Wert gleicht (ungetrimmter Altbestand „Gutnoff " wird bei
 * einer Bereinigung also geschrieben), oder wenn beide leer bzw. nur Leerraum sind (U-130-11-0b-leerraum-teil:
 * ein Leerraum-Teil aus der flachen Brücke, etwa Vatersname `' '`, ist im Modal schon leer — ihn zu „leeren"
 * ändert nichts, sonst verletzte ein unveränderter Aufruf den No-op, AP-0.22).
 */
function wertUnveraendert(roh: string, vorher: NamePartZeile): boolean {
  const wert = roh.trim()
  return wert === vorher.wert || (wert === '' && vorher.wert.trim() === '')
}

/** Normiert und prüft die Zielliste gegen die gespeicherten Teile — wirft vor jedem Schreibvorgang. Die
 * Prüfungen von ID und Art laufen für JEDEN Eintrag mit ID, auch für einen leeren (U-130-11-0b-leerraum-teil). */
function zieleBilden(ein: NamensformUebernehmenEin, gespeichert: readonly NamePartZeile[]): readonly Ziel[] {
  const nachId = new Map(gespeichert.map((teil) => [teil.id, teil] as const))
  const ziele: Ziel[] = []
  for (const teil of ein.teile) {
    let vorher: NamePartZeile | undefined
    if (teil.id !== undefined) {
      vorher = nachId.get(teil.id)
      if (vorher === undefined) {
        throw new WurzelFehler('NICHT_GEFUNDEN_NAMENSTEIL')
      }
      if (vorher.art !== teil.art) {
        throw new WurzelFehler('VALIDIERUNG_NAMENSTEIL_ART_ABWEICHEND')
      }
    }
    const unveraendert = vorher !== undefined && wertUnveraendert(teil.wert, vorher)
    // Leer und nicht unverändert: ein neuer leerer Eintrag wird verworfen, ein geleerter bestehender entfällt.
    if (!unveraendert && teil.wert.trim() === '') continue
    // E2/E4: geprüft wird nur ein neuer oder geänderter Wert; ein unveränderter Altbestandswert bleibt.
    const wert = unveraendert && vorher !== undefined ? vorher.wert : namensteilWertPruefen(teil.art, teil.wert)
    if (teil.istRufname && teil.art !== 'vorname') {
      throw new WurzelFehler('VALIDIERUNG_RUFNAME_KEIN_VORNAME')
    }
    ziele.push({ vorher, art: teil.art, wert, feminineVariante: teil.feminineVariante, istRufname: teil.istRufname, neueId: undefined })
  }
  return ziele
}

/** Kopf einer NEUEN Form: `null` heißt dort „nicht gesetzt". `rolle` ist per Schema vorhanden. `originalText`
 * fehlt bewusst — er kommt erst in Schritt 6, nach den Teilen (FTS-Trigger, `mitOriginalTextNachfuehrung`). */
function anlegenEin(personId: string, kopf: NamensformUebernehmenKopf): NamensformAnlegenEin {
  return {
    personId,
    rolle: kopf.rolle ?? null,
    rollenNotiz: kopf.rollenNotiz ?? undefined,
    sprache: kopf.sprache ?? undefined,
    schrift: kopf.schrift ?? undefined,
    reihenfolge: kopf.reihenfolge ?? undefined,
    umschriftVon: kopf.umschriftVon ?? undefined,
    umschriftNorm: kopf.umschriftNorm ?? undefined,
    konfidenz: kopf.konfidenz ?? undefined,
    gueltigVon: kopf.gueltigVon ?? undefined,
    gueltigBis: kopf.gueltigBis ?? undefined,
  }
}

/** Schritt 6: nur die gegenüber `vorher` (Stand vor dem Befehl bzw. nach den Teilen bei einer neuen Form)
 * geänderten Kopf-Felder an `namensformAendern`. Bei einer bestehenden Form ist `vorher` der Stand VOR dem
 * Befehl; das ist nur richtig, weil die Teilschritte mit `OHNE_NACHFUEHRUNG` die Form-Zeile nicht anfassen —
 * sie ist nach Schritt 5 unverändert. */
function kopfUebernehmen(tx: Tx, vorher: NameFormZeile, kopf: NamensformUebernehmenKopf): void {
  const felder = namensformGeaenderteFelder(vorher, { id: vorher.id, ...kopf })
  if (felder.length === 0) return
  const nur = <T>(feld: (typeof felder)[number], wert: T): T | undefined => (felder.includes(feld) ? wert : undefined)
  namensformAendern(tx, {
    id: vorher.id,
    rolle: nur('rolle', kopf.rolle),
    rollenNotiz: nur('rollenNotiz', kopf.rollenNotiz),
    sprache: nur('sprache', kopf.sprache),
    schrift: nur('schrift', kopf.schrift),
    reihenfolge: nur('reihenfolge', kopf.reihenfolge),
    umschriftVon: nur('umschriftVon', kopf.umschriftVon),
    umschriftNorm: nur('umschriftNorm', kopf.umschriftNorm),
    konfidenz: nur('konfidenz', kopf.konfidenz),
    gueltigVon: nur('gueltigVon', kopf.gueltigVon),
    gueltigBis: nur('gueltigBis', kopf.gueltigBis),
    originalText: nur('originalText', kopf.originalText),
  })
}

/** Schritt 4 für eine Art: Rang für Rang einfügen bzw. heranholen. */
function artEinordnen(tx: Tx, formId: string, art: Ziel['art'], ziele: readonly Ziel[]): void {
  ziele.forEach((ziel, rang) => {
    if (ziel.vorher === undefined) {
      const feminineVariante = ziel.feminineVariante ?? undefined
      ziel.neueId = namensteilAnlegen(tx, { namensformId: formId, art, wert: ziel.wert, feminineVariante, position: rang }, OHNE_NACHFUEHRUNG).id
      return
    }
    const id = ziel.vorher.id
    const stelle = namePartRepo.teileDerArt(tx, formId, art).findIndex((teil) => teil.id === id)
    if (stelle < rang) {
      // Unerreichbar: Ränge 0 … rang−1 tragen schon die vorigen Ziele, der Teil ist keines davon.
      throw new WurzelFehler('INTERN_UNERWARTET', 'namensform.uebernehmen: Teil steht vor seinem Zielrang.')
    }
    if (stelle !== rang) namensteilVerschieben(tx, { id, position: rang }, OHNE_NACHFUEHRUNG)
  })
}

export function namensformUebernehmen(tx: Tx, ein: NamensformUebernehmenEin): { readonly id: string } {
  let vorher: NameFormZeile | undefined
  if (ein.formId !== null) {
    vorher = nameFormRepo.lesen(tx, ein.formId)
    if (vorher === undefined || vorher.person_id !== ein.personId) {
      throw new WurzelFehler('NICHT_GEFUNDEN_NAME')
    }
  }
  const gespeichert = vorher === undefined ? [] : namePartRepo.teileFuerForm(tx, vorher.id)
  const ziele = zieleBilden(ein, gespeichert)
  if (vorher !== undefined) namensformAenderungPruefen(tx, vorher, { id: vorher.id, ...ein.kopf })
  // E3: einmal für den ganzen Aufruf, am Stand VOR dem ersten Schreibvorgang (neue Form: `NULL` folgt).
  const folgtDenTeilen = vorher === undefined || originalTextFolgtDenTeilen(tx, vorher)
  // Vergleichsstand für Schritt 6: neu montiert wird nur, wenn sich die Montage der Teile ändert (Review #205).
  const montageVorher = vorher === undefined ? undefined : montageDerTeile(tx, vorher.id)

  // 1. neue Form
  const formId = vorher?.id ?? namensformAnlegen(tx, anlegenEin(ein.personId, ein.kopf)).id

  // 2. entfallene Teile
  const behalten = new Set(ziele.flatMap((ziel) => (ziel.vorher === undefined ? [] : [ziel.vorher.id])))
  for (const teil of gespeichert) {
    if (!behalten.has(teil.id)) namensteilLoeschen(tx, { id: teil.id }, OHNE_NACHFUEHRUNG)
  }

  // 3. geänderte Werte/Varianten — nur bei einem Unterschied aufrufen
  for (const ziel of ziele) {
    if (ziel.vorher === undefined) continue
    // Ein unveränderter Wert geht nicht mit: `namensteilGeaenderteFelder` vergleicht getrimmt und hielte einen
    // gespeicherten Leerraum-Teil (`' '`) sonst für geändert (U-130-11-0b-leerraum-teil).
    const wert = ziel.wert === ziel.vorher.wert ? undefined : ziel.wert
    const aendern = { id: ziel.vorher.id, wert, feminineVariante: ziel.feminineVariante }
    if (namensteilGeaenderteFelder(ziel.vorher, aendern).length > 0) namensteilAendern(tx, aendern, OHNE_NACHFUEHRUNG)
  }

  // 4. je Art einordnen (Arten in der Folge ihres ersten Auftretens)
  const arten = [...new Set(ziele.map((ziel) => ziel.art))]
  for (const art of arten) {
    artEinordnen(
      tx,
      formId,
      art,
      ziele.filter((ziel) => ziel.art === art),
    )
  }

  // 5. Rufname
  const zielRufname = ziele.find((ziel) => ziel.istRufname)
  const neuerRufname = zielRufname === undefined ? null : (zielId(zielRufname) ?? null)
  const alterRufname = namePartRepo.teileDerArt(tx, formId, 'vorname').find((teil) => teil.ist_rufname === 1)?.id ?? null
  if (neuerRufname !== alterRufname) namensformRufnameSetzen(tx, { namensformId: formId, namensteilId: neuerRufname }, OHNE_NACHFUEHRUNG)

  // 6. Kopf nach den Teilen (`basis`: Stand vor dem Befehl bzw. die gerade angelegte Form)
  const basis = vorher ?? nameFormRepo.lesen(tx, formId)
  if (basis === undefined) {
    // Unerreichbar: die Form wurde in Schritt 1 in dieser Transaktion angelegt.
    throw new WurzelFehler('INTERN_UNERWARTET', 'namensform.uebernehmen: neue Form fehlt.')
  }
  const mitgeschickt = ein.kopf.originalText
  const montageNachher = montageDerTeile(tx, formId)
  // Neue Form: `montageVorher` ist `undefined`, also immer „geändert" (montiert wie bisher; No-op über `kopfUebernehmen`).
  // Dritte Bedingung (neben `folgtDenTeilen` und dem Montage-Vergleich; Nachreview #205): `basis` trägt noch den alten Text, `tx` liest die neuen Teile — würde der
  // Text nach den Teilen nicht mehr als Montage erkannt (Rufname verschoben/entfernt bei gleicher Montage), gälte
  // er fortan als wortgetreu und folgte nie wieder; dann wird ebenfalls neu montiert.
  const neuMontieren = folgtDenTeilen && (montageNachher !== montageVorher || !originalTextFolgtDenTeilen(tx, basis))
  const originalText = mitgeschickt !== undefined && mitgeschickt !== basis.original_text ? mitgeschickt : neuMontieren ? montageNachher : undefined
  kopfUebernehmen(tx, basis, vorher === undefined ? { originalText } : { ...ein.kopf, originalText })

  // 7. Hauptname
  if (ein.hauptname === true && nameFormRepo.lesen(tx, formId)?.ist_bevorzugt !== 1) {
    const alt = nameFormRepo.formenFuerPerson(tx, ein.personId).find((form) => form.ist_bevorzugt === 1)
    if (alt === undefined) {
      // Unerreichbar: eine Person mit Formen hat immer genau eine bevorzugte (Constraint-Trigger, 0006).
      throw new WurzelFehler('INTERN_UNERWARTET', 'namensform.uebernehmen: Person ohne bevorzugte Namensform.')
    }
    hauptnameWechseln(tx, { personId: ein.personId, alt: alt.id, neu: formId })
  }
  return { id: formId }
}
