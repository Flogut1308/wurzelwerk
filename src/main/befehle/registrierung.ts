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
  nameAnlegenEinSchema,
  nameAendernEinSchema,
  nameLoeschenEinSchema,
  hauptnameWechselnEinSchema,
  type NameAnlegenEin,
  type NameAendernEin,
  type NameLoeschenEin,
  type HauptnameWechselnEin,
  elternschaftAnlegenEinSchema,
  elternschaftAendernEinSchema,
  elternschaftLoeschenEinSchema,
  type ElternschaftAnlegenEin,
  type ElternschaftAendernEin,
  type ElternschaftLoeschenEin,
  partnerschaftAnlegenEinSchema,
  partnerschaftAendernEinSchema,
  partnerschaftLoeschenEinSchema,
  type PartnerschaftAnlegenEin,
  type PartnerschaftAendernEin,
  type PartnerschaftLoeschenEin,
  ereignisAnlegenEinSchema,
  ereignisAendernEinSchema,
  ereignisLoeschenEinSchema,
  type EreignisAnlegenEin,
  type EreignisAendernEin,
  type EreignisLoeschenEin,
  beteiligungLoeschenEinSchema,
  type BeteiligungLoeschenEin,
  aussageAnlegenEinSchema,
  aussageAendernEinSchema,
  aussageLoeschenEinSchema,
  type AussageAnlegenEin,
  type AussageAendernEin,
  type AussageLoeschenEin,
  aussageZitatAnlegenEinSchema,
  aussageZitatLoeschenEinSchema,
  type AussageZitatAnlegenEin,
  type AussageZitatLoeschenEin,
  ortAnlegenEinSchema,
  type OrtAnlegenEin,
  ortAendernEinSchema,
  type OrtAendernEin,
  ortsnameAnlegenEinSchema,
  ortsnameAendernEinSchema,
  ortsnameLoeschenEinSchema,
  type OrtsnameAnlegenEin,
  type OrtsnameAendernEin,
  type OrtsnameLoeschenEin,
  ortszugehoerigkeitAnlegenEinSchema,
  ortszugehoerigkeitAendernEinSchema,
  ortszugehoerigkeitLoeschenEinSchema,
  type OrtszugehoerigkeitAnlegenEin,
  type OrtszugehoerigkeitAendernEin,
  type OrtszugehoerigkeitLoeschenEin,
  ortExterneIdAnlegenEinSchema,
  ortExterneIdLoeschenEinSchema,
  type OrtExterneIdAnlegenEin,
  type OrtExterneIdLoeschenEin,
  archivAnlegenEinSchema,
  archivAendernEinSchema,
  type ArchivAnlegenEin,
  type ArchivAendernEin,
  quelleAnlegenEinSchema,
  quelleAendernEinSchema,
  type QuelleAnlegenEin,
  type QuelleAendernEin,
  zitatAnlegenEinSchema,
  zitatAendernEinSchema,
  zitatLoeschenEinSchema,
  type ZitatAnlegenEin,
  type ZitatAendernEin,
  type ZitatLoeschenEin,
  negativbefundAnlegenEinSchema,
  negativbefundAendernEinSchema,
  negativbefundLoeschenEinSchema,
  type NegativbefundAnlegenEin,
  type NegativbefundAendernEin,
  type NegativbefundLoeschenEin,
} from '../../shared/schemata/befehle'
import { personAnlegen } from './person-anlegen'
import { personFeldSetzen } from './person-feld-setzen'
import { personLoeschen } from './person-loeschen'
import { nameAnlegen } from './name-anlegen'
import { nameAendern } from './name-aendern'
import { nameLoeschen } from './name-loeschen'
import { hauptnameWechseln } from './hauptname-wechseln'
import { elternschaftAnlegen } from './elternschaft-anlegen'
import { elternschaftAendern } from './elternschaft-aendern'
import { elternschaftLoeschen } from './elternschaft-loeschen'
import { partnerschaftAnlegen } from './partnerschaft-anlegen'
import { partnerschaftAendern } from './partnerschaft-aendern'
import { partnerschaftLoeschen } from './partnerschaft-loeschen'
import { ereignisAnlegen } from './ereignis-anlegen'
import { ereignisAendern } from './ereignis-aendern'
import { ereignisLoeschen } from './ereignis-loeschen'
import { beteiligungLoeschen } from './beteiligung-loeschen'
import { aussageAnlegen } from './aussage-anlegen'
import { aussageAendern } from './aussage-aendern'
import { aussageLoeschen } from './aussage-loeschen'
import { aussageZitatAnlegen } from './aussage-zitat-anlegen'
import { aussageZitatLoeschen } from './aussage-zitat-loeschen'
import { ortAnlegen } from './ort-anlegen'
import { ortAendern } from './ort-aendern'
import { ortsnameAnlegen } from './ortsname-anlegen'
import { ortsnameAendern } from './ortsname-aendern'
import { ortsnameLoeschen } from './ortsname-loeschen'
import { ortszugehoerigkeitAnlegen } from './ortszugehoerigkeit-anlegen'
import { ortszugehoerigkeitAendern } from './ortszugehoerigkeit-aendern'
import { ortszugehoerigkeitLoeschen } from './ortszugehoerigkeit-loeschen'
import { ortExterneIdAnlegen } from './ort-externe-id-anlegen'
import { ortExterneIdLoeschen } from './ort-externe-id-loeschen'
import { archivAnlegen } from './archiv-anlegen'
import { archivAendern } from './archiv-aendern'
import { quelleAnlegen } from './quelle-anlegen'
import { quelleAendern } from './quelle-aendern'
import { zitatAnlegen } from './zitat-anlegen'
import { zitatAendern } from './zitat-aendern'
import { zitatLoeschen } from './zitat-loeschen'
import { negativbefundAnlegen } from './negativbefund-anlegen'
import { negativbefundAendern } from './negativbefund-aendern'
import { negativbefundLoeschen } from './negativbefund-loeschen'
import type { TransaktionArt } from '../repositories/journal-repo'
import type { Tx } from '../repositories/basis'

