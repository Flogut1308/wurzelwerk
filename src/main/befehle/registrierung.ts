// AP-0.9, 55_Architektur.md §4 (Befehlsbus): die feste Registrierung aller `befehl:`-Namen auf
// ihre Zod-Schemata, `transaktion.art` und Handler. `src/main/befehle/bus.ts` ist die einzige
// Stelle, die hier nachschlägt.
//
// `BefehlKarte` (Ein/Aus je Befehlsname) spiegelt bewusst den Aufbau von
// `src/shared/ipc/vertrag.ts` (`Vertrag`/`Kanal`/`Ein`/`Aus`) - dieselbe Typkarten-Technik, hier
// für Befehlsnamen statt IPC-Kanalnamen. `BefehlDef<Ein, Aus>` ist bewusst über freie Ein-/Aus-
// Typparameter definiert statt über den Befehlsnamen selbst: so bleibt es der allgemeine
// Ausführungsvertrag, den `bus.ts` seiner generischen Engine (`fuehreAusDef`) zugrunde legt - die
// Engine kennt `REGISTRIERUNG`/`BefehlName` gar nicht, sondern nur einen beliebigen `BefehlDef`.
// `test/einheit/befehl-bus.test.ts` nutzt genau das, um für die Bus-Mechanik selbst (leere
// Transaktion verwerfen, werfender Handler, Verschachtelung) einen kleinen Test-Befehl zu
// injizieren, ohne eine zweite Registrierungs-API im Produktivcode zu brauchen.
import { z } from 'zod'
import {
  personAnlegenEinSchema,
  personFeldSetzenEinSchema,
  personLoeschenEinSchema,
  type PersonAnlegenEin,
  type PersonFeldSetzenEin,
  type PersonLoeschenEin,
} from '../../shared/schemata/befehle'
import { personAnlegen } from './person-anlegen'
import { personFeldSetzen } from './person-feld-setzen'
import { personLoeschen } from './person-loeschen'
import type { TransaktionArt } from '../repositories/journal-repo'
import type { Tx } from '../repositories/basis'

/** Der allgemeine Ausführungsvertrag eines Befehls — unabhängig von einem konkreten Namen. */
export interface BefehlDef<Ein, Aus> {
  readonly schema: z.ZodType<Ein>
  readonly art: TransaktionArt
  readonly beschreibung: (ein: Ein) => string
  readonly handler: (tx: Tx, ein: Ein) => Aus
}

interface BefehlKarte {
  'person.anlegen': { ein: PersonAnlegenEin; aus: { readonly id: string } }
  'person.feldSetzen': { ein: PersonFeldSetzenEin; aus: null }
  'person.loeschen': { ein: PersonLoeschenEin; aus: null }
}

export type BefehlName = keyof BefehlKarte
export type BefehlEin<N extends BefehlName> = BefehlKarte[N]['ein']
export type BefehlAus<N extends BefehlName> = BefehlKarte[N]['aus']

/** Alle drei Befehle aus AP-0.9 laufen als `art: 'nutzer'` (Nutzeraktion im laufenden Betrieb). */
export const REGISTRIERUNG: { readonly [N in BefehlName]: BefehlDef<BefehlEin<N>, BefehlAus<N>> } = {
  'person.anlegen': {
    schema: personAnlegenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.person_angelegt',
    handler: personAnlegen,
  },
  'person.feldSetzen': {
    schema: personFeldSetzenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.person_feld_gesetzt',
    handler: personFeldSetzen,
  },
  'person.loeschen': {
    schema: personLoeschenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.person_geloescht',
    handler: personLoeschen,
  },
}
