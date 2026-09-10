// Fixture für die Regel `not-to-unresolvable` (test/grenzen/verletzungen.test.ts).
// BEWUSST unter src/main/ statt src/core/ (hueter-Auflage A2, AP-0.14): ein unauflösbarer
// relativer Import löst bei jedem "from"-Anker, dessen "to"-Restriktion mit einem einfachen
// pathNot arbeitet (z. B. core-darf-nichts: to.pathNot '^src/core'), ZUSÄTZLICH diese Regel mit
// aus — der unaufgelöste Pfad "./gibt-es-nicht" beginnt schlicht nicht mit "src/core". src/main
// hat keine "to"-Restriktion, die auf einen generischen unaufgelösten Pfad anspringt
// (main-darf-nicht-renderer-oder-preload prüft nur auf ^src/(renderer|preload)), deshalb
// triggert diese Fixture hier ausschließlich not-to-unresolvable (empirisch geprüft).
import { irgendwas } from './gibt-es-nicht'

export const wert = irgendwas
