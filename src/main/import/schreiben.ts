// AP-1.3d: Orchestrator der Import-Schreiblogik (56_Import_Vertrag.md §3, ADR-026). Reine
// Orchestrierung — KEIN SQL hier (CLAUDE.md §2: SQL nur in `src/main/repositories/`), jedes
// Statement läuft über ein Repository. Läuft in einer bereits offenen, ARMIERTEN Transaktion
// (Aufrufer: ein künftiger Befehl über `src/main/befehle/bus.ts` — dieses Modul öffnet selbst
// keine Transaktion, CLAUDE.md §2 Regel 3).
//
// Zwei Durchläufe:
//  Pass 1 (Kennungsauflösung): jede der sieben Arrays mit eigenem `id`-Feld (`quellen`,
//    `personen`, `orte`, `ereignisse`, `partnerschaften`, `medien`, `interviews`) bekommt eine
//    UUID — `tmp:x` → `neueId()`, `db:<uuid>` → `<uuid>` (Präfix strippen). Eine `db:`-Kennung
//    REFERENZIERT nur einen vorhandenen Datensatz, sie ERSETZT ihn nicht (56_Import_Vertrag.md
//    §2.1) — für keines der sieben Arrays wird darum bei einer `db:`-Kennung die eigene Zeile
//    (oder ihre unmittelbar zugehörigen Kindzeilen: `name` bei Person, `ortsname` bei Ort)
//    geschrieben; andere Objekte referenzieren die aufgelöste UUID trotzdem ganz normal.
//  Pass 2 (Insert in FK-Reihenfolge): ort(+ortsname) → medium → person(+name) → quelle →
//    interview_sitzung → ereignis(+beteiligung) → elternschaft/partnerschaft(+partnerschaft_person)
//    → diagnose/risikofaktor → aussage+aussage_zitat (ZULETZT). Die Existenz-Aussagen (ADR-026)
//    und die abgeleiteten geburtsdatum/todesdatum/geburtsort-Aussagen werden darum NICHT sofort
//    neben ihrem jeweiligen Objekt geschrieben, sondern während der Objekt-Durchläufe nur
//    GESAMMELT (`aussagenAufgaben`) — jede Aussage braucht über `belege[].quelle` eine bereits
//    existierende `quelle`-Zeile, und `quelle` selbst wird erst NACH `person` geschrieben (ihr
//    `informant_person_id` referenziert `person`). Am Ende dieser Funktion sind alle Objektzeilen
//    fertig, und die gesammelten Aussagen werden in einem Rutsch geschrieben.
import type { z } from 'zod'
import { WurzelFehler } from '../../shared/fehler/wurzel-fehler'
import { AussageSubjektTypEnum } from '../../shared/schemata/gemeinsam'
import type { ImportDatei } from '../../shared/schemata/import-v1'
import { neueId as neueIdStandard } from '../id'
import type { Tx } from '../repositories/basis'
import * as aussageRepo from '../repositories/aussage-repo'
import * as belegRepo from '../repositories/beleg-repo'
import * as beziehungRepo from '../repositories/beziehung-repo'
import * as ereignisRepo from '../repositories/ereignis-repo'
import * as gesundheitRepo from '../repositories/gesundheit-repo'
import * as interviewRepo from '../repositories/interview-repo'
import * as mediumRepo from '../repositories/medium-repo'
import * as nameRepo from '../repositories/name-repo'
import * as ortRepo from '../repositories/ort-repo'
import * as personRepo from '../repositories/person-repo'
import { datumSpalten, type DatumSpaltengruppe } from './datum-spalten'

// `Beleg` ist im Vertrag nicht exportiert (nur `ImportDatei`, s. `src/shared/schemata/import-v1.ts`)
// — hier per Indexzugriff auf ein Feld extrahiert, das dieselbe `belegeSchema`-Form trägt wie
// jede andere belegpflichtige Entität (Person/Ereignis/Elternschaft/Partnerschaft/Diagnose/
// Risikofaktor/Aussage, s. Kopfkommentar von `import-v1.ts`).
type Beleg = NonNullable<ImportDatei['personen']>[number]['belege'][number]
type AussageSubjektTyp = z.infer<typeof AussageSubjektTypEnum>

