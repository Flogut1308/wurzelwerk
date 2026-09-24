// AP-0.10 PR-B — geschützter Prüfpfad (CLAUDE.md §5/§13, ADR-025). fast-check-Arbitrary +
// Ausführungshelfer für `test/invarianten/undo-bitgleich.test.ts`: erzeugt Folgen aus den drei
// registrierten Befehlen (`person.anlegen`/`feldSetzen`/`loeschen`,
// `src/main/befehle/registrierung.ts`), schema-konform zu `src/shared/schemata/befehle.ts`.
//
// Referenzielle Aktionen (`feldSetzen`/`loeschen`) tragen nur einen rohen `fc.nat()`-Index statt
// einer echten `personId`: die echte ID entsteht erst zur AUSFÜHRUNGSZEIT über `neueId()`
// (`src/main/ipc/huelle.ts`, aufgerufen aus dem `person.anlegen`-Handler) und ist zum
// Generierungszeitpunkt nicht bekannt. Muster "Index modulo aktuelle Länge" wie in
// `test/invarianten/_modell-abgeleitet.ts` — `aktionAusfuehren()` unten löst den Index zur
// Ausführungszeit gegen `zustand.personIds` (die bislang angelegten, noch nicht gelöschten
// Personen) auf. Ist diese Liste leer, ist die Aktion ein bewusstes No-op (kein
// `fuehreAus()`-Aufruf, keine Transaktion, kein Undo-Schritt) — der Aufrufer
// (`undo-bitgleich.test.ts`) zählt Undo-Schritte ohnehin über `while (undoZiel(db) !==
// undefined)`, nicht über `folge.length`, das bleibt also robust gegen No-ops UND gegen vom
// Befehlsbus verworfene leere Transaktionen (z. B. `feldSetzen` ohne tatsächliche
// Werteänderung — `src/main/befehle/bus.ts` legt dafür gar keine `transaktion`-Zeile an).
//
// AP-1.12 PR-B ERWEITERUNG (Mehrzeilen-Transaktionen, s. Kopfkommentar von
// `undo-bitgleich.test.ts`): der Generator deckt jetzt zusätzlich `name.anlegen/aendern/loeschen`,
// `elternschaft.anlegen/aendern/loeschen`, `partnerschaft.anlegen/aendern/loeschen`,
// `ereignis.anlegen/aendern/loeschen` und `aussage.anlegen/loeschen` ab — dasselbe
// "Index-modulo-Länge-oder-No-op"-Muster wie oben, konsequent auf alle neuen Referenzen
// (`personId`, `nameId`, `elternschaftId`, `partnerschaftId`, `ereignisId`, `aussageId`)
// ausgeweitet. Bewusste Vereinfachungen, jede für sich gültige (nicht invalide!) Eingaben:
//
// - KEINE `belege`/`zitatId`-Referenzen: optional in jedem betroffenen Schema, das Weglassen
//   bleibt darum immer schema-konform. Eine `zitat`-Fixture anzulegen bräuchte einen rohen
//   Journal-Aus/-An-Umweg (Muster `neuesZitat()` in `test/einheit/befehl-aussage.test.ts`) ohne
//   zusätzlichen Erkenntnisgewinn für DIESE Invariante (die prüft Undo-Bitgleichheit, nicht den
//   Belegpfad — der ist in `test/einheit/befehl-aussage.test.ts` bereits geprüft).
// - KEIN `ortId`/`Datumswert` (bei `ereignis`/`partnerschaft`/`aussage`): es gibt in diesem
//   Arbeitspaket keinen `ort.anlegen`-Befehl, den der Generator referenzieren könnte, und
//   `Datumswert` hat eine eigene mehrteilige `superRefine`-Gültigkeitslogik
//   (`src/shared/schemata/import-v1.ts`), die hier keinen zusätzlichen Mehrzeilen-Fall aufdeckt.
//   Alle drei Felder sind optional, das Weglassen ist schema-konform.
// - `elternschaft.anlegen`: die beiden Personen werden über `zweiVerschiedeneAusListe()`
//   IMMER verschieden gewählt (keine Selbstkante) UND vorab mit der ECHTEN Produktivfunktion
//   `wuerdeZyklusErzeugen()` (`src/core/graph/zyklus.ts`, dieselbe reine Funktion, die
//   `elternschaft-anlegen.ts` selbst aufruft) gegen die bislang erzeugten Kanten geprüft — ein
//   Kandidat, der einen Zyklus schließen würde, wird als No-op übersprungen. So bleibt jede
//   ausgeführte `elternschaft.anlegen`-Aktion eine SCHEMA- UND FACHLICH gültige Eingabe, statt
//   sich auf einen `KONFLIKT_ZYKLUS`-Wurf zu verlassen (der Handler würde dann ohnehin nichts
//   schreiben — `db.transaction()` rollt zurück —, ein Catch dafür wäre nur zusätzliche
//   Komplexität ohne zusätzliche Deckung).
// - `person.loeschen`: `elternschaft.elternteil_id`/`kind_id`, `partnerschaft_person.person_id`
//   und `beteiligung.person_id` sind alle `ON DELETE RESTRICT` (docs/schema/0002_kern.sql) — eine
//   Person, die in einer dieser drei getrackten Listen vorkommt, würde das rohe
//   `SQLITE_CONSTRAINT_FOREIGNKEY` werfen (kein `WurzelFehler`, weil `person-loeschen.ts` das
//   nicht vorab prüft). `personIstGebunden()` erkennt das VORHER anhand des mitgeführten
//   Zustands und macht die Aktion zu einem No-op — wieder: gültige statt zufällig scheiternde
//   Eingaben. `name.person_id` ist dagegen `ON DELETE CASCADE` — eine gelöschte Person nimmt ihre
//   Namen mit, `zustand.namen` wird darum nach einem erfolgreichen `person.loeschen` gefiltert,
//   sonst würde eine spätere `name.aendern/loeschen`-Aktion einen inzwischen kaskadiert
//   gelöschten `nameId` referenzieren.
// - `elternschaft.loeschen`/`partnerschaft.loeschen`/`ereignis.loeschen` räumen (E-7, polymorphe
//   `aussage.subjekt_id` ohne FK-`CASCADE`) ihre Existenz-Aussage manuell mit ab
//   (`aussageRepo.loeschenNachSubjekt`, s. Handler-Kommentare) — UND jede vom Nutzer per
//   `aussage.anlegen` zusätzlich auf dasselbe Subjekt geschriebene Aussage gleich mit (die
//   Löschung ist `DELETE ... WHERE subjekt_typ = @t AND subjekt_id = @id`, ohne
//   `praedikat`-Filter). `zustand.aussagen` wird darum nach jedem dieser drei Löschbefehle
//   entsprechend gefiltert, sonst würde ein späteres `aussage.loeschen` einen bereits
//   verschwundenen `aussageId` referenzieren. `name.loeschen`/`person.loeschen` räumen dagegen
//   KEINE `aussage`-Zeilen ab (`name-loeschen.ts` schreibt von vornherein keine Existenz-Aussage,
//   `person-loeschen.ts` prüft `aussage` gar nicht) — eine Aussage über eine inzwischen gelöschte
//   `name`/`person`-Zeile bleibt als Datensatz unverändert bestehen (nur fachlich "verwaist"), sie
//   verschwindet nicht aus der Tabelle. Für DIESE Invariante (bitgleiche Undo-Rücknahme jedes
//   einzelnen Schritts) ist das unschädlich: die Aussage-Zeile selbst wird von einem
//   `name`/`person`-Löschschritt gar nicht berührt, ihr `aussageId` bleibt darum ein gültiges,
//   weiterhin existierendes Ziel — kein Zustandsabgleich nötig.
// - Jede `anlegen`-Aktion für `elternschaft`/`partnerschaft`/`ereignis` liest sich die versteckte,
//   vom Handler selbst erzeugte Existenz-Aussage (`existenzAussageIdLesen()`, eine einzelne
//   `SELECT`-Abfrage direkt gegen `Tx` — zulässig in `test/`, das keiner der vier
//   Architekturschichten aus CLAUDE.md §2 unterliegt, Muster identisch zu
//   `test/invarianten/_kanonischer-abzug.ts`) zurück und trägt sie in `zustand.aussagen` nach:
//   das macht diese Existenz-Aussagen selbst zu gültigen `aussage.loeschen`-Zielen, statt nur die
//   per `aussage.anlegen` zusätzlich geschriebenen Aussagen zu erreichen.
// - `aussage.anlegen`/`aussage.faktAendern`: DEMOTE-DECKUNG (hueter-Befund, AP-1.12 PR-B —
//   die ursprüngliche Fassung dieses Kommentars behauptete, eine kleine feste `praedikat`-Menge
//   allein mache Wiederholungen "realistisch oft"; belegt waren es 0 von 300 Läufen, weil
//   `subjektWahlRoh % pools.length` die fünf Subjekt-Pools GLEICH oft wählte, obwohl vier davon
//   (`name`/`elternschaft`/`partnerschaft`/`ereignis`) am Anfang jeder Folge leer sind — ein
//   uniform verteilter Modulo trifft darum weit überwiegend leere Pools und damit No-ops, und
//   selbst ein Treffer auf `person` traf `subjektZielRoh % personIds.length` mit wechselnder
//   Poolgröße kaum je zweimal dieselbe Person/dasselbe Prädikat):
//   - `poolIndexBiased()` gewichtet die Poolwahl zu 80 % auf `person` (Index 0) — der einzige Pool,
//     der ab der ersten `person.anlegen`-Aktion garantiert befüllt ist — statt gleich zu verteilen.
//   - `praedikat` bleibt aus einer KLEINEN, festen Wertemenge (jetzt zwei statt vier Werten).
//   - Die eigentliche Garantie liefert die eigene Aktion `aussageFaktAendern`: sie führt Buch über
//     jedes per `aussage.anlegen`/`aussageFaktAendern` erzeugte (subjektTyp, subjektId, praedikat)
//     in `zustand.aussageTripel` und WIEDERHOLT bei jeder weiteren Ausführung eines dieser
//     Dreiklänge — mit `istBevorzugt: 1` erzwungen, sowohl beim erstmaligen Anlegen ALS AUCH bei
//     jeder Wiederholung (der Demote-Zweig in `aussage-anlegen.ts` demoted nur, was zuvor selbst
//     `istBevorzugt=1` war — ein Zufallstreffer mit `istBevorzugt` aus `fc.option()` hätte das nicht
//     zuverlässig sichergestellt). Sobald ein Dreiklang einmal existiert, bleibt jede weitere
//     `aussageFaktAendern`-Ausführung (solange `zustand.aussageTripel` nicht leer ist) ein
//     GARANTIERTER Demote-Treffer statt eines Zufallstreffers. Gelöschte Subjekte werden aus
//     `zustand.aussageTripel` entfernt (dieselben Filter wie bei `zustand.aussagen`), damit nie ein
//     `NICHT_GEFUNDEN_*`-Wurf auf ein inzwischen kaskadiert/manuell gelöschtes Subjekt entsteht.
//
// AP-1.15 PR-B ERWEITERUNG: `beteiligung.loeschen` (AP-1.15 PR-A, `src/main/befehle/beteiligung-
// loeschen.ts`) kommt als eigene Aktion dazu (s. `AktionBeteiligungLoeschen`). Der Generator führt
// dafür `zustand.beteiligungen` (Typ `BeteiligungInfo`) — jede von `ereignisAnlegen` real angelegte
// Beteiligung wird über eine rohe `SELECT`-Abfrage (`beteiligungIdLesen()`, Muster identisch zu
// `existenzAussageIdLesen()`) mit ihrer echten `id` nachgetragen, weil `ereignis.anlegen` selbst nur
// die `ereignisId` zurückgibt. `beteiligungLoeschen` wählt daraus ein EXISTIERENDES Ziel (Index-
// modulo-Länge, dasselbe No-op-Muster wie überall sonst) und entfernt es sowohl aus
// `zustand.beteiligungen` als auch aus der `personIds`-Liste des betroffenen `zustand.ereignisse`-
// Eintrags (die einzige Beteiligung, die diese Person an dieses Ereignis band, ist jetzt weg — s.
// `personIstGebunden()`). Bewusst abgebildet: das zugehörige `ereignis` bleibt bestehen, auch mit 0
// Beteiligungen — Variante A laut `BeteiligungLoeschenEin`-Kommentar (`src/shared/schemata/
// befehle.ts`) löscht ausdrücklich NUR die Beteiligungszeile, nicht das Ereignis. `ereignisLoeschen`
// räumt dafür jetzt zusätzlich alle noch offenen `zustand.beteiligungen`-Einträge des gelöschten
// Ereignisses ab (CASCADE, `ereignis-repo.ts`), sonst könnte ein späteres `beteiligungLoeschen` einen
// bereits kaskadiert gelöschten `id` referenzieren.
//
// AP-1.16 PR-B ERWEITERUNG: ALLE Ort-Schreibbefehle (`src/main/befehle/ort-anlegen.ts` bis
// `ort-externe-id-loeschen.ts`, AP-1.13 PR-C + AP-1.16 PR-A) kommen dazu — `ort.anlegen` war in
// AP-1.13 PR-C bewusst zurückgestellt (Kopfkommentar dort: "AP-1.16 vorbehalten"), holt der
// Generator jetzt nach. Vier neue getrackte Listen (`zustand.ortIds`/`ortsnamen`/
// `ortszugehoerigkeiten`/`ortExterneIds`), dasselbe Index-modulo-Länge-oder-No-op-Muster wie
// überall sonst:
//
// - `ort.anlegen` legt selbst (im Handler, NICHT im Generator) einen primären `ortsname` mit an
//   (analog `ort-anlegen.ts`-Kopfkommentar) — dessen `id` liest der Generator über eine rohe
//   `SELECT`-Abfrage nach (`ortsnameIdLesen()`, Muster identisch zu `beteiligungIdLesen()`) und
//   trägt ihn in `zustand.ortsnamen` nach, damit er ein gültiges `ortsname.aendern`/`.loeschen`-Ziel
//   wird — genau wie die versteckte Existenz-Aussage bei `elternschaft`/`partnerschaft`/`ereignis`.
// - KEIN `ort.loeschen`-Befehl existiert (Kaskaden-Entscheidung offen laut Schema-Kommentar) — damit
//   entfällt jede Kaskaden-Nachpflege für `ort_id`, wenn ein Ort selbst gelöscht würde; `ortsname`/
//   `ortszugehoerigkeit`/`ort_externe_id` werden nur über ihre EIGENEN `loeschen`-Befehle entfernt.
// - `ortszugehoerigkeit.anlegen`: die beiden Orte werden über `zweiVerschiedeneAusListe()` (bereits
//   generisch über `string[]`, unverändert wiederverwendet) IMMER verschieden gewählt UND vorab mit
//   der ECHTEN Produktivfunktion `wuerdeZyklusErzeugen()` (`src/core/ort/zyklus.ts` — eigener
//   Import-Alias `ortWuerdeZyklusErzeugen`, weil `src/core/graph/zyklus.ts` bereits eine
//   gleichnamige Funktion für den Elternschaftsgraphen importiert) NUR gegen die bestehenden Kanten
//   DERSELBEN `art` (politisch/kirchlich getrennt, wie der Handler selbst prüft) geprüft — ein
//   Kandidat, der einen Zyklus schließen würde, wird als No-op übersprungen. Die Namenskollision
//   zwischen dem Aktions-Diskriminator `art` (`'ortszugehoerigkeitAnlegen'`) und dem fachlichen Feld
//   `art` (`'politisch' | 'kirchlich'`) löst `AktionOrtszugehoerigkeitAnlegen` über das Feld
//   `zugehoerigkeitArt` statt `art`.
// - `ort-externe-id.anlegen`: `ort_externe_id` hat den zusammengesetzten Primärschlüssel
//   `(ort_id, system)` (kein eigenes `id`, s. Schema-Kommentar) — ein zweiter Aufruf mit derselben
//   Kombination würde `KONFLIKT_ORT_EXTERNE_ID_DUPLIKAT` werfen. `zustand.ortExterneIds` trackt jede
//   angelegte Kombination; ein Kandidat, dessen `(ortId, system)` bereits existiert, wird als No-op
//   übersprungen (dasselbe Vermeidungsmuster wie beim Zyklus oben, statt sich auf den Wurf zu
//   verlassen, den `db.transaction()` ohnehin zurückrollen würde).
// - Alle übrigen Felder (Koordinaten, Gültigkeitszeiträume, `typ`, `notiz`, …) sind in JEDER
//   betroffenen `Ein`-Nutzlast optional — der Generator setzt sie trotzdem IMMER auf einen
//   konkreten Wert (nie `undefined`), das bleibt schema-konform und erspart das bedingte Spreaden,
//   das `exactOptionalPropertyTypes` sonst an mehreren Stellen erzwingen würde (anders als bei
//   `AktionAussageAnlegen.istBevorzugt` oben, wo "Feld weglassen" selbst ein zu deckender Fall ist).
// - KEINE Anbindung an `AussageSubjektKind`/`aussageSubjektPools()`: `ort` bleibt dort bewusst
//   ausgeschlossen (Kommentar dort weiterhin gültig für DIESES Arbeitspaket) — `ort.anlegen`
//   schreibt keine Existenz-Aussage (`ort-anlegen.ts`-Kopfkommentar: "kein belegbares Fachprädikat"),
//   eine `aussage.anlegen`-Anbindung an Orte ist kein Bestandteil dieses Auftrags.
//
// AP-1.17 PR-B ERWEITERUNG: die zwölf Quellen-/Zitat-/Archiv-/Negativbefund-Schreibbefehle
// (`src/main/befehle/archiv-anlegen.ts` bis `negativbefund-loeschen.ts`, AP-1.17 PR-A1..A4) kommen
// dazu — vier neue getrackte Listen (`zustand.archivIds`/`quelleIds`/`zitatIds`/
// `negativbefundIds`), dasselbe Index-modulo-Länge-oder-No-op-Muster wie überall sonst. Bewusste
// Vereinfachungen:
//
// - Nur die im Auftrag genannten Felder werden mit generierten Werten belegt (`archiv`: `name`/
//   `kontakt`/`url`/`notiz`; `quelle`: `typ`/`titel`/`autor`/`notiz`/optional `archivId`; `zitat`:
//   `quelleId`/`seite`/`transkript`/`konfidenz`; `negativbefund`: `gesuchtePersonId`/optional
//   `quelleId`/`gesuchtesPraedikat`/`zeitraumVon`/`zeitraumBis`/`beschreibung`). Alle übrigen
//   optionalen Felder aus `src/shared/schemata/befehle.ts` (`quelle.archivId` ausgenommen —
//   s. unten — sowie `quelle.informantPersonId`/`audioMediumId`, `zitat.mediumId`,
//   `archiv.ortId`, `quelle.gespraechsdatum`/`zitat.zugriffsdatum`) bleiben unbelegt (schema-
//   konformes Weglassen, analog dem `ortId`/`Datumswert`-Verzicht bei `ereignis`/`partnerschaft`/
//   `aussage`, s. Kopfkommentar oben) — sie würden je eine weitere getrackte Liste
//   (`medienIds`/zusätzliche Personenreferenzen) brauchen, ohne zusätzlichen Erkenntnisgewinn für
//   DIESE Invariante (Undo-Bitgleichheit, nicht Vollständigkeit des Belegpfads).
// - `quelle.anlegen`/`quelle.aendern`: `archivId` ist die einzige Referenz auf eine ANDERE neue
//   Liste (`zustand.archivIds`) — `wahlAufloesen()` (s. unten) bildet das GENAUSO ab wie
//   `istBevorzugt` bei `AktionAussageAnlegen` (immer vorhandener Schlüssel mit `undefined` als
//   möglichem Wert statt eines optionalen Schlüssels, `exactOptionalPropertyTypes`): ein
//   `fc.option()`-Index, der ENTWEDER `nil` ist ODER — bei nichtleerer `archivIds`-Liste — ein
//   bestehendes Archiv referenziert. Ist `archivIds` (noch) leer, macht `wahlAufloesen()` daraus
//   ebenfalls `undefined` (kein separater No-op-Fall nötig — beide Schemata lassen `archivId`
//   weg, das bleibt immer schema-konform, NIE ein Grund, die ganze Aktion zu verwerfen).
// - `negativbefund.anlegen`/`.aendern`: dieselbe `wahlAufloesen()`-Machart für das optionale
//   `quelleId` gegen `zustand.quelleIds`. `gesuchtePersonId` ist dagegen PFLICHT — eine leere
//   `zustand.personIds`-Liste macht die ganze Aktion zum No-op (wie bei jeder anderen personId-
//   referenzierenden Aktion, `zielId()`).
// - `zitat.anlegen` braucht eine bestehende `quelleId` (PFLICHT im Schema) — ist `zustand.
//   quelleIds` (noch) leer, ist die Aktion ein bewusster No-op (kein `fuehreAus()`-Aufruf), exakt
//   das Muster, das `ortszugehoerigkeit.anlegen` gegen eine zu kurze `ortIds`-Liste bereits nutzt.
//   `zitat.aendern` braucht ZUSÄTZLICH eine (nicht notwendigerweise dieselbe) bestehende `quelleId`
//   für das PFLICHT-Feld `quelleId` in `ZitatAendernEin` — beide Ziele werden unabhängig
//   aufgelöst, beide No-op-Fälle einzeln geprüft.
// - `negativbefund` ist — anders als `quelle`/`zitat`/`archiv` — an eine Person gebunden mit
//   `ON DELETE CASCADE` auf `gesuchte_person_id` (docs/schema/0002_kern.sql §2.7, Kommentar dort:
//   "personengebundene Forschungsnotiz, analog `diagnose.person_id`"). Ein `person.loeschen` nimmt
//   darum jeden `negativbefund` mit, dessen `gesuchtePersonId` die gelöschte Person war —
//   `NegativbefundInfo` trackt diese `personId` extra (analog `NameInfo.personId`), der
//   `'loeschen'`-Fall filtert `zustand.negativbefundIds` genauso wie `zustand.namen`, sonst würde
//   ein späteres `negativbefund.aendern`/`.loeschen` einen bereits kaskadiert gelöschten Datensatz
//   referenzieren. `quelle_id` auf `negativbefund` ist dagegen `ON DELETE SET NULL`, aber KEIN
//   `quelle.loeschen`-Befehl existiert (Kaskaden-Entscheidung offen, analog `ort.loeschen`) — damit
//   entfällt jede SET-NULL-Nachpflege für DIESES Arbeitspaket. `archiv_id` auf `quelle` ist ebenso
//   `ON DELETE SET NULL`, aber auch hier existiert kein `archiv.loeschen` — keine Nachpflege nötig.
// - KEIN `quelle.loeschen`/`archiv.loeschen`: beide Kaskaden-Entscheidungen sind laut
//   Abschnittskommentar in `src/shared/schemata/befehle.ts` bewusst offen (analog `ort.loeschen`).
//   `zustand.archivIds`/`quelleIds` bleiben darum reine `string[]` ohne Löschpfad von außen —
//   anders als `zustand.zitatIds` (`zitat.loeschen` existiert) und `zustand.negativbefundIds`
//   (eigener Löschbefehl UND CASCADE über `person.loeschen`, s. oben).
import fc from 'fast-check'
import { GeschlechtEnum, LebendStatusEnum, PlatzhalterGrundEnum } from '../../src/shared/schemata/person'
import { NameTypEnum } from '../../src/shared/schemata/name'
import { ElternschaftTypEnum } from '../../src/shared/schemata/elternschaft'
import { PartnerschaftTypEnum, EndeGrundEnum } from '../../src/shared/schemata/partnerschaft'
import { EreignisTypEnum } from '../../src/shared/schemata/ereignis'
import { BeteiligungRolleEnum } from '../../src/shared/schemata/beteiligung'
import { OrtTypEnum } from '../../src/shared/schemata/ort'
import { OrtszugehoerigkeitArtEnum } from '../../src/shared/schemata/ortszugehoerigkeit'
import { ExterneIdSystemEnum } from '../../src/shared/schemata/ort-externe-id'
import { QuelleTypEnum } from '../../src/shared/schemata/quelle'
import type {
  PersonAnlegenEin,
  PersonFeldSetzenEin,
  NameAnlegenEin,
  ElternschaftAnlegenEin,
  PartnerschaftAnlegenEin,
  EreignisAnlegenEin,
  AussageAnlegenEin,
  OrtAnlegenEin,
  OrtszugehoerigkeitAnlegenEin,
  OrtExterneIdAnlegenEin,
  QuelleAnlegenEin,
} from '../../src/shared/schemata/befehle'
import { fuehreAus } from '../../src/main/befehle/bus'
import type { Tx } from '../../src/main/repositories/basis'
import { wuerdeZyklusErzeugen, type Elternkante } from '../../src/core/graph/zyklus'
import { wuerdeZyklusErzeugen as ortWuerdeZyklusErzeugen, type Ortskante } from '../../src/core/ort/zyklus'
import { transkriptArbitrary } from './_befehlsfolge-beleg'

