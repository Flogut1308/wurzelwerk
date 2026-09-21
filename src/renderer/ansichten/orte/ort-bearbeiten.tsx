// AP-1.16 PR-C (S-20-Muster, docs/71_Designsystem.md §3.2): die Orte-Pflege-Ansicht. Zustandsbasiert
// wie `profil-bearbeiten-ereignisse.tsx`/`profil-bearbeiten-namen.tsx` — Liste bestehender Namen /
// Zugehörigkeiten (politisch UND kirchlich, getrennt) / externer Kennungen, je mit Inline-
// Bearbeiten/Entfernen, plus drei feste „hinzufügen"-Formulare. KEIN Speichern-Knopf — jede
// Eingabe committet sofort über den passenden Befehl (Textfelder debounced über
// `useEntwurfMitVerzoegertemCommit`, Auswahlfelder/Löschen sofort). KEIN zweiter Schreibweg: JEDE
// Änderung läuft über genau EINEN der acht `befehl:ort*`-Kanäle aus `befehl-hooks.ts`.
//
// Einstiegspunkt (docs/80_Offene_Fragen.md): ein „Ort bearbeiten"-Link neben dem `Ortsfeld`, sobald
// ein Ort ausgewählt ist (`profil-bearbeiten-ereignisse.tsx`) — NICHT der globale Header-„Orte"-
// Eintrag (S-35, Phase 2/3).
import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Aus } from '../../../shared/ipc/vertrag'
import type { OrtDetailExterneId, OrtDetailName, OrtDetailZugehoerigkeit } from '../../../shared/schemata/ort-detail'
import { Auswahlfeld, type AuswahlfeldOption } from '../../bausteine/auswahlfeld'
import { Formularfeld } from '../../bausteine/formularfeld'
import { Ortsfeld, type OrtsfeldZustand } from '../../bausteine/ortsfeld'
import { ortsfeldNeuAnlegenEin } from '../../bausteine/ortsfeld-logik'
import { Schaltflaeche } from '../../bausteine/schaltflaeche'
import { Seitenschublade } from '../../bausteine/seitenschublade'
import { Text } from '../../bausteine/text'
import { Textfeld } from '../../bausteine/textfeld'
import { useOrtDetail, useOrtSuche } from '../../brücke/abfrage-hooks'
import {
  useOrtAnlegen,
  useOrtExterneIdAnlegen,
  useOrtExterneIdLoeschen,
  useOrtsnameAendern,
  useOrtsnameAnlegen,
  useOrtsnameLoeschen,
  useOrtszugehoerigkeitAendern,
  useOrtszugehoerigkeitAnlegen,
  useOrtszugehoerigkeitLoeschen,
} from '../../brücke/befehl-hooks'
import { useEntwurfMitVerzoegertemCommit } from '../profil/profil-bearbeiten-debounce'
import {
  EXTERNE_ID_ENTWURF_LEER,
  ORTSNAME_ENTWURF_LEER,
  auswahlWertZuBool,
  boolZuAuswahlWert,
  externeIdAnlegenEinAusEntwurf,
  externeIdEntwurfAbsendbar,
  jdnZuIsoText,
  ortsnameAendernEinAusEntwurf,
  ortsnameAnlegenEinAusEntwurf,
  ortsnameEntwurfAbsendbar,
  ortsnameEntwurfAusZeile,
  ortszugehoerigkeitAendernEinAusText,
  ortszugehoerigkeitAnlegenEinAusEntwurf,
  ortszugehoerigkeitEntwurfAbsendbar,
  ortszugehoerigkeitEntwurfLeer,
  type ExterneIdEntwurfWerte,
  type ExterneIdSystemWert,
  type JaNeinAuswahlWert,
  type OrtsnameEntwurfWerte,
  type OrtszugehoerigkeitArtWert,
  type OrtszugehoerigkeitEntwurfWerte,
} from './ort-bearbeiten-logik'
import './ort-bearbeiten.css'

export interface OrtBearbeitenAnsichtProps {
  readonly ortId: string
  readonly aufSchliessen: () => void
}

/** Die Schublade selbst — lädt `abfrage:ort.detail` und delegiert an `OrteBearbeitenInhalt`
 * (getrennt, damit der Inhalt ohne Netzwerk/Query-Zustand testbar bleibt, Muster
 * `ProfilBearbeitenInhalt`/`profil-ansicht.tsx`). */
