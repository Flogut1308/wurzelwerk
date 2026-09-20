// AP-1.4b PR-A: Zod-Eingabeschemata der beiden Import-Dialog-Kanäle. Die Schemata sind hier (in
// `src/shared`), damit `src/main/ipc/registrierung.ts` sie registrieren kann, ohne dass eine
// Electron-abhängige Datei importiert wird — und damit `test/einheit/dialoge.test.ts` (AP-1.26,
// vormals `import-dialog-kanaele.test.ts`) sie Electron-frei gegenprüft.
//
// `berichtSpeichern` bekommt den vollständigen `Trockenlaufbericht`, den der Renderer bereits hält
// (Entscheidung Nutzer, 18.09.2026): schlank, ein Codeweg, kein zweiter Trockenlauf. Das Schema
// spiegelt `src/shared/import/trockenlauf-bericht.ts` — eine strukturelle Abweichung ist über
// `z.ZodType<Ein<...>>` ein Typfehler.
import { z } from 'zod'
import { ALLE_IMP_CODES } from '../import/imp-codes'
import type { Ein } from '../ipc/vertrag'

const befundSchema = z.object({
  schweregrad: z.union([z.literal('fehler'), z.literal('hinweis')]),
  code: z.enum(ALLE_IMP_CODES),
  pfad: z.string(),
  kennung: z.string().optional(),
  datei: z.string(),
  zeile: z.number().optional(),
})

const trockenlaufberichtSchema = z.object({
  zusammenfassung: z.object({
    datei: z.string(),
    vertragErzeugtAm: z.string().nullable(),
    vertragWerkzeug: z.string().nullable(),
    pruefsummeQuelltext: z.string().nullable(),
    bereitsImportiertAm: z.string().nullable(),
    fehlerAnzahl: z.number(),
    hinweisAnzahl: z.number(),
    geaenderteZeilenAnzahl: z.number(),
    ruecknahmeArt: z.union([z.literal('undo'), z.literal('schnappschuss')]),
  }),
  wirdAngelegt: z.array(z.object({ tabelle: z.string(), anzahl: z.number() })),
  wirdErgaenzt: z.array(
    z.object({
      subjektKennung: z.string(),
      praedikat: z.string(),
      wertText: z.string().nullable(),
      wertZahl: z.number().nullable(),
      istKonflikt: z.boolean(),
    }),
  ),
  moeglicheDubletten: z.array(
    z.object({
      neueKennung: z.string(),
      bestehendeKennung: z.string(),
      punktwert: z.number(),
      begruendung: z.string(),
    }),
  ),
  fehler: z.array(befundSchema),
  hinweise: z.array(befundSchema),
  nichtVerarbeitetesMaterial: z.array(z.object({ text: z.string(), warum: z.string() })),
  gesundheitsdaten: z.object({ diagnosenAnzahl: z.number(), risikofaktorenAnzahl: z.number() }),
  importGesperrt: z.boolean(),
})

/** Die tiefe Objektstruktur der Eingabe (nur intern) — s. `importBerichtSpeichernEinSchema`. */
const berichtSpeichernRoh = z.object({ bericht: trockenlaufberichtSchema })

/** `befehl:import.dateiWaehlen` nimmt keine Eingabe — der Dialog wählt selbst. */
export const importDateiWaehlenEinSchema: z.ZodType<Ein<'befehl:import.dateiWaehlen'>> = z.null()

/**
 * `befehl:import.berichtSpeichern` nimmt den vollständigen Bericht (s. Kopfkommentar). Über
 * `z.custom` statt direkt `berichtSpeichernRoh`, weil dessen Zod-`.optional()`-Ausgabe die
 * optionalen `Befund`-Felder (`kennung?`, `zeile?`) als `string | undefined` tippt, was unter
 * `exactOptionalPropertyTypes` nicht zu `Befund` (`kennung?: string`) passt. `z.custom<Ein<...>>`
 * bindet den exakten Zieltyp und führt die TIEFE Prüfung als Prädikat aus — die Validierung bleibt
 * also real, nur die Typreibung entfällt (ohne `as`).
 */
export const importBerichtSpeichernEinSchema: z.ZodType<Ein<'befehl:import.berichtSpeichern'>> = z.custom<Ein<'befehl:import.berichtSpeichern'>>(
  (wert) => berichtSpeichernRoh.safeParse(wert).success,
)