/**
 * Verteilendes `Omit` (`T extends unknown ? ... : never` erzwingt die Verteilung über jedes
 * Unionsmitglied einzeln): das eingebaute `Omit<T, K>` verteilt NICHT über eine diskriminierte
 * Union (`Pick<T, Exclude<keyof T, K>>` bildet stattdessen die Vereinigung aller Schlüssel/Werte
 * über ALLE Mitglieder auf einmal ab und verwirft damit genau die Kopplung `feld` ↔ `wert`, die
 * `feldSetzenEin()` unten für ihr `switch` braucht).
 */
type VerteilendesOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never

/** `person.feldSetzen`-Nutzlast ohne `id` — die `id` kommt erst zur Ausführungszeit aus `zustand.personIds` (s. Modul-Kommentar). */
type FeldwertOhneId = VerteilendesOmit<PersonFeldSetzenEin, 'id'>

export interface AktionAnlegen {
  readonly art: 'anlegen'
  readonly ein: PersonAnlegenEin
}

export interface AktionFeldSetzen {
  readonly art: 'feldSetzen'
  readonly zielRoh: number
  readonly feldwert: FeldwertOhneId
}

export interface AktionLoeschen {
  readonly art: 'loeschen'
  readonly zielRoh: number
}

// -----------------------------------------------------------------------------------------------
// AP-1.12 PR-B: Aktionstypen für die neuen Befehle (s. Kopfkommentar für die Designentscheidungen).
// -----------------------------------------------------------------------------------------------

type NameTyp = NameAnlegenEin['typ']
type ElternschaftTyp = ElternschaftAnlegenEin['typ']
type PartnerschaftTyp = PartnerschaftAnlegenEin['typ']
type EndeGrund = NonNullable<PartnerschaftAnlegenEin['endeGrund']>
type EreignisTyp = EreignisAnlegenEin['typ']
type BeteiligungRolle = EreignisAnlegenEin['beteiligungen'][number]['rolle']

export interface AktionNameAnlegen {
  readonly art: 'nameAnlegen'
  readonly personZielRoh: number
  readonly typ: NameTyp
  readonly nachname: string
  readonly vornamen: string
}

export interface AktionNameAendern {
  readonly art: 'nameAendern'
  readonly nameZielRoh: number
  readonly typ: NameTyp
  readonly nachname: string
  readonly vornamen: string
}

export interface AktionNameLoeschen {
  readonly art: 'nameLoeschen'
  readonly nameZielRoh: number
}

/**
 * AP-1.33 PR-B ERWEITERUNG: `hauptname.wechseln` (`src/main/befehle/hauptname-wechseln.ts`) — macht
 * eine bestehende, NICHT bevorzugte Form zur bevorzugten ihrer Person. `nameZielRoh` wählt die neue
 * Form aus `zustand.namen`; die alte (bisher bevorzugte) liest `aktionAusfuehren()` zur
 * Ausführungszeit aus `name_form` nach (der Generator trackt `ist_bevorzugt` nicht — `name.anlegen`
 * und `name.loeschen` entscheiden das selbst, s. `loeschenMitNachruecken`). Ist die gewählte Form
 * schon die bevorzugte, ist die Aktion ein No-op (der Handler würde ohnehin nichts schreiben).
 */
export interface AktionHauptnameWechseln {
  readonly art: 'hauptnameWechseln'
  readonly nameZielRoh: number
}

/**
 * AP-1.33 PR-B ERWEITERUNG („MEHRFORMEN-DECKUNG", Muster wie „DEMOTE-DECKUNG"): `name.anlegen` für
 * eine Person, die BEREITS eine Form hat (`nameZielRoh` wählt eine bestehende Form, ihre Person
 * bekommt eine weitere). `nameAnlegen` verteilt Formen gleichmäßig über alle Personen — Personen mit
 * zwei oder mehr Formen, die `hauptname.wechseln` und das Nachrücken in `name.loeschen`
 * (`loeschenMitNachruecken`) erst erreichbar machen, entstehen so nur selten. Diese Aktion erzeugt
 * sie gezielt. Temporäre Zählung (NICHT committet) über `{ seed: 20260924, numRuns: 300 }` ohne
 * diese Aktion: `hauptname.wechseln` 6, Nachrücken 1 echte Treffer; Zahlen mit ihr im PR-Bericht.
 */
export interface AktionNameWeitereFormAnlegen {
  readonly art: 'nameWeitereFormAnlegen'
  readonly nameZielRoh: number
  readonly typ: NameTyp
  readonly nachname: string
  readonly vornamen: string
}

export interface AktionElternschaftAnlegen {
  readonly art: 'elternschaftAnlegen'
  readonly elternteilZielRoh: number
  readonly kindZielRoh: number
  readonly typ: ElternschaftTyp
  readonly konfidenz: number
  readonly notiz: string
}

export interface AktionElternschaftAendern {
  readonly art: 'elternschaftAendern'
  readonly elternschaftZielRoh: number
  readonly typ: ElternschaftTyp
  readonly notiz: string
}

export interface AktionElternschaftLoeschen {
  readonly art: 'elternschaftLoeschen'
  readonly elternschaftZielRoh: number
}

export interface AktionPartnerschaftAnlegen {
  readonly art: 'partnerschaftAnlegen'
  readonly personZielRohA: number
  readonly personZielRohB: number
  readonly typ: PartnerschaftTyp
  readonly konfidenz: number
  readonly notiz: string
}

export interface AktionPartnerschaftAendern {
  readonly art: 'partnerschaftAendern'
  readonly partnerschaftZielRoh: number
  readonly typ: PartnerschaftTyp
  readonly endeGrund: EndeGrund
  readonly notiz: string
}

export interface AktionPartnerschaftLoeschen {
  readonly art: 'partnerschaftLoeschen'
  readonly partnerschaftZielRoh: number
}

export interface AktionEreignisAnlegen {
  readonly art: 'ereignisAnlegen'
  readonly personZielRoh: number
  readonly typ: EreignisTyp
  readonly rolle: BeteiligungRolle
  readonly konfidenz: number
  readonly beschreibung: string
}

export interface AktionEreignisAendern {
  readonly art: 'ereignisAendern'
  readonly ereignisZielRoh: number
  readonly typ: EreignisTyp
  readonly beschreibung: string
}

export interface AktionEreignisLoeschen {
  readonly art: 'ereignisLoeschen'
  readonly ereignisZielRoh: number
}

/**
 * AP-1.15 PR-B ERWEITERUNG: `beteiligung.loeschen` — wählt eine EXISTIERENDE Beteiligung (über
 * `zustand.beteiligungen`, s. dortiger Typkommentar) statt eine `personId`/`ereignisId` direkt zu
 * referenzieren. `beteiligung.loeschen` (`src/shared/schemata/befehle.ts`) nimmt ausschließlich die
 * `id` der Beteiligungszeile selbst entgegen (Variante A, s. Kommentar an `BeteiligungLoeschenEin`)
 * — das zugehörige `ereignis` bleibt bestehen, auch wenn danach keine Beteiligung mehr übrig ist
 * (der Generator bildet genau diesen "0 Beteiligungen"-Fall ab, s. `aktionAusfuehren()` unten).
 */
export interface AktionBeteiligungLoeschen {
  readonly art: 'beteiligungLoeschen'
  readonly beteiligungZielRoh: number
}

/** Genau eines von `wertText`/`wertZahl` (nie `wertRefId`, s. Kopfkommentar) — als eigene
 * diskriminierte Union statt zweier optionaler Felder, damit `aussageAnlegenEinBauen()` unten nie
 * versehentlich beide gleichzeitig setzen kann (das wäre ein Zod-`superRefine`-Fehlschlag,
 * `aussageAnlegenEinSchema`). */
export type AktionAussageWert = { readonly art: 'text'; readonly wert: string } | { readonly art: 'zahl'; readonly wert: number }

