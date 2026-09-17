// AP-1.4a, 56_Import_Vertrag.md §4 Stufe 4 (IMP-401…IMP-404, Hinweise) + Prüfsummen-Abgleich
// (§6.2 Gestaltungsentscheidung 7). Read-only SQL gegen den Bestand — KEINE Transaktion (CLAUDE.md
// §2: SQL nur in `src/main/repositories/` + `src/main/abfragen/`), läuft aber innerhalb der bereits
// offenen Trockenlauf-Transaktion des Aufrufers (`src/main/befehle/import-trockenlauf.ts`), NACH
// `schreibeImport()` — sieht also sowohl den alten Bestand als auch die soeben (noch nicht
// zurückgerollten) neuen Zeilen. Jede Abfrage schließt die neue(n) eigene(n) Zeile(n) darum explizit
// per ID aus, damit ein frisch importierter Datensatz nicht sich selbst als "Kollision" meldet.
import type Database from 'better-sqlite3'

const DB_PRAEFIX = 'db:'

/** Ein Kandidat für IMP-401 (Personen-Dublette): neu angelegte Person (`tmp:`-Kennung + UUID). */
export interface PersonKandidat {
  readonly kennung: string
  readonly uuid: string
}

export interface OrtKandidat {
  readonly kennung: string
  readonly uuid: string
}

export interface QuelleKandidat {
  readonly kennung: string
  readonly uuid: string
}

/** IMP-401/403/404: ein möglicher Bestandstreffer, mit Punktwert + Begründung (§6.2 Gestaltungsentscheidung 4). */
export interface KollisionsFund {
  readonly neueKennung: string
  readonly bestehendeKennung: string
  readonly punktwert: number
  readonly begruendung: string
}

/** IMP-402: ein `db:`-Subjekt bekommt einen bevorzugten Wert, der einem bestehenden bevorzugten Wert widerspricht. */
export interface KonfliktFund {
  readonly subjektKennung: string
  readonly praedikat: string
  readonly bestehenderWert: string
}

interface PersonFlachZeile {
  readonly person_id: string
  readonly sortier_nachname: string
  readonly sortier_vornamen: string
  readonly geburt_jahr: number | null
}

function personFlachLesen(db: Database.Database, personId: string): PersonFlachZeile | undefined {
  return db
    .prepare<{ readonly personId: string }, PersonFlachZeile>(
      'SELECT person_id, sortier_nachname, sortier_vornamen, geburt_jahr FROM person_flach WHERE person_id = @personId',
    )
    .get({ personId })
}

interface PersonFlachKandidatZeile {
  readonly person_id: string
  readonly sortier_vornamen: string
  readonly geburt_jahr: number | null
}

/**
 * IMP-401: Namensgleichheit (exakter `sortier_nachname`) + überlappende/nahe Lebensdaten →
 * möglicher Dublettenkandidat. Einfache, erste Heuristik (D-15 sieht die tatsächliche
 * Verbinden/Getrennt/Später-Entscheidung erst in der Oberfläche, AP-1.4b vor) — Punktwert additiv:
 * 0,4 Nachname (durch die Abfrage bereits erzwungen) + 0,3 Vornamen gleich/0,15 einer ist Präfix
 * des anderen + 0,3 Geburtsjahr gleich/0,15 Abstand ≤ 2 Jahre. Ab 0,5 gilt ein Fund als Kandidat.
 */
export function findePersonenDubletten(db: Database.Database, kandidaten: readonly PersonKandidat[]): readonly KollisionsFund[] {
  const funde: KollisionsFund[] = []
  for (const kandidat of kandidaten) {
    const eigene = personFlachLesen(db, kandidat.uuid)
    if (eigene === undefined || eigene.sortier_nachname === '') continue

    const treffer = db
      .prepare<{ readonly nachname: string; readonly eigeneId: string }, PersonFlachKandidatZeile>(
        `SELECT person_id, sortier_vornamen, geburt_jahr FROM person_flach
         WHERE sortier_nachname = @nachname AND person_id != @eigeneId`,
      )
      .all({ nachname: eigene.sortier_nachname, eigeneId: kandidat.uuid })

    for (const bestand of treffer) {
      let punktwert = 0.4
      const teile: string[] = ['Nachname gleich']

      if (eigene.sortier_vornamen !== '' && eigene.sortier_vornamen === bestand.sortier_vornamen) {
        punktwert += 0.3
        teile.push('Vornamen gleich')
      } else if (eigene.sortier_vornamen !== '' && bestand.sortier_vornamen !== '') {
        const [kurz, lang] = eigene.sortier_vornamen.length <= bestand.sortier_vornamen.length ? [eigene.sortier_vornamen, bestand.sortier_vornamen] : [bestand.sortier_vornamen, eigene.sortier_vornamen]
        if (lang.startsWith(kurz)) {
          punktwert += 0.15
          teile.push('Vornamen ähnlich')
        }
      }

      if (eigene.geburt_jahr !== null && bestand.geburt_jahr !== null) {
        const abstand = Math.abs(eigene.geburt_jahr - bestand.geburt_jahr)
        if (abstand === 0) {
          punktwert += 0.3
          teile.push('Geburtsjahr gleich')
        } else if (abstand <= 2) {
          punktwert += 0.15
          teile.push(`Geburtsjahr nah beieinander (${abstand} Jahre)`)
        }
      }

      if (punktwert >= 0.5) {
        funde.push({
          neueKennung: kandidat.kennung,
          bestehendeKennung: `${DB_PRAEFIX}${bestand.person_id}`,
          punktwert: Math.round(punktwert * 100) / 100,
          begruendung: teile.join(' · '),
        })
      }
    }
  }
  return funde
}