/** Der allgemeine Ausführungsvertrag eines Befehls — unabhängig von einem konkreten Namen. */
export interface BefehlDef<Ein, Aus> {
  readonly schema: z.ZodType<Ein>
  readonly art: TransaktionArt
  readonly beschreibung: (ein: Ein) => string
  readonly handler: (tx: Tx, ein: Ein) => Aus
  /**
   * Koaleszenz-Schlüssel (55_Architektur.md §4.8, AP-0.15): liefert `null`, wenn dieser Aufruf
   * NIE mit einer vorangehenden Transaktion zusammengefasst werden darf (Default bei Fehlen),
   * sonst einen Schlüssel, der über mehrere schnelle Aufrufe hinweg identisch bleibt (z. B.
   * `person:<id>:notiz`) - `src/main/journal/koaleszenz.ts` entscheidet anhand dieses Schlüssels
   * plus Zeitfenster, ob ein Merge stattfindet.
   */
  readonly koaleszenzSchluessel?: (ein: Ein) => string | null
}

interface BefehlKarte {
  'person.anlegen': { ein: PersonAnlegenEin; aus: { readonly id: string } }
  'person.feldSetzen': { ein: PersonFeldSetzenEin; aus: null }
  'person.loeschen': { ein: PersonLoeschenEin; aus: null }
  'name.anlegen': { ein: NameAnlegenEin; aus: { readonly id: string } }
  'name.aendern': { ein: NameAendernEin; aus: null }
  'name.loeschen': { ein: NameLoeschenEin; aus: null }
  'hauptname.wechseln': { ein: HauptnameWechselnEin; aus: null }
  'elternschaft.anlegen': { ein: ElternschaftAnlegenEin; aus: { readonly id: string } }
  'elternschaft.aendern': { ein: ElternschaftAendernEin; aus: null }
  'elternschaft.loeschen': { ein: ElternschaftLoeschenEin; aus: null }
  'partnerschaft.anlegen': { ein: PartnerschaftAnlegenEin; aus: { readonly id: string } }
  'partnerschaft.aendern': { ein: PartnerschaftAendernEin; aus: null }
  'partnerschaft.loeschen': { ein: PartnerschaftLoeschenEin; aus: null }
  'ereignis.anlegen': { ein: EreignisAnlegenEin; aus: { readonly id: string } }
  'ereignis.aendern': { ein: EreignisAendernEin; aus: null }
  'ereignis.loeschen': { ein: EreignisLoeschenEin; aus: null }
  'beteiligung.loeschen': { ein: BeteiligungLoeschenEin; aus: null }
  'aussage.anlegen': { ein: AussageAnlegenEin; aus: { readonly id: string } }
  'aussage.aendern': { ein: AussageAendernEin; aus: null }
  'aussage.loeschen': { ein: AussageLoeschenEin; aus: null }
  'aussage_zitat.anlegen': { ein: AussageZitatAnlegenEin; aus: null }
  'aussage_zitat.loeschen': { ein: AussageZitatLoeschenEin; aus: null }
  'ort.anlegen': { ein: OrtAnlegenEin; aus: { readonly id: string } }
  'ort.aendern': { ein: OrtAendernEin; aus: null }
  'ortsname.anlegen': { ein: OrtsnameAnlegenEin; aus: { readonly id: string } }
  'ortsname.aendern': { ein: OrtsnameAendernEin; aus: null }
  'ortsname.loeschen': { ein: OrtsnameLoeschenEin; aus: null }
  'ortszugehoerigkeit.anlegen': { ein: OrtszugehoerigkeitAnlegenEin; aus: { readonly id: string } }
  'ortszugehoerigkeit.aendern': { ein: OrtszugehoerigkeitAendernEin; aus: null }
  'ortszugehoerigkeit.loeschen': { ein: OrtszugehoerigkeitLoeschenEin; aus: null }
  'ort-externe-id.anlegen': { ein: OrtExterneIdAnlegenEin; aus: null }
  'ort-externe-id.loeschen': { ein: OrtExterneIdLoeschenEin; aus: null }
  'archiv.anlegen': { ein: ArchivAnlegenEin; aus: { readonly id: string } }
  'archiv.aendern': { ein: ArchivAendernEin; aus: null }
  'quelle.anlegen': { ein: QuelleAnlegenEin; aus: { readonly id: string } }
  'quelle.aendern': { ein: QuelleAendernEin; aus: null }
  'zitat.anlegen': { ein: ZitatAnlegenEin; aus: { readonly id: string } }
  'zitat.aendern': { ein: ZitatAendernEin; aus: null }
  'zitat.loeschen': { ein: ZitatLoeschenEin; aus: null }
  'negativbefund.anlegen': { ein: NegativbefundAnlegenEin; aus: { readonly id: string } }
  'negativbefund.aendern': { ein: NegativbefundAendernEin; aus: null }
  'negativbefund.loeschen': { ein: NegativbefundLoeschenEin; aus: null }
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
    // 55_Architektur.md §4.8, AP-0.15: nur `notiz` bekommt einen Koaleszenz-Schlüssel - mehrere
    // schnelle Notiz-Änderungen an derselben Person verdichten sich zu einem Undo-Schritt. Andere
    // Felder (geschlecht, privat, ...) sind seltene Einzelaktionen, keine Tastatureingaben.
    koaleszenzSchluessel: (ein) => (ein.feld === 'notiz' ? `person:${ein.id}:notiz` : null),
  },
  'person.loeschen': {
    schema: personLoeschenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.person_geloescht',
    handler: personLoeschen,
  },
  'name.anlegen': {
    schema: nameAnlegenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.name_angelegt',
    handler: nameAnlegen,
  },
  'name.aendern': {
    schema: nameAendernEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.name_geaendert',
    handler: nameAendern,
  },
  'name.loeschen': {
    schema: nameLoeschenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.name_geloescht',
    handler: nameLoeschen,
  },
  'hauptname.wechseln': {
    schema: hauptnameWechselnEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.hauptname_gewechselt',
    handler: hauptnameWechseln,
  },
  'elternschaft.anlegen': {
    schema: elternschaftAnlegenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.elternschaft_angelegt',
    handler: elternschaftAnlegen,
  },
  'elternschaft.aendern': {
    schema: elternschaftAendernEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.elternschaft_geaendert',
    handler: elternschaftAendern,
  },
  'elternschaft.loeschen': {
    schema: elternschaftLoeschenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.elternschaft_geloescht',
    handler: elternschaftLoeschen,
  },
  'partnerschaft.anlegen': {
    schema: partnerschaftAnlegenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.partnerschaft_angelegt',
    handler: partnerschaftAnlegen,
  },
  'partnerschaft.aendern': {
    schema: partnerschaftAendernEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.partnerschaft_geaendert',
    handler: partnerschaftAendern,
  },
  'partnerschaft.loeschen': {
    schema: partnerschaftLoeschenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.partnerschaft_geloescht',
    handler: partnerschaftLoeschen,
  },
  'ereignis.anlegen': {
    schema: ereignisAnlegenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.ereignis_angelegt',
    handler: ereignisAnlegen,
  },
  'ereignis.aendern': {
    schema: ereignisAendernEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.ereignis_geaendert',
    handler: ereignisAendern,
  },
  'ereignis.loeschen': {
    schema: ereignisLoeschenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.ereignis_geloescht',
    handler: ereignisLoeschen,
  },
  'beteiligung.loeschen': {
    schema: beteiligungLoeschenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.beteiligung_geloescht',
    handler: beteiligungLoeschen,
  },
  'aussage.anlegen': {
    schema: aussageAnlegenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.aussage_angelegt',
    handler: aussageAnlegen,
  },
  'aussage.aendern': {
    schema: aussageAendernEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.aussage_geaendert',
    handler: aussageAendern,
    koaleszenzSchluessel: (ein) => `aussage:${ein.id}`,
  },
  'aussage.loeschen': {
    schema: aussageLoeschenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.aussage_geloescht',
    handler: aussageLoeschen,
  },
  'aussage_zitat.anlegen': {
    schema: aussageZitatAnlegenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.aussage_zitat_angelegt',
    handler: aussageZitatAnlegen,
  },
  'aussage_zitat.loeschen': {
    schema: aussageZitatLoeschenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.aussage_zitat_geloescht',
    handler: aussageZitatLoeschen,
  },
  'ort.anlegen': {
    schema: ortAnlegenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.ort_angelegt',
    handler: ortAnlegen,
  },
  'ort.aendern': {
    schema: ortAendernEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.ort_geaendert',
    handler: ortAendern,
  },
  'ortsname.anlegen': {
    schema: ortsnameAnlegenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.ortsname_angelegt',
    handler: ortsnameAnlegen,
  },
  'ortsname.aendern': {
    schema: ortsnameAendernEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.ortsname_geaendert',
    handler: ortsnameAendern,
  },
  'ortsname.loeschen': {
    schema: ortsnameLoeschenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.ortsname_geloescht',
    handler: ortsnameLoeschen,
  },
  'ortszugehoerigkeit.anlegen': {
    schema: ortszugehoerigkeitAnlegenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.ortszugehoerigkeit_angelegt',
    handler: ortszugehoerigkeitAnlegen,
  },
  'ortszugehoerigkeit.aendern': {
    schema: ortszugehoerigkeitAendernEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.ortszugehoerigkeit_geaendert',
    handler: ortszugehoerigkeitAendern,
  },
  'ortszugehoerigkeit.loeschen': {
    schema: ortszugehoerigkeitLoeschenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.ortszugehoerigkeit_geloescht',
    handler: ortszugehoerigkeitLoeschen,
  },
  'ort-externe-id.anlegen': {
    schema: ortExterneIdAnlegenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.ort_externe_id_angelegt',
    handler: ortExterneIdAnlegen,
  },
  'ort-externe-id.loeschen': {
    schema: ortExterneIdLoeschenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.ort_externe_id_geloescht',
    handler: ortExterneIdLoeschen,
  },
  'archiv.anlegen': {
    schema: archivAnlegenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.archiv_angelegt',
    handler: archivAnlegen,
  },
  'archiv.aendern': {
    schema: archivAendernEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.archiv_geaendert',
    handler: archivAendern,
  },
  'quelle.anlegen': {
    schema: quelleAnlegenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.quelle_angelegt',
    handler: quelleAnlegen,
  },
  'quelle.aendern': {
    schema: quelleAendernEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.quelle_geaendert',
    handler: quelleAendern,
  },
  'zitat.anlegen': {
    schema: zitatAnlegenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.zitat_angelegt',
    handler: zitatAnlegen,
  },
  'zitat.aendern': {
    schema: zitatAendernEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.zitat_geaendert',
    handler: zitatAendern,
  },
  'zitat.loeschen': {
    schema: zitatLoeschenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.zitat_geloescht',
    handler: zitatLoeschen,
  },
  'negativbefund.anlegen': {
    schema: negativbefundAnlegenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.negativbefund_angelegt',
    handler: negativbefundAnlegen,
  },
  'negativbefund.aendern': {
    schema: negativbefundAendernEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.negativbefund_geaendert',
    handler: negativbefundAendern,
  },
  'negativbefund.loeschen': {
    schema: negativbefundLoeschenEinSchema,
    art: 'nutzer',
    beschreibung: () => 'journal.negativbefund_geloescht',
    handler: negativbefundLoeschen,
  },
}
