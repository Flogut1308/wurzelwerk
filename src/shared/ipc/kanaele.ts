import type { Kanal } from './vertrag'

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
]
export const ALLE_KANAELE: readonly string[] = kanaele

/**
 * Weißliste aller `ereignis:`-Kanäle (Hauptprozess → Renderer). AP-0.9 ergänzt die ersten beiden
 * Kanäle des Befehlsbusses; `ereignis:speicherStatus` folgt später.
 */
export const EREIGNIS_KANAELE: readonly string[] = ['ereignis:datenGeaendert', 'ereignis:journalStatus']