export function OrtBearbeitenAnsicht({ ortId, aufSchliessen }: OrtBearbeitenAnsichtProps) {
  const { t } = useTranslation('orte')
  const abfrage = useOrtDetail({ ortId })

  return (
    <Seitenschublade titel={t('bearbeiten_titel')} aufSchliessen={aufSchliessen}>
      {abfrage.isPending ? (
        <Text rolle="hilfe" als="p">
          {t('laedt')}
        </Text>
      ) : null}
      {abfrage.isError ? (
        <Text rolle="hilfe" als="p">
          {t('fehler')}
        </Text>
      ) : null}
      {abfrage.isSuccess ? <OrteBearbeitenInhalt ortId={ortId} daten={abfrage.data} /> : null}
    </Seitenschublade>
  )
}

export interface OrteBearbeitenInhaltProps {
  readonly ortId: string
  readonly daten: Aus<'abfrage:ort.detail'>
}

/** Der eigentliche Pflege-Inhalt — drei Abschnitte (Namen / Zugehörigkeit / externe Kennungen),
 * jeder mit Liste + „hinzufügen"-Formular. Reine Props, kein `useOrtDetail` hier. */
export function OrteBearbeitenInhalt({ ortId, daten }: OrteBearbeitenInhaltProps) {
  return (
    <>
      <NamenAbschnitt ortId={ortId} namen={daten.namen} />
      <ZugehoerigkeitenAbschnitt ortId={ortId} zugehoerigkeiten={daten.zugehoerigkeiten} />
      <ExterneIdsAbschnitt ortId={ortId} externeIds={daten.externeIds} />
    </>
  )
}

/** ja/nein-Auswahlfeld-Optionen für `istBevorzugt` (§14-Vermerk `ort-bearbeiten-logik.ts`: es
 * gibt noch keinen `Checkbox`-Baustein, ein `Auswahlfeld` mit zwei festen Werten bleibt innerhalb
 * der vorhandenen Design-Sprache). */
function jaNeinOptionen(t: (schluessel: string) => string): readonly AuswahlfeldOption<JaNeinAuswahlWert>[] {
  return [
    { wert: 'nein', beschriftung: t('ja_nein_nein') },
    { wert: 'ja', beschriftung: t('ja_nein_ja') },
  ]
}

// -------------------------------------------------------------------------------------------
// Namen
// -------------------------------------------------------------------------------------------

function NamenAbschnitt({ ortId, namen }: { readonly ortId: string; readonly namen: readonly OrtDetailName[] }) {
  const { t } = useTranslation('orte')
  return (
    <section className="wz-ort-bearbeiten__abschnitt" aria-labelledby="wz-ort-bearbeiten-namen-titel">
      <Text rolle="titel-klein" als="h2" id="wz-ort-bearbeiten-namen-titel">
        {t('namen_ueberschrift')}
      </Text>

      {namen.length === 0 ? (
        <Text rolle="hilfe" als="p">
          {t('namen_liste_leer')}
        </Text>
      ) : (
        <ul className="wz-ort-bearbeiten__liste">
          {namen.map((zeile) => (
            <li key={zeile.id} className="wz-ort-bearbeiten__zeile">
              <OrtsnameFelder ortsname={zeile} />
            </li>
          ))}
        </ul>
      )}

      <OrtsnameNeuFormular ortId={ortId} />
    </section>
  )
}

/** Inline-Bearbeiten einer bestehenden `ortsname`-Zeile — dieselbe Debounce-Commit-Form wie
 * `NamenFelder` (`profil-bearbeiten-namen.tsx`): Textfelder committen verzögert, das
 * Auswahlfeld (`istBevorzugt`) sofort. */
