import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type Locator } from '@playwright/test'
import { z } from 'zod'

/**
 * A-07, C-26, AP-1.30 PR 13d (docs/80 §33 V-130-13-*), langsames Gate: der Reiter „Leben" über die echte App.
 * Szenario: Emil Eckert mit Geburt 1900 (Aussage), Beruf „Schmied" 1920–1958 (Datumsgruppe), Militärdienst
 * „zwischen 1941 und 1945", Umzug 1945 mit Ort, Tod 1980 (Ereignis, Verstorbener) und Konfession ohne Datum.
 *
 * - Reihenfolge der Stationen, Lage der Zeitspur (gegen unabhängig gerechnete Anteile, keine Pixel),
 *   „ohne Zeitangabe" am Ende, Reiterzähler = Zahl der Stationszeilen.
 * - Ereignis anlegen: Station in höchstens einer Sekunde sichtbar, ⌘Z nimmt genau diesen einen Schritt zurück.
 * - Zehn Anschläge im Datumsfeld des Neu-Formulars schreiben nichts (der Reiter hat keine Autosave-Felder;
 *   Ersatz für die „zehn Anschläge = ein Undo-Schritt"-Prüfung der anderen Reiter, docs/80 §33 V-130-13-zaehler).
 * - Beteiligung entfernen: Station weg, ⌘Z stellt sie her.
 *
 * Menü-Undo über den Menüpunkt im Hauptprozess, per `setImmediate` als eigene Aufgabe (Muster `menuepunktKlicken`
 * in ablauf-13/18/19, docs/80 §33 V-130-ci-ablauf13). Zusicherungen an DOM-State und `abfrage:*`-Ergebnisse
 * (kein Log-Datei-Lesen, keine festen Pausen).
 */
const HAUPTPROZESS_EINSTIEG = join(__dirname, '../../out/main/index.js')

/** Julianische Tageszahl eines gregorianischen Datums — hier unabhängig vom Produktcode gerechnet. */
function jdn(jahr: number, monat: number, tag: number): number {
  const a = Math.floor((14 - monat) / 12)
  const y = jahr + 4800 - a
  const m = monat + 12 * a - 3
  return tag + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045
}

const ACHSE_VON = jdn(1900, 1, 1)
const ACHSE_BIS = jdn(1980, 12, 31)
const anteil = (tageszahl: number): number => (tageszahl - ACHSE_VON) / (ACHSE_BIS - ACHSE_VON)

