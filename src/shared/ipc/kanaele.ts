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
  'abfrage:projekt.zuletzt',
  'befehl:wartung.abgeleiteteNeuAufbauen',
  'befehl:person.anlegen',
  'befehl:person.feldSetzen',
  'befehl:person.loeschen',
  'befehl:journal.undo',
  'befehl:journal.redo',
  'abfrage:journal.verlauf',
  'abfrage:import.pruefen',
  'befehl:import.trockenlauf',
  'befehl:import.ausfuehren',
  'abfrage:person.liste',
  'abfrage:suche',
]
export const ALLE_KANAELE: readonly string[] = kanaele

/**
 * Weißliste aller `ereignis:`-Kanäle (Hauptprozess → Renderer, AP-0.20: gegen `EreignisKanal`
 * geprüft — ein Tippfehler in der Liste wäre schon hier ein Typfehler, analog zu `kanaele` oben).
 * Der EXPORT bleibt `readonly string[]`: der Preload prüft rohe, ungeprüfte Strings dagegen
 * (Abnahme, nicht ändern). `ereignis:speicherStatus` folgt später (§7.5).
 */
const ereignisKanaele: readonly EreignisKanal[] = ['ereignis:datenGeaendert', 'ereignis:journalStatus', 'ereignis:projektGeschlossen']
export const EREIGNIS_KANAELE: readonly string[] = ereignisKanaele