function OrtsnameFelder({ ortsname: zeile }: { readonly ortsname: OrtDetailName }) {
  const { t } = useTranslation('orte')
  const ortsnameAendern = useOrtsnameAendern()
  const ortsnameLoeschen = useOrtsnameLoeschen()

  const wert = useMemo(() => ortsnameEntwurfAusZeile(zeile), [zeile])
  const [eintrag, setEintrag] = useEntwurfMitVerzoegertemCommit<OrtsnameEntwurfWerte>(wert, (naechster) =>
    ortsnameAendern.mutate(ortsnameAendernEinAusEntwurf(zeile.id, naechster)),
  )

  function sofortAendern(naechster: OrtsnameEntwurfWerte): void {
    setEintrag(naechster)
    ortsnameAendern.mutate(ortsnameAendernEinAusEntwurf(zeile.id, naechster))
  }

  return (
    <div className="wz-ort-bearbeiten__felder">
      <Formularfeld beschriftung={t('ortsname_name_beschriftung')}>
        <Textfeld wert={eintrag.name} aufAenderung={(wert) => setEintrag({ ...eintrag, name: wert })} />
      </Formularfeld>
      <Formularfeld beschriftung={t('gueltig_von_beschriftung')}>
        <Textfeld wert={eintrag.gueltigVonText} aufAenderung={(wert) => setEintrag({ ...eintrag, gueltigVonText: wert })} />
      </Formularfeld>
      <Formularfeld beschriftung={t('gueltig_bis_beschriftung')}>
        <Textfeld wert={eintrag.gueltigBisText} aufAenderung={(wert) => setEintrag({ ...eintrag, gueltigBisText: wert })} />
      </Formularfeld>
      <Formularfeld beschriftung={t('ist_bevorzugt_beschriftung')}>
        <Auswahlfeld
          wert={boolZuAuswahlWert(eintrag.istBevorzugt)}
          optionen={jaNeinOptionen(t)}
          aufAenderung={(wert) => sofortAendern({ ...eintrag, istBevorzugt: auswahlWertZuBool(wert) })}
        />
      </Formularfeld>
      <Schaltflaeche variante="gefaehrlich" aufKlick={() => ortsnameLoeschen.mutate({ id: zeile.id })}>
        {t('entfernen')}
      </Schaltflaeche>
    </div>
  )
}

function OrtsnameNeuFormular({ ortId }: { readonly ortId: string }) {
  const { t } = useTranslation('orte')
  const ortsnameAnlegen = useOrtsnameAnlegen()
  const [entwurf, setEntwurf] = useState<OrtsnameEntwurfWerte>(ORTSNAME_ENTWURF_LEER)

  function absenden(ereignis: FormEvent<HTMLFormElement>): void {
    ereignis.preventDefault()
    if (!ortsnameEntwurfAbsendbar(entwurf)) return
    ortsnameAnlegen.mutate(ortsnameAnlegenEinAusEntwurf(ortId, entwurf))
    setEntwurf(ORTSNAME_ENTWURF_LEER)
  }

  return (
    <form className="wz-ort-bearbeiten__neu" onSubmit={absenden} aria-labelledby="wz-ort-bearbeiten-namen-neu-titel">
      <Text rolle="beschriftung" als="p" id="wz-ort-bearbeiten-namen-neu-titel">
        {t('namen_neu_ueberschrift')}
      </Text>
      <div className="wz-ort-bearbeiten__felder">
        <Formularfeld beschriftung={t('ortsname_name_beschriftung')}>
          <Textfeld wert={entwurf.name} aufAenderung={(wert) => setEntwurf({ ...entwurf, name: wert })} />
        </Formularfeld>
        <Formularfeld beschriftung={t('gueltig_von_beschriftung')}>
          <Textfeld wert={entwurf.gueltigVonText} aufAenderung={(wert) => setEntwurf({ ...entwurf, gueltigVonText: wert })} />
        </Formularfeld>
        <Formularfeld beschriftung={t('gueltig_bis_beschriftung')}>
          <Textfeld wert={entwurf.gueltigBisText} aufAenderung={(wert) => setEntwurf({ ...entwurf, gueltigBisText: wert })} />
        </Formularfeld>
        <Formularfeld beschriftung={t('ist_bevorzugt_beschriftung')}>
          <Auswahlfeld
            wert={boolZuAuswahlWert(entwurf.istBevorzugt)}
            optionen={jaNeinOptionen(t)}
            aufAenderung={(wert) => setEntwurf({ ...entwurf, istBevorzugt: auswahlWertZuBool(wert) })}
          />
        </Formularfeld>
      </div>
      <Schaltflaeche variante="sekundaer" typ="submit" gesperrt={!ortsnameEntwurfAbsendbar(entwurf)}>
        {t('namen_hinzufuegen')}
      </Schaltflaeche>
    </form>
  )
}

// -------------------------------------------------------------------------------------------
// Zugehörigkeit (politisch/kirchlich getrennt, s. src/core/ort/zeitbezug.ts-Kopfkommentar)
// -------------------------------------------------------------------------------------------