const LEERE_DATUM_SPALTEN: DatumSpaltengruppe = datumSpalten(undefined)

export interface SchreibOptionen {
  readonly erstelltAm: number
  readonly neueId?: () => string
}

/**
 * Eine einzelne "WIRD ERGÄNZT"-Zeile für den Trockenlauf-Bericht (56_Import_Vertrag.md §6.2 Punkt
 * 2, AP-1.4a): eine neue Aussage (+ ihr Beleg), deren Subjekt eine bereits bestehende `db:`-Kennung
 * ist — im Unterschied zu einer Aussage über eine in DIESEM Lauf neu angelegte Entität ("WIRD
 * ANGELEGT"). Nur `aussage`/`zitat`/`aussage_zitat` können "ergänzt" sein: jede andere Tabelle wird
 * für eine `db:`-Kennung von `schreibeImport()` gar nicht erst beschrieben (§2.1 Schutzregel — die
 * eigene Zeile/ihre unmittelbaren Kindzeilen werden bei `db:` übersprungen, s. Moduldoku oben).
 */
export interface ErgaenzungEintrag {
  readonly subjektTyp: AussageSubjektTyp
  /** Die aufgelöste UUID (== `aussage.subjekt_id`). */
  readonly subjektId: string
  /** Die ursprüngliche `db:<uuid>`-Kennung, wie sie im Vertrag stand (für die Berichtsanzeige). */
  readonly subjektKennung: string
  readonly praedikat: string
  readonly wertText?: string | undefined
  readonly wertZahl?: number | undefined
  readonly istBevorzugt?: boolean | undefined
  /** `id` der soeben eingefügten `aussage`-Zeile — für `findeBevorzugungsKonflikte()`
   * (`src/main/abfragen/import-kollision.ts`, IMP-402), damit diese neue Zeile bei der Suche nach
   * einem WIDERSPRECHENDEN bestehenden bevorzugten Wert nicht sich selbst trifft. */
  readonly aussageId: string
}

/** Ergebnis von `schreibeImport()`: die Kennungsauflösung (für den Aufrufer, z. B. den
 * Trockenlauf-Bericht oder `import_herkunft`) + eine Zeilenzählung je Tabelle + die Liste der
 * "WIRD ERGÄNZT"-Aussagen (AP-1.4a). */
export interface SchreibErgebnis {
  readonly kennungen: ReadonlyMap<string, string>
  readonly zeilen: Readonly<Record<string, number>>
  readonly ergaenzungen: readonly ErgaenzungEintrag[]
}

/** `true`, wenn eine Kennung `db:` ist (referenziert einen vorhandenen Datensatz, §2.1). */
function istDbKennung(kennung: string): boolean {
  return kennung.startsWith('db:')
}

/** UUID aus einer `db:<uuid>`-Kennung (Präfix strippen, §2.1). */
function uuidAusDbKennung(kennung: string): string {
  return kennung.slice('db:'.length)
}

function boolZuInt(wert: boolean | undefined): 0 | 1 | null {
  if (wert === undefined) return null
  return wert ? 1 : 0
}

function boolZuIntMitVorgabe(wert: boolean | undefined, vorgabe: 0 | 1): 0 | 1 {
  if (wert === undefined) return vorgabe
  return wert ? 1 : 0
}

/** Eine gesammelte Aussage — verarbeitet erst NACHDEM alle Objektzeilen stehen (s. Moduldoku). */
interface AussageAufgabe {
  readonly subjektTyp: AussageSubjektTyp
  readonly subjektId: string
  readonly praedikat: string
  readonly wertText?: string | undefined
  readonly wertZahl?: number | undefined
  readonly wertRefId?: string | undefined
  readonly datum?: DatumSpaltengruppe | undefined
  readonly gueltigVon?: number | undefined
  readonly gueltigBis?: number | undefined
  readonly istBevorzugt?: boolean | undefined
  readonly begruendung?: string | undefined
  readonly unsicherheit?: string | undefined
  readonly konfidenz: number
  readonly belege: readonly Beleg[]
}

