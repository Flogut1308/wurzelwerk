// Baut aus zerlegten Namensbestandteilen strukturierte Anzeige-Segmente (AP-1.2). Kein fertiger
// String, kein i18n hier (CLAUDE.md §4) — die Zusammensetzung zu sichtbarem Text ist Sache des
// Renderers.
import type { Anzeigename, AnzeigenameVorname, Namensbestandteile } from './typen'

/**
 * Zerlegt `vornamen` an Leerzeichen und markiert den Rufnamen: `rufnameText` gewinnt (exakter
 * Texttreffer innerhalb der Kette), sonst zählt `rufnameIndex` (0-basierte Position).
 */
function vornamenListe(bestandteile: Namensbestandteile): readonly AnzeigenameVorname[] {
  const { vornamen, rufnameIndex, rufnameText } = bestandteile
  if (vornamen === undefined) {
    return []
  }
  const tokens = vornamen.split(/\s+/u).filter((token) => token.length > 0)
  return tokens.map((text, index) => ({
    text,
    istRufname: rufnameText !== undefined ? text === rufnameText : index === rufnameIndex,
  }))
}

/**
 * Baut aus `Namensbestandteile` ein `Anzeigename`-Ergebnis (Titel, Vornamenkette mit
 * Rufname-Markierung, Präfix, Nachname, Zusatz). Reine Funktion, keine Datenbank, kein i18n.
 */
export function anzeigename(bestandteile: Namensbestandteile): Anzeigename {
  return {
    ...(bestandteile.titelVor !== undefined ? { titelVor: bestandteile.titelVor } : {}),
    vornamen: vornamenListe(bestandteile),
    ...(bestandteile.praefix !== undefined ? { praefix: bestandteile.praefix } : {}),
    ...(bestandteile.nachname !== undefined ? { nachname: bestandteile.nachname } : {}),
    ...(bestandteile.zusatzNach !== undefined ? { zusatzNach: bestandteile.zusatzNach } : {}),
  }
}