export interface AktionAussageAnlegen {
  readonly art: 'aussageAnlegen'
  readonly subjektWahlRoh: number
  readonly subjektZielRoh: number
  readonly praedikat: string
  readonly wert: AktionAussageWert
  readonly konfidenz: number
  /** Bewusst ein immer vorhandener (nicht optionaler) Schlüssel mit `undefined` als möglichem
   * Wert statt eines optionalen Schlüssels: `exactOptionalPropertyTypes` (CLAUDE.md §4) verbietet
   * sonst das Zuweisen von `undefined` an einen `?`-Schlüssel. `aussageAnlegenEinBauen()` baut die
   * echte `AussageAnlegenEin`-Nutzlast über bedingtes Spreaden, damit der Schlüssel dort bei
   * `undefined` ganz FEHLT statt explizit `undefined` zu sein (dasselbe Problem in die andere
   * Richtung). */
  readonly istBevorzugt: 0 | 1 | undefined
}

export interface AktionAussageLoeschen {
  readonly art: 'aussageLoeschen'
  readonly aussageZielRoh: number
}

/**
 * AP-1.29 PR-B ERWEITERUNG: `aussage.aendern` (`src/main/befehle/aussage-aendern.ts`,
 * Koaleszenzschlüssel `aussage:<id>` — die generische Koaleszenz-Fallunterscheidung in
 * `undo-bitgleich.test.ts` (Modul-Kommentar Punkt 2) deckt das bereits ab, ohne dass dieser
 * Generator selbst etwas dafür tun muss). Wählt eine BESTEHENDE `aussage` aus `zustand.aussagen`
 * (Index-modulo-Länge-oder-No-op, wie überall sonst) und patcht Wert/Konfidenz/Begründung/
 * Unsicherheit/Gültigkeitszeitraum — GENAU wie bei `AktionAussageAnlegen` nie `wertRefId` (der
 * Handler-Vertrag verlangt exakt eines von `wertText`/`wertZahl`/`wertRefId`, s.
 * `aussageAendernEinSchema`-Kopfkommentar dort). KEIN `datum`: optional im Schema, derselbe
 * Verzicht wie bei `aussage.anlegen`/`ereignis`/`partnerschaft` oben (Kopfkommentar dieser Datei) —
 * `Datumswert` hat eine eigene mehrteilige `superRefine`-Gültigkeitslogik, die hier keinen
 * zusätzlichen Mehrzeilen-Fall aufdeckt. `begruendung`/`unsicherheit`/`gueltigVon`/`gueltigBis`
 * bekommen IMMER einen konkreten Wert (nie `undefined`) — analog `AktionOrtAendern` oben, jedes
 * Feld ist im Schema optional, ein konkreter Wert bleibt genauso schema-konform und erspart das
 * bedingte Spreaden.
 */
export interface AktionAussageAendern {
  readonly art: 'aussageAendern'
  readonly aussageZielRoh: number
  readonly wert: AktionAussageWert
  readonly konfidenz: number
  readonly begruendung: string
  readonly unsicherheit: string
  readonly gueltigVon: number
  readonly gueltigBis: number
}

/**
 * AP-1.29 PR-B ERWEITERUNG: `aussage_zitat.anlegen` (`src/main/befehle/aussage-zitat-anlegen.ts`)
 * — verknüpft eine BESTEHENDE `aussage` (`zustand.aussagen`) mit einem BESTEHENDEN `zitat`
 * (`zustand.zitatIds`, AP-1.17 PR-B). Braucht BEIDE Listen nichtleer — leere `aussagen` ODER leere
 * `zitatIds` machen die Aktion zum No-op (zwei No-op-Prüfungen statt einer, dasselbe Muster wie
 * `zitatAendern` oben mit zwei unabhängigen Zielen). Eine bereits bestehende Kombination
 * (zusammengesetzter Primärschlüssel `(aussage_id, zitat_id)`, s. Handler-Kommentar) würde
 * `KONFLIKT_BEREITS_VORHANDEN` werfen — `zustand.aussageZitatVerknuepfungen` trackt jede angelegte
 * Kombination, ein Kandidat mit bereits vergebener Kombination wird als No-op übersprungen
 * (dasselbe Vermeidungsmuster wie bei `ort-externe-id.anlegen` oben).
 */
export interface AktionAussageZitatAnlegen {
  readonly art: 'aussageZitatAnlegen'
  readonly aussageZielRoh: number
  readonly zitatZielRoh: number
}

/**
 * AP-1.29 PR-B ERWEITERUNG: `aussage_zitat.loeschen` (`src/main/befehle/aussage-zitat-loeschen.ts`)
 * — löst NUR die Verknüpfung, `aussage` UND `zitat` bleiben unberührt (Handler-Kommentar). Wählt
 * eine EXISTIERENDE Verknüpfung aus `zustand.aussageZitatVerknuepfungen` (Index-modulo-Länge-oder-
 * No-op, wie überall sonst).
 */
export interface AktionAussageZitatLoeschen {
  readonly art: 'aussageZitatLoeschen'
  readonly verknuepfungZielRoh: number
}

/** Garantiert (statt zufällig) den "Fakt ändern"-Demote-Pfad — s. Kopfkommentar dieser Datei
 * ("DEMOTE-DECKUNG"). Existiert bereits ein getrackter (subjektTyp, subjektId, praedikat)-Dreiklang
 * (`zustand.aussageTripel`), wiederholt diese Aktion GENAU DIESEN Dreiklang mit `istBevorzugt: 1`
 * (garantierter Demote-Treffer); sonst legt sie — analog zu `aussage.anlegen` — einen neuen an
 * (ebenfalls mit `istBevorzugt: 1`) und trackt ihn für spätere Wiederholungen. */
export interface AktionAussageFaktAendern {
  readonly art: 'aussageFaktAendern'
  readonly tripelWahlRoh: number
  readonly subjektWahlRoh: number
  readonly subjektZielRoh: number
  readonly praedikat: string
  readonly wert: AktionAussageWert
  readonly konfidenz: number
}

// -----------------------------------------------------------------------------------------------
// AP-1.16 PR-B: Aktionstypen für die Ort-Befehle (s. Kopfkommentar für die Designentscheidungen).
// -----------------------------------------------------------------------------------------------

type OrtTyp = NonNullable<OrtAnlegenEin['typ']>
type OrtszugehoerigkeitArt = OrtszugehoerigkeitAnlegenEin['art']
type ExterneIdSystem = OrtExterneIdAnlegenEin['system']

export interface AktionOrtAnlegen {
  readonly art: 'ortAnlegen'
  readonly name: string
  readonly typ: OrtTyp
  readonly notiz: string
}

export interface AktionOrtAendern {
  readonly art: 'ortAendern'
  readonly ortZielRoh: number
  readonly typ: OrtTyp
  readonly koordinatenLat: number
  readonly koordinatenLon: number
  readonly existiertVon: number
  readonly existiertBis: number
  readonly notiz: string
}

export interface AktionOrtsnameAnlegen {
  readonly art: 'ortsnameAnlegen'
  readonly ortZielRoh: number
  readonly name: string
  readonly sprache: string
  readonly gueltigVon: number
  readonly gueltigBis: number
  readonly istBevorzugt: 0 | 1
  readonly originalText: string
}

export interface AktionOrtsnameAendern {
  readonly art: 'ortsnameAendern'
  readonly ortsnameZielRoh: number
  readonly name: string
  readonly sprache: string
  readonly gueltigVon: number
  readonly gueltigBis: number
  readonly istBevorzugt: 0 | 1
  readonly originalText: string
}

export interface AktionOrtsnameLoeschen {
  readonly art: 'ortsnameLoeschen'
  readonly ortsnameZielRoh: number
}

/** `zugehoerigkeitArt` statt `art`, um die Kollision mit dem Aktions-Diskriminator `art`
 * (`'ortszugehoerigkeitAnlegen'`) zu vermeiden — s. Kopfkommentar. */
export interface AktionOrtszugehoerigkeitAnlegen {
  readonly art: 'ortszugehoerigkeitAnlegen'
  readonly ortZielRohA: number
  readonly ortZielRohB: number
  readonly zugehoerigkeitArt: OrtszugehoerigkeitArt
  readonly gueltigVon: number
  readonly gueltigBis: number
}

export interface AktionOrtszugehoerigkeitAendern {
  readonly art: 'ortszugehoerigkeitAendern'
  readonly ortszugehoerigkeitZielRoh: number
  readonly gueltigVon: number
  readonly gueltigBis: number
}

export interface AktionOrtszugehoerigkeitLoeschen {
  readonly art: 'ortszugehoerigkeitLoeschen'
  readonly ortszugehoerigkeitZielRoh: number
}

export interface AktionOrtExterneIdAnlegen {
  readonly art: 'ortExterneIdAnlegen'
  readonly ortZielRoh: number
  readonly system: ExterneIdSystem
  readonly wert: string
}

export interface AktionOrtExterneIdLoeschen {
  readonly art: 'ortExterneIdLoeschen'
  readonly ortExterneIdZielRoh: number
}

// -----------------------------------------------------------------------------------------------
// AP-1.17 PR-B: Aktionstypen für die Archiv-/Quelle-/Zitat-/Negativbefund-Befehle (s.
// Kopfkommentar für die Designentscheidungen).
// -----------------------------------------------------------------------------------------------

type QuelleTyp = QuelleAnlegenEin['typ']

export interface AktionArchivAnlegen {
  readonly art: 'archivAnlegen'
  readonly name: string
  readonly kontakt: string
  readonly url: string
  readonly notiz: string
}

export interface AktionArchivAendern {
  readonly art: 'archivAendern'
  readonly archivZielRoh: number
  readonly name: string
  readonly kontakt: string
  readonly url: string
  readonly notiz: string
}

/** `archivWahlRoh` löst `wahlAufloesen()` gegen `zustand.archivIds` auf (s. Kopfkommentar) —
 * `undefined` bleibt schema-konform weglassbar (`QuelleAnlegenEin.archivId` ist optional). */
export interface AktionQuelleAnlegen {
  readonly art: 'quelleAnlegen'
  readonly typ: QuelleTyp
  readonly titel: string
  readonly autor: string
  readonly notiz: string
  readonly archivWahlRoh: number | undefined
}

export interface AktionQuelleAendern {
  readonly art: 'quelleAendern'
  readonly quelleZielRoh: number
  readonly typ: QuelleTyp
  readonly titel: string
  readonly autor: string
  readonly notiz: string
  readonly archivWahlRoh: number | undefined
}

/** `quelleZielRoh` braucht eine bereits bestehende `quelleId` (Pflichtfeld) — leere
 * `zustand.quelleIds` macht die Aktion zum No-op (s. Kopfkommentar). AP-1.34 PR-B2: `transkript`
 * aus `transkriptArbitrary()` (`_befehlsfolge-beleg.ts`, Umlaute/Emoji statt nur ASCII) und
 * optional — `undefined` lässt den Schlüssel weg (bedingtes Spreaden, `exactOptionalPropertyTypes`),
 * das Zitat hat dann KEIN Transkript (NULL): der Fall „Anker ohne Transkript" (§31 U-1.34-E4/F4). */
export interface AktionZitatAnlegen {
  readonly art: 'zitatAnlegen'
  readonly quelleZielRoh: number
  readonly seite: string
  readonly transkript: string | undefined
  readonly konfidenz: number
}

export interface AktionZitatAendern {
  readonly art: 'zitatAendern'
  readonly zitatZielRoh: number
  readonly quelleZielRoh: number
  readonly seite: string
  readonly transkript: string
  readonly konfidenz: number
}

export interface AktionZitatLoeschen {
  readonly art: 'zitatLoeschen'
  readonly zitatZielRoh: number
}

/** `quelleWahlRoh` löst `wahlAufloesen()` gegen `zustand.quelleIds` auf (optionales Feld, s.
 * Kopfkommentar) — `personZielRoh` referenziert die PFLICHT-`gesuchtePersonId` über `zielId()`. */
export interface AktionNegativbefundAnlegen {
  readonly art: 'negativbefundAnlegen'
  readonly personZielRoh: number
  readonly quelleWahlRoh: number | undefined
  readonly gesuchtesPraedikat: string
  readonly zeitraumVon: number
  readonly zeitraumBis: number
  readonly beschreibung: string
}

export interface AktionNegativbefundAendern {
  readonly art: 'negativbefundAendern'
  readonly negativbefundZielRoh: number
  readonly personZielRoh: number
  readonly quelleWahlRoh: number | undefined
  readonly gesuchtesPraedikat: string
  readonly zeitraumVon: number
  readonly zeitraumBis: number
  readonly beschreibung: string
}

export interface AktionNegativbefundLoeschen {
  readonly art: 'negativbefundLoeschen'
  readonly negativbefundZielRoh: number
}

export type Aktion =
  | AktionAnlegen
  | AktionFeldSetzen
  | AktionLoeschen
  | AktionNameAnlegen
  | AktionNameAendern
  | AktionNameLoeschen
  | AktionHauptnameWechseln
  | AktionNameWeitereFormAnlegen
  | AktionElternschaftAnlegen
  | AktionElternschaftAendern
  | AktionElternschaftLoeschen
  | AktionPartnerschaftAnlegen
  | AktionPartnerschaftAendern
  | AktionPartnerschaftLoeschen
  | AktionEreignisAnlegen
  | AktionEreignisAendern
  | AktionEreignisLoeschen
  | AktionBeteiligungLoeschen
  | AktionAussageAnlegen
  | AktionAussageLoeschen
  | AktionAussageFaktAendern
  | AktionAussageAendern
  | AktionAussageZitatAnlegen
  | AktionAussageZitatLoeschen
  | AktionOrtAnlegen
  | AktionOrtAendern
  | AktionOrtsnameAnlegen
  | AktionOrtsnameAendern
  | AktionOrtsnameLoeschen
  | AktionOrtszugehoerigkeitAnlegen
  | AktionOrtszugehoerigkeitAendern
  | AktionOrtszugehoerigkeitLoeschen
  | AktionOrtExterneIdAnlegen
  | AktionOrtExterneIdLoeschen
  | AktionArchivAnlegen
  | AktionArchivAendern
  | AktionQuelleAnlegen
  | AktionQuelleAendern
  | AktionZitatAnlegen
  | AktionZitatAendern
  | AktionZitatLoeschen
  | AktionNegativbefundAnlegen
  | AktionNegativbefundAendern
  | AktionNegativbefundLoeschen

/** Arbitrary für eine schema-konforme `PersonAnlegenEin`-Nutzlast (`personAnlegenEinSchema`, `src/shared/schemata/befehle.ts`). */
function personAnlegenEinArbitrary(): fc.Arbitrary<PersonAnlegenEin> {
  return fc.record(
    {
      geschlecht: fc.constantFrom(...GeschlechtEnum.options),
      lebend_status: fc.constantFrom(...LebendStatusEnum.options),
      privat: fc.constantFrom<0 | 1>(0, 1),
      notiz: fc.string(),
      gesperrt_bis: fc.integer(),
      ist_platzhalter: fc.constantFrom<0 | 1>(0, 1),
      platzhalter_grund: fc.constantFrom(...PlatzhalterGrundEnum.options),
    },
    { requiredKeys: ['privat', 'ist_platzhalter'] },
  )
}

/** Arbitrary für eine schema-konforme `FeldwertOhneId` — eine der sieben Varianten aus `personFeldSetzenEinSchema` (ohne `id`). */
function feldwertArbitrary(): fc.Arbitrary<FeldwertOhneId> {
  return fc.oneof(
    fc.record({ feld: fc.constant('geschlecht' as const), wert: fc.constantFrom(...GeschlechtEnum.options) }),
    fc.record({ feld: fc.constant('lebend_status' as const), wert: fc.constantFrom(...LebendStatusEnum.options) }),
    fc.record({ feld: fc.constant('privat' as const), wert: fc.constantFrom<0 | 1>(0, 1) }),
    fc.record({ feld: fc.constant('notiz' as const), wert: fc.string() }),
    fc.record({ feld: fc.constant('gesperrt_bis' as const), wert: fc.integer() }),
    fc.record({ feld: fc.constant('ist_platzhalter' as const), wert: fc.constantFrom<0 | 1>(0, 1) }),
    fc.record({ feld: fc.constant('platzhalter_grund' as const), wert: fc.constantFrom(...PlatzhalterGrundEnum.options) }),
  )
}

