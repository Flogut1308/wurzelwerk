import type { EreignisKanal, Kanal } from './vertrag'

/**
 * Weißliste aller `abfrage:`/`befehl:`-Kanäle aus `Vertrag` (ADR-016). Der Preload prüft jeden
 * Aufruf dagegen, bevor er `ipcRenderer.invoke` überhaupt aufruft — dort ist der Kanalname ein
 * roher, ungeprüfter `string` aus dem Renderer, darum ist die Weißliste selbst `readonly
 * string[]`. `kanaele` ist `as const satisfies readonly Kanal[]`: ein Tippfehler in der Liste
 * ist schon hier ein Typfehler, UND die Literalunion bleibt erhalten, damit der
 * Vollständigkeitsbeweis unten (`FehlendeKanaele`) greift — die reine `readonly Kanal[]`-Annotation
 * hätte das auf die breite Union verwässert und wäre für eine Teilmenge typkorrekt geblieben (der
 * eigentliche Grund, warum 13 Kanäle unbemerkt fehlen konnten, s. AP-1.17c1-Nachbesserung unten).
 */
const kanaele = [
  'abfrage:version',
  'befehl:protokoll.melden',
  'befehl:projekt.anlegen',
  'befehl:projekt.oeffnen',
  'befehl:projekt.schliessen',
  'befehl:projekt.elternordnerWaehlen',
  'befehl:projekt.ordnerWaehlen',
  'abfrage:projekt.zuletzt',
  'befehl:wartung.abgeleiteteNeuAufbauen',
  'befehl:person.anlegen',
  'befehl:person.feldSetzen',
  'befehl:person.loeschen',
  'befehl:name.anlegen',
  'befehl:name.aendern',
  'befehl:name.loeschen',
  'befehl:elternschaft.anlegen',
  'befehl:elternschaft.aendern',
  'befehl:elternschaft.loeschen',
  'befehl:partnerschaft.anlegen',
  'befehl:partnerschaft.aendern',
  'befehl:partnerschaft.loeschen',
  'befehl:ereignis.anlegen',
  'befehl:ereignis.aendern',
  'befehl:ereignis.loeschen',
  'befehl:beteiligung.loeschen',
  'befehl:aussage.anlegen',
  'befehl:aussage.aendern',
  'befehl:aussage.loeschen',
  'befehl:aussage_zitat.anlegen',
  'befehl:aussage_zitat.loeschen',
  'befehl:journal.undo',
  'befehl:journal.redo',
  'abfrage:journal.verlauf',
  // Vom Compile-Zeit-Vollständigkeitsbeweis unten (`FehlendeKanaele`) beim Einbau dieses Guards
  // aufgedeckt: dieselbe Bugklasse wie die 13 Kanäle weiter unten — in `registrierung.ts` bedient
  // (`schnappschussErzeugen`/`schnappschussListeLesen`/`schnappschussWiederherstellen`), aber nie
  // hier eingetragen. Die hartkodierte Runtime-Liste in
  // `test/einheit/kanaele-vollstaendigkeit.test.ts` deckte nur die dort benannten 13 ab und hätte
  // diese drei nie gefunden — genau der Beweis, warum diese Liste jetzt der eigentliche Wächter ist.
  'befehl:schnappschuss.erzeugen',
  'abfrage:schnappschuss.liste',
  'befehl:schnappschuss.wiederherstellen',
  'abfrage:import.pruefen',
  'befehl:import.trockenlauf',
  'befehl:import.ausfuehren',
  'befehl:import.dateiWaehlen',
  'befehl:import.berichtSpeichern',
  'abfrage:person.liste',
  'abfrage:suche',
  'abfrage:person.detail',
  'abfrage:pruefhinweise',
  'befehl:ort.anlegen',
  'befehl:ort.aendern',
  'abfrage:ort.suche',
  'abfrage:ort.detail',
  'befehl:ortsname.anlegen',
  'befehl:ortsname.aendern',
  'befehl:ortsname.loeschen',
  'befehl:ortszugehoerigkeit.anlegen',
  'befehl:ortszugehoerigkeit.aendern',
  'befehl:ortszugehoerigkeit.loeschen',
  'befehl:ort-externe-id.anlegen',
  'befehl:ort-externe-id.loeschen',
  // AP-1.17c1-Nachbesserung: diese 13 Kanäle waren in `registrierung.ts` bedient, aber nie hier
  // eingetragen — der Preload wies jeden Aufruf mit `IPC_UNBEKANNTER_KANAL` zurück, unabhängig
  // vom Handler (s. `test/einheit/kanaele-vollstaendigkeit.test.ts`). Damit war die gesamte
  // Quellen-/Zitat-/Archiv-/Negativbefund-Pflege aus dem Renderer heraus unerreichbar.
  'befehl:archiv.anlegen',
  'befehl:archiv.aendern',
  'abfrage:archiv.suche',
  'befehl:quelle.anlegen',
  'befehl:quelle.aendern',
  'abfrage:quelle.detail',
  'abfrage:quelle.suche',
  'befehl:zitat.anlegen',
  'befehl:zitat.aendern',
  'befehl:zitat.loeschen',
  'befehl:negativbefund.anlegen',
  'befehl:negativbefund.aendern',
  'befehl:negativbefund.loeschen',
  'abfrage:negativbefund.liste',
] as const satisfies readonly Kanal[]

/**
 * Compile-Zeit-Vollständigkeitsbeweis: Wenn ein in `Vertrag` deklarierter `abfrage:`/`befehl:`-
 * Kanal hier in `kanaele` fehlt, ist `FehlendeKanaele` kein `never` mehr — die Zuweisung an
 * `_kanaeleVollstaendig` wird dann ein Typfehler und `pnpm typen` schlägt fehl. Das ersetzt eine
 * Handpflege-Liste: jeder künftig neu deklarierte Kanal muss hier auftauchen, sonst kompiliert
 * nichts mehr (s. AP-1.17c1-Nachbesserung, Kopfkommentar in
 * `test/einheit/kanaele-vollstaendigkeit.test.ts`).
 */
type FehlendeKanaele = Exclude<Kanal, (typeof kanaele)[number]>
const _kanaeleVollstaendig: [FehlendeKanaele] extends [never] ? true : false = true
void _kanaeleVollstaendig

export const ALLE_KANAELE: readonly string[] = kanaele

/**
 * Weißliste aller `ereignis:`-Kanäle (Hauptprozess → Renderer, AP-0.20: gegen `EreignisKanal`
 * geprüft — ein Tippfehler in der Liste wäre schon hier ein Typfehler, analog zu `kanaele` oben).
 * Der EXPORT bleibt `readonly string[]`: der Preload prüft rohe, ungeprüfte Strings dagegen
 * (Abnahme, nicht ändern). `ereignis:speicherStatus` folgt später (§7.5).
 */
const ereignisKanaele: readonly EreignisKanal[] = [
  'ereignis:datenGeaendert',
  'ereignis:journalStatus',
  'ereignis:projektGeschlossen',
  'ereignis:zustandsbibliothekOeffnen',
]
export const EREIGNIS_KANAELE: readonly string[] = ereignisKanaele
