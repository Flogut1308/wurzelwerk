/**
 * Zentrale Tastenkürzel-Tabelle (§11, ADR-012). `CmdOrCtrl` ist Electrons eigene Abstraktion für
 * Cmd (macOS) / Ctrl (Windows, Linux) — sie wird nur hier verwendet, nirgends sonst im Code steht
 * eine Plattformabfrage für Tastenkürzel.
 */
export const TASTENKUERZEL = {
  beenden: 'CmdOrCtrl+Q',
  rueckgaengig: 'CmdOrCtrl+Z',
  wiederholen: 'Shift+CmdOrCtrl+Z',
  schliessen: 'CmdOrCtrl+W',
} as const