function nameAnlegenAktionArbitrary(): fc.Arbitrary<AktionNameAnlegen> {
  return fc
    .record({
      personZielRoh: fc.nat(),
      typ: fc.constantFrom(...NameTypEnum.options),
      nachname: fc.string(),
      vornamen: fc.string(),
    })
    .map((r): AktionNameAnlegen => ({ art: 'nameAnlegen', ...r }))
}

function nameAendernAktionArbitrary(): fc.Arbitrary<AktionNameAendern> {
  return fc
    .record({
      nameZielRoh: fc.nat(),
      typ: fc.constantFrom(...NameTypEnum.options),
      nachname: fc.string(),
      vornamen: fc.string(),
    })
    .map((r): AktionNameAendern => ({ art: 'nameAendern', ...r }))
}

function nameLoeschenAktionArbitrary(): fc.Arbitrary<AktionNameLoeschen> {
  return fc.nat().map((nameZielRoh): AktionNameLoeschen => ({ art: 'nameLoeschen', nameZielRoh }))
}

/** AP-1.33 PR-B: s. Typkommentar `AktionNameWeitereFormAnlegen`. */
function nameWeitereFormAnlegenAktionArbitrary(): fc.Arbitrary<AktionNameWeitereFormAnlegen> {
  return fc
    .record({
      nameZielRoh: fc.nat(),
      typ: fc.constantFrom(...NameTypEnum.options),
      nachname: fc.string(),
      vornamen: fc.string(),
    })
    .map((r): AktionNameWeitereFormAnlegen => ({ art: 'nameWeitereFormAnlegen', ...r }))
}

/** AP-1.33 PR-B: s. Typkommentar `AktionHauptnameWechseln`. */
function hauptnameWechselnAktionArbitrary(): fc.Arbitrary<AktionHauptnameWechseln> {
  return fc.nat().map((nameZielRoh): AktionHauptnameWechseln => ({ art: 'hauptnameWechseln', nameZielRoh }))
}

function elternschaftAnlegenAktionArbitrary(): fc.Arbitrary<AktionElternschaftAnlegen> {
  return fc
    .record({
      elternteilZielRoh: fc.nat(),
      kindZielRoh: fc.nat(),
      typ: fc.constantFrom(...ElternschaftTypEnum.options),
      konfidenz: fc.integer({ min: 1, max: 4 }),
      notiz: fc.string(),
    })
    .map((r): AktionElternschaftAnlegen => ({ art: 'elternschaftAnlegen', ...r }))
}

function elternschaftAendernAktionArbitrary(): fc.Arbitrary<AktionElternschaftAendern> {
  return fc
    .record({
      elternschaftZielRoh: fc.nat(),
      typ: fc.constantFrom(...ElternschaftTypEnum.options),
      notiz: fc.string(),
    })
    .map((r): AktionElternschaftAendern => ({ art: 'elternschaftAendern', ...r }))
}

function elternschaftLoeschenAktionArbitrary(): fc.Arbitrary<AktionElternschaftLoeschen> {
  return fc.nat().map((elternschaftZielRoh): AktionElternschaftLoeschen => ({ art: 'elternschaftLoeschen', elternschaftZielRoh }))
}

function partnerschaftAnlegenAktionArbitrary(): fc.Arbitrary<AktionPartnerschaftAnlegen> {
  return fc
    .record({
      personZielRohA: fc.nat(),
      personZielRohB: fc.nat(),
      typ: fc.constantFrom(...PartnerschaftTypEnum.options),
      konfidenz: fc.integer({ min: 1, max: 4 }),
      notiz: fc.string(),
    })
    .map((r): AktionPartnerschaftAnlegen => ({ art: 'partnerschaftAnlegen', ...r }))
}

function partnerschaftAendernAktionArbitrary(): fc.Arbitrary<AktionPartnerschaftAendern> {
  return fc
    .record({
      partnerschaftZielRoh: fc.nat(),
      typ: fc.constantFrom(...PartnerschaftTypEnum.options),
      endeGrund: fc.constantFrom(...EndeGrundEnum.options),
      notiz: fc.string(),
    })
    .map((r): AktionPartnerschaftAendern => ({ art: 'partnerschaftAendern', ...r }))
}

function partnerschaftLoeschenAktionArbitrary(): fc.Arbitrary<AktionPartnerschaftLoeschen> {
  return fc.nat().map((partnerschaftZielRoh): AktionPartnerschaftLoeschen => ({ art: 'partnerschaftLoeschen', partnerschaftZielRoh }))
}

function ereignisAnlegenAktionArbitrary(): fc.Arbitrary<AktionEreignisAnlegen> {
  return fc
    .record({
      personZielRoh: fc.nat(),
      typ: fc.constantFrom(...EreignisTypEnum.options),
      rolle: fc.constantFrom(...BeteiligungRolleEnum.options),
      konfidenz: fc.integer({ min: 1, max: 4 }),
      beschreibung: fc.string(),
    })
    .map((r): AktionEreignisAnlegen => ({ art: 'ereignisAnlegen', ...r }))
}

function ereignisAendernAktionArbitrary(): fc.Arbitrary<AktionEreignisAendern> {
  return fc
    .record({
      ereignisZielRoh: fc.nat(),
      typ: fc.constantFrom(...EreignisTypEnum.options),
      beschreibung: fc.string(),
    })
    .map((r): AktionEreignisAendern => ({ art: 'ereignisAendern', ...r }))
}

function ereignisLoeschenAktionArbitrary(): fc.Arbitrary<AktionEreignisLoeschen> {
  return fc.nat().map((ereignisZielRoh): AktionEreignisLoeschen => ({ art: 'ereignisLoeschen', ereignisZielRoh }))
}

function beteiligungLoeschenAktionArbitrary(): fc.Arbitrary<AktionBeteiligungLoeschen> {
  return fc.nat().map((beteiligungZielRoh): AktionBeteiligungLoeschen => ({ art: 'beteiligungLoeschen', beteiligungZielRoh }))
}

function aussageWertArbitrary(): fc.Arbitrary<AktionAussageWert> {
  return fc.oneof(
    fc.string().map((wert): AktionAussageWert => ({ art: 'text', wert })),
    fc.integer().map((wert): AktionAussageWert => ({ art: 'zahl', wert })),
  )
}

/** `praedikat` aus einer kleinen, festen Wertemenge (zwei Werte, s. Kopfkommentar "DEMOTE-
 * DECKUNG") — begünstigt Wiederholungen desselben (subjektTyp, subjektId, praedikat)-Dreiklangs.
 * Die ZUVERLÄSSIGE Demote-Deckung liefert aber `aussageFaktAendernAktionArbitrary()` unten, nicht
 * diese Funktion allein (s. Kopfkommentar). */
function aussageAnlegenAktionArbitrary(): fc.Arbitrary<AktionAussageAnlegen> {
  return fc
    .record({
      subjektWahlRoh: fc.nat(),
      subjektZielRoh: fc.nat(),
      praedikat: fc.constantFrom('beruf', 'wohnort'),
      wert: aussageWertArbitrary(),
      konfidenz: fc.integer({ min: 1, max: 4 }),
      istBevorzugt: fc.option(fc.constantFrom<0 | 1>(0, 1), { nil: undefined }),
    })
    .map((r): AktionAussageAnlegen => ({ art: 'aussageAnlegen', ...r }))
}

function aussageLoeschenAktionArbitrary(): fc.Arbitrary<AktionAussageLoeschen> {
  return fc.nat().map((aussageZielRoh): AktionAussageLoeschen => ({ art: 'aussageLoeschen', aussageZielRoh }))
}

/** s. Kopfkommentar "DEMOTE-DECKUNG" und Typkommentar bei `AktionAussageFaktAendern`. Derselbe
 * kleine, feste `praedikat`-Wertevorrat wie `aussageAnlegenAktionArbitrary()` — bewusst dieselben
 * zwei Werte, damit ein per `aussage.anlegen` zufällig erzeugter Dreiklang ebenfalls als
 * Wiederholungsziel taugt, sobald `zustand.aussageTripel` ihn enthält. */
function aussageFaktAendernAktionArbitrary(): fc.Arbitrary<AktionAussageFaktAendern> {
  return fc
    .record({
      tripelWahlRoh: fc.nat(),
      subjektWahlRoh: fc.nat(),
      subjektZielRoh: fc.nat(),
      praedikat: fc.constantFrom('beruf', 'wohnort'),
      wert: aussageWertArbitrary(),
      konfidenz: fc.integer({ min: 1, max: 4 }),
    })
    .map((r): AktionAussageFaktAendern => ({ art: 'aussageFaktAendern', ...r }))
}

/** AP-1.29 PR-B: s. Typkommentar `AktionAussageAendern`. */
function aussageAendernAktionArbitrary(): fc.Arbitrary<AktionAussageAendern> {
  return fc
    .record({
      aussageZielRoh: fc.nat(),
      wert: aussageWertArbitrary(),
      konfidenz: fc.integer({ min: 1, max: 4 }),
      begruendung: fc.string(),
      unsicherheit: fc.string(),
      gueltigVon: fc.integer(),
      gueltigBis: fc.integer(),
    })
    .map((r): AktionAussageAendern => ({ art: 'aussageAendern', ...r }))
}

/** AP-1.29 PR-B: s. Typkommentar `AktionAussageZitatAnlegen`. */
function aussageZitatAnlegenAktionArbitrary(): fc.Arbitrary<AktionAussageZitatAnlegen> {
  return fc
    .record({ aussageZielRoh: fc.nat(), zitatZielRoh: fc.nat() })
    .map((r): AktionAussageZitatAnlegen => ({ art: 'aussageZitatAnlegen', ...r }))
}

/** AP-1.29 PR-B: s. Typkommentar `AktionAussageZitatLoeschen`. */
function aussageZitatLoeschenAktionArbitrary(): fc.Arbitrary<AktionAussageZitatLoeschen> {
  return fc
    .nat()
    .map((verknuepfungZielRoh): AktionAussageZitatLoeschen => ({ art: 'aussageZitatLoeschen', verknuepfungZielRoh }))
}

// -----------------------------------------------------------------------------------------------
// AP-1.16 PR-B: Arbitraries für die Ort-Befehle (s. Kopfkommentar für die Designentscheidungen).
// Jedes Feld bekommt IMMER einen konkreten Wert (nie `undefined`) — jedes betroffene `*Ein`
// erlaubt das ebenfalls, weil alle diese Felder dort optional sind (s. `src/shared/schemata/
// befehle.ts`); ein weggelassenes Feld wäre GENAUSO schema-konform, würde aber das bedingte
// Spreaden erzwingen, das `AktionAussageAnlegen.istBevorzugt` oben aus einem anderen Grund braucht
// (dort ist "Feld weglassen" selbst ein zu deckender Fall). `name`/`wert` (bei
// `ort.anlegen`/`ortsname.anlegen`/`.aendern`/`ort-externe-id.anlegen`) nutzen `minLength: 1` —
// die jeweiligen Schemata erzwingen `z.string().min(1)`.
// -----------------------------------------------------------------------------------------------

function ortAnlegenAktionArbitrary(): fc.Arbitrary<AktionOrtAnlegen> {
  return fc
    .record({
      name: fc.string({ minLength: 1 }),
      typ: fc.constantFrom(...OrtTypEnum.options),
      notiz: fc.string(),
    })
    .map((r): AktionOrtAnlegen => ({ art: 'ortAnlegen', ...r }))
}

function ortAendernAktionArbitrary(): fc.Arbitrary<AktionOrtAendern> {
  return fc
    .record({
      ortZielRoh: fc.nat(),
      typ: fc.constantFrom(...OrtTypEnum.options),
      koordinatenLat: fc.double({ min: -90, max: 90, noNaN: true }),
      koordinatenLon: fc.double({ min: -180, max: 180, noNaN: true }),
      existiertVon: fc.integer(),
      existiertBis: fc.integer(),
      notiz: fc.string(),
    })
    .map((r): AktionOrtAendern => ({ art: 'ortAendern', ...r }))
}

function ortsnameAnlegenAktionArbitrary(): fc.Arbitrary<AktionOrtsnameAnlegen> {
  return fc
    .record({
      ortZielRoh: fc.nat(),
      name: fc.string({ minLength: 1 }),
      sprache: fc.string(),
      gueltigVon: fc.integer(),
      gueltigBis: fc.integer(),
      istBevorzugt: fc.constantFrom<0 | 1>(0, 1),
      originalText: fc.string(),
    })
    .map((r): AktionOrtsnameAnlegen => ({ art: 'ortsnameAnlegen', ...r }))
}

function ortsnameAendernAktionArbitrary(): fc.Arbitrary<AktionOrtsnameAendern> {
  return fc
    .record({
      ortsnameZielRoh: fc.nat(),
      name: fc.string({ minLength: 1 }),
      sprache: fc.string(),
      gueltigVon: fc.integer(),
      gueltigBis: fc.integer(),
      istBevorzugt: fc.constantFrom<0 | 1>(0, 1),
      originalText: fc.string(),
    })
    .map((r): AktionOrtsnameAendern => ({ art: 'ortsnameAendern', ...r }))
}

function ortsnameLoeschenAktionArbitrary(): fc.Arbitrary<AktionOrtsnameLoeschen> {
  return fc.nat().map((ortsnameZielRoh): AktionOrtsnameLoeschen => ({ art: 'ortsnameLoeschen', ortsnameZielRoh }))
}

function ortszugehoerigkeitAnlegenAktionArbitrary(): fc.Arbitrary<AktionOrtszugehoerigkeitAnlegen> {
  return fc
    .record({
      ortZielRohA: fc.nat(),
      ortZielRohB: fc.nat(),
      zugehoerigkeitArt: fc.constantFrom(...OrtszugehoerigkeitArtEnum.options),
      gueltigVon: fc.integer(),
      gueltigBis: fc.integer(),
    })
    .map((r): AktionOrtszugehoerigkeitAnlegen => ({ art: 'ortszugehoerigkeitAnlegen', ...r }))
}

function ortszugehoerigkeitAendernAktionArbitrary(): fc.Arbitrary<AktionOrtszugehoerigkeitAendern> {
  return fc
    .record({
      ortszugehoerigkeitZielRoh: fc.nat(),
      gueltigVon: fc.integer(),
      gueltigBis: fc.integer(),
    })
    .map((r): AktionOrtszugehoerigkeitAendern => ({ art: 'ortszugehoerigkeitAendern', ...r }))
}

function ortszugehoerigkeitLoeschenAktionArbitrary(): fc.Arbitrary<AktionOrtszugehoerigkeitLoeschen> {
  return fc
    .nat()
    .map((ortszugehoerigkeitZielRoh): AktionOrtszugehoerigkeitLoeschen => ({ art: 'ortszugehoerigkeitLoeschen', ortszugehoerigkeitZielRoh }))
}

function ortExterneIdAnlegenAktionArbitrary(): fc.Arbitrary<AktionOrtExterneIdAnlegen> {
  return fc
    .record({
      ortZielRoh: fc.nat(),
      system: fc.constantFrom(...ExterneIdSystemEnum.options),
      wert: fc.string({ minLength: 1 }),
    })
    .map((r): AktionOrtExterneIdAnlegen => ({ art: 'ortExterneIdAnlegen', ...r }))
}

function ortExterneIdLoeschenAktionArbitrary(): fc.Arbitrary<AktionOrtExterneIdLoeschen> {
  return fc
    .nat()
    .map((ortExterneIdZielRoh): AktionOrtExterneIdLoeschen => ({ art: 'ortExterneIdLoeschen', ortExterneIdZielRoh }))
}

// -----------------------------------------------------------------------------------------------
// AP-1.17 PR-B: Arbitraries für die Archiv-/Quelle-/Zitat-/Negativbefund-Befehle (s.
// Kopfkommentar für die Designentscheidungen). `archivWahlRoh`/`quelleWahlRoh` nutzen
// `fc.option(fc.nat(), { nil: undefined })` — derselbe "immer vorhandener Schlüssel mit
// `undefined` als möglichem Wert"-Baustein wie `AktionAussageAnlegen.istBevorzugt`.
// -----------------------------------------------------------------------------------------------

function archivAnlegenAktionArbitrary(): fc.Arbitrary<AktionArchivAnlegen> {
  return fc
    .record({
      name: fc.string({ minLength: 1 }),
      kontakt: fc.string(),
      url: fc.string(),
      notiz: fc.string(),
    })
    .map((r): AktionArchivAnlegen => ({ art: 'archivAnlegen', ...r }))
}

