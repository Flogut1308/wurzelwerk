// AP-1.16 PR-C (docs/71_Designsystem.md §3.2, 55_Architektur.md §5). `abfrage:ort.detail` —
// read-only SQL gegen `ort`/`ortsname`/`ortszugehoerigkeit`/`ort_externe_id` (CLAUDE.md §2: SQL
// nur in src/main/repositories/, src/main/abfragen/ — hier direkt, analog `person-detail.ts`,
// KEIN Umweg über `ort-repo.ts`), KEINE Transaktion, Spalten aufgezählt, benannte Parameter.
//
// Bewusst ROH (s. Kopfkommentar `src/shared/schemata/ort-detail.ts`): KEINE Datumsauflösung hier
// — jede `ortsname`-/`ortszugehoerigkeit`-Zeile kommt unverändert mit ihrem eigenen
// Gültigkeitszeitraum zurück, für die Orte-Pflege-Ansicht (Liste bestehender Zeilen zum
// Bearbeiten/Entfernen). Die datumsgültige Auflösung bleibt `abfrage:ort.suche`
// (`src/main/abfragen/ort-suche.ts`, `src/core/ort/zeitbezug.ts`) vorbehalten — KEIN zweiter
// Auflösungsweg.
import type Database from 'better-sqlite3'
import { ExterneIdSystemEnum } from '../../shared/schemata/ort-externe-id'
import { OrtTypEnum } from '../../shared/schemata/ort'
import type { OrtDetailAus, OrtDetailEin, OrtDetailExterneId, OrtDetailName, OrtDetailZugehoerigkeit } from '../../shared/schemata/ort-detail'
import { OrtszugehoerigkeitArtEnum } from '../../shared/schemata/ortszugehoerigkeit'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { datensatzExistiert } from '../repositories/basis'

interface KopfZeile {
  readonly id: string
  readonly typ: string | null
  readonly koordinaten_lat: number | null
  readonly koordinaten_lon: number | null
  readonly existiert_von: number | null
  readonly existiert_bis: number | null
  readonly notiz: string | null
}

function kopfLaden(db: Database.Database, ortId: string): KopfZeile | undefined {
  return db
    .prepare<
      { readonly ortId: string },
      KopfZeile
    >(`SELECT id, typ, koordinaten_lat, koordinaten_lon, existiert_von, existiert_bis, notiz
       FROM ort WHERE id = @ortId`,
    )
    .get({ ortId })
}

interface NameZeile {
  readonly id: string
  readonly name: string | null
  readonly sprache: string | null
  readonly gueltig_von: number | null
  readonly gueltig_bis: number | null
  readonly ist_bevorzugt: 0 | 1 | null
  readonly original_text: string | null
}

function namenLaden(db: Database.Database, ortId: string): readonly OrtDetailName[] {
  const zeilen = db
    .prepare<
      { readonly ortId: string },
      NameZeile
    >(`SELECT id, name, sprache, gueltig_von, gueltig_bis, ist_bevorzugt, original_text
       FROM ortsname
       WHERE ort_id = @ortId
       ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id`,
    )
    .all({ ortId })
  return zeilen.map((zeile) => ({
    id: zeile.id,
    name: zeile.name,
    sprache: zeile.sprache,
    gueltig_von: zeile.gueltig_von,
    gueltig_bis: zeile.gueltig_bis,
    ist_bevorzugt: zeile.ist_bevorzugt === 1,
    original_text: zeile.original_text,
  }))
}

interface ZugehoerigkeitZeile {
  readonly id: string
  readonly uebergeordnet_id: string
  readonly uebergeordnet_anzeigename: string | null
  readonly art: string
  readonly gueltig_von: number | null
  readonly gueltig_bis: number | null
}

/** `uebergeordnet_anzeigename` kommt über den bevorzugten (`ist_bevorzugt`) Namen des
 * übergeordneten Orts — KEINE Datumsauflösung (s. Modulkopf), dieselbe unmarkierte Vorschau wie
 * `ortsnamenLaden` in `src/main/abfragen/ort-suche.ts` ohne `jdn`. */
function zugehoerigkeitenLaden(db: Database.Database, ortId: string): readonly OrtDetailZugehoerigkeit[] {
  const zeilen = db
    .prepare<
      { readonly ortId: string },
      ZugehoerigkeitZeile
    >(`SELECT z.id AS id, z.uebergeordnet_id AS uebergeordnet_id, go.name AS uebergeordnet_anzeigename,
              z.art AS art, z.gueltig_von AS gueltig_von, z.gueltig_bis AS gueltig_bis
       FROM ortszugehoerigkeit z
       LEFT JOIN (
         SELECT ort_id, name,
           ROW_NUMBER() OVER (PARTITION BY ort_id ORDER BY (CASE WHEN ist_bevorzugt = 1 THEN 0 ELSE 1 END), id) AS rang
         FROM ortsname
       ) go ON go.ort_id = z.uebergeordnet_id AND go.rang = 1
       WHERE z.ort_id = @ortId
       ORDER BY z.art, z.id`,
    )
    .all({ ortId })
  return zeilen.map((zeile) => ({
    id: zeile.id,
    uebergeordnet_id: zeile.uebergeordnet_id,
    uebergeordnet_anzeigename: zeile.uebergeordnet_anzeigename,
    art: OrtszugehoerigkeitArtEnum.parse(zeile.art),
    gueltig_von: zeile.gueltig_von,
    gueltig_bis: zeile.gueltig_bis,
  }))
}

interface ExterneIdZeile {
  readonly system: string
  readonly wert: string
}

function externeIdsLaden(db: Database.Database, ortId: string): readonly OrtDetailExterneId[] {
  const zeilen = db
    .prepare<
      { readonly ortId: string },
      ExterneIdZeile
    >(`SELECT system, wert FROM ort_externe_id WHERE ort_id = @ortId ORDER BY system`,
    )
    .all({ ortId })
  return zeilen.map((zeile) => ({ system: ExterneIdSystemEnum.parse(zeile.system), wert: zeile.wert }))
}

/** `abfrage:ort.detail` (55_Architektur.md §5, AP-1.16 PR-C). */
export function ortDetail(db: Database.Database, ein: OrtDetailEin): OrtDetailAus {
  if (!datensatzExistiert(db, 'ort', ein.ortId)) {
    throw new WurzelFehler('NICHT_GEFUNDEN_ORT')
  }
  const kopfZeile = kopfLaden(db, ein.ortId)
  if (kopfZeile === undefined) {
    // Defensiv (CLAUDE.md §4: kein `!`): die vorstehende `datensatzExistiert`-Prüfung hat die
    // Zeile bereits bestätigt — dieser Zweig sollte unerreichbar sein.
    throw new WurzelFehler('INTERN_UNERWARTET', `ort fehlt trotz datensatzExistiert() für "${ein.ortId}".`)
  }

  return {
    kopf: {
      id: kopfZeile.id,
      typ: kopfZeile.typ === null ? null : OrtTypEnum.parse(kopfZeile.typ),
      koordinaten_lat: kopfZeile.koordinaten_lat,
      koordinaten_lon: kopfZeile.koordinaten_lon,
      existiert_von: kopfZeile.existiert_von,
      existiert_bis: kopfZeile.existiert_bis,
      notiz: kopfZeile.notiz,
    },
    namen: namenLaden(db, ein.ortId),
    zugehoerigkeiten: zugehoerigkeitenLaden(db, ein.ortId),
    externeIds: externeIdsLaden(db, ein.ortId),
  }
}
