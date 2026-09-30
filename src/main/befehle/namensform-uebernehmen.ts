// AP-1.30 PR 11-0 (A-02, A-19; docs/80 §33 V-130-11-E1, V-130-11-E4, V-130-11-0): Handler für
// `namensform.uebernehmen` — schreibt das Modal „Namensform bearbeiten" beim Übernehmen. Läuft in der vom
// Befehlsbus bereits geöffneten und armierten Transaktion (CLAUDE.md §2: kein `BEGIN`/`COMMIT` hier).
//
// Keine zweite Schreiblogik und kein eigenes SQL: der Handler vergleicht Zielliste und Kopf mit dem
// gespeicherten Stand und ruft nur die granularen Befehlsfunktionen (`namensformAnlegen`/`Aendern`,
// `namensteilLoeschen`/`Aendern`/`Anlegen`/`Verschieben`, `namensformRufnameSetzen`, `hauptnameWechseln`) auf —
// je mit ihren eigenen Prüfungen, ihrer E1-sicheren Schrittfolge und ihrer `original_text`-Nachführung (E3).
//
// Ein Undo-Schritt: alle Einzelschritte schreiben in DIESELBE Bus-Transaktion (eine `transaktion_id`); der
// Befehl hat bewusst keinen Koaleszenzschlüssel (kein Autosave). No-op (AP-0.22): jede aufgerufene Funktion
// wird nur bei einem tatsächlichen Unterschied aufgerufen (bzw. ist selbst ein No-op) — ein unveränderter
// Aufruf schreibt nichts, und der Bus verwirft die leere Transaktion.
//
// Prüfen VOR dem ersten Schreiben: fremde/unbekannte Teil-ID, bestehende Teil-ID mit anderer Art
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
//      Befehl ändern, bei einer neuen Form nur ein gesetzter `originalText`. So gewinnt ein ausdrücklich
//      gesetzter bzw. geänderter `originalText` über die Nachführung aus Schritt 2–5 (auch wenn er zufällig
//      wie eine Montage der ersten Teile aussieht), ein unverändert mitgeschickter setzt sie nicht zurück;
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
import { namensteilWertPruefen } from './namensteil-hilfen'
import { namensteilLoeschen } from './namensteil-loeschen'
import { namensteilVerschieben } from './namensteil-verschieben'

/** Ein geprüfter, nicht leerer Eintrag der Zielliste. `vorher` ist der gespeicherte Teil (gleiche ID und Art)
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

/** Normiert und prüft die Zielliste gegen die gespeicherten Teile — wirft vor jedem Schreibvorgang. */
function zieleBilden(ein: NamensformUebernehmenEin, gespeichert: readonly NamePartZeile[]): readonly Ziel[] {
  const nachId = new Map(gespeichert.map((teil) => [teil.id, teil] as const))
  const ziele: Ziel[] = []
  for (const teil of ein.teile) {
    if (teil.wert.trim() === '') continue
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
    // E2/E4: geprüft wird nur ein neuer oder geänderter Wert; ein unveränderter Altbestandswert bleibt.
    const wert = vorher !== undefined && teil.wert.trim() === vorher.wert ? vorher.wert : namensteilWertPruefen(teil.art, teil.wert)
    if (teil.istRufname && teil.art !== 'vorname') {
      throw new WurzelFehler('VALIDIERUNG_RUFNAME_KEIN_VORNAME')
    }
    ziele.push({ vorher, art: teil.art, wert, feminineVariante: teil.feminineVariante, istRufname: teil.istRufname, neueId: undefined })
  }
  return ziele
}

/** Kopf einer NEUEN Form: `null` heißt dort „nicht gesetzt". `rolle` ist per Schema vorhanden. `originalText`
 * fehlt bewusst — er kommt erst in Schritt 6, nach den Teilen (sonst montierte ihn die Nachführung neu). */
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
 * geänderten Kopf-Felder an `namensformAendern`. */
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
      ziel.neueId = namensteilAnlegen(tx, { namensformId: formId, art, wert: ziel.wert, feminineVariante, position: rang }).id
      return
    }
    const id = ziel.vorher.id
    const stelle = namePartRepo.teileDerArt(tx, formId, art).findIndex((teil) => teil.id === id)
    if (stelle < rang) {
      // Unerreichbar: Ränge 0 … rang−1 tragen schon die vorigen Ziele, der Teil ist keines davon.
      throw new WurzelFehler('INTERN_UNERWARTET', 'namensform.uebernehmen: Teil steht vor seinem Zielrang.')
    }
    if (stelle !== rang) namensteilVerschieben(tx, { id, position: rang })
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

  // 1. neue Form
  const formId = vorher?.id ?? namensformAnlegen(tx, anlegenEin(ein.personId, ein.kopf)).id

  // 2. entfallene Teile
  const behalten = new Set(ziele.flatMap((ziel) => (ziel.vorher === undefined ? [] : [ziel.vorher.id])))
  for (const teil of gespeichert) {
    if (!behalten.has(teil.id)) namensteilLoeschen(tx, { id: teil.id })
  }

  // 3. geänderte Werte/Varianten — nur bei einem Unterschied aufrufen
  for (const ziel of ziele) {
    if (ziel.vorher === undefined) continue
    const aendern = { id: ziel.vorher.id, wert: ziel.wert, feminineVariante: ziel.feminineVariante }
    if (namensteilGeaenderteFelder(ziel.vorher, aendern).length > 0) namensteilAendern(tx, aendern)
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
  if (neuerRufname !== alterRufname) namensformRufnameSetzen(tx, { namensformId: formId, namensteilId: neuerRufname })

  // 6. Kopf nach den Teilen
  if (vorher !== undefined) {
    kopfUebernehmen(tx, vorher, ein.kopf)
  } else if (ein.kopf.originalText !== undefined && ein.kopf.originalText !== null) {
    const neu = nameFormRepo.lesen(tx, formId)
    if (neu === undefined) {
      // Unerreichbar: die Form wurde in Schritt 1 in dieser Transaktion angelegt.
      throw new WurzelFehler('INTERN_UNERWARTET', 'namensform.uebernehmen: neue Form fehlt.')
    }
    kopfUebernehmen(tx, neu, { originalText: ein.kopf.originalText })
  }

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
