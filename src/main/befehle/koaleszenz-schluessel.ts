// AP-1.30 (PR 4), docs/architektur.md §4.8: die Koaleszenzschlüssel der Autosave-Befehle
// (`src/shared/autosave.ts::AUTOSAVE_BEFEHLE`). Ein Schlüssel hat immer die Form
// `Befehl:Subjekt:Feld` — so fasst `src/main/journal/koaleszenz.ts` nur schnelle Folgeänderungen
// AM SELBEN FELD DESSELBEN DATENSATZES durch DENSELBEN BEFEHL zu einem Undo-Schritt zusammen.
//
// WO und WANN der Schlüssel entsteht (eine Stelle): der Bus (`bus.ts::fuehreAusDef`) ruft die
// Schlüsselfunktion INNERHALB der Transaktion, VOR dem Handler. Nur dort sieht sie beides — die
// Nutzlast UND den gespeicherten Stand (`vorher`), gegen den sie prüft, ob sich wirklich nur das
// genannte Feld ändert. Vor der Transaktion wäre der Stand nicht gegen gleichzeitige Schreiber
// gesichert, nach dem Handler wäre `vorher` überschrieben (nur noch aus dem Journal rekonstruierbar,
// bei `name.aendern` über gelöschte und neu angelegte Bestandteile hinweg). Die Funktionen hier
// lesen nur (Repositories), schreiben nie und werfen nicht: fehlt der Datensatz, gibt es keinen
// Schlüssel — den Fehler meldet danach der Handler.
//
// Den Vergleich selbst liefern die Handler-Module (`<befehl>GeaenderteFelder`) — derselbe Vergleich,
// der dort über den No-op entscheidet; eine zweite Kopie hier könnte auseinanderlaufen.
import type {
  AussageAendernEin,
  ElternschaftAendernEin,
  EreignisAendernEin,
  NameAendernEin,
  NameAendernFeld,
  PartnerschaftAendernEin,
  PersonFeldSetzenEin,
} from '../../shared/schemata/befehle'
import type { Tx } from '../repositories/basis'
import * as aussageRepo from '../repositories/aussage-repo'
import * as beziehungRepo from '../repositories/beziehung-repo'
import * as ereignisRepo from '../repositories/ereignis-repo'
import * as nameRepo from '../repositories/name-repo'
import { aussageGeaenderteFelder } from './aussage-aendern'
import { elternschaftGeaenderteFelder } from './elternschaft-aendern'
import { ereignisGeaenderteFelder } from './ereignis-aendern'
import { nameGeaenderteFelder } from './name-aendern'
import { partnerschaftGeaenderteFelder } from './partnerschaft-aendern'

/**
 * `Befehl:Subjekt:Feld`, wenn `feld` gesetzt ist und sich gegenüber dem gespeicherten Stand GENAU
 * die Felder aus `erlaubt` (mindestens eines) ändern — sonst `null` (keine Koaleszenz). Eine
 * leere Änderungsliste ist ebenfalls `null`: ein No-op wird vom Bus ohnehin verworfen.
 */
function schluesselBeiEinemFeld<F extends string>(
  befehl: string,
  subjektId: string,
  feld: F | undefined,
  geaendert: readonly F[] | undefined,
  erlaubt: (feld: F) => readonly F[] = (f) => [f],
): string | null {
  if (feld === undefined || geaendert === undefined || geaendert.length === 0) return null
  const zulaessig = erlaubt(feld)
  return geaendert.every((f) => zulaessig.includes(f)) ? `${befehl}:${subjektId}:${feld}` : null
}

/** `person.feldSetzen` ändert je Aufruf genau eine Spalte — der Schlüssel folgt direkt aus der Nutzlast. */
export function personFeldSetzenSchluessel(_tx: Tx, ein: PersonFeldSetzenEin): string {
  return `person.feldSetzen:${ein.id}:${ein.feld}`
}

/** `rufnameIndex`/`rufnameText` sind zwei Sichten auf dasselbe `ist_rufname` eines Vornamens —
 * ein Rufnamenwechsel ändert in der flachen Sicht immer beide. Jedes andere Feld steht für sich
 * (auch `vornamen`: verschiebt sich dabei der Rufname mit, sind es zwei Änderungen). */
function nameErlaubt(feld: NameAendernFeld): readonly NameAendernFeld[] {
  if (feld === 'rufnameIndex' || feld === 'rufnameText') return ['rufnameIndex', 'rufnameText']
  return [feld]
}

export function nameAendernSchluessel(tx: Tx, ein: NameAendernEin): string | null {
  if (ein.feld === undefined) return null
  const vorher = nameRepo.lesen(tx, ein.id)
  return schluesselBeiEinemFeld('name.aendern', ein.id, ein.feld, vorher === undefined ? undefined : nameGeaenderteFelder(vorher, ein), nameErlaubt)
}

export function ereignisAendernSchluessel(tx: Tx, ein: EreignisAendernEin): string | null {
  if (ein.feld === undefined) return null
  const vorher = ereignisRepo.lesen(tx, ein.id)
  return schluesselBeiEinemFeld('ereignis.aendern', ein.id, ein.feld, vorher === undefined ? undefined : ereignisGeaenderteFelder(vorher, ein))
}

export function partnerschaftAendernSchluessel(tx: Tx, ein: PartnerschaftAendernEin): string | null {
  if (ein.feld === undefined) return null
  const vorher = beziehungRepo.partnerschaftLesen(tx, ein.id)
  return schluesselBeiEinemFeld('partnerschaft.aendern', ein.id, ein.feld, vorher === undefined ? undefined : partnerschaftGeaenderteFelder(vorher, ein))
}

export function elternschaftAendernSchluessel(tx: Tx, ein: ElternschaftAendernEin): string | null {
  if (ein.feld === undefined) return null
  const vorher = beziehungRepo.elternschaftLesen(tx, ein.id)
  return schluesselBeiEinemFeld('elternschaft.aendern', ein.id, ein.feld, vorher === undefined ? undefined : elternschaftGeaenderteFelder(vorher, ein))
}

export function aussageAendernSchluessel(tx: Tx, ein: AussageAendernEin): string | null {
  if (ein.feld === undefined) return null
  const vorher = aussageRepo.lesen(tx, ein.id)
  return schluesselBeiEinemFeld('aussage.aendern', ein.id, ein.feld, vorher === undefined ? undefined : aussageGeaenderteFelder(vorher, ein))
}
