// AP-1.7 PR-B: i18n-Schlüsselzuordnungen für die Profilseite, in einer eigenen `.ts`-Datei statt
// JSX-Inline-Schaltern (analog `spaltenSchluessel`/`konfidenzSchluessel` — ein `switch` mit
// vollständiger Abdeckung, damit ein künftiger Enum-Wert hier einen Typfehler erzeugt, keinen
// stillen Fall). Reines TypeScript, kein JSX, kein DOM — leicht ohne Renderer testbar.
import type { z } from 'zod'
import type { BeteiligungRolleEnum } from '../../../shared/schemata/beteiligung'
import type { ElternschaftTypEnum } from '../../../shared/schemata/elternschaft'
import type { EreignisTypEnum } from '../../../shared/schemata/ereignis'
import type { PartnerschaftTypEnum } from '../../../shared/schemata/partnerschaft'
import type { PersonDetailBeziehungRichtungEnum, PersonDetailGesundheitArtEnum } from '../../../shared/schemata/person-detail'

export function ereignisTypSchluessel(typ: z.infer<typeof EreignisTypEnum>): string {
  switch (typ) {
    case 'geburt':
      return 'ereignis_geburt'
    case 'taufe':
      return 'ereignis_taufe'
    case 'konfirmation':
      return 'ereignis_konfirmation'
    case 'trauung':
      return 'ereignis_trauung'
    case 'kirchl_trauung':
      return 'ereignis_kirchl_trauung'
    case 'verlobung':
      return 'ereignis_verlobung'
    case 'scheidung':
      return 'ereignis_scheidung'
    case 'tod':
      return 'ereignis_tod'
    case 'beerdigung':
      return 'ereignis_beerdigung'
    case 'auswanderung':
      return 'ereignis_auswanderung'
    case 'einwanderung':
      return 'ereignis_einwanderung'
    case 'umzug':
      return 'ereignis_umzug'
    case 'beruf':
      return 'ereignis_beruf'
    case 'militaerdienst':
      return 'ereignis_militaerdienst'
    case 'volkszaehlung':
      return 'ereignis_volkszaehlung'
    case 'testament':
      return 'ereignis_testament'
    case 'sonstiges':
      return 'ereignis_sonstiges'
  }
}

export function beteiligungRolleSchluessel(rolle: z.infer<typeof BeteiligungRolleEnum>): string {
  switch (rolle) {
    case 'hauptperson':
      return 'rolle_hauptperson'
    case 'kind':
      return 'rolle_kind'
    case 'vater':
      return 'rolle_vater'
    case 'mutter':
      return 'rolle_mutter'
    case 'braeutigam':
      return 'rolle_braeutigam'
    case 'braut':
      return 'rolle_braut'
    case 'pate':
      return 'rolle_pate'
    case 'patenvertreter':
      return 'rolle_patenvertreter'
    case 'trauzeuge':
      return 'rolle_trauzeuge'
    case 'verstorbener':
      return 'rolle_verstorbener'
    case 'ehepartner':
      return 'rolle_ehepartner'
    case 'informant':
      return 'rolle_informant'
    case 'pfarrer':
      return 'rolle_pfarrer'
    case 'hebamme':
      return 'rolle_hebamme'
    case 'dienstherr':
      return 'rolle_dienstherr'
  }
}

/** Elternschafts- UND Partnerschaftstyp in EINEM Schalter (statt einer künstlichen Typ-Aufspaltung
 * über `richtung`, die einen `as`-Cast bräuchte, CLAUDE.md §4) — `unbekannt` existiert in beiden
 * Enums und bekommt hier einen einzigen, gemeinsamen Schlüssel. */
