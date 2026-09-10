// AP-0.12 (57_Phase0_Arbeitspakete.md „AP-0.12 — Fixture-Korpus und Generator"): reiner,
// deterministischer Zufallsgenerator für den Fixture-Korpus und den Massendaten-Generator. Ein
// Korpus mit der Abnahme "zwei Läufe mit gleichem Seed erzeugen bitgleiche Datenbanken" braucht
// einen echten, reproduzierbaren Zufallsstrom — `Math.random`/`crypto.randomUUID` sind dafür
// ungeeignet (nicht reproduzierbar) UND in `src/core/` ohnehin verboten (CLAUDE.md §4). SplitMix64
// (Vigna 2015, eine verbreitete Wahl genau für diesen Zweck) kommt mit einem einzigen 64-Bit-Zustand
// und reiner `BigInt`-Arithmetik aus — deterministisch auf jeder Plattform, kein
// Fließkomma-Rundungsrisiko.
//
// Verwendungszweck ausschließlich Test-/Fixture-Infrastruktur (`test/hilfsmittel/`,
// `fixtures/generiert/`): KEINE kryptografische Zufallsquelle und NICHT für echte Nutzerdaten — die
// entstehen weiterhin über `uuid7()` in `src/main/datenbank/verbindung.ts` (zeit-/zufallsbasiert,
// bewusst NICHT deterministisch).

const MASKE_64 = 0xffffffffffffffffn
const GOLDENER_SCHNITT_64 = 0x9e3779b97f4a7c15n
const MISCH_KONSTANTE_1 = 0xbf58476d1ce4e5b9n
const MISCH_KONSTANTE_2 = 0x94d049bb133111ebn
const HEX_JE_ZUSTAND = 16
const ZEIT_BITS_MASKE = 0xffffffffffffn // 48 Bit
const ID_ZUFALLS_HEX_LAENGE = 19

/**
 * Deterministischer Pseudozufallsgenerator (SplitMix64). Gleicher `seed` → exakt derselbe
 * Zahlenstrom, in jedem Prozess und auf jeder Plattform (reine `BigInt`-Arithmetik, kein
 * `Math.random`/`Date.now`/`new Date`/`crypto`, CLAUDE.md §4).
 */
export class SeedPrng {
  private zustand: bigint
  private zeitzaehler = 0n
  private hexVorrat = ''

  constructor(seed: number | bigint) {
    const seedGanzzahl = typeof seed === 'bigint' ? seed : BigInt(Math.trunc(seed))
    this.zustand = seedGanzzahl & MASKE_64
  }

  /** Ein SplitMix64-Schritt: Zustand fortschreiben, Ergebnis durchmischen. */
  private naechsterZustand(): bigint {
    this.zustand = (this.zustand + GOLDENER_SCHNITT_64) & MASKE_64
    let z = this.zustand
    z = ((z ^ (z >> 30n)) * MISCH_KONSTANTE_1) & MASKE_64
    z = ((z ^ (z >> 27n)) * MISCH_KONSTANTE_2) & MASKE_64
    z = (z ^ (z >> 31n)) & MASKE_64
    return z
  }

  /** Nächste 32-Bit-Zahl (0 … 2^32-1) des deterministischen Stroms. */
  naechsteZahl(): number {
    return Number(this.naechsterZustand() & 0xffffffffn)
  }

  /**
   * Nächste `zeichen` Hex-Ziffern (Kleinbuchstaben) des deterministischen Stroms. Ein einzelner
   * SplitMix64-Schritt liefert 64 Bit = 16 Hex-Ziffern; ein interner Vorrat puffert den Überhang
   * zwischen Aufrufen, damit z. B. `naechsterHex(3)` gefolgt von `naechsterHex(20)` denselben
   * Gesamtstrom liefert wie ein einziger `naechsterHex(23)`-Aufruf.
   */
  naechsterHex(zeichen: number): string {
    if (!Number.isInteger(zeichen) || zeichen < 0) {
      throw new RangeError(`SeedPrng.naechsterHex: zeichen muss eine nichtnegative Ganzzahl sein, war ${String(zeichen)}`)
    }
    while (this.hexVorrat.length < zeichen) {
      this.hexVorrat += this.naechsterZustand().toString(16).padStart(HEX_JE_ZUSTAND, '0')
    }
    const ergebnis = this.hexVorrat.slice(0, zeichen)
    this.hexVorrat = this.hexVorrat.slice(zeichen)
    return ergebnis
  }

  /**
   * Deterministische, UUID-v7-förmige Kennung: `xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx` mit
   * Version-Nibble `7` und Varianten-Nibble `y` ∈ {8,9,a,b} (RFC 9562 §5.7 / §4.1). Die
   * Zeitkomponente (die ersten 48 Bit) kommt aus einem monoton steigenden internen Zähler statt aus
   * der Uhr: zwei Instanzen mit demselben `seed` erzeugen dadurch exakt dieselbe Folge von IDs
   * (AP-0.12-Abnahme "zwei Läufe mit gleichem Seed → bitgleiche Datenbank"). Der Zähler bildet keine
   * echte Millisekunden-Uhr nach — für Fixtures zählt nur eine stabile, aufsteigende
   * Sortierreihenfolge, keine reale Zeitangabe.
   */
  naechsteId(): string {
    this.zeitzaehler += 1n
    const zeitHex = (this.zeitzaehler & ZEIT_BITS_MASKE).toString(16).padStart(12, '0')
    const zufallsHex = this.naechsterHex(ID_ZUFALLS_HEX_LAENGE)
    const randA = zufallsHex.slice(0, 3)
    const variantenQuelle = Number.parseInt(zufallsHex.slice(3, 4), 16)
    const restB = zufallsHex.slice(4)
    // Variantennibble RFC 9562: oberste zwei Bit fest `10`, untere zwei Bit frei aus dem Zufallsstrom.
    const variantenNibble = ((variantenQuelle & 0b0011) | 0b1000).toString(16)
    return (
      `${zeitHex.slice(0, 8)}-${zeitHex.slice(8, 12)}-7${randA}-` +
      `${variantenNibble}${restB.slice(0, 3)}-${restB.slice(3)}`
    )
  }
}
