import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ALLE_FEHLERCODES } from '../../src/shared/fehler/codes'
import fehlerRessourcen from '../../src/shared/i18n/de/fehler.json'
import negativbefundRessourcen from '../../src/shared/i18n/de/negativbefund.json'
import profilRessourcen from '../../src/shared/i18n/de/profil.json'
import quellenRessourcen from '../../src/shared/i18n/de/quellen.json'
import {
  PRAEDIKAT_SCHLUESSEL,
  beteiligungRolleSchluessel,
  ereignisTypSchluessel,
  geschlechtSchluessel,
  gesundheitArtSchluessel,
  kantentypSchluessel,
  nameTypSchluessel,
  platzhalterGrundSchluessel,
  quelleTypSchluessel,
  richtungSchluessel,
  schriftSchluessel,
  unmittelbarkeitSchluessel,
} from '../../src/renderer/ansichten/profil/profil-schluessel'
import { informationsartSchluessel, quelleArtSchluessel, quelleFormSchluessel } from '../../src/renderer/ansichten/quellen/quellen-schluessel'
import { BeteiligungRolleEnum } from '../../src/shared/schemata/beteiligung'
import { ElternschaftTypEnum } from '../../src/shared/schemata/elternschaft'
import { EreignisTypEnum } from '../../src/shared/schemata/ereignis'
import { NameTypEnum, SchriftEnum } from '../../src/shared/schemata/name'
import { PartnerschaftTypEnum } from '../../src/shared/schemata/partnerschaft'
import { GeschlechtEnum, PlatzhalterGrundEnum } from '../../src/shared/schemata/person'
import { PersonDetailBeziehungRichtungEnum, PersonDetailGesundheitArtEnum } from '../../src/shared/schemata/person-detail'
import { InformationsartEnum, QuelleArtEnum, QuelleFormEnum, QuelleTypEnum, UnmittelbarkeitEnum } from '../../src/shared/schemata/quelle'

/**
 * Erzwingt §7: jeder Fehlercode braucht einen i18n-Schlüssel `.titel` und `.was_tun`, und
 * `was_tun` ist eine Handlungsanweisung, keine leere Zeichenkette. `ALLE_FEHLERCODES` ist die
 * einzige Quelle der Wahrheit (codes.ts) — dieser Test läuft gegen jeden Code, der dort jemals
 * ergänzt wird, ohne dass die Testdatei angefasst werden muss.
 */
describe('i18n-Ressourcen für Fehlercodes (§7, ADR-011)', () => {
  it.each(ALLE_FEHLERCODES)('hat einen vollständigen Eintrag für %s', (code) => {
    const eintrag = fehlerRessourcen[code]

    expect(eintrag).toBeDefined()
    expect(eintrag.titel.trim().length).toBeGreaterThan(0)
    expect(eintrag.was_tun.trim().length).toBeGreaterThan(0)
  })
})

/**
 * AP-1.7 PR-B (hueter-Auflage 2, PR #66): dehnt das Vollständigkeitsnetz auf den neuen `profil`-
 * Namespace aus. Zwei Quellen, weil `t(...)` in der Profilseite auf zwei Arten aufgerufen wird
 * (`profil-ansicht.tsx`, `beleg-liste.tsx`, `widerspruchsblock.tsx`, `beleg-abzeichen.tsx`,
 * `seitenschublade.tsx`):
 *
 * 1. Literal — `t('ueberschrift')` — statisch aus dem Quelltext herauslesbar.
 * 2. Dynamisch über eine geschlossene Schalter-Funktion — `t(ereignisTypSchluessel(typ))`
 *    (`src/renderer/ansichten/profil/profil-schluessel.ts`) — hier NICHT aus dem Quelltext
 *    herauslesbar (das Ergebnis ist zur Statik-Zeit kein Literal), darum stattdessen jede
 *    Schalter-Funktion über ALLE Enum-Werte durchlaufen (`.options`, wie
 *    `test/einheit/elternschaft-typ-konsistenz.test.ts` es bereits vormacht) und jeden
 *    tatsächlich erzeugten Schlüssel prüfen.
 *
 * `praedikatSchluessel()` ist eine Nachschlagetabelle mit einer OFFENEN Eingabemenge (E-6) — hier
 * über `PRAEDIKAT_SCHLUESSEL` (der Tabelle selbst, benannt exportiert) geprüft, nicht über die
 * Funktion, weil ein unbekanntes Prädikat bewusst `undefined` liefert (kein Schlüssel, roher Text).
 */