test.describe('Ablauf 20 — Reiter Leben: Stationen, Zeitspur, Zähler, Anlegen und Entfernen', () => {
  const einstiegFehlt = !existsSync(HAUPTPROZESS_EINSTIEG)
  if (einstiegFehlt && process.env['CI'] !== undefined) {
    throw new Error(
      'out/main/index.js fehlt im CI-Lauf — das E2E-Gate würde stillschweigend überspringen. ' +
        '`test:e2e` muss zuvor bauen (electron-vite build).',
    )
  }
  test.skip(einstiegFehlt, 'out/main/index.js fehlt — lokal `pnpm test:e2e` (baut selbst) oder vorher `pnpm build`.')
  test.describe.configure({ mode: 'serial' })

  let app: Awaited<ReturnType<typeof electron.launch>>
  let fenster: Awaited<ReturnType<typeof app.firstWindow>>
  let elternordner: string
  let editor: Locator
  let personId = ''

  test.beforeAll(async () => {
    elternordner = mkdtempSync(join(tmpdir(), 'wurzelwerk-e2e-reiter-leben-'))
    app = await electron.launch({ args: [HAUPTPROZESS_EINSTIEG] })
    fenster = await app.firstWindow()
  })

  test.afterAll(async () => {
    await app.close()
    rmSync(elternordner, { recursive: true, force: true })
  })

  async function aufrufen(kanal: string, nutzlast: unknown): Promise<unknown> {
    const ergebnis = await fenster.evaluate(async ({ k, n }) => window.wurzelwerk.aufrufen(k, n), { k: kanal, n: nutzlast })
    if (!ergebnis.ok) throw new Error(`${kanal} fehlgeschlagen`)
    return ergebnis.daten
  }

  async function anlegen(kanal: string, nutzlast: unknown): Promise<string> {
    return z.object({ id: z.string() }).parse(await aufrufen(kanal, nutzlast)).id
  }

  /** Zahl der angewendeten Schritte im Verlauf = Tiefe des Undo-Stapels (zurückgenommene Schritte zählen nicht). */
  async function verlaufAnzahl(): Promise<number> {
    const eintraege = z.array(z.object({ status: z.string() })).parse(await aufrufen('abfrage:journal.verlauf', { grenze: 500 }))
    return eintraege.filter((eintrag) => eintrag.status === 'angewendet').length
  }

  /** Klickt einen Menüpunkt im Hauptprozess als eigene Aufgabe der Ereignisschleife (ablauf-13). */
  async function menuepunktKlicken(kuerzel: string): Promise<void> {
    await app.evaluate(({ Menu }, gesucht) => {
      const menue = Menu.getApplicationMenu()
      if (menue === null) throw new Error('kein Anwendungsmenü')
      const eintrag = menue.items.flatMap((oben) => oben.submenu?.items ?? []).find((unten) => unten.accelerator === gesucht)
      if (eintrag === undefined) throw new Error(`Menüpunkt ${gesucht} fehlt`)
      if (!eintrag.enabled) throw new Error(`Menüpunkt ${gesucht} ist deaktiviert`)
      return new Promise<void>((fertig, fehlgeschlagen) => {
        setImmediate(() => {
          try {
            eintrag.click()
            fertig()
          } catch (fehler: unknown) {
            fehlgeschlagen(fehler)
          }
        })
      })
    }, kuerzel)
  }

  const reiter = (): Locator => editor.getByRole('tab', { name: /^Leben/ })
  const stationen = (): Locator => editor.locator('.wz-reiter-leben__station')
  const station = (art: RegExp): Locator => stationen().filter({ hasText: art })
  const neuFelder = (): Locator => editor.locator('.wz-profil-bearbeiten-ereignisse__felder')

  /** Lage der Spur einer Station als Anteile 0..1, aus den Prozentwerten im Style (keine Pixel). */
  async function spurAnteile(zeile: Locator): Promise<{ readonly anfang: number; readonly ende: number }> {
    const stil = (await zeile.locator('.wz-reiter-leben__balken').getAttribute('style')) ?? ''
    const links = /left:\s*min\(\s*([-\d.e]+)%/.exec(stil)
    const breite = /width:\s*([-\d.e]+)%/.exec(stil)
    if (links?.[1] === undefined || breite?.[1] === undefined) throw new Error(`Spur ohne Prozentwerte: ${stil}`)
    const anfang = Number(links[1]) / 100
    return { anfang, ende: anfang + Number(breite[1]) / 100 }
  }

  test('Szenario anlegen, Reiter öffnen: Reihenfolge, Zeitspur, „ohne Zeitangabe" und Zähler', async () => {
    test.setTimeout(90_000)
    await app.evaluate(({ dialog }, gewaehlt) => {
      dialog.showOpenDialog = (() => Promise.resolve({ canceled: false, filePaths: [gewaehlt] })) as typeof dialog.showOpenDialog
    }, elternordner)
    await fenster.getByPlaceholder('Projektname').fill('Reiter-Leben-Test')
    await fenster.getByRole('button', { name: 'Neues Projekt anlegen' }).click()
    await expect(fenster.getByRole('table')).toBeVisible()

    personId = await anlegen('befehl:person.anlegen', { privat: 0, ist_platzhalter: 0, geschlecht: 'M', lebend_status: 'verstorben' })
    await aufrufen('befehl:name.anlegen', { personId, typ: 'geburtsname', vornamen: 'Emil', nachname: 'Eckert' })
    const jahr = (wert1: string) => ({ kalender: 'gregorian', modifikator: 'exakt', praezision: 'jahr', wert1 })
    await aufrufen('befehl:aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat: 'geburtsdatum', datum: jahr('1900'), konfidenz: 3 })
    await aufrufen('befehl:aussage.anlegen', {
      subjektTyp: 'person',
      subjektId: personId,
      praedikat: 'beruf',
      wertText: 'Schmied',
      datum: { kalender: 'gregorian', modifikator: 'von_bis', praezision: 'jahr', wert1: '1920', wert2: '1958', original_text: '1920–1958' },
      konfidenz: 3,
    })
    await aufrufen('befehl:aussage.anlegen', { subjektTyp: 'person', subjektId: personId, praedikat: 'konfession', wertText: 'evangelisch', konfidenz: 3 })
    const ortId = await anlegen('befehl:ort.anlegen', { name: 'Stolp' })
    await aufrufen('befehl:ereignis.anlegen', {
      typ: 'militaerdienst',
      datum: { kalender: 'gregorian', modifikator: 'zwischen', praezision: 'jahr', wert1: '1941', wert2: '1945', original_text: 'zwischen 1941 und 1945' },
      beteiligungen: [{ personId, rolle: 'hauptperson' }],
      konfidenz: 3,
    })
    await aufrufen('befehl:ereignis.anlegen', { typ: 'umzug', ortId, datum: jahr('1945'), beteiligungen: [{ personId, rolle: 'hauptperson' }], konfidenz: 3 })
    await aufrufen('befehl:ereignis.anlegen', { typ: 'tod', datum: jahr('1980'), beteiligungen: [{ personId, rolle: 'verstorbener' }], konfidenz: 3 })

    await fenster.locator('[role="row"]:has-text("Emil Eckert")').click()
    await fenster.getByRole('dialog', { name: 'Profil', exact: true }).getByRole('button', { name: 'Bearbeiten', exact: true }).click()
    editor = fenster.getByRole('dialog', { name: 'Person bearbeiten', exact: true })
    await reiter().click()
    await expect(reiter()).toHaveAttribute('aria-selected', 'true')
    await expect(editor.getByRole('heading', { name: 'Lebensstationen', exact: true, level: 2 })).toBeVisible()

    // Reihenfolge nach Zeit, Undatiertes zuletzt; Geburt ist keine Station (Lebensdatum).
    await expect(stationen()).toHaveCount(5)
    await expect(stationen().nth(0)).toContainText('Schmied')
    await expect(stationen().nth(1)).toContainText('Militärdienst')
    await expect(stationen().nth(2)).toContainText('Umzug')
    await expect(stationen().nth(2)).toContainText('Stolp')
    await expect(stationen().nth(3)).toContainText('Verstorbener')
    await expect(stationen().nth(4)).toContainText('Konfession')
    await expect(station(/Geburt/)).toHaveCount(0)

    // Zeitspur: Achse Geburt 1900 bis Tod 1980; Anteile aus eigener Tageszahlrechnung.
    await expect(editor.locator('.wz-reiter-leben__achse')).toContainText('1900 – 1980')
    const schmied = await spurAnteile(stationen().nth(0))
    expect(schmied.anfang).toBeCloseTo(anteil(jdn(1920, 1, 1)), 3)
    expect(schmied.ende).toBeCloseTo(anteil(jdn(1958, 12, 31)), 3)
    const militaer = await spurAnteile(stationen().nth(1))
    expect(militaer.anfang).toBeCloseTo(anteil(jdn(1941, 1, 1)), 3)
    expect(militaer.ende).toBeCloseTo(anteil(jdn(1945, 12, 31)), 3)
    await expect(stationen().nth(1)).toContainText('ungefähr')
    const umzug = await spurAnteile(stationen().nth(2))
    expect(umzug.anfang).toBeCloseTo(anteil(jdn(1945, 1, 1)), 3)
    expect(umzug.ende).toBeCloseTo(anteil(jdn(1945, 12, 31)), 3)
    const tod = await spurAnteile(stationen().nth(3))
    expect(tod.anfang).toBeCloseTo(anteil(jdn(1980, 1, 1)), 3)
    expect(tod.ende).toBeCloseTo(1, 3)

    // „ohne Zeitangabe": Text statt Spur, am Ende.
    await expect(stationen().nth(4)).toContainText('ohne Zeitangabe')
    await expect(stationen().nth(4).locator('.wz-reiter-leben__balken')).toHaveCount(0)

    // Reiterzähler = Zahl der Zeilen.
    await expect(reiter().locator('.wz-zaehler')).toHaveText('5')
  })

  test('Ereignis anlegen: Station in höchstens einer Sekunde sichtbar, ⌘Z nimmt genau diesen Schritt zurück', async () => {
    const vorher = await verlaufAnzahl()
    await neuFelder().locator('select').first().selectOption('konfirmation')
    await neuFelder().locator('.wz-datumsfeld input').fill('1914')
    await editor.getByRole('radio', { name: 'Konfidenz: gesichert', exact: true }).click()
    const absenden = editor.getByRole('button', { name: 'Ereignis anlegen', exact: true })
    await expect(absenden).toBeEnabled()
    await absenden.click()

    await expect(station(/Konfirmation/)).toBeVisible({ timeout: 1000 })
    await expect(stationen()).toHaveCount(6)
    // Sortiert nach Zeit: 1914 liegt vor dem Beruf (1920).
    await expect(stationen().nth(0)).toContainText('Konfirmation')
    await expect(station(/Konfirmation/).locator('.wz-reiter-leben__balken')).toHaveCount(1)
    await expect(reiter().locator('.wz-zaehler')).toHaveText('6')
    expect(await verlaufAnzahl()).toBe(vorher + 1)

    await menuepunktKlicken('CmdOrCtrl+Z')
    await expect(station(/Konfirmation/)).toHaveCount(0)
    await expect(stationen()).toHaveCount(5)
    await expect(reiter().locator('.wz-zaehler')).toHaveText('5')
    expect(await verlaufAnzahl()).toBe(vorher)
  })

  test('zehn Anschläge im Datumsfeld des Neu-Formulars schreiben nichts', async () => {
    const vorher = await verlaufAnzahl()
    const feld = neuFelder().locator('.wz-datumsfeld input')
    await feld.fill('')
    await feld.focus()
    const beginn = Date.now()
    await feld.pressSequentially('1850123456', { delay: 40 })
    expect(Date.now() - beginn).toBeLessThan(2000)
    await expect(feld).toHaveValue('1850123456')

    // Nichts geschrieben: Verlauf, Stationen und Zähler unverändert; „Ereignis anlegen" bleibt ohne Konfidenz gesperrt.
    expect(await verlaufAnzahl()).toBe(vorher)
    await expect(stationen()).toHaveCount(5)
    await expect(reiter().locator('.wz-zaehler')).toHaveText('5')
    await expect(editor.getByRole('button', { name: 'Ereignis anlegen', exact: true })).toBeDisabled()
    await feld.fill('')
  })

  test('Beteiligung entfernen: die Station verschwindet, ⌘Z stellt sie her', async () => {
    const vorher = await verlaufAnzahl()
    await station(/Umzug/).getByRole('button', { name: /^Beteiligung entfernen: Umzug/ }).click()
    await expect(station(/Umzug/)).toHaveCount(0)
    await expect(stationen()).toHaveCount(4)
    await expect(reiter().locator('.wz-zaehler')).toHaveText('4')
    expect(await verlaufAnzahl()).toBe(vorher + 1)

    await menuepunktKlicken('CmdOrCtrl+Z')
    await expect(station(/Umzug/)).toHaveCount(1)
    await expect(stationen()).toHaveCount(5)
    await expect(stationen().nth(2)).toContainText('Umzug')
    await expect(reiter().locator('.wz-zaehler')).toHaveText('5')
    expect(await verlaufAnzahl()).toBe(vorher)
  })
})