function archivAendernAktionArbitrary(): fc.Arbitrary<AktionArchivAendern> {
  return fc
    .record({
      archivZielRoh: fc.nat(),
      name: fc.string({ minLength: 1 }),
      kontakt: fc.string(),
      url: fc.string(),
      notiz: fc.string(),
    })
    .map((r): AktionArchivAendern => ({ art: 'archivAendern', ...r }))
}

function quelleAnlegenAktionArbitrary(): fc.Arbitrary<AktionQuelleAnlegen> {
  return fc
    .record({
      typ: fc.constantFrom(...QuelleTypEnum.options),
      titel: fc.string(),
      autor: fc.string(),
      notiz: fc.string(),
      archivWahlRoh: fc.option(fc.nat(), { nil: undefined }),
    })
    .map((r): AktionQuelleAnlegen => ({ art: 'quelleAnlegen', ...r }))
}

function quelleAendernAktionArbitrary(): fc.Arbitrary<AktionQuelleAendern> {
  return fc
    .record({
      quelleZielRoh: fc.nat(),
      typ: fc.constantFrom(...QuelleTypEnum.options),
      titel: fc.string(),
      autor: fc.string(),
      notiz: fc.string(),
      archivWahlRoh: fc.option(fc.nat(), { nil: undefined }),
    })
    .map((r): AktionQuelleAendern => ({ art: 'quelleAendern', ...r }))
}

function zitatAnlegenAktionArbitrary(): fc.Arbitrary<AktionZitatAnlegen> {
  return fc
    .record({
      quelleZielRoh: fc.nat(),
      seite: fc.string(),
      transkript: fc.option(transkriptArbitrary(), { nil: undefined }),
      konfidenz: fc.integer({ min: 1, max: 4 }),
    })
    .map((r): AktionZitatAnlegen => ({ art: 'zitatAnlegen', ...r }))
}

function zitatAendernAktionArbitrary(): fc.Arbitrary<AktionZitatAendern> {
  return fc
    .record({
      zitatZielRoh: fc.nat(),
      quelleZielRoh: fc.nat(),
      seite: fc.string(),
      transkript: transkriptArbitrary(),
      konfidenz: fc.integer({ min: 1, max: 4 }),
    })
    .map((r): AktionZitatAendern => ({ art: 'zitatAendern', ...r }))
}

function zitatLoeschenAktionArbitrary(): fc.Arbitrary<AktionZitatLoeschen> {
  return fc.nat().map((zitatZielRoh): AktionZitatLoeschen => ({ art: 'zitatLoeschen', zitatZielRoh }))
}

function negativbefundAnlegenAktionArbitrary(): fc.Arbitrary<AktionNegativbefundAnlegen> {
  return fc
    .record({
      personZielRoh: fc.nat(),
      quelleWahlRoh: fc.option(fc.nat(), { nil: undefined }),
      gesuchtesPraedikat: fc.string(),
      zeitraumVon: fc.integer(),
      zeitraumBis: fc.integer(),
      beschreibung: fc.string(),
    })
    .map((r): AktionNegativbefundAnlegen => ({ art: 'negativbefundAnlegen', ...r }))
}

function negativbefundAendernAktionArbitrary(): fc.Arbitrary<AktionNegativbefundAendern> {
  return fc
    .record({
      negativbefundZielRoh: fc.nat(),
      personZielRoh: fc.nat(),
      quelleWahlRoh: fc.option(fc.nat(), { nil: undefined }),
      gesuchtesPraedikat: fc.string(),
      zeitraumVon: fc.integer(),
      zeitraumBis: fc.integer(),
      beschreibung: fc.string(),
    })
    .map((r): AktionNegativbefundAendern => ({ art: 'negativbefundAendern', ...r }))
}

function negativbefundLoeschenAktionArbitrary(): fc.Arbitrary<AktionNegativbefundLoeschen> {
  return fc
    .nat()
    .map((negativbefundZielRoh): AktionNegativbefundLoeschen => ({ art: 'negativbefundLoeschen', negativbefundZielRoh }))
}

/**
 * Arbitrary für eine einzelne `Aktion`. Gewichte: `anlegen` (Person) bleibt mit Abstand am
 * höchsten (3), weil praktisch jede neue Aktion — die eigenen `person.*`-Aktionen ausgenommen —
 * mindestens eine bestehende Person referenziert; ohne genügend früh angelegte Personen blieben
 * `name`/`elternschaft`/`partnerschaft`/`ereignis`/`aussage`-Aktionen überwiegend No-ops. Die
 * `anlegen`-Aktionen der neuen Entitäten liegen bei 2 (mehr Gewicht als ihre `aendern`/`loeschen`-
 * Geschwister, damit über eine 40 Aktionen lange Folge hinweg genug davon existieren, an denen
 * `aendern`/`loeschen` überhaupt etwas zu tun haben). `aussageFaktAendern` liegt bewusst bei 3
 * (höher als `aussageAnlegen`/`aussageLoeschen`) — sie ist der garantierte Demote-Pfad
 * (Kopfkommentar "DEMOTE-DECKUNG") und soll darum über eine Folge hinweg mehrfach feuern, nicht
 * nur einmal zufällig. AP-1.17 PR-B: `archivAnlegen`/`quelleAnlegen`/`zitatAnlegen`/
 * `negativbefundAnlegen` liegen ebenfalls bei 2, ihre `aendern`/`loeschen`-Geschwister bei 1 —
 * dasselbe Muster wie bei `name`/`elternschaft`/… oben. AP-1.29 PR-B: `aussageAendern` liegt bei 2
 * (analog den `aendern`-Geschwistern anderer Entitäten), `aussageZitatAnlegen` bei 2,
 * `aussageZitatLoeschen` bei 1 — dasselbe Muster. AP-1.33 PR-B: `hauptnameWechseln` bei 2 — er
 * braucht eine Person mit MINDESTENS ZWEI Formen und eine nicht bevorzugte davon als Ziel, feuert
 * also seltener als ein gewöhnliches `aendern`; `nameWeitereFormAnlegen` bei 2 erzeugt genau diese
 * Personen (Typkommentar „MEHRFORMEN-DECKUNG", Trefferzahlen im PR-Bericht).
 */
function aktionArbitrary(): fc.Arbitrary<Aktion> {
  return fc.oneof(
    { weight: 3, arbitrary: personAnlegenEinArbitrary().map((ein): AktionAnlegen => ({ art: 'anlegen', ein })) },
    {
      weight: 2,
      arbitrary: fc
        .record({ zielRoh: fc.nat(), feldwert: feldwertArbitrary() })
        .map((r): AktionFeldSetzen => ({ art: 'feldSetzen', zielRoh: r.zielRoh, feldwert: r.feldwert })),
    },
    { weight: 1, arbitrary: fc.nat().map((zielRoh): AktionLoeschen => ({ art: 'loeschen', zielRoh })) },
    { weight: 2, arbitrary: nameAnlegenAktionArbitrary() },
    { weight: 1, arbitrary: nameAendernAktionArbitrary() },
    { weight: 1, arbitrary: nameLoeschenAktionArbitrary() },
    { weight: 2, arbitrary: hauptnameWechselnAktionArbitrary() },
    { weight: 2, arbitrary: nameWeitereFormAnlegenAktionArbitrary() },
    { weight: 2, arbitrary: elternschaftAnlegenAktionArbitrary() },
    { weight: 1, arbitrary: elternschaftAendernAktionArbitrary() },
    { weight: 1, arbitrary: elternschaftLoeschenAktionArbitrary() },
    { weight: 2, arbitrary: partnerschaftAnlegenAktionArbitrary() },
    { weight: 1, arbitrary: partnerschaftAendernAktionArbitrary() },
    { weight: 1, arbitrary: partnerschaftLoeschenAktionArbitrary() },
    { weight: 2, arbitrary: ereignisAnlegenAktionArbitrary() },
    { weight: 1, arbitrary: ereignisAendernAktionArbitrary() },
    { weight: 1, arbitrary: ereignisLoeschenAktionArbitrary() },
    { weight: 1, arbitrary: beteiligungLoeschenAktionArbitrary() },
    { weight: 2, arbitrary: aussageAnlegenAktionArbitrary() },
    { weight: 1, arbitrary: aussageLoeschenAktionArbitrary() },
    { weight: 3, arbitrary: aussageFaktAendernAktionArbitrary() },
    { weight: 2, arbitrary: aussageAendernAktionArbitrary() },
    { weight: 2, arbitrary: aussageZitatAnlegenAktionArbitrary() },
    { weight: 1, arbitrary: aussageZitatLoeschenAktionArbitrary() },
    { weight: 2, arbitrary: ortAnlegenAktionArbitrary() },
    { weight: 1, arbitrary: ortAendernAktionArbitrary() },
    { weight: 2, arbitrary: ortsnameAnlegenAktionArbitrary() },
    { weight: 1, arbitrary: ortsnameAendernAktionArbitrary() },
    { weight: 1, arbitrary: ortsnameLoeschenAktionArbitrary() },
    { weight: 2, arbitrary: ortszugehoerigkeitAnlegenAktionArbitrary() },
    { weight: 1, arbitrary: ortszugehoerigkeitAendernAktionArbitrary() },
    { weight: 1, arbitrary: ortszugehoerigkeitLoeschenAktionArbitrary() },
    { weight: 2, arbitrary: ortExterneIdAnlegenAktionArbitrary() },
    { weight: 1, arbitrary: ortExterneIdLoeschenAktionArbitrary() },
    { weight: 2, arbitrary: archivAnlegenAktionArbitrary() },
    { weight: 1, arbitrary: archivAendernAktionArbitrary() },
    { weight: 2, arbitrary: quelleAnlegenAktionArbitrary() },
    { weight: 1, arbitrary: quelleAendernAktionArbitrary() },
    { weight: 2, arbitrary: zitatAnlegenAktionArbitrary() },
    { weight: 1, arbitrary: zitatAendernAktionArbitrary() },
    { weight: 1, arbitrary: zitatLoeschenAktionArbitrary() },
    { weight: 2, arbitrary: negativbefundAnlegenAktionArbitrary() },
    { weight: 1, arbitrary: negativbefundAendernAktionArbitrary() },
    { weight: 1, arbitrary: negativbefundLoeschenAktionArbitrary() },
  )
}

/** Eine Folge von `Aktion`en — die eigentliche Arbitrary, die `undo-bitgleich.test.ts` an
 * `fc.property()` übergibt. `minLength: 15` (statt der vorherigen `0`, s. Kopfkommentar "DEMOTE-
 * DECKUNG"): fast-checks eingebaute Größenheuristik hält die generierten Längen über weite Teile
 * der 300 Läufe klein, eine zu kurze Folge lässt `aussageFaktAendern` (Gewicht 3 von 28) selten
 * zweimal in DERSELBEN Folge fallen — ohne `minLength` feuerte der Demote-Pfad nur in 5 von 300
 * Läufen, mit `minLength: 15` deutlich öfter (Belegzahl im PR-Bericht).
 *
 * AP-1.16 PR-B: `minLength: 18` (statt weiterhin `15`) — die zehn neuen Ort-Aktionen (Gesamtgewicht
 * 15) verdünnen JEDES bestehende Gewicht in `aktionArbitrary()` (Gesamtgewicht jetzt 44 statt 29),
 * darunter auch `aussageFaktAendern` (3/44 statt 3/29). Die leicht angehobene Mindestlänge gleicht
 * das für die Demote-Deckung wieder etwas aus, ohne `numRuns` zu verändern (CLAUDE.md §13:
 * Determinismus/Gate-Stärke ist Pflicht, nicht die Stellschraube einer Loop) — belegte
 * Trefferzahlen für Demote UND für jede neue Ort-Aktion stehen im PR-Bericht.
 *
 * AP-1.17 PR-B: `minLength` bleibt bei `18` — die zwölf neuen Archiv-/Quelle-/Zitat-/
 * Negativbefund-Aktionen (Gesamtgewicht 14) verdünnen `aussageFaktAendern` weiter (3/58 statt
 * 3/44), eine temporäre Instrumentierung (NICHT committet, Muster identisch zum AP-1.16-PR-B-
 * Bericht) über genau `{ seed: 20260910, numRuns: 300 }` zeigte aber weiterhin 86 Demote-Treffer
 * (deutlich über der 5-Treffer-Schwelle, die ursprünglich zur Einführung von `minLength` führte)
 * UND jede der zwölf neuen Aktionen real feuernd (nie 0) — belegte Trefferzahlen stehen im
 * PR-Bericht. Eine weitere Anhebung von `minLength` war darum nicht nötig.
 *
 * AP-1.29 PR-B: `minLength`/`maxLength` von `18`/`40` auf `30`/`52` angehoben — anders als bei den
 * bisherigen Erweiterungen reicht hier eine reine Gewichtsfrage nicht: `aussageZitatAnlegen`
 * braucht eine bestehende `aussage` UND ein bestehendes `zitat` GLEICHZEITIG, `zitat` selbst
 * braucht vorher eine bestehende `quelle` — eine Kette aus drei erfolgreichen `anlegen`-Schritten
 * IN DER RICHTIGEN REIHENFOLGE innerhalb DERSELBEN Folge, nicht bloß irgendwann im Lauf. Eine
 * temporäre Instrumentierung (NICHT committet, Muster identisch zu AP-1.16/AP-1.17 PR-B) über
 * genau `{ seed: 20260910, numRuns: 300 }` zeigte bei `18`/`40` `aussageZitatLoeschen` als
 * einzige neue Aktion bei 0 echten Treffern (die Kette `quelle.anlegen` → `zitat.anlegen` →
 * `aussage_zitat.anlegen` → `aussage_zitat.loeschen` kam in keiner der 300 Folgen in dieser
 * Reihenfolge lang genug vor) — ein klarer Verstoß gegen die "nie 0"-Anforderung. Mit `30`/`52`:
 * `aussageAendern` 149, `aussageZitatAnlegen` 23, `aussageZitatLoeschen` 3 echte Treffer (alle
 * über 0, `aussageZitatLoeschen` mit knappem, aber durch den festen Seed STABILEM Abstand).
 * Laufzeit lokal weiterhin deutlich unter dem 180s-`it()`-Timeout (s. `undo-bitgleich.test.ts`,
 * ~21s statt ~17s zuvor). */
export function befehlsfolgeArbitrary(): fc.Arbitrary<readonly Aktion[]> {
  return fc.array(aktionArbitrary(), { minLength: 30, maxLength: 52 })
}

/** Ein angelegter Name — `personId` wird für die CASCADE-Bereinigung nach `person.loeschen`
 * gebraucht (s. Kopfkommentar). */
interface NameInfo {
  readonly id: string
  readonly personId: string
}

interface ElternschaftInfo {
  readonly id: string
  readonly elternteilId: string
  readonly kindId: string
}

interface PartnerschaftInfo {
  readonly id: string
  readonly personIds: readonly string[]
}

interface EreignisInfo {
  readonly id: string
  readonly personIds: readonly string[]
}

/**
 * AP-1.15 PR-B ERWEITERUNG: eine angelegte `beteiligung`-Zeile — `ereignisId`/`personId` werden für
 * die Zustandspflege nach `beteiligung.loeschen` gebraucht (s. dortiger Fall in
 * `aktionAusfuehren()`: die gelöschte Beteiligung fällt aus `zustand.beteiligungen`, UND die
 * `personId` fällt aus `zustand.ereignisse[].personIds` — das RESTRICT auf `beteiligung.person_id`
 * (s. Kopfkommentar `personIstGebunden()`) gilt nur, solange die Beteiligung selbst noch existiert).
 */
interface BeteiligungInfo {
  readonly id: string
  readonly ereignisId: string
  readonly personId: string
}

/** Deckungsgleich mit `SubjektTypEnum` (`src/shared/schemata/gemeinsam.ts`) MINUS `'ort'` — AP-1.16
 * PR-B bringt zwar `ort.anlegen` als Aktion (s. Kopfkommentar), aber `ort.anlegen` schreibt KEINE
 * Existenz-Aussage (`ort-anlegen.ts`-Kopfkommentar: "ein Ort selbst ist kein belegbares
 * Fachprädikat […], sondern ein Stammdatensatz") — eine `aussage.anlegen`-Anbindung an Orte bleibt
 * darum außerhalb dieses Arbeitspakets, `'ort'` fehlt hier weiterhin bewusst. */
type AussageSubjektKind = 'person' | 'name' | 'elternschaft' | 'partnerschaft' | 'ereignis'

interface AussageInfo {
  readonly id: string
  readonly subjektTyp: AussageSubjektKind
  readonly subjektId: string
}