/**
 * Schreibt eine geprüfte Importdatei in die Datenbank (56_Import_Vertrag.md §3, ADR-026). `datei`
 * muss bereits Stufe 1 + Stufe 2 (`src/main/import/validierung.ts`) bestanden haben — diese
 * Funktion validiert nicht erneut, sie schreibt.
 */
export function schreibeImport(tx: Tx, datei: ImportDatei, opt: SchreibOptionen): SchreibErgebnis {
  const neueId = opt.neueId ?? neueIdStandard
  const erstelltAm = opt.erstelltAm

  const zeilenZaehler = new Map<string, number>()
  function zaehle(tabelle: string): void {
    zeilenZaehler.set(tabelle, (zeilenZaehler.get(tabelle) ?? 0) + 1)
  }

  // ---------------------------------------------------------------------------------------------
  // Pass 1 — Kennungsauflösung
  // ---------------------------------------------------------------------------------------------
  const kennungen = new Map<string, string>()
  function registriere(kennung: string): void {
    kennungen.set(kennung, istDbKennung(kennung) ? uuidAusDbKennung(kennung) : neueId())
  }
  datei.quellen.forEach((q) => registriere(q.id))
  datei.personen?.forEach((p) => registriere(p.id))
  datei.orte?.forEach((o) => registriere(o.id))
  datei.ereignisse?.forEach((e) => registriere(e.id))
  datei.partnerschaften?.forEach((p) => registriere(p.id))
  datei.medien?.forEach((m) => registriere(m.id))
  datei.interviews?.forEach((i) => registriere(i.id))

  function aufloesen(kennung: string): string {
    const uuid = kennungen.get(kennung)
    if (uuid === undefined) {
      // Sollte nie eintreten: Stufe 2 (IMP-201/IMP-202) hätte eine unauflösbare Kennung schon
      // vor diesem Aufruf abgelehnt.
      throw new WurzelFehler('INTERN_UNERWARTET', `schreibeImport(): Kennung "${kennung}" ist nicht aufgelöst (Stufe 2 hätte das erkannt).`)
    }
    return uuid
  }

  // AP-1.4a: Rückwärtsauflösung UUID -> ursprüngliche `db:`-Kennung, NUR für tatsächlich
  // referenzierte (nicht neu angelegte) Entitäten — Grundlage für `ergaenzungen` unten (§6.2 "WIRD
  // ERGÄNZT"). Gebaut direkt nach Pass 1, weil `kennungen` ab hier vollständig befüllt ist.
  const uuidZuDbKennung = new Map<string, string>()
  kennungen.forEach((uuid, kennung) => {
    if (istDbKennung(kennung)) uuidZuDbKennung.set(uuid, kennung)
  })
  const ergaenzungen: ErgaenzungEintrag[] = []

  const aussagenAufgaben: AussageAufgabe[] = []

  /** Existenz-Aussage (ADR-026, `wert_text` FESTGENAGELT auf `'ja'`) — je belegtem Objekt genau
   * eine, unabhängig davon, ob dessen eigene Zeile in diesem Lauf geschrieben oder (bei einer
   * `db:`-Kennung) nur referenziert wurde: die Existenz-Aussage ist eine neue Bezeugung, keine
   * Eigenschaft der Zeile selbst. */
  function merkeExistenzAussage(subjektTyp: AussageSubjektTyp, subjektId: string, konfidenz: number, belege: readonly Beleg[]): void {
    aussagenAufgaben.push({ subjektTyp, subjektId, praedikat: 'existenz', wertText: 'ja', konfidenz, belege })
  }

  // ---------------------------------------------------------------------------------------------
  // Pass 2 — Insert in FK-Reihenfolge (Objektzeilen zuerst, Aussagen ganz am Ende, s. Moduldoku)
  // ---------------------------------------------------------------------------------------------

  // 1. ort + ortsname — VOR medium (medium.ort_id REFERENCES ort(id), docs/schema/0002_kern.sql:409;
  //    ein `medien[]`-Eintrag mit `ort`-Feld bräche sonst unter foreign_keys=ON ab, hueter-Auflage
  //    aus PR #60).
  datei.orte?.forEach((o) => {
    const id = aufloesen(o.id)
    if (istDbKennung(o.id)) return
    ortRepo.einfuegen(tx, {
      id,
      typ: o.typ,
      koordinatenLat: o.koordinaten?.lat ?? null,
      koordinatenLon: o.koordinaten?.lon ?? null,
      existiertVon: o.existiert_von ?? null,
      existiertBis: o.existiert_bis ?? null,
      notiz: o.notiz ?? null,
      erstelltAm,
      geaendertAm: erstelltAm,
    })
    zaehle('ort')
    o.namen.forEach((n) => {
      ortRepo.ortsnameEinfuegen(tx, {
        id: neueId(),
        ortId: id,
        name: n.name,
        sprache: n.sprache ?? null,
        gueltigVon: n.gueltig_von ?? null,
        gueltigBis: n.gueltig_bis ?? null,
        istBevorzugt: boolZuInt(n.ist_bevorzugt),
        originalText: n.original_text ?? null,
        erstelltAm,
        geaendertAm: erstelltAm,
      })
      zaehle('ortsname')
    })
  })

  // 2. medium — NACH ort (s. o.), VOR quelle/interview_sitzung (deren audio_medium_id → medium
  //    referenziert).
  datei.medien?.forEach((m) => {
    const id = aufloesen(m.id)
    if (istDbKennung(m.id)) return
    mediumRepo.einfuegen(tx, {
      id,
      relativerPfad: m.relativer_pfad,
      titel: m.titel ?? null,
      beschreibung: m.beschreibung ?? null,
      datum: datumSpalten(m.datum),
      ortId: m.ort !== undefined ? aufloesen(m.ort) : null,
      erstelltAm,
      geaendertAm: erstelltAm,
    })
    zaehle('medium')
  })

  // 3. person(+name) — Zeile selbst nur für tmp:-Kennungen (s. Moduldoku Pass 1); Existenz-Aussage
  //    wird für JEDE Person gemerkt (auch db:) und erst am Ende geschrieben.
  datei.personen?.forEach((p) => {
    const id = aufloesen(p.id)
    if (!istDbKennung(p.id)) {
      personRepo.einfuegen(tx, {
        id,
        geschlecht: p.geschlecht,
        lebend_status: p.lebend_status,
        privat: boolZuIntMitVorgabe(p.privat, 0),
        notiz: p.notiz,
        gesperrt_bis: undefined,
        ist_platzhalter: boolZuIntMitVorgabe(p.ist_platzhalter, 0),
        platzhalter_grund: p.platzhalter_grund,
        unsicherheit: p.unsicherheit ?? null,
        erstelltAm,
        geaendertAm: erstelltAm,
      })
      zaehle('person')

      const namenIds = (p.namen ?? []).map(() => neueId())
      p.namen?.forEach((n, index) => {
        const nameId = namenIds[index]
        if (nameId === undefined) {
          // Defensiv (CLAUDE.md §4: kein `!`) — `namenIds` hat laut Konstruktion genau
          // `p.namen.length` Einträge, ein `undefined` hier wäre ein Programmierfehler.
          throw new WurzelFehler('INTERN_UNERWARTET', `schreibeImport(): fehlende Name-ID an Index ${index} für Person "${p.id}".`)
        }
        const umschriftVonId = n.umschrift_von !== undefined ? (namenIds[n.umschrift_von] ?? null) : null
        nameRepo.einfuegen(tx, {
          id: nameId,
          personId: id,
          typ: n.typ ?? 'geburtsname',
          schrift: n.schrift ?? null,
          umschriftVon: umschriftVonId,
          umschriftNorm: n.umschrift_norm ?? null,
          vornamen: n.vornamen ?? null,
          rufnameIndex: n.rufname_index ?? null,
          rufnameText: n.rufname_text ?? null,
          nachname: n.nachname ?? null,
          praefix: n.praefix ?? null,
          titelVor: n.titel_vor ?? null,
          zusatzNach: n.zusatz_nach ?? null,
          originalText: n.original_text ?? null,
          sprache: n.sprache ?? null,
          istBevorzugt: boolZuInt(n.ist_bevorzugt),
          gueltigVon: n.gueltig_von ?? null,
          gueltigBis: n.gueltig_bis ?? null,
          erstelltAm,
          geaendertAm: erstelltAm,
        })
        zaehle('name')
      })
    }

    merkeExistenzAussage('person', id, p.konfidenz, p.belege)
  })

  // 4. quelle (§2.15 "mündlich": informant_person/gespraechsdatum/form/unmittelbarkeit/audio_medium)
  datei.quellen.forEach((q) => {
    const id = aufloesen(q.id)
    if (istDbKennung(q.id)) return
    belegRepo.quelleEinfuegen(tx, {
      id,
      typ: q.typ,
      titel: q.titel,
      autor: q.autor ?? null,
      verlag: q.verlag ?? null,
      jahr: q.jahr ?? null,
      art: q.art ?? null,
      informationsart: q.informationsart ?? null,
      signatur: q.signatur ?? null,
      notiz: q.notiz ?? null,
      informantPersonId: q.informant_person !== undefined ? aufloesen(q.informant_person) : null,
      gespraechsdatum: datumSpalten(q.gespraechsdatum),
      form: q.form ?? null,
      unmittelbarkeit: q.unmittelbarkeit ?? null,
      audioMediumId: q.audio_medium !== undefined ? aufloesen(q.audio_medium) : null,
      erstelltAm,
      geaendertAm: erstelltAm,
    })
    zaehle('quelle')
  })

  // 5. interview_sitzung
  datei.interviews?.forEach((i) => {
    const id = aufloesen(i.id)
    if (istDbKennung(i.id)) return
    interviewRepo.einfuegen(tx, {
      id,
      informantPersonId: aufloesen(i.informant_person),
      datum: datumSpalten(i.datum),
      ortId: i.ort !== undefined ? aufloesen(i.ort) : null,
      audioMediumId: i.audio_medium !== undefined ? aufloesen(i.audio_medium) : null,
      notizen: i.notizen ?? null,
      status: i.status ?? null,
      erstelltAm,
      geaendertAm: erstelltAm,
    })
    zaehle('interview_sitzung')
  })

  // 6. ereignis + beteiligung — Existenz-Aussage + abgeleitete geburtsdatum/todesdatum/geburtsort
  //    NUR für typ='geburt'/'tod' (56_Import_Vertrag.md §3.5, ADR-026); alle Aussagen gemerkt, nicht
  //    sofort geschrieben (s. Moduldoku).
  datei.ereignisse?.forEach((e) => {
    const id = aufloesen(e.id)
    if (!istDbKennung(e.id)) {
      ereignisRepo.einfuegen(tx, {
        id,
        typ: e.typ,
        ortId: e.ort !== undefined ? aufloesen(e.ort) : null,
        datum: datumSpalten(e.datum),
        beschreibung: e.beschreibung ?? null,
        notiz: e.notiz ?? null,
        erstelltAm,
        geaendertAm: erstelltAm,
      })
      zaehle('ereignis')

      e.beteiligungen.forEach((b) => {
        ereignisRepo.beteiligungEinfuegen(tx, {
          id: neueId(),
          ereignisId: id,
          personId: aufloesen(b.person),
          rolle: b.rolle,
          reihenfolge: b.reihenfolge ?? null,
          erstelltAm,
          geaendertAm: erstelltAm,
        })
        zaehle('beteiligung')
      })
    }

    merkeExistenzAussage('ereignis', id, e.konfidenz, e.belege)

    if (e.typ === 'geburt' && e.datum !== undefined) {
      const hauptperson = e.beteiligungen.find((b) => b.rolle === 'hauptperson')
      if (hauptperson !== undefined) {
        const subjektId = aufloesen(hauptperson.person)
        aussagenAufgaben.push({
          subjektTyp: 'person',
          subjektId,
          praedikat: 'geburtsdatum',
          datum: datumSpalten(e.datum),
          konfidenz: e.konfidenz,
          belege: e.belege,
        })
        if (e.ort !== undefined) {
          aussagenAufgaben.push({
            subjektTyp: 'person',
            subjektId,
            praedikat: 'geburtsort',
            wertRefId: aufloesen(e.ort),
            konfidenz: e.konfidenz,
            belege: e.belege,
          })
        }
      }
    }

    if (e.typ === 'tod' && e.datum !== undefined) {
      const verstorbener = e.beteiligungen.find((b) => b.rolle === 'verstorbener')
      if (verstorbener !== undefined) {
        aussagenAufgaben.push({
          subjektTyp: 'person',
          subjektId: aufloesen(verstorbener.person),
          praedikat: 'todesdatum',
          datum: datumSpalten(e.datum),
          konfidenz: e.konfidenz,
          belege: e.belege,
        })
      }
    }
  })

  // 7. elternschaft/partnerschaft/partnerschaft_person — Existenz-Aussage je Kante (gemerkt).
  datei.elternschaften?.forEach((el) => {
    const id = neueId() // Elternschaft hat keine eigene Kennung im Vertrag — immer neu.
    beziehungRepo.elternschaftEinfuegen(tx, {
      id,
      elternteilId: aufloesen(el.elternteil),
      kindId: aufloesen(el.kind),
      typ: el.typ,
      notiz: el.notiz ?? null,
      erstelltAm,
      geaendertAm: erstelltAm,
    })
    zaehle('elternschaft')
    merkeExistenzAussage('elternschaft', id, el.konfidenz, el.belege)
  })

  datei.partnerschaften?.forEach((pa) => {
    const id = aufloesen(pa.id)
    if (!istDbKennung(pa.id)) {
      beziehungRepo.partnerschaftEinfuegen(tx, {
        id,
        typ: pa.typ,
        beginn: datumSpalten(pa.beginn),
        ende: datumSpalten(pa.ende),
        endeGrund: pa.ende_grund ?? null,
        reihenfolge: pa.reihenfolge ?? null,
        notiz: pa.notiz ?? null,
        erstelltAm,
        geaendertAm: erstelltAm,
      })
      zaehle('partnerschaft')

      pa.beteiligte.forEach((beteiligter) => {
        beziehungRepo.partnerschaftPersonEinfuegen(tx, {
          partnerschaftId: id,
          personId: aufloesen(beteiligter.person),
          rolle: beteiligter.rolle ?? null,
          erstelltAm,
          geaendertAm: erstelltAm,
        })
        zaehle('partnerschaft_person')
      })
    }

    merkeExistenzAussage('partnerschaft', id, pa.konfidenz, pa.belege)
  })

  // 8. diagnose/risikofaktor — eigene `konfidenz`-Spalte UNVERÄNDERT (kein ADR-026-Fall), plus
  //    Existenz-Aussage (gemerkt) für den einzigen Belegpfad (aussage_zitat, 0005-Migration).
  datei.diagnosen?.forEach((d) => {
    const id = neueId()
    gesundheitRepo.diagnoseEinfuegen(tx, {
      id,
      personId: aufloesen(d.person),
      kategorie: d.kategorie,
      organ: d.organ ?? null,
      bezeichnung: d.bezeichnung,
      erstdiagnose: datumSpalten(d.erstdiagnose),
      alterBeiDiagnose: d.alter_bei_diagnose ?? null,
      status: d.status,
      konfidenz: d.konfidenz,
      notiz: d.notiz ?? null,
      erstelltAm,
      geaendertAm: erstelltAm,
    })
    zaehle('diagnose')
    merkeExistenzAussage('diagnose', id, d.konfidenz, d.belege)
  })

  datei.risikofaktoren?.forEach((r) => {
    const id = neueId()
    gesundheitRepo.risikofaktorEinfuegen(tx, {
      id,
      personId: aufloesen(r.person),
      art: r.art,
      detail: r.detail ?? null,
      intensitaet: r.intensitaet,
      beginn: datumSpalten(r.beginn),
      ende: datumSpalten(r.ende),
      konfidenz: r.konfidenz,
      notiz: r.notiz ?? null,
      erstelltAm,
      geaendertAm: erstelltAm,
    })
    zaehle('risikofaktor')
    merkeExistenzAussage('risikofaktor', id, r.konfidenz, r.belege)
  })

  // 9. reguläre Vertrags-`aussagen[]` — ebenfalls gemerkt, nicht sofort geschrieben.
  datei.aussagen?.forEach((a) => {
    aussagenAufgaben.push({
      subjektTyp: a.subjekt_typ,
      subjektId: aufloesen(a.subjekt),
      praedikat: a.praedikat,
      wertText: a.wert_text,
      wertZahl: a.wert_zahl,
      wertRefId: a.wert_ref !== undefined ? aufloesen(a.wert_ref) : undefined,
      datum: datumSpalten(a.datum),
      gueltigVon: a.gueltig_von,
      gueltigBis: a.gueltig_bis,
      istBevorzugt: a.ist_bevorzugt,
      begruendung: a.begruendung,
      unsicherheit: a.unsicherheit,
      konfidenz: a.konfidenz,
      belege: a.belege,
    })
  })

  // 10. aussage + aussage_zitat (zuletzt, 56_Import_Vertrag.md-FK-Reihenfolge) — jetzt stehen ALLE
  //     Objektzeilen (inkl. `quelle`), jede `belege[].quelle` löst darum sicher auf.
  aussagenAufgaben.forEach((eingabe) => {
    const aussageId = neueId()
    aussageRepo.einfuegen(tx, {
      id: aussageId,
      subjektTyp: eingabe.subjektTyp,
      subjektId: eingabe.subjektId,
      praedikat: eingabe.praedikat,
      wertText: eingabe.wertText ?? null,
      wertZahl: eingabe.wertZahl ?? null,
      wertRefId: eingabe.wertRefId ?? null,
      datum: eingabe.datum ?? LEERE_DATUM_SPALTEN,
      konfidenz: eingabe.konfidenz,
      istBevorzugt: boolZuInt(eingabe.istBevorzugt),
      begruendung: eingabe.begruendung ?? null,
      unsicherheit: eingabe.unsicherheit ?? null,
      gueltigVon: eingabe.gueltigVon ?? null,
      gueltigBis: eingabe.gueltigBis ?? null,
      erstelltAm,
      geaendertAm: erstelltAm,
    })
    zaehle('aussage')

    const bestehendeKennung = uuidZuDbKennung.get(eingabe.subjektId)
    if (bestehendeKennung !== undefined) {
      ergaenzungen.push({
        subjektTyp: eingabe.subjektTyp,
        subjektId: eingabe.subjektId,
        subjektKennung: bestehendeKennung,
        praedikat: eingabe.praedikat,
        wertText: eingabe.wertText,
        wertZahl: eingabe.wertZahl,
        istBevorzugt: eingabe.istBevorzugt,
        aussageId,
      })
    }

    eingabe.belege.forEach((beleg) => {
      const zitatId = neueId()
      belegRepo.zitatEinfuegen(tx, {
        id: zitatId,
        quelleId: aufloesen(beleg.quelle),
        seite: beleg.seite ?? null,
        eintragsnummer: beleg.eintragsnummer ?? null,
        band: beleg.band ?? null,
        jahr: beleg.jahr ?? null,
        zeitmarkeSekunden: beleg.zeitmarke_sekunden ?? null,
        transkript: beleg.transkript ?? null,
        uebersetzung: beleg.uebersetzung ?? null,
        digitalisatUrl: beleg.digitalisat_url ?? null,
        konfidenz: beleg.konfidenz,
        erstelltAm,
        geaendertAm: erstelltAm,
      })
      zaehle('zitat')
      aussageRepo.zitatVerknuepfen(tx, { aussageId, zitatId, erstelltAm, geaendertAm: erstelltAm })
      zaehle('aussage_zitat')
    })
  })

  const zeilen: Record<string, number> = {}
  zeilenZaehler.forEach((anzahl, tabelle) => {
    zeilen[tabelle] = anzahl
  })

  return { kennungen, zeilen, ergaenzungen }
}