describe('i18n-Ressourcen für den profil-Namespace (AP-1.7 PR-B)', () => {
  const RENDERER_WURZEL = fileURLToPath(new URL('../../src/renderer', import.meta.url))
  const NUTZT_PROFIL_NAMESPACE = /useTranslation\(\s*['"]profil['"]\s*\)/
  const LITERALER_T_AUFRUF = /\bt\(\s*['"]([a-zA-Z0-9_]+)['"]/g

  function quellDateien(wurzel: string): readonly string[] {
    const gefunden: string[] = []
    for (const eintrag of readdirSync(wurzel, { withFileTypes: true })) {
      const pfad = join(wurzel, eintrag.name)
      if (eintrag.isDirectory()) gefunden.push(...quellDateien(pfad))
      else if (eintrag.name.endsWith('.tsx') || eintrag.name.endsWith('.ts')) gefunden.push(pfad)
    }
    return gefunden
  }

  /** Alle LITERAL in `t(...)` verwendeten Schlüssel aus jeder Datei, die `useTranslation('profil')`
   * aufruft — bewusst nur diese Dateien, sonst würden z. B. `liste.json`-Schlüssel aus
   * `widerspruch-zeichen.tsx` (Namespace `liste`) fälschlich gegen `profil.json` geprüft. */
  function literaleProfilSchluessel(): ReadonlySet<string> {
    const schluessel = new Set<string>()
    for (const datei of quellDateien(RENDERER_WURZEL)) {
      const inhalt = readFileSync(datei, 'utf8')
      if (!NUTZT_PROFIL_NAMESPACE.test(inhalt)) continue
      for (const treffer of inhalt.matchAll(LITERALER_T_AUFRUF)) {
        const gefundenerSchluessel = treffer[1]
        if (gefundenerSchluessel !== undefined) schluessel.add(gefundenerSchluessel)
      }
    }
    return schluessel
  }

  /** Alle Schlüssel, die die geschlossenen Schalter-Funktionen aus `profil-schluessel.ts` über
   * IHRE VOLLE Eingabemenge (jeden Enum-Wert) tatsächlich erzeugen können. */
  function dynamischeProfilSchluessel(): ReadonlySet<string> {
    const schluessel = new Set<string>()
    for (const typ of EreignisTypEnum.options) schluessel.add(ereignisTypSchluessel(typ))
    for (const rolle of BeteiligungRolleEnum.options) schluessel.add(beteiligungRolleSchluessel(rolle))
    for (const typ of ElternschaftTypEnum.options) schluessel.add(kantentypSchluessel(typ))
    for (const typ of PartnerschaftTypEnum.options) schluessel.add(kantentypSchluessel(typ))
    for (const richtung of PersonDetailBeziehungRichtungEnum.options) schluessel.add(richtungSchluessel(richtung))
    for (const art of PersonDetailGesundheitArtEnum.options) schluessel.add(gesundheitArtSchluessel(art))
    for (const typ of QuelleTypEnum.options) schluessel.add(quelleTypSchluessel(typ))
    for (const unmittelbarkeit of UnmittelbarkeitEnum.options) schluessel.add(unmittelbarkeitSchluessel(unmittelbarkeit))
    for (const wert of Object.values(PRAEDIKAT_SCHLUESSEL)) schluessel.add(wert)
    // AP-1.14a: Kernfelder-Schreibmaske.
    for (const typ of NameTypEnum.options) schluessel.add(nameTypSchluessel(typ))
    for (const schrift of SchriftEnum.options) schluessel.add(schriftSchluessel(schrift))
    for (const geschlecht of GeschlechtEnum.options) schluessel.add(geschlechtSchluessel(geschlecht))
    for (const grund of PlatzhalterGrundEnum.options) schluessel.add(platzhalterGrundSchluessel(grund))
    return schluessel
  }

  it('jeder literal in t(...) verwendete Schlüssel existiert in profil.json', () => {
    const gefundene = literaleProfilSchluessel()
    expect(gefundene.size).toBeGreaterThan(0)
    for (const schluessel of gefundene) {
      expect(profilRessourcen, `Schlüssel "${schluessel}" (literal verwendet) fehlt in profil.json`).toHaveProperty(schluessel)
    }
  })

  it('jeder von profil-schluessel.ts über die volle Enum-/Tabellenmenge erzeugte Schlüssel existiert in profil.json', () => {
    const gefundene = dynamischeProfilSchluessel()
    expect(gefundene.size).toBeGreaterThan(0)
    for (const schluessel of gefundene) {
      expect(profilRessourcen, `Schlüssel "${schluessel}" (dynamisch erzeugt) fehlt in profil.json`).toHaveProperty(schluessel)
    }
  })
})

/**
 * AP-1.17 PR-C1: dehnt dasselbe Vollständigkeitsnetz auf den neuen `quellen`-Namespace aus
 * (`quelle-bearbeiten.tsx`, `quellen-schluessel.ts`) — dieselbe Zweiteilung (literal/dynamisch)
 * wie beim `profil`-Namespace oben, bewusst als eigener `describe`-Block mit eigenen, lokal
 * scope­nden Hilfsfunktionen statt einer verschachtelten Abhängigkeit vom Block oben.
 */
describe('i18n-Ressourcen für den quellen-Namespace (AP-1.17 PR-C1)', () => {
  const RENDERER_WURZEL = fileURLToPath(new URL('../../src/renderer', import.meta.url))
  const NUTZT_QUELLEN_NAMESPACE = /useTranslation\(\s*['"]quellen['"]\s*\)/
  const LITERALER_T_AUFRUF = /\bt\(\s*['"]([a-zA-Z0-9_]+)['"]/g

  function quellDateien(wurzel: string): readonly string[] {
    const gefunden: string[] = []
    for (const eintrag of readdirSync(wurzel, { withFileTypes: true })) {
      const pfad = join(wurzel, eintrag.name)
      if (eintrag.isDirectory()) gefunden.push(...quellDateien(pfad))
      else if (eintrag.name.endsWith('.tsx') || eintrag.name.endsWith('.ts')) gefunden.push(pfad)
    }
    return gefunden
  }

  /** Alle LITERAL in `t(...)` verwendeten Schlüssel aus jeder Datei, die `useTranslation('quellen')`
   * aufruft. */
  function literaleQuellenSchluessel(): ReadonlySet<string> {
    const schluessel = new Set<string>()
    for (const datei of quellDateien(RENDERER_WURZEL)) {
      const inhalt = readFileSync(datei, 'utf8')
      if (!NUTZT_QUELLEN_NAMESPACE.test(inhalt)) continue
      for (const treffer of inhalt.matchAll(LITERALER_T_AUFRUF)) {
        const gefundenerSchluessel = treffer[1]
        if (gefundenerSchluessel !== undefined) schluessel.add(gefundenerSchluessel)
      }
    }
    return schluessel
  }

  /** Alle Schlüssel, die die geschlossenen Schalter-Funktionen aus `quellen-schluessel.ts`
   * (inklusive der von dort re-exportierten `quelleTypSchluessel`/`unmittelbarkeitSchluessel`)
   * über IHRE VOLLE Eingabemenge tatsächlich erzeugen können. */
  function dynamischeQuellenSchluessel(): ReadonlySet<string> {
    const schluessel = new Set<string>()
    for (const typ of QuelleTypEnum.options) schluessel.add(quelleTypSchluessel(typ))
    for (const unmittelbarkeit of UnmittelbarkeitEnum.options) schluessel.add(unmittelbarkeitSchluessel(unmittelbarkeit))
    for (const art of QuelleArtEnum.options) schluessel.add(quelleArtSchluessel(art))
    for (const wert of InformationsartEnum.options) schluessel.add(informationsartSchluessel(wert))
    for (const form of QuelleFormEnum.options) schluessel.add(quelleFormSchluessel(form))
    return schluessel
  }

  it('jeder literal in t(...) verwendete Schlüssel existiert in quellen.json', () => {
    const gefundene = literaleQuellenSchluessel()
    expect(gefundene.size).toBeGreaterThan(0)
    for (const schluessel of gefundene) {
      expect(quellenRessourcen, `Schlüssel "${schluessel}" (literal verwendet) fehlt in quellen.json`).toHaveProperty(schluessel)
    }
  })

  it('jeder von quellen-schluessel.ts über die volle Enum-Menge erzeugte Schlüssel existiert in quellen.json', () => {
    const gefundene = dynamischeQuellenSchluessel()
    expect(gefundene.size).toBeGreaterThan(0)
    for (const schluessel of gefundene) {
      expect(quellenRessourcen, `Schlüssel "${schluessel}" (dynamisch erzeugt) fehlt in quellen.json`).toHaveProperty(schluessel)
    }
  })
})

/**
 * AP-1.17 PR-C2: dehnt dasselbe Vollständigkeitsnetz auf den neuen `negativbefund`-Namespace aus
 * (`negativbefund-abschnitt.tsx`) — hier NUR literal geprüft, es gibt (anders als `profil`/
 * `quellen`) keine geschlossene Schalter-Funktion über einen Enum in diesem Namespace.
 */
describe('i18n-Ressourcen für den negativbefund-Namespace (AP-1.17 PR-C2)', () => {
  const RENDERER_WURZEL = fileURLToPath(new URL('../../src/renderer', import.meta.url))
  const NUTZT_NEGATIVBEFUND_NAMESPACE = /useTranslation\(\s*['"]negativbefund['"]\s*\)/
  const LITERALER_T_AUFRUF = /\bt\(\s*['"]([a-zA-Z0-9_]+)['"]/g

  function quellDateien(wurzel: string): readonly string[] {
    const gefunden: string[] = []
    for (const eintrag of readdirSync(wurzel, { withFileTypes: true })) {
      const pfad = join(wurzel, eintrag.name)
      if (eintrag.isDirectory()) gefunden.push(...quellDateien(pfad))
      else if (eintrag.name.endsWith('.tsx') || eintrag.name.endsWith('.ts')) gefunden.push(pfad)
    }
    return gefunden
  }

  /** Alle LITERAL in `t(...)` verwendeten Schlüssel aus jeder Datei, die
   * `useTranslation('negativbefund')` aufruft. */
  function literaleNegativbefundSchluessel(): ReadonlySet<string> {
    const schluessel = new Set<string>()
    for (const datei of quellDateien(RENDERER_WURZEL)) {
      const inhalt = readFileSync(datei, 'utf8')
      if (!NUTZT_NEGATIVBEFUND_NAMESPACE.test(inhalt)) continue
      for (const treffer of inhalt.matchAll(LITERALER_T_AUFRUF)) {
        const gefundenerSchluessel = treffer[1]
        if (gefundenerSchluessel !== undefined) schluessel.add(gefundenerSchluessel)
      }
    }
    return schluessel
  }

  it('jeder literal in t(...) verwendete Schlüssel existiert in negativbefund.json', () => {
    const gefundene = literaleNegativbefundSchluessel()
    expect(gefundene.size).toBeGreaterThan(0)
    for (const schluessel of gefundene) {
      expect(negativbefundRessourcen, `Schlüssel "${schluessel}" (literal verwendet) fehlt in negativbefund.json`).toHaveProperty(schluessel)
    }
  })
})