/** Ein getrackter (subjektTyp, subjektId, praedikat)-Dreiklang — die Grundlage der garantierten
 * Demote-Wiederholung durch `aussageFaktAendern` (s. Kopfkommentar "DEMOTE-DECKUNG"). */
interface AussageTripelInfo {
  readonly subjektTyp: AussageSubjektKind
  readonly subjektId: string
  readonly praedikat: string
}

/** Ein angelegter `ortsname` — sowohl der vom Handler `ort.anlegen` selbst mit angelegte primäre
 * Name (`ortsnameIdLesen()` liest seine `id` nach, s. Kopfkommentar) als auch jeder per
 * `ortsname.anlegen` zusätzlich angelegte weitere Name. `ortId` wird hier nicht für eine Kaskade
 * gebraucht (`ort.loeschen` existiert nicht, s. Kopfkommentar) — bewusst trotzdem mitgeführt,
 * analog `NameInfo.personId`, falls ein späteres Arbeitspaket `ort.loeschen` nachzieht. */
interface OrtsnameInfo {
  readonly id: string
  readonly ortId: string
}

/** Eine angelegte `ortszugehoerigkeit`-Kante — `art` wird für die NACH-`art`-getrennte
 * Zyklusprüfung in `ortszugehoerigkeitAnlegen` gebraucht (s. Kopfkommentar). */
interface OrtszugehoerigkeitInfo {
  readonly id: string
  readonly ortId: string
  readonly uebergeordnetId: string
  readonly art: OrtszugehoerigkeitArt
}

/** Eine angelegte `ort_externe_id`-Zeile — KEIN eigenes `id` (zusammengesetzter Primärschlüssel
 * `(ort_id, system)`, s. Kopfkommentar), darum trackt der Generator das Paar direkt statt einer
 * generierten `id`. */
interface OrtExterneIdInfo {
  readonly ortId: string
  readonly system: ExterneIdSystem
}

/** Ein angelegter `negativbefund` — `personId` wird für die CASCADE-Bereinigung nach
 * `person.loeschen` gebraucht (`gesuchte_person_id ... ON DELETE CASCADE`, s. Kopfkommentar,
 * analog `NameInfo.personId`). */
interface NegativbefundInfo {
  readonly id: string
  readonly personId: string
}

/** AP-1.29 PR-B: eine angelegte `aussage_zitat`-Verknüpfung — KEIN eigenes `id` (zusammengesetzter
 * Primärschlüssel `(aussage_id, zitat_id)`, s. Kopfkommentar `AktionAussageZitatAnlegen`, analog
 * `OrtExterneIdInfo`), darum trackt der Generator das Paar direkt statt einer generierten `id`. */
interface AussageZitatVerknuepfungInfo {
  readonly aussageId: string
  readonly zitatId: string
}

/** Mutabler Modellzustand einer einzelnen Eigenschaftslauf-Ausführung (kein Vertrags-/Ergebnistyp — bewusst kein `readonly`, analog `ModellZustand` in `_modell-abgeleitet.ts`). */
export interface Zustand {
  personIds: string[]
  namen: NameInfo[]
  elternschaften: ElternschaftInfo[]
  partnerschaften: PartnerschaftInfo[]
  ereignisse: EreignisInfo[]
  beteiligungen: BeteiligungInfo[]
  aussagen: AussageInfo[]
  aussageTripel: AussageTripelInfo[]
  aussageZitatVerknuepfungen: AussageZitatVerknuepfungInfo[]
  ortIds: string[]
  ortsnamen: OrtsnameInfo[]
  ortszugehoerigkeiten: OrtszugehoerigkeitInfo[]
  ortExterneIds: OrtExterneIdInfo[]
  archivIds: string[]
  quelleIds: string[]
  zitatIds: string[]
  negativbefundIds: NegativbefundInfo[]
}

export function neuerZustand(): Zustand {
  return {
    personIds: [],
    namen: [],
    elternschaften: [],
    partnerschaften: [],
    ereignisse: [],
    beteiligungen: [],
    aussagen: [],
    aussageTripel: [],
    aussageZitatVerknuepfungen: [],
    ortIds: [],
    ortsnamen: [],
    ortszugehoerigkeiten: [],
    ortExterneIds: [],
    archivIds: [],
    quelleIds: [],
    zitatIds: [],
    negativbefundIds: [],
  }
}

/** Löst `zielRoh` gegen die aktuell lebenden Personen auf — `undefined`, wenn die Liste (noch) leer ist. */
function zielId(zustand: Zustand, zielRoh: number): string | undefined {
  if (zustand.personIds.length === 0) {
    return undefined
  }
  const index = zielRoh % zustand.personIds.length
  return zustand.personIds[index]
}

/** Generische Fassung von `zielId()` für die neuen getrackten Listen (`namen`/`elternschaften`/
 * `partnerschaften`/`ereignisse`/`aussagen`) — `undefined`, wenn `liste` (noch) leer ist. */
function zielAusListe<T>(liste: readonly T[], roh: number): T | undefined {
  if (liste.length === 0) {
    return undefined
  }
  const index = roh % liste.length
  const element = liste[index]
  if (element === undefined) {
    throw new Error('zielAusListe(): unerreichbar — der Index liegt per Modulo innerhalb der Listenlänge.')
  }
  return element
}

/** AP-1.17 PR-B: löst eine OPTIONALE Referenz auf eine bestehende Liste auf — `undefined`, wenn
 * entweder gar kein Wahl-Index generiert wurde (`fc.option()`s `nil`-Zweig, s.
 * `AktionQuelleAnlegen.archivWahlRoh`/`AktionNegativbefundAnlegen.quelleWahlRoh`) ODER die
 * Zielliste (noch) leer ist. Beide Fälle bleiben schema-konform (`archivId`/`quelleId` sind in
 * jedem betroffenen `*Ein`-Schema optional) — kein separater No-op-Fall für die AUFRUFENDE Aktion
 * nötig, anders als bei einer PFLICHT-Referenz (`zielId()`/`zielAusListe()`). */
function wahlAufloesen(liste: readonly string[], wahlRoh: number | undefined): string | undefined {
  if (wahlRoh === undefined) {
    return undefined
  }
  return zielAusListe(liste, wahlRoh)
}

/** Wählt zwei VERSCHIEDENE Elemente aus `liste` (nie denselben Index zweimal) — `undefined`, wenn
 * `liste` weniger als zwei Einträge hat. Klassischer Verschiebungs-Trick: `versatz` liegt in
 * `[1, liste.length - 1]`, `(indexA + versatz) % liste.length` kann darum nie wieder `indexA`
 * ergeben. */
function zweiVerschiedeneAusListe(liste: readonly string[], rohA: number, rohB: number): readonly [string, string] | undefined {
  if (liste.length < 2) {
    return undefined
  }
  const indexA = rohA % liste.length
  const versatz = 1 + (rohB % (liste.length - 1))
  const indexB = (indexA + versatz) % liste.length
  const a = liste[indexA]
  const b = liste[indexB]
  if (a === undefined || b === undefined) {
    throw new Error('zweiVerschiedeneAusListe(): unerreichbar — beide Indizes liegen innerhalb der Listenlänge.')
  }
  return [a, b]
}

/** `true`, wenn `personId` in einer `ON DELETE RESTRICT`-Beziehung steckt (`elternschaft`,
 * `partnerschaft_person`, `beteiligung` — docs/schema/0002_kern.sql) — ein `person.loeschen`
 * darauf würde das Fremdschlüssel-`RESTRICT` verletzen (s. Kopfkommentar). */
function personIstGebunden(zustand: Zustand, personId: string): boolean {
  const inElternschaft = zustand.elternschaften.some((e) => e.elternteilId === personId || e.kindId === personId)
  const inPartnerschaft = zustand.partnerschaften.some((p) => p.personIds.includes(personId))
  const inEreignis = zustand.ereignisse.some((e) => e.personIds.includes(personId))
  return inElternschaft || inPartnerschaft || inEreignis
}

interface AussageIdZeile {
  readonly id: string
}

/** Liest die `id` der versteckten Existenz-Aussage, die `elternschaft.anlegen`/
 * `partnerschaft.anlegen`/`ereignis.anlegen` selbst schreiben (`existenz-aussage.ts`) — direkt
 * gegen `Tx`, s. Kopfkommentar. Unerreichbar, dass keine Zeile gefunden wird: jeder dieser drei
 * Handler schreibt in genau derselben Transaktion, aus der `id` gerade zurückkam, GENAU eine
 * Existenz-Aussage. */
function existenzAussageIdLesen(db: Tx, subjektTyp: AussageSubjektKind, subjektId: string): string {
  const zeile = db
    .prepare<{ readonly subjektTyp: string; readonly subjektId: string }, AussageIdZeile>(
      `SELECT id FROM aussage WHERE subjekt_typ = @subjektTyp AND subjekt_id = @subjektId AND praedikat = 'existenz' ORDER BY id LIMIT 1`,
    )
    .get({ subjektTyp, subjektId })
  if (zeile === undefined) {
    throw new Error(`existenzAussageIdLesen(): keine Existenz-Aussage für ${subjektTyp}/${subjektId} gefunden — unerreichbar.`)
  }
  return zeile.id
}

interface BeteiligungIdZeile {
  readonly id: string
}

/**
 * AP-1.15 PR-B ERWEITERUNG: liest die `id` der `beteiligung`-Zeile, die `ereignis.anlegen` selbst
 * anlegt (`ereignisRepo.beteiligungEinfuegen()`, `ereignis-anlegen.ts`) — direkt gegen `Tx`, s.
 * Modul-Kommentar (analog `existenzAussageIdLesen()`). Der Generator legt pro `ereignisAnlegen`-
 * Aktion genau EINE Beteiligung an (eine `personId`, s. `ereignisAnlegenAktionArbitrary()`),
 * `ereignisId` + `personId` identifizieren diese Zeile darum eindeutig. Unerreichbar, dass keine
 * Zeile gefunden wird: der Handler schreibt sie in genau derselben Transaktion, aus der `ereignisId`
 * gerade zurückkam.
 */
function beteiligungIdLesen(db: Tx, ereignisId: string, personId: string): string {
  const zeile = db
    .prepare<{ readonly ereignisId: string; readonly personId: string }, BeteiligungIdZeile>(
      `SELECT id FROM beteiligung WHERE ereignis_id = @ereignisId AND person_id = @personId ORDER BY id LIMIT 1`,
    )
    .get({ ereignisId, personId })
  if (zeile === undefined) {
    throw new Error(`beteiligungIdLesen(): keine Beteiligung für ${ereignisId}/${personId} gefunden — unerreichbar.`)
  }
  return zeile.id
}

interface OrtsnameIdZeile {
  readonly id: string
}

/**
 * AP-1.16 PR-B: liest die `id` des primären `ortsname`, den `ort.anlegen` selbst mit anlegt
 * (`ortRepo.ortsnameEinfuegen()`, `ort-anlegen.ts`) — direkt gegen `Tx`, s. Modul-Kommentar (analog
 * `beteiligungIdLesen()`). `ort.anlegen` legt pro Aufruf GENAU EINEN Ortsnamen zu einem GERADE ERST
 * angelegten Ort an, `ortId` identifiziert diese Zeile darum eindeutig. Unerreichbar, dass keine
 * Zeile gefunden wird: der Handler schreibt sie in genau derselben Transaktion, aus der `ortId`
 * gerade zurückkam.
 */
function ortsnameIdLesen(db: Tx, ortId: string): string {
  const zeile = db
    .prepare<{ readonly ortId: string }, OrtsnameIdZeile>(`SELECT id FROM ortsname WHERE ort_id = @ortId ORDER BY id LIMIT 1`)
    .get({ ortId })
  if (zeile === undefined) {
    throw new Error(`ortsnameIdLesen(): kein Ortsname für ${ortId} gefunden — unerreichbar.`)
  }
  return zeile.id
}

/**
 * Baut die vollständige `PersonFeldSetzenEin`-Nutzlast aus `id` + `FeldwertOhneId` — bewusst ein
 * `switch` statt eines Objekt-Spreads (`{ id, ...feldwert }`): TypeScript narrowt eine
 * diskriminierte Union über ein `switch` auf `feldwert.feld` zuverlässig pro Zweig, ein Spread
 * eines Union-Typs wäre hier weniger offensichtlich typsicher. Der `never`-Zweig zwingt einen
 * Compile-Fehler, sobald `PersonFeldSetzenEin` (`src/shared/schemata/befehle.ts`) um eine hier
 * nicht behandelte Variante wächst (analog `minimalZeileFuer` in `_journal-minimalzeilen.ts`).
 */
function feldSetzenEin(id: string, feldwert: FeldwertOhneId): PersonFeldSetzenEin {
  switch (feldwert.feld) {
    case 'geschlecht':
      return { id, feld: 'geschlecht', wert: feldwert.wert }
    case 'lebend_status':
      return { id, feld: 'lebend_status', wert: feldwert.wert }
    case 'privat':
      return { id, feld: 'privat', wert: feldwert.wert }
    case 'notiz':
      return { id, feld: 'notiz', wert: feldwert.wert }
    case 'gesperrt_bis':
      return { id, feld: 'gesperrt_bis', wert: feldwert.wert }
    case 'ist_platzhalter':
      return { id, feld: 'ist_platzhalter', wert: feldwert.wert }
    case 'platzhalter_grund':
      return { id, feld: 'platzhalter_grund', wert: feldwert.wert }
    default: {
      const nieErreicht: never = feldwert
      throw new Error(`feldSetzenEin(): unbehandeltes Feld ${JSON.stringify(nieErreicht)}`)
    }
  }
}

interface AussageSubjektPool {
  readonly kind: AussageSubjektKind
  readonly ids: readonly string[]
}

/** Die fünf Kandidatenlisten für `aussage.anlegen`s `subjektTyp`/`subjektId`, IN DIESER
 * REIHENFOLGE (`person` an Index 0 — `poolIndexBiased()` unten setzt das voraus, s. Kopfkommentar
 * zu `AussageSubjektKind` — kein `'ort'`, weil kein `ort.anlegen`-Befehl existiert). */
function aussageSubjektPools(zustand: Zustand): readonly AussageSubjektPool[] {
  return [
    { kind: 'person', ids: zustand.personIds },
    { kind: 'name', ids: zustand.namen.map((n) => n.id) },
    { kind: 'elternschaft', ids: zustand.elternschaften.map((e) => e.id) },
    { kind: 'partnerschaft', ids: zustand.partnerschaften.map((p) => p.id) },
    { kind: 'ereignis', ids: zustand.ereignisse.map((e) => e.id) },
  ]
}

/** Wählt den Index in `aussageSubjektPools()` BIASED zu `person` (Index 0, 80 % der Fälle) statt
 * gleichverteilt über alle fünf Pools — s. Kopfkommentar "DEMOTE-DECKUNG". `person` ist der einzige
 * Pool, der ab der ersten `person.anlegen`-Aktion garantiert befüllt ist; ein uniformer
 * `roh % 5`-Modulo hätte 80 % der `aussage.anlegen`/`aussageFaktAendern`-Aktionen auf typischerweise
 * leere Pools gelenkt und damit zu No-ops gemacht (belegter hueter-Befund: 0/300 Demote-Treffer). */
function poolIndexBiased(roh: number): number {
  const bucket = roh % 100
  if (bucket < 80) return 0
  if (bucket < 85) return 1
  if (bucket < 90) return 2
  if (bucket < 95) return 3
  return 4
}

/** Gemeinsamer Baustein für `wertText`/`wertZahl` aus `AktionAussageWert` — bedingtes Spreaden
 * (statt eines optionalen Felds mit `undefined`), damit ein weggelassenes Feld beim Zusammenbau
 * wirklich FEHLT statt explizit `undefined` zu sein (`exactOptionalPropertyTypes`). Von
 * `aussageAnlegenEinBauen()` UND dem `aussageFaktAendern`-Zweig in `aktionAusfuehren()` genutzt. */
function aussageWertFeld(wert: AktionAussageWert): { readonly wertText: string } | { readonly wertZahl: number } {
  return wert.art === 'text' ? { wertText: wert.wert } : { wertZahl: wert.wert }
}

/** Baut die `AussageAnlegenEin`-Nutzlast aus `AktionAussageAnlegen` — bedingtes Spreaden für
 * `wertText`/`wertZahl`/`istBevorzugt`, damit ein weggelassenes Feld beim Zusammenbau wirklich
 * FEHLT statt explizit `undefined` zu sein (`exactOptionalPropertyTypes`, s. Typkommentar bei
 * `AktionAussageAnlegen`). */
