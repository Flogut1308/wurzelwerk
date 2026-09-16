// Ambiente Zusage für CSS-Nebeneffekt-Importe (tokens.css, basis.css, schriften.css).
// Der Renderer bindet die Gestaltung über `import './gestaltung/tokens.css'` ein; Vite bündelt die
// Datei, tsc braucht nur die Modulzusage. Kein Standardexport (CLAUDE.md §4): das leere Modul
// erlaubt ausschließlich den Nebeneffekt-Import.
declare module '*.css'