interface QuelleTitelZeile {
  readonly id: string
  readonly titel: string | null
}

/** IMP-404: Quelle mit identischem (getrimmten) Titel existiert schon. */
export function findeQuellenDubletten(db: Database.Database, kandidaten: readonly QuelleKandidat[]): readonly KollisionsFund[] {
  const funde: KollisionsFund[] = []
  for (const kandidat of kandidaten) {
    const eigene = db.prepare<{ readonly id: string }, QuelleTitelZeile>('SELECT id, titel FROM quelle WHERE id = @id').get({ id: kandidat.uuid })
    if (eigene?.titel === null || eigene?.titel === undefined) continue
    const titel = eigene.titel.trim()
    if (titel === '') continue

    const treffer = db
      .prepare<{ readonly titel: string; readonly eigeneId: string }, QuelleTitelZeile>(
        'SELECT id, titel FROM quelle WHERE TRIM(titel) = @titel AND id != @eigeneId',
      )
      .all({ titel, eigeneId: kandidat.uuid })

    for (const bestand of treffer) {
      funde.push({
        neueKennung: kandidat.kennung,
        bestehendeKennung: `${DB_PRAEFIX}${bestand.id}`,
        punktwert: 1,
        begruendung: 'Titel identisch',
      })
    }
  }
  return funde
}

interface OrtKoordinateZeile {
  readonly id: string
  readonly koordinaten_lat: number | null
  readonly koordinaten_lon: number | null
}

interface OrtBevorzugterNameZeile {
  readonly ort_id: string
  readonly name: string
}

const ERDRADIUS_KM = 6371
const IMP_403_RADIUS_KM = 5

/** Haversine-Abstand zweier Koordinaten in Kilometern (reine Arithmetik, kein `Math.random`/`Date`). */
function abstandKm(latA: number, lonA: number, latB: number, lonB: number): number {
  const toRad = (grad: number): number => (grad * Math.PI) / 180
  const dLat = toRad(latB - latA)
  const dLon = toRad(lonB - lonA)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLon / 2) ** 2
  return ERDRADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** IMP-403: Ort mit gleichem bevorzugten Namen UND Koordinaten im Umkreis von 5 km existiert schon. */
export function findeOrtsDubletten(db: Database.Database, kandidaten: readonly OrtKandidat[]): readonly KollisionsFund[] {
  const funde: KollisionsFund[] = []
  for (const kandidat of kandidaten) {
    const eigenerOrt = db
      .prepare<{ readonly id: string }, OrtKoordinateZeile>('SELECT id, koordinaten_lat, koordinaten_lon FROM ort WHERE id = @id')
      .get({ id: kandidat.uuid })
    if (eigenerOrt?.koordinaten_lat === null || eigenerOrt?.koordinaten_lat === undefined || eigenerOrt.koordinaten_lon === null) continue
    const eigenerName = db
      .prepare<{ readonly ortId: string }, OrtBevorzugterNameZeile>(
        `SELECT ort_id, name FROM ortsname WHERE ort_id = @ortId AND ist_bevorzugt = 1 ORDER BY id LIMIT 1`,
      )
      .get({ ortId: kandidat.uuid })
    if (eigenerName === undefined) continue

    const bestandsOrte = db
      .prepare<{ readonly name: string; readonly eigeneId: string }, OrtKoordinateZeile & { readonly ort_id: string }>(
        `SELECT o.id, o.koordinaten_lat, o.koordinaten_lon, o.id AS ort_id
         FROM ort o JOIN ortsname n ON n.ort_id = o.id AND n.ist_bevorzugt = 1
         WHERE n.name = @name AND o.id != @eigeneId AND o.koordinaten_lat IS NOT NULL AND o.koordinaten_lon IS NOT NULL`,
      )
      .all({ name: eigenerName.name, eigeneId: kandidat.uuid })

    for (const bestand of bestandsOrte) {
      if (bestand.koordinaten_lat === null || bestand.koordinaten_lon === null) continue
      const abstand = abstandKm(eigenerOrt.koordinaten_lat, eigenerOrt.koordinaten_lon, bestand.koordinaten_lat, bestand.koordinaten_lon)
      if (abstand <= IMP_403_RADIUS_KM) {
        funde.push({
          neueKennung: kandidat.kennung,
          bestehendeKennung: `${DB_PRAEFIX}${bestand.ort_id}`,
          punktwert: 1,
          begruendung: `Name gleich · Abstand ${abstand.toFixed(1)} km`,
        })
      }
    }
  }
  return funde
}