function aussageAnlegenEinBauen(kind: AussageSubjektKind, subjektId: string, aktion: AktionAussageAnlegen): AussageAnlegenEin {
  const bevorzugtFeld = aktion.istBevorzugt === undefined ? {} : { istBevorzugt: aktion.istBevorzugt }
  return {
    subjektTyp: kind,
    subjektId,
    praedikat: aktion.praedikat,
    konfidenz: aktion.konfidenz,
    ...aussageWertFeld(aktion.wert),
    ...bevorzugtFeld,
  }
}

/**
 * Führt eine einzelne `Aktion` über den echten Befehlsbus (`fuehreAus`, `src/main/befehle/bus.ts`)
 * aus und pflegt `zustand` nach (s. Kopfkommentar für die genauen Nachpflege-Regeln je Befehl).
 * Referenzielle Aktionen ohne gültiges Ziel (leere getrackte Liste, oder — bei `elternschaft.
 * anlegen`/`person.loeschen` — ein Kandidat, der eine fachliche Regel verletzen würde) sind
 * bewusste No-ops: kein `fuehreAus()`-Aufruf, keine Transaktion, kein Undo-Schritt.
 */
export function aktionAusfuehren(db: Tx, zustand: Zustand, aktion: Aktion): void {
  switch (aktion.art) {
    case 'anlegen': {
      const { id } = fuehreAus(db, 'person.anlegen', aktion.ein)
      zustand.personIds.push(id)
      return
    }

    case 'feldSetzen': {
      const id = zielId(zustand, aktion.zielRoh)
      if (id === undefined) {
        return
      }
      fuehreAus(db, 'person.feldSetzen', feldSetzenEin(id, aktion.feldwert))
      return
    }

    case 'loeschen': {
      const id = zielId(zustand, aktion.zielRoh)
      if (id === undefined) {
        return
      }
      if (personIstGebunden(zustand, id)) {
        return
      }
      fuehreAus(db, 'person.loeschen', { id })
      // Die `name`-Ids der gelöschten Person VOR dem Filtern merken (s. unten — CASCADE nimmt sie
      // mit, `zustand.aussageTripel` muss das für 'name'-Dreiklänge genauso nachvollziehen wie für
      // 'person'-Dreiklänge).
      const kaskadiertGeloeschteNamenIds = zustand.namen.filter((n) => n.personId === id).map((n) => n.id)
      zustand.personIds = zustand.personIds.filter((vorhandeneId) => vorhandeneId !== id)
      zustand.namen = zustand.namen.filter((n) => n.personId !== id) // CASCADE (name.person_id)
      // Kein FK-`CASCADE` auf `aussage` (s. Modul-Kommentar) — eine bereits vorhandene `aussage`-
      // ZEILE über die gelöschte Person (oder ihre kaskadiert gelöschten Namen) bleibt bestehen,
      // aber der (subjektTyp, subjektId, praedikat)-Dreiklang darf NICHT mehr für eine neue
      // `aussage.anlegen`-Wiederholung (`aussageFaktAendern`) herangezogen werden — deren Subjekt
      // existiert nicht mehr, ein erneutes Anlegen würde `NICHT_GEFUNDEN_PERSON`/`NICHT_GEFUNDEN_NAME`
      // werfen.
      zustand.aussageTripel = zustand.aussageTripel.filter(
        (t) =>
          !(t.subjektTyp === 'person' && t.subjektId === id) &&
          !(t.subjektTyp === 'name' && kaskadiertGeloeschteNamenIds.includes(t.subjektId)),
      )
      // AP-1.17 PR-B: `negativbefund.gesuchte_person_id ... ON DELETE CASCADE` (s. Kopfkommentar)
      // nimmt jeden `negativbefund` der gelöschten Person mit — `zustand.negativbefundIds` muss das
      // nachvollziehen, sonst würde ein späteres `negativbefund.aendern`/`.loeschen` einen bereits
      // kaskadiert gelöschten Datensatz referenzieren.
      zustand.negativbefundIds = zustand.negativbefundIds.filter((n) => n.personId !== id)
      return
    }

    case 'nameAnlegen': {
      const personId = zielId(zustand, aktion.personZielRoh)
      if (personId === undefined) {
        return
      }
      const { id } = fuehreAus(db, 'name.anlegen', {
        personId,
        typ: aktion.typ,
        nachname: aktion.nachname,
        vornamen: aktion.vornamen,
      })
      zustand.namen.push({ id, personId })
      return
    }

    case 'nameAendern': {
      const ziel = zielAusListe(zustand.namen, aktion.nameZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'name.aendern', { id: ziel.id, typ: aktion.typ, nachname: aktion.nachname, vornamen: aktion.vornamen })
      return
    }

    case 'nameLoeschen': {
      const ziel = zielAusListe(zustand.namen, aktion.nameZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'name.loeschen', { id: ziel.id })
      zustand.namen = zustand.namen.filter((n) => n.id !== ziel.id)
      zustand.aussageTripel = zustand.aussageTripel.filter((t) => !(t.subjektTyp === 'name' && t.subjektId === ziel.id))
      return
    }

    case 'nameWeitereFormAnlegen': {
      const vorhandene = zielAusListe(zustand.namen, aktion.nameZielRoh)
      if (vorhandene === undefined) {
        return
      }
      const { id } = fuehreAus(db, 'name.anlegen', {
        personId: vorhandene.personId,
        typ: aktion.typ,
        nachname: aktion.nachname,
        vornamen: aktion.vornamen,
      })
      zustand.namen.push({ id, personId: vorhandene.personId })
      return
    }

    case 'hauptnameWechseln': {
      const neu = zielAusListe(zustand.namen, aktion.nameZielRoh)
      if (neu === undefined) {
        return
      }
      const alt = db
        .prepare<{ readonly personId: string }, { readonly id: string }>(
          'SELECT id FROM name_form WHERE person_id = @personId AND ist_bevorzugt = 1',
        )
        .get({ personId: neu.personId })
      if (alt === undefined || alt.id === neu.id) {
        return
      }
      fuehreAus(db, 'hauptname.wechseln', { personId: neu.personId, alt: alt.id, neu: neu.id })
      return
    }

    case 'elternschaftAnlegen': {
      const paar = zweiVerschiedeneAusListe(zustand.personIds, aktion.elternteilZielRoh, aktion.kindZielRoh)
      if (paar === undefined) {
        return
      }
      const [elternteilId, kindId] = paar
      const kanten: readonly Elternkante[] = zustand.elternschaften.map((e) => ({ elternteilId: e.elternteilId, kindId: e.kindId }))
      if (wuerdeZyklusErzeugen(kanten, { elternteilId, kindId })) {
        return
      }
      const { id } = fuehreAus(db, 'elternschaft.anlegen', {
        elternteilId,
        kindId,
        typ: aktion.typ,
        konfidenz: aktion.konfidenz,
        notiz: aktion.notiz,
      })
      zustand.elternschaften.push({ id, elternteilId, kindId })
      zustand.aussagen.push({ id: existenzAussageIdLesen(db, 'elternschaft', id), subjektTyp: 'elternschaft', subjektId: id })
      return
    }

    case 'elternschaftAendern': {
      const ziel = zielAusListe(zustand.elternschaften, aktion.elternschaftZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'elternschaft.aendern', { id: ziel.id, typ: aktion.typ, notiz: aktion.notiz })
      return
    }

    case 'elternschaftLoeschen': {
      const ziel = zielAusListe(zustand.elternschaften, aktion.elternschaftZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'elternschaft.loeschen', { id: ziel.id })
      zustand.elternschaften = zustand.elternschaften.filter((e) => e.id !== ziel.id)
      // AP-1.29 PR-B: `aussageRepo.loeschenNachSubjekt` löscht ALLE `aussage`-Zeilen dieses Subjekts
      // (nicht nur die Existenz-Aussage, s. Modul-Kommentar) — jede darauf `aussage_zitat`-verknüpfte
      // Zeile kaskadiert mit (`ON DELETE CASCADE` auf `aussage_id`, s. Kopfkommentar
      // `AktionAussageZitatAnlegen`). Die betroffenen `aussageId`s VOR dem Filtern merken.
      const entfernteAussagenIds = zustand.aussagen
        .filter((a) => a.subjektTyp === 'elternschaft' && a.subjektId === ziel.id)
        .map((a) => a.id)
      zustand.aussagen = zustand.aussagen.filter((a) => !(a.subjektTyp === 'elternschaft' && a.subjektId === ziel.id))
      zustand.aussageTripel = zustand.aussageTripel.filter((t) => !(t.subjektTyp === 'elternschaft' && t.subjektId === ziel.id))
      zustand.aussageZitatVerknuepfungen = zustand.aussageZitatVerknuepfungen.filter(
        (v) => !entfernteAussagenIds.includes(v.aussageId),
      )
      return
    }

    case 'partnerschaftAnlegen': {
      const paar = zweiVerschiedeneAusListe(zustand.personIds, aktion.personZielRohA, aktion.personZielRohB)
      if (paar === undefined) {
        return
      }
      const [a, b] = paar
      const { id } = fuehreAus(db, 'partnerschaft.anlegen', {
        typ: aktion.typ,
        beteiligte: [{ personId: a }, { personId: b }],
        konfidenz: aktion.konfidenz,
        notiz: aktion.notiz,
      })
      zustand.partnerschaften.push({ id, personIds: [a, b] })
      zustand.aussagen.push({ id: existenzAussageIdLesen(db, 'partnerschaft', id), subjektTyp: 'partnerschaft', subjektId: id })
      return
    }

    case 'partnerschaftAendern': {
      const ziel = zielAusListe(zustand.partnerschaften, aktion.partnerschaftZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'partnerschaft.aendern', { id: ziel.id, typ: aktion.typ, endeGrund: aktion.endeGrund, notiz: aktion.notiz })
      return
    }

    case 'partnerschaftLoeschen': {
      const ziel = zielAusListe(zustand.partnerschaften, aktion.partnerschaftZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'partnerschaft.loeschen', { id: ziel.id })
      zustand.partnerschaften = zustand.partnerschaften.filter((p) => p.id !== ziel.id)
      // AP-1.29 PR-B: s. Kommentar im `elternschaftLoeschen`-Fall — dieselbe CASCADE-Nachpflege für
      // `aussage_zitat`.
      const entfernteAussagenIds = zustand.aussagen
        .filter((a) => a.subjektTyp === 'partnerschaft' && a.subjektId === ziel.id)
        .map((a) => a.id)
      zustand.aussagen = zustand.aussagen.filter((a) => !(a.subjektTyp === 'partnerschaft' && a.subjektId === ziel.id))
      zustand.aussageTripel = zustand.aussageTripel.filter((t) => !(t.subjektTyp === 'partnerschaft' && t.subjektId === ziel.id))
      zustand.aussageZitatVerknuepfungen = zustand.aussageZitatVerknuepfungen.filter(
        (v) => !entfernteAussagenIds.includes(v.aussageId),
      )
      return
    }

    case 'ereignisAnlegen': {
      const personId = zielId(zustand, aktion.personZielRoh)
      if (personId === undefined) {
        return
      }
      const { id } = fuehreAus(db, 'ereignis.anlegen', {
        typ: aktion.typ,
        beteiligungen: [{ personId, rolle: aktion.rolle }],
        konfidenz: aktion.konfidenz,
        beschreibung: aktion.beschreibung,
      })
      zustand.ereignisse.push({ id, personIds: [personId] })
      zustand.beteiligungen.push({ id: beteiligungIdLesen(db, id, personId), ereignisId: id, personId })
      zustand.aussagen.push({ id: existenzAussageIdLesen(db, 'ereignis', id), subjektTyp: 'ereignis', subjektId: id })
      return
    }

    case 'ereignisAendern': {
      const ziel = zielAusListe(zustand.ereignisse, aktion.ereignisZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'ereignis.aendern', { id: ziel.id, typ: aktion.typ, beschreibung: aktion.beschreibung })
      return
    }

    case 'ereignisLoeschen': {
      const ziel = zielAusListe(zustand.ereignisse, aktion.ereignisZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'ereignis.loeschen', { id: ziel.id })
      zustand.ereignisse = zustand.ereignisse.filter((e) => e.id !== ziel.id)
      // `ereignis-repo.ts` Kommentar "CASCADE räumt `beteiligung` ab" — jede noch offene Beteiligung
      // dieses Ereignisses verschwindet mit, `zustand.beteiligungen` muss das nachvollziehen (sonst
      // würde ein späteres `beteiligung.loeschen` einen bereits kaskadiert gelöschten `id` referenzieren).
      zustand.beteiligungen = zustand.beteiligungen.filter((b) => b.ereignisId !== ziel.id)
      // AP-1.29 PR-B: s. Kommentar im `elternschaftLoeschen`-Fall — dieselbe CASCADE-Nachpflege für
      // `aussage_zitat`.
      const entfernteAussagenIds = zustand.aussagen
        .filter((a) => a.subjektTyp === 'ereignis' && a.subjektId === ziel.id)
        .map((a) => a.id)
      zustand.aussagen = zustand.aussagen.filter((a) => !(a.subjektTyp === 'ereignis' && a.subjektId === ziel.id))
      zustand.aussageTripel = zustand.aussageTripel.filter((t) => !(t.subjektTyp === 'ereignis' && t.subjektId === ziel.id))
      zustand.aussageZitatVerknuepfungen = zustand.aussageZitatVerknuepfungen.filter(
        (v) => !entfernteAussagenIds.includes(v.aussageId),
      )
      return
    }

    case 'beteiligungLoeschen': {
      const ziel = zielAusListe(zustand.beteiligungen, aktion.beteiligungZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'beteiligung.loeschen', { id: ziel.id })
      zustand.beteiligungen = zustand.beteiligungen.filter((b) => b.id !== ziel.id)
      // Das zugehörige `ereignis` bleibt bestehen — auch mit 0 Beteiligungen (Variante A, s.
      // Typkommentar `AktionBeteiligungLoeschen`). `personIstGebunden()` prüft `beteiligung.person_id`
      // (RESTRICT) über `zustand.ereignisse[].personIds` (s. dortiger Kopfkommentar) — die gelöschte
      // `personId` muss darum aus DIESEM Ereignis-Eintrag verschwinden, sonst bliebe die Person dort
      // fälschlich weiter als "gebunden" markiert, obwohl die einzige Beteiligung, die sie band, gerade
      // gelöscht wurde.
      zustand.ereignisse = zustand.ereignisse.map((e) =>
        e.id === ziel.ereignisId ? { id: e.id, personIds: e.personIds.filter((p) => p !== ziel.personId) } : e,
      )
      return
    }

    case 'aussageAnlegen': {
      const pools = aussageSubjektPools(zustand)
      const pool = pools[poolIndexBiased(aktion.subjektWahlRoh)]
      if (pool === undefined) {
        throw new Error('aktionAusfuehren(aussageAnlegen): unerreichbar — der Index liegt innerhalb der Poolanzahl.')
      }
      const subjektId = zielAusListe(pool.ids, aktion.subjektZielRoh)
      if (subjektId === undefined) {
        return
      }
      const { id } = fuehreAus(db, 'aussage.anlegen', aussageAnlegenEinBauen(pool.kind, subjektId, aktion))
      zustand.aussagen.push({ id, subjektTyp: pool.kind, subjektId })
      // `istBevorzugt === 1` macht diesen Dreiklang ebenfalls zu einem gültigen Wiederholungsziel
      // für `aussageFaktAendern` (s. dortiger Fall) — nur dann demoted eine spätere Wiederholung
      // tatsächlich etwas (`aussage-anlegen.ts` demoted nur zuvor selbst bevorzugte Aussagen).
      if (aktion.istBevorzugt === 1) {
        zustand.aussageTripel.push({ subjektTyp: pool.kind, subjektId, praedikat: aktion.praedikat })
      }
      return
    }

    case 'aussageLoeschen': {
      const ziel = zielAusListe(zustand.aussagen, aktion.aussageZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'aussage.loeschen', { id: ziel.id })
      zustand.aussagen = zustand.aussagen.filter((a) => a.id !== ziel.id)
      // AP-1.29 PR-B: `ON DELETE CASCADE` auf `aussage_zitat.aussage_id` (Kopfkommentar
      // `AktionAussageZitatAnlegen`) — jede Verknüpfung dieser Aussage verschwindet mit.
      zustand.aussageZitatVerknuepfungen = zustand.aussageZitatVerknuepfungen.filter((v) => v.aussageId !== ziel.id)
      return
    }

    case 'aussageAendern': {
      const ziel = zielAusListe(zustand.aussagen, aktion.aussageZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'aussage.aendern', {
        id: ziel.id,
        konfidenz: aktion.konfidenz,
        begruendung: aktion.begruendung,
        unsicherheit: aktion.unsicherheit,
        gueltigVon: aktion.gueltigVon,
        gueltigBis: aktion.gueltigBis,
        ...aussageWertFeld(aktion.wert),
      })
      return
    }

    case 'aussageZitatAnlegen': {
      const aussage = zielAusListe(zustand.aussagen, aktion.aussageZielRoh)
      if (aussage === undefined) {
        return
      }
      const zitatId = zielAusListe(zustand.zitatIds, aktion.zitatZielRoh)
      if (zitatId === undefined) {
        return
      }
      // Zusammengesetzter Primärschlüssel `(aussage_id, zitat_id)` (Kopfkommentar) — ein Kandidat
      // mit bereits vergebener Kombination würde `KONFLIKT_BEREITS_VORHANDEN` werfen, bleibt darum
      // ein bewusster No-op (dasselbe Vermeidungsmuster wie bei `ort-externe-id.anlegen`).
      const bestehtSchon = zustand.aussageZitatVerknuepfungen.some(
        (v) => v.aussageId === aussage.id && v.zitatId === zitatId,
      )
      if (bestehtSchon) {
        return
      }
      fuehreAus(db, 'aussage_zitat.anlegen', { aussageId: aussage.id, zitatId })
      zustand.aussageZitatVerknuepfungen.push({ aussageId: aussage.id, zitatId })
      return
    }

    case 'aussageZitatLoeschen': {
      const ziel = zielAusListe(zustand.aussageZitatVerknuepfungen, aktion.verknuepfungZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'aussage_zitat.loeschen', { aussageId: ziel.aussageId, zitatId: ziel.zitatId })
      zustand.aussageZitatVerknuepfungen = zustand.aussageZitatVerknuepfungen.filter(
        (v) => !(v.aussageId === ziel.aussageId && v.zitatId === ziel.zitatId),
      )
      return
    }

    case 'aussageFaktAendern': {
      // Existiert bereits ein getrackter Dreiklang: GENAU DIESEN wiederholen — mit `istBevorzugt: 1`
      // erzwungen, garantierter Demote-Treffer (s. Kopfkommentar "DEMOTE-DECKUNG" und Typkommentar
      // bei `AktionAussageFaktAendern`). Kein No-op-Fall hier: `zielAusListe()` liefert bei
      // nichtleerer Liste immer ein Element.
      if (zustand.aussageTripel.length > 0) {
        const tripel = zielAusListe(zustand.aussageTripel, aktion.tripelWahlRoh)
        if (tripel === undefined) {
          throw new Error('aktionAusfuehren(aussageFaktAendern): unerreichbar — die Liste ist nicht leer.')
        }
        const { id } = fuehreAus(db, 'aussage.anlegen', {
          subjektTyp: tripel.subjektTyp,
          subjektId: tripel.subjektId,
          praedikat: tripel.praedikat,
          konfidenz: aktion.konfidenz,
          istBevorzugt: 1,
          ...aussageWertFeld(aktion.wert),
        })
        zustand.aussagen.push({ id, subjektTyp: tripel.subjektTyp, subjektId: tripel.subjektId })
        return
      }

      // Noch kein getrackter Dreiklang: einen neuen anlegen (analog `aussageAnlegen`, aber IMMER
      // `istBevorzugt: 1`) und für spätere Wiederholungen vormerken.
      const pools = aussageSubjektPools(zustand)
      const pool = pools[poolIndexBiased(aktion.subjektWahlRoh)]
      if (pool === undefined) {
        throw new Error('aktionAusfuehren(aussageFaktAendern): unerreichbar — der Index liegt innerhalb der Poolanzahl.')
      }
      const subjektId = zielAusListe(pool.ids, aktion.subjektZielRoh)
      if (subjektId === undefined) {
        return
      }
      const { id } = fuehreAus(db, 'aussage.anlegen', {
        subjektTyp: pool.kind,
        subjektId,
        praedikat: aktion.praedikat,
        konfidenz: aktion.konfidenz,
        istBevorzugt: 1,
        ...aussageWertFeld(aktion.wert),
      })
      zustand.aussagen.push({ id, subjektTyp: pool.kind, subjektId })
      zustand.aussageTripel.push({ subjektTyp: pool.kind, subjektId, praedikat: aktion.praedikat })
      return
    }

    case 'ortAnlegen': {
      const { id } = fuehreAus(db, 'ort.anlegen', { name: aktion.name, typ: aktion.typ, notiz: aktion.notiz })
      zustand.ortIds.push(id)
      // `ort.anlegen` legt selbst einen primären `ortsname` an (s. Kopfkommentar) — dessen echte
      // `id` liest der Generator nach, damit sie ein gültiges `ortsname.aendern`/`.loeschen`-Ziel
      // wird (analog `existenzAussageIdLesen()`/`beteiligungIdLesen()`).
      const ortsnameId = ortsnameIdLesen(db, id)
      zustand.ortsnamen.push({ id: ortsnameId, ortId: id })
      return
    }

    case 'ortAendern': {
      const ortId = zielAusListe(zustand.ortIds, aktion.ortZielRoh)
      if (ortId === undefined) {
        return
      }
      fuehreAus(db, 'ort.aendern', {
        id: ortId,
        typ: aktion.typ,
        koordinatenLat: aktion.koordinatenLat,
        koordinatenLon: aktion.koordinatenLon,
        existiertVon: aktion.existiertVon,
        existiertBis: aktion.existiertBis,
        notiz: aktion.notiz,
      })
      return
    }

    case 'ortsnameAnlegen': {
      const ortId = zielAusListe(zustand.ortIds, aktion.ortZielRoh)
      if (ortId === undefined) {
        return
      }
      const { id } = fuehreAus(db, 'ortsname.anlegen', {
        ortId,
        name: aktion.name,
        sprache: aktion.sprache,
        gueltigVon: aktion.gueltigVon,
        gueltigBis: aktion.gueltigBis,
        istBevorzugt: aktion.istBevorzugt,
        originalText: aktion.originalText,
      })
      zustand.ortsnamen.push({ id, ortId })
      return
    }

    case 'ortsnameAendern': {
      const ziel = zielAusListe(zustand.ortsnamen, aktion.ortsnameZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'ortsname.aendern', {
        id: ziel.id,
        name: aktion.name,
        sprache: aktion.sprache,
        gueltigVon: aktion.gueltigVon,
        gueltigBis: aktion.gueltigBis,
        istBevorzugt: aktion.istBevorzugt,
        originalText: aktion.originalText,
      })
      return
    }

    case 'ortsnameLoeschen': {
      const ziel = zielAusListe(zustand.ortsnamen, aktion.ortsnameZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'ortsname.loeschen', { id: ziel.id })
      zustand.ortsnamen = zustand.ortsnamen.filter((n) => n.id !== ziel.id)
      return
    }

    case 'ortszugehoerigkeitAnlegen': {
      const paar = zweiVerschiedeneAusListe(zustand.ortIds, aktion.ortZielRohA, aktion.ortZielRohB)
      if (paar === undefined) {
        return
      }
      const [ortId, uebergeordnetId] = paar
      const kanten: readonly Ortskante[] = zustand.ortszugehoerigkeiten
        .filter((z) => z.art === aktion.zugehoerigkeitArt)
        .map((z) => ({ ortId: z.ortId, uebergeordnetId: z.uebergeordnetId }))
      if (ortWuerdeZyklusErzeugen(kanten, { ortId, uebergeordnetId })) {
        return
      }
      const { id } = fuehreAus(db, 'ortszugehoerigkeit.anlegen', {
        ortId,
        uebergeordnetId,
        art: aktion.zugehoerigkeitArt,
        gueltigVon: aktion.gueltigVon,
        gueltigBis: aktion.gueltigBis,
      })
      zustand.ortszugehoerigkeiten.push({ id, ortId, uebergeordnetId, art: aktion.zugehoerigkeitArt })
      return
    }

    case 'ortszugehoerigkeitAendern': {
      const ziel = zielAusListe(zustand.ortszugehoerigkeiten, aktion.ortszugehoerigkeitZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'ortszugehoerigkeit.aendern', { id: ziel.id, gueltigVon: aktion.gueltigVon, gueltigBis: aktion.gueltigBis })
      return
    }

    case 'ortszugehoerigkeitLoeschen': {
      const ziel = zielAusListe(zustand.ortszugehoerigkeiten, aktion.ortszugehoerigkeitZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'ortszugehoerigkeit.loeschen', { id: ziel.id })
      zustand.ortszugehoerigkeiten = zustand.ortszugehoerigkeiten.filter((z) => z.id !== ziel.id)
      return
    }

    case 'ortExterneIdAnlegen': {
      const ortId = zielAusListe(zustand.ortIds, aktion.ortZielRoh)
      if (ortId === undefined) {
        return
      }
      // `(ortId, system)` ist der zusammengesetzte Primärschlüssel (s. Kopfkommentar) — ein
      // Kandidat mit einer bereits vergebenen Kombination würde `KONFLIKT_ORT_EXTERNE_ID_DUPLIKAT`
      // werfen, bleibt darum (wie der Zyklus-Fall oben) ein bewusster No-op statt eines Wurfs.
      const bestehtSchon = zustand.ortExterneIds.some((e) => e.ortId === ortId && e.system === aktion.system)
      if (bestehtSchon) {
        return
      }
      fuehreAus(db, 'ort-externe-id.anlegen', { ortId, system: aktion.system, wert: aktion.wert })
      zustand.ortExterneIds.push({ ortId, system: aktion.system })
      return
    }

    case 'ortExterneIdLoeschen': {
      const ziel = zielAusListe(zustand.ortExterneIds, aktion.ortExterneIdZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'ort-externe-id.loeschen', { ortId: ziel.ortId, system: ziel.system })
      zustand.ortExterneIds = zustand.ortExterneIds.filter((e) => !(e.ortId === ziel.ortId && e.system === ziel.system))
      return
    }

    case 'archivAnlegen': {
      const { id } = fuehreAus(db, 'archiv.anlegen', { name: aktion.name, kontakt: aktion.kontakt, url: aktion.url, notiz: aktion.notiz })
      zustand.archivIds.push(id)
      return
    }

    case 'archivAendern': {
      const archivId = zielAusListe(zustand.archivIds, aktion.archivZielRoh)
      if (archivId === undefined) {
        return
      }
      fuehreAus(db, 'archiv.aendern', { id: archivId, name: aktion.name, kontakt: aktion.kontakt, url: aktion.url, notiz: aktion.notiz })
      return
    }

    case 'quelleAnlegen': {
      const archivId = wahlAufloesen(zustand.archivIds, aktion.archivWahlRoh)
      const { id } = fuehreAus(db, 'quelle.anlegen', {
        typ: aktion.typ,
        titel: aktion.titel,
        autor: aktion.autor,
        notiz: aktion.notiz,
        ...(archivId === undefined ? {} : { archivId }),
      })
      zustand.quelleIds.push(id)
      return
    }

    case 'quelleAendern': {
      const quelleId = zielAusListe(zustand.quelleIds, aktion.quelleZielRoh)
      if (quelleId === undefined) {
        return
      }
      const archivId = wahlAufloesen(zustand.archivIds, aktion.archivWahlRoh)
      fuehreAus(db, 'quelle.aendern', {
        id: quelleId,
        typ: aktion.typ,
        titel: aktion.titel,
        autor: aktion.autor,
        notiz: aktion.notiz,
        ...(archivId === undefined ? {} : { archivId }),
      })
      return
    }

    case 'zitatAnlegen': {
      const quelleId = zielAusListe(zustand.quelleIds, aktion.quelleZielRoh)
      if (quelleId === undefined) {
        return
      }
      const { id } = fuehreAus(db, 'zitat.anlegen', {
        quelleId,
        seite: aktion.seite,
        konfidenz: aktion.konfidenz,
        ...(aktion.transkript === undefined ? {} : { transkript: aktion.transkript }),
      })
      zustand.zitatIds.push(id)
      return
    }

    case 'zitatAendern': {
      const zitatId = zielAusListe(zustand.zitatIds, aktion.zitatZielRoh)
      if (zitatId === undefined) {
        return
      }
      const quelleId = zielAusListe(zustand.quelleIds, aktion.quelleZielRoh)
      if (quelleId === undefined) {
        return
      }
      fuehreAus(db, 'zitat.aendern', {
        id: zitatId,
        quelleId,
        seite: aktion.seite,
        transkript: aktion.transkript,
        konfidenz: aktion.konfidenz,
      })
      return
    }

    case 'zitatLoeschen': {
      const zitatId = zielAusListe(zustand.zitatIds, aktion.zitatZielRoh)
      if (zitatId === undefined) {
        return
      }
      fuehreAus(db, 'zitat.loeschen', { id: zitatId })
      zustand.zitatIds = zustand.zitatIds.filter((z) => z !== zitatId)
      // AP-1.29 PR-B: `ON DELETE CASCADE` auf `aussage_zitat.zitat_id` (Kopfkommentar
      // `AktionAussageZitatAnlegen`) — jede Verknüpfung dieses Zitats verschwindet mit.
      zustand.aussageZitatVerknuepfungen = zustand.aussageZitatVerknuepfungen.filter((v) => v.zitatId !== zitatId)
      return
    }

    case 'negativbefundAnlegen': {
      const personId = zielId(zustand, aktion.personZielRoh)
      if (personId === undefined) {
        return
      }
      const quelleId = wahlAufloesen(zustand.quelleIds, aktion.quelleWahlRoh)
      const { id } = fuehreAus(db, 'negativbefund.anlegen', {
        gesuchtePersonId: personId,
        gesuchtesPraedikat: aktion.gesuchtesPraedikat,
        zeitraumVon: aktion.zeitraumVon,
        zeitraumBis: aktion.zeitraumBis,
        beschreibung: aktion.beschreibung,
        ...(quelleId === undefined ? {} : { quelleId }),
      })
      zustand.negativbefundIds.push({ id, personId })
      return
    }

    case 'negativbefundAendern': {
      const ziel = zielAusListe(zustand.negativbefundIds, aktion.negativbefundZielRoh)
      if (ziel === undefined) {
        return
      }
      const personId = zielId(zustand, aktion.personZielRoh)
      if (personId === undefined) {
        return
      }
      const quelleId = wahlAufloesen(zustand.quelleIds, aktion.quelleWahlRoh)
      fuehreAus(db, 'negativbefund.aendern', {
        id: ziel.id,
        gesuchtePersonId: personId,
        gesuchtesPraedikat: aktion.gesuchtesPraedikat,
        zeitraumVon: aktion.zeitraumVon,
        zeitraumBis: aktion.zeitraumBis,
        beschreibung: aktion.beschreibung,
        ...(quelleId === undefined ? {} : { quelleId }),
      })
      // Die Zeile bleibt an `personId` (dem NEU angegebenen Ziel) gebunden — `negativbefund.aendern`
      // erlaubt genau das (die editierbaren Spalten umfassen `gesuchtePersonId` selbst, s.
      // Abschnittskommentar `src/shared/schemata/befehle.ts`). `zustand.negativbefundIds` muss diese
      // neue Bindung nachführen, sonst würde ein späteres `person.loeschen` auf das ALTE
      // `ziel.personId` fälschlich noch diesen (inzwischen umgehängten) Negativbefund kaskadieren.
      zustand.negativbefundIds = zustand.negativbefundIds.map((n) => (n.id === ziel.id ? { id: n.id, personId } : n))
      return
    }

    case 'negativbefundLoeschen': {
      const ziel = zielAusListe(zustand.negativbefundIds, aktion.negativbefundZielRoh)
      if (ziel === undefined) {
        return
      }
      fuehreAus(db, 'negativbefund.loeschen', { id: ziel.id })
      zustand.negativbefundIds = zustand.negativbefundIds.filter((n) => n.id !== ziel.id)
      return
    }

    default: {
      const nieErreicht: never = aktion
      throw new Error(`aktionAusfuehren(): unbehandelte Aktion ${JSON.stringify(nieErreicht)}`)
    }
  }
}
