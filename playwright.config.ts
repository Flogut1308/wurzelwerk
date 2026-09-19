import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'test/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  retries: 0,
  // AP-1.25: Referenzbilder liegen unter test/golden/bilder/ (geschützter Prüfpfad, ADR-025),
  // nicht im Playwright-Standardpfad neben der Spec-Datei. `{platform}` löst zur Laufzeit auf
  // `process.platform` auf — da `test/e2e/bildvergleich.spec.ts` sich außer auf macOS überall
  // selbst überspringt (ADR-012), entstehen ausschließlich `-darwin`-Dateien.
  snapshotPathTemplate: 'test/golden/bilder/{arg}-{platform}{ext}',
  expect: {
    toHaveScreenshot: {
      // `threshold` (Pixelmatch-Farbempfindlichkeit, 0..1) auf 0: der Playwright-Standardwert
      // (0.2) ist zu tolerant für einen Ein-Tokenschritt-Regress zwischen benachbarten,
      // absichtlich sehr ähnlichen Flächentönen (`--wz-flaeche-grund` #F3F0EA vs.
      // `--wz-flaeche-vertieft` #F0EDE6, Delta nur (3,3,4) je Kanal) — bei 0.2 blieb eine
      // vollflächige Verwechslung dieser beiden Tokens messbar UNENTDECKT (0 gemeldete
      // Differenzpixel trotz falscher Fläche auf der gesamten Seite, geprüft 19.09.2026, Mutationsprobe).
      threshold: 0,
      // `maxDiffPixelRatio`: bei `threshold: 0` bleiben nur die Zustandsbibliothek-Aufnahmen
      // (viel Text, viele Bausteine) nicht bitgleich zwischen zwei Läufen derselben Maschine —
      // gemessen bis zu ~593 von ca. 1.097 Mio. Pixeln (≈0,00054); alle übrigen vier Motive sind
      // bei `threshold: 0` bitgleich. 0.002 ist die kleinste Zehnerschritt-Ratio mit Sicherheitsrand
      // über diesem Messwert — s. docs/80_Offene_Fragen.md §22 für die vollständige Herleitung
      // (inkl. der verworfenen Alternative, stattdessen `threshold` zu lockern).
      maxDiffPixelRatio: 0.002,
    },
  },
})
