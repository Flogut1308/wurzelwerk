import type { EreignisKanal, Kanal } from './vertrag'

/**
 * Weißliste aller `abfrage:`/`befehl:`-Kanäle aus `Vertrag` (ADR-016). Der Preload prüft jeden
 * Aufruf dagegen, bevor er `ipcRenderer.invoke` überhaupt aufruft — dort ist der Kanalname ein
 * roher, ungeprüfter `string` aus dem Renderer, darum ist die Weißliste selbst `readonly
 * string[]`. Die Elemente sind hier trotzdem gegen `Kanal` geprüft: `kanaele` ist `readonly
 * Kanal[]`, ein Tippfehler in der Liste wäre also schon hier ein Typfehler.
 */
const kanaele: readonly Kanal[] = [
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
  'befehl:aussage.loeschen',
  'befehl:journal.undo',
  'befehl:journal.redo',
  'abfrage:journal.verlauf',
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
]
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