interface AussageWertZeile {
  readonly wert_text: string | null
  readonly wert_zahl: number | null
  readonly wert_ref_id: string | null
}

/** Eine "WIRD ERGÄNZT"-Aussage, für den IMP-402-Konfliktcheck (s. `src/main/import/schreiben.ts::ErgaenzungEintrag`). */
export interface BevorzugteErgaenzung {
  readonly subjektKennung: string
  readonly subjektTyp: string
  readonly subjektId: string
  readonly praedikat: string
  readonly neueAussageId: string
  readonly wertText: string | null
  readonly wertZahl: number | null
}

function wertRepraesentation(zeile: AussageWertZeile): string {
  return `${zeile.wert_text ?? ''}|${zeile.wert_zahl ?? ''}|${zeile.wert_ref_id ?? ''}`
}

/** IMP-402: `db:`-Subjekt bekommt einen bevorzugten Wert, der einem bereits bestehenden
 * bevorzugten Wert (anderes Prädikat-Subjekt-Paar, `ist_bevorzugt = 1`, andere `aussage.id`)
 * widerspricht. */
export function findeBevorzugungsKonflikte(db: Database.Database, ergaenzungen: readonly BevorzugteErgaenzung[]): readonly KonfliktFund[] {
  const funde: KonfliktFund[] = []
  for (const ergaenzung of ergaenzungen) {
    const bestehende = db
      .prepare<{ readonly subjektTyp: string; readonly subjektId: string; readonly praedikat: string; readonly neueId: string }, AussageWertZeile>(
        `SELECT wert_text, wert_zahl, wert_ref_id FROM aussage
         WHERE subjekt_typ = @subjektTyp AND subjekt_id = @subjektId AND praedikat = @praedikat
           AND ist_bevorzugt = 1 AND id != @neueId`,
      )
      .all({ subjektTyp: ergaenzung.subjektTyp, subjektId: ergaenzung.subjektId, praedikat: ergaenzung.praedikat, neueId: ergaenzung.neueAussageId })

    const neueRepraesentation = `${ergaenzung.wertText ?? ''}|${ergaenzung.wertZahl ?? ''}|`
    for (const zeile of bestehende) {
      if (wertRepraesentation(zeile) === neueRepraesentation) continue
      funde.push({
        subjektKennung: ergaenzung.subjektKennung,
        praedikat: ergaenzung.praedikat,
        bestehenderWert: zeile.wert_text ?? (zeile.wert_zahl !== null ? String(zeile.wert_zahl) : zeile.wert_ref_id ?? ''),
      })
    }
  }
  return funde
}

interface ImportLaufPruefsummeZeile {
  readonly zeitpunkt: number | null
}

/** Prüfsummen-Abgleich (§6.2 Gestaltungsentscheidung 7): existiert bereits ein `import_lauf` mit
 * identischer `pruefsumme`? Gibt dessen Zeitpunkt (Unix-ms) zurück, sonst `undefined`. */
export function bereitsImportiertAm(db: Database.Database, pruefsummeQuelltext: string): number | undefined {
  const zeile = db
    .prepare<{ readonly pruefsumme: string }, ImportLaufPruefsummeZeile>('SELECT zeitpunkt FROM import_lauf WHERE pruefsumme = @pruefsumme ORDER BY zeitpunkt ASC LIMIT 1')
    .get({ pruefsumme: pruefsummeQuelltext })
  return zeile?.zeitpunkt ?? undefined
}