export function kantentypSchluessel(typ: z.infer<typeof ElternschaftTypEnum> | z.infer<typeof PartnerschaftTypEnum>): string {
  switch (typ) {
    case 'biologisch':
      return 'elternschaft_biologisch'
    case 'adoptiv':
      return 'elternschaft_adoptiv'
    case 'stief':
      return 'elternschaft_stief'
    case 'pflege':
      return 'elternschaft_pflege'
    case 'zieh':
      return 'elternschaft_zieh'
    case 'anerkannt':
      return 'elternschaft_anerkannt'
    case 'leihmutter':
      return 'elternschaft_leihmutter'
    case 'ehe_zivil':
      return 'partnerschaft_ehe_zivil'
    case 'ehe_kirchlich':
      return 'partnerschaft_ehe_kirchlich'
    case 'verlobung':
      return 'partnerschaft_verlobung'
    case 'lebensgemeinschaft':
      return 'partnerschaft_lebensgemeinschaft'
    case 'eingetr_lebenspartnerschaft':
      return 'partnerschaft_eingetr_lebenspartnerschaft'
    case 'unbekannt':
      return 'kantentyp_unbekannt'
  }
}

export function richtungSchluessel(richtung: z.infer<typeof PersonDetailBeziehungRichtungEnum>): string {
  switch (richtung) {
    case 'elternteil':
      return 'beziehung_elternteil'
    case 'kind':
      return 'beziehung_kind'
    case 'partner':
      return 'beziehung_partner'
  }
}

export function gesundheitArtSchluessel(art: z.infer<typeof PersonDetailGesundheitArtEnum>): string {
  switch (art) {
    case 'diagnose':
      return 'gesundheit_diagnose'
    case 'risikofaktor':
      return 'gesundheit_risikofaktor'
  }
}

/** `aussage.praedikat` ist per E-6 eine FREIE Zeichenkette mit offener Menge (`docs/datenmodell.md`
 * §2.7/§2.16, `56_Import_Vertrag.md` §3.1) — kein geschlossener Enum, darum keine erschöpfende
 * Schalter-Funktion wie oben, sondern eine Nachschlagetabelle mit den in `56_Import_Vertrag.md`
 * §3.1 genannten „bekannten" Prädikaten. `'existenz'` (ADR-026) bewusst NICHT hier: die
 * Existenz-Aussage ist eine importinterne Modellierung des Belegapparats selbst, kein Feld, das
 * ein Mensch als Fakt lesen will — `profil-ansicht.tsx` filtert sie vor der Anzeige heraus.
 *
 * Benannt exportiert (hueter-Auflage 2, PR #66): `test/einheit/i18n-vollstaendig.test.ts` iteriert
 * über `Object.values(...)`, um jeden hier vergebenen Schlüssel gegen `profil.json` zu prüfen,
 * ohne die Tabelle in der Testdatei zu verdoppeln. */
export const PRAEDIKAT_SCHLUESSEL: Readonly<Record<string, string>> = {
  geburtsdatum: 'praedikat_geburtsdatum',
  geburtsort: 'praedikat_geburtsort',
  todesdatum: 'praedikat_todesdatum',
  todesursache: 'praedikat_todesursache',
  alter_bei_tod: 'praedikat_alter_bei_tod',
  beruf: 'praedikat_beruf',
  konfession: 'praedikat_konfession',
  wohnort: 'praedikat_wohnort',
  hofname: 'praedikat_hofname',
  ausbildung: 'praedikat_ausbildung',
  militaerdienst: 'praedikat_militaerdienst',
  auswanderung: 'praedikat_auswanderung',
  vermoegen: 'praedikat_vermoegen',
  mitgliedschaft: 'praedikat_mitgliedschaft',
}

/** `undefined` für ein unbekanntes/benutzerdefiniertes Prädikat — der Aufrufer zeigt dann das
 * rohe `praedikat` selbst an (technische Bezeichnung, `--wz-familie-technisch`), statt einen
 * erfundenen deutschen Text vorzutäuschen. */
export function praedikatSchluessel(praedikat: string): string | undefined {
  return PRAEDIKAT_SCHLUESSEL[praedikat]
}