function ZugehoerigkeitenAbschnitt({ ortId, zugehoerigkeiten }: { readonly ortId: string; readonly zugehoerigkeiten: readonly OrtDetailZugehoerigkeit[] }) {
  const { t } = useTranslation('orte')
  const politisch = zugehoerigkeiten.filter((eintrag) => eintrag.art === 'politisch')
  const kirchlich = zugehoerigkeiten.filter((eintrag) => eintrag.art === 'kirchlich')

  return (
    <section className="wz-ort-bearbeiten__abschnitt" aria-labelledby="wz-ort-bearbeiten-zugehoerigkeit-titel">
      <Text rolle="titel-klein" als="h2" id="wz-ort-bearbeiten-zugehoerigkeit-titel">
        {t('zugehoerigkeit_ueberschrift')}
      </Text>

      <ZugehoerigkeitTeilliste ueberschrift={t('zugehoerigkeit_politisch_ueberschrift')} leertext={t('zugehoerigkeit_politisch_leer')} zugehoerigkeiten={politisch} />
      <ZugehoerigkeitTeilliste ueberschrift={t('zugehoerigkeit_kirchlich_ueberschrift')} leertext={t('zugehoerigkeit_kirchlich_leer')} zugehoerigkeiten={kirchlich} />

      <ZugehoerigkeitNeuFormular ortId={ortId} />
    </section>
  )
}

function ZugehoerigkeitTeilliste({
  ueberschrift,
  leertext,
  zugehoerigkeiten,
}: {
  readonly ueberschrift: string
  readonly leertext: string
  readonly zugehoerigkeiten: readonly OrtDetailZugehoerigkeit[]
}) {
  return (
    <div>
      <Text rolle="beschriftung" als="p">
        {ueberschrift}
      </Text>
      {zugehoerigkeiten.length === 0 ? (
        <Text rolle="hilfe" als="p">
          {leertext}
        </Text>
      ) : (
        <ul className="wz-ort-bearbeiten__liste">
          {zugehoerigkeiten.map((zeile) => (
            <li key={zeile.id} className="wz-ort-bearbeiten__zeile">
              <ZugehoerigkeitFelder zugehoerigkeit={zeile} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface GueltigkeitEntwurf {
  readonly vonText: string
  readonly bisText: string
}

/** Inline-Bearbeiten EINER bestehenden Kante — NUR `gueltigVon`/`gueltigBis` (s.
 * `befehl:ortszugehoerigkeit.aendern`-Vertrag: `ortId`/`uebergeordnetId`/`art` sind unveränderlich,
 * das wäre fachlich eine andere Kante). */
function ZugehoerigkeitFelder({ zugehoerigkeit: zeile }: { readonly zugehoerigkeit: OrtDetailZugehoerigkeit }) {
  const { t } = useTranslation('orte')
  const zugehoerigkeitAendern = useOrtszugehoerigkeitAendern()
  const zugehoerigkeitLoeschen = useOrtszugehoerigkeitLoeschen()

  const wert = useMemo<GueltigkeitEntwurf>(
    () => ({ vonText: jdnZuIsoText(zeile.gueltig_von), bisText: jdnZuIsoText(zeile.gueltig_bis) }),
    [zeile.gueltig_von, zeile.gueltig_bis],
  )
  const [entwurf, setEntwurf] = useEntwurfMitVerzoegertemCommit<GueltigkeitEntwurf>(wert, (naechster) =>
    zugehoerigkeitAendern.mutate(ortszugehoerigkeitAendernEinAusText(zeile.id, naechster.vonText, naechster.bisText)),
  )

  return (
    <div className="wz-ort-bearbeiten__felder">
      <Text rolle="koerper" als="span">
        {zeile.uebergeordnet_anzeigename ?? zeile.uebergeordnet_id}
      </Text>
      <Formularfeld beschriftung={t('gueltig_von_beschriftung')}>
        <Textfeld wert={entwurf.vonText} aufAenderung={(wert) => setEntwurf({ ...entwurf, vonText: wert })} />
      </Formularfeld>
      <Formularfeld beschriftung={t('gueltig_bis_beschriftung')}>
        <Textfeld wert={entwurf.bisText} aufAenderung={(wert) => setEntwurf({ ...entwurf, bisText: wert })} />
      </Formularfeld>
      <Schaltflaeche variante="gefaehrlich" aufKlick={() => zugehoerigkeitLoeschen.mutate({ id: zeile.id })}>
        {t('entfernen')}
      </Schaltflaeche>
    </div>
  )
}

function artOptionen(t: (schluessel: string) => string): readonly AuswahlfeldOption<OrtszugehoerigkeitArtWert>[] {
  return [
    { wert: 'politisch', beschriftung: t('zugehoerigkeit_art_politisch') },
    { wert: 'kirchlich', beschriftung: t('zugehoerigkeit_art_kirchlich') },
  ]
}

/** „Zugehörigkeit hinzufügen" — Umschalter für `art`, übergeordneter Ort über das echte `Ortsfeld`
 * (dasselbe Suche-/Neu-Anlegen-Muster wie die Ortauswahl im Ereignis-Neu-Formular,
 * `profil-bearbeiten-ereignisse.tsx`), zwei Gültigkeits-Textfelder. */
function ZugehoerigkeitNeuFormular({ ortId }: { readonly ortId: string }) {
  const { t } = useTranslation('orte')
  const zugehoerigkeitAnlegen = useOrtszugehoerigkeitAnlegen()
  const ortAnlegen = useOrtAnlegen()
  const [entwurf, setEntwurf] = useState<OrtszugehoerigkeitEntwurfWerte>(ortszugehoerigkeitEntwurfLeer('politisch'))
  const [suchtext, setSuchtext] = useState('')
  const [hervorgehobenerIndex, setHervorgehobenerIndex] = useState<number | null>(null)

  const sucheAktiv = suchtext.trim() !== ''
  const sucheAbfrage = useOrtSuche({ text: suchtext }, { enabled: sucheAktiv })
  const zustand: OrtsfeldZustand = sucheAktiv ? (sucheAbfrage.isPending ? 'laedt' : 'bereit') : 'leer'
  const treffer = sucheAbfrage.data?.treffer ?? []

  function ausgewaehlt(gewaehlteOrtId: string): void {
    const treffergefunden = treffer.find((eintrag) => eintrag.id === gewaehlteOrtId)
    const text = treffergefunden?.anzeigename ?? suchtext
    setEntwurf({ ...entwurf, uebergeordnetId: gewaehlteOrtId, uebergeordnetText: text })
    setSuchtext(text)
  }

  async function neuAnlegen(): Promise<void> {
    const ergebnis = await ortAnlegen.mutateAsync(ortsfeldNeuAnlegenEin(suchtext))
    setEntwurf({ ...entwurf, uebergeordnetId: ergebnis.id, uebergeordnetText: suchtext })
  }

  function absenden(ereignis: FormEvent<HTMLFormElement>): void {
    ereignis.preventDefault()
    const nutzlast = ortszugehoerigkeitAnlegenEinAusEntwurf(ortId, entwurf)
    if (nutzlast === null) return
    zugehoerigkeitAnlegen.mutate(nutzlast)
    setEntwurf(ortszugehoerigkeitEntwurfLeer(entwurf.art))
    setSuchtext('')
  }

  return (
    <form className="wz-ort-bearbeiten__neu" onSubmit={absenden} aria-labelledby="wz-ort-bearbeiten-zugehoerigkeit-neu-titel">
      <Text rolle="beschriftung" als="p" id="wz-ort-bearbeiten-zugehoerigkeit-neu-titel">
        {t('zugehoerigkeit_neu_ueberschrift')}
      </Text>
      <div className="wz-ort-bearbeiten__felder">
        <Formularfeld beschriftung={t('zugehoerigkeit_art_beschriftung')}>
          <Auswahlfeld wert={entwurf.art} optionen={artOptionen(t)} aufAenderung={(wert) => setEntwurf({ ...entwurf, art: wert })} />
        </Formularfeld>
        <Formularfeld beschriftung={t('zugehoerigkeit_uebergeordnet_beschriftung')}>
          <Ortsfeld
            text={suchtext}
            aufAenderung={setSuchtext}
            zustand={zustand}
            treffer={treffer}
            hervorgehobenerIndex={hervorgehobenerIndex}
            aufHervorgehobenerIndexAenderung={setHervorgehobenerIndex}
            aufAusgewaehlt={ausgewaehlt}
            aufNeuAnlegen={() => void neuAnlegen()}
          />
        </Formularfeld>
        <Formularfeld beschriftung={t('gueltig_von_beschriftung')}>
          <Textfeld wert={entwurf.gueltigVonText} aufAenderung={(wert) => setEntwurf({ ...entwurf, gueltigVonText: wert })} />
        </Formularfeld>
        <Formularfeld beschriftung={t('gueltig_bis_beschriftung')}>
          <Textfeld wert={entwurf.gueltigBisText} aufAenderung={(wert) => setEntwurf({ ...entwurf, gueltigBisText: wert })} />
        </Formularfeld>
      </div>
      <Schaltflaeche variante="sekundaer" typ="submit" gesperrt={!ortszugehoerigkeitEntwurfAbsendbar(entwurf)}>
        {t('zugehoerigkeit_hinzufuegen')}
      </Schaltflaeche>
    </form>
  )
}

// -------------------------------------------------------------------------------------------
// Externe Kennungen
// -------------------------------------------------------------------------------------------

function externeIdSystemSchluessel(system: ExterneIdSystemWert): string {
  switch (system) {
    case 'gov':
      return 'externe_id_system_gov'
    case 'geonames':
      return 'externe_id_system_geonames'
    case 'wikidata':
      return 'externe_id_system_wikidata'
  }
}

function systemOptionen(t: (schluessel: string) => string): readonly AuswahlfeldOption<ExterneIdSystemWert>[] {
  return (['gov', 'geonames', 'wikidata'] as const).map((system) => ({ wert: system, beschriftung: t(externeIdSystemSchluessel(system)) }))
}

function ExterneIdsAbschnitt({ ortId, externeIds }: { readonly ortId: string; readonly externeIds: readonly OrtDetailExterneId[] }) {
  const { t } = useTranslation('orte')
  const externeIdLoeschen = useOrtExterneIdLoeschen()

  return (
    <section className="wz-ort-bearbeiten__abschnitt" aria-labelledby="wz-ort-bearbeiten-externe-id-titel">
      <Text rolle="titel-klein" als="h2" id="wz-ort-bearbeiten-externe-id-titel">
        {t('externe_id_ueberschrift')}
      </Text>

      {externeIds.length === 0 ? (
        <Text rolle="hilfe" als="p">
          {t('externe_id_liste_leer')}
        </Text>
      ) : (
        <ul className="wz-ort-bearbeiten__liste">
          {externeIds.map((zeile) => (
            <li key={zeile.system} className="wz-ort-bearbeiten__zeile">
              <div className="wz-ort-bearbeiten__felder">
                <Text rolle="koerper" als="span">
                  {t(externeIdSystemSchluessel(zeile.system))}
                </Text>
                <Text rolle="koerper" als="span">
                  {zeile.wert}
                </Text>
                <Schaltflaeche variante="gefaehrlich" aufKlick={() => externeIdLoeschen.mutate({ ortId, system: zeile.system })}>
                  {t('entfernen')}
                </Schaltflaeche>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ExterneIdNeuFormular ortId={ortId} />
    </section>
  )
}

function ExterneIdNeuFormular({ ortId }: { readonly ortId: string }) {
  const { t } = useTranslation('orte')
  const externeIdAnlegen = useOrtExterneIdAnlegen()
  const [entwurf, setEntwurf] = useState<ExterneIdEntwurfWerte>(EXTERNE_ID_ENTWURF_LEER)

  function absenden(ereignis: FormEvent<HTMLFormElement>): void {
    ereignis.preventDefault()
    if (!externeIdEntwurfAbsendbar(entwurf)) return
    externeIdAnlegen.mutate(externeIdAnlegenEinAusEntwurf(ortId, entwurf))
    setEntwurf(EXTERNE_ID_ENTWURF_LEER)
  }

  return (
    <form className="wz-ort-bearbeiten__neu" onSubmit={absenden} aria-labelledby="wz-ort-bearbeiten-externe-id-neu-titel">
      <Text rolle="beschriftung" als="p" id="wz-ort-bearbeiten-externe-id-neu-titel">
        {t('externe_id_neu_ueberschrift')}
      </Text>
      <div className="wz-ort-bearbeiten__felder">
        <Formularfeld beschriftung={t('externe_id_system_beschriftung')}>
          <Auswahlfeld wert={entwurf.system} optionen={systemOptionen(t)} aufAenderung={(wert) => setEntwurf({ ...entwurf, system: wert })} />
        </Formularfeld>
        <Formularfeld beschriftung={t('externe_id_wert_beschriftung')}>
          <Textfeld wert={entwurf.wert} aufAenderung={(wert) => setEntwurf({ ...entwurf, wert })} />
        </Formularfeld>
      </div>
      <Schaltflaeche variante="sekundaer" typ="submit" gesperrt={!externeIdEntwurfAbsendbar(entwurf)}>
        {t('externe_id_hinzufuegen')}
      </Schaltflaeche>
    </form>
  )
}
