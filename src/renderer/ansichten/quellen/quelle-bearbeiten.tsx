// AP-1.17 PR-C1 (S-23-Baustein-Wiederverwendung, docs/71_Designsystem.md §2/§3, docs/
// 80_Offene_Fragen.md §29): die Quelle/Zitat/Archiv-Pflege-Ansicht. Zustandsbasiert wie
// `ort-bearbeiten.tsx` — Stammfelder der Quelle (inkl. mündlich-Block, §2.15) plus eine
// dreistufige Zitate-Liste (Quelle → Zitat → Transkript, §3), je Zitat mit Inline-
// Bearbeiten/Entfernen, plus ein festes „Zitat hinzufügen"-Formular. KEIN Speichern-Knopf — jede
// Eingabe committet sofort über den passenden Befehl (Textfelder debounced über
// `useEntwurfMitVerzoegertemCommit`, Auswahlfelder/Personen-/Archivauswahl/Löschen sofort). KEIN
// zweiter Schreibweg: JEDE Änderung läuft über genau EINEN der `befehl:quelle*`/`befehl:zitat*`/
// `befehl:archiv*`-Kanäle aus `befehl-hooks.ts`.
//
// Einstiegspunkt (§14, docs/80_Offene_Fragen.md §29): ein „Quelle bearbeiten"/„Quelle anlegen"-
// Link am Belegapparat des Profils (`beleg-liste.tsx`) — es gibt noch KEINEN globalen „Quellen"-
// Screen (das bleibt S-35, Phase 2/3, C-23 mit Dublettenerkennung), analog zum „Ort bearbeiten"-
// Link am Ortsfeld (AP-1.16 PR-C).
import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { z } from 'zod'
import type { Aus } from '../../../shared/ipc/vertrag'
import { InformationsartEnum, QuelleArtEnum, QuelleFormEnum, QuelleTypEnum, UnmittelbarkeitEnum } from '../../../shared/schemata/quelle'
import type { QuelleDetailKopf, QuelleDetailZitat } from '../../../shared/schemata/quelle-detail'
import { Archivfeld, type ArchivfeldZustand } from '../../bausteine/archivfeld'
import { archivfeldNeuAnlegenEin } from '../../bausteine/archivfeld-logik'
import { Auswahlfeld, type AuswahlfeldOption } from '../../bausteine/auswahlfeld'
import { Datumsfeld } from '../../bausteine/datumsfeld'
import { Formularfeld } from '../../bausteine/formularfeld'
import { Konfidenzwaehler } from '../../bausteine/konfidenzwaehler'
import { Langtextfeld } from '../../bausteine/langtextfeld'
import { Personenwaehler, type PersonenwaehlerZustand } from '../../bausteine/personenwaehler'
import { personenwaehlerNeuAnlegenEin, personenwaehlerPlatzhalterAnlegenEin } from '../../bausteine/personenwaehler-logik'
import { Schaltflaeche } from '../../bausteine/schaltflaeche'
import { Seitenschublade } from '../../bausteine/seitenschublade'
import { Text } from '../../bausteine/text'
import { Textfeld } from '../../bausteine/textfeld'
import { Zahlfeld } from '../../bausteine/zahlfeld'
import { useArchivSuche, useQuelleDetail, useSuche } from '../../brücke/abfrage-hooks'
import { useArchivAnlegen, usePersonAnlegen, useQuelleAendern, useZitatAendern, useZitatAnlegen, useZitatLoeschen } from '../../brücke/befehl-hooks'
import { useEntwurfMitVerzoegertemCommit } from '../profil/profil-bearbeiten-debounce'
import { ereignisPersonSucheEin } from '../profil/profil-bearbeiten-logik'
import {
  ZITAT_ENTWURF_LEER,
  jahrTextIstGueltig,
  quelleAendernEinAusEntwurf,
  quelleKopfEntwurfAusDetail,
  zitatAendernEinAusEntwurf,
  zitatAnlegenEinAusEntwurf,
  zitatEntwurfAusZeile,
  zitatEntwurfHatInhalt,
  type InformationsartAuswahlWert,
  type QuelleArtAuswahlWert,
  type QuelleFormAuswahlWert,
  type QuelleKopfEntwurfWerte,
  type UnmittelbarkeitAuswahlWert,
  type ZitatEntwurfWerte,
} from './quelle-bearbeiten-logik'
import { informationsartSchluessel, quelleArtSchluessel, quelleFormSchluessel, quelleTypSchluessel, unmittelbarkeitSchluessel } from './quellen-schluessel'
import './quelle-bearbeiten.css'

export interface QuelleBearbeitenAnsichtProps {
  readonly quelleId: string
  readonly aufSchliessen: () => void
}

/** Die Schublade selbst — lädt `abfrage:quelle.detail` und delegiert an `QuelleBearbeitenInhalt`
 * (getrennt, damit der Inhalt ohne Netzwerk/Query-Zustand testbar bleibt, Muster
 * `OrteBearbeitenInhalt`/`ort-bearbeiten.tsx`). */
export function QuelleBearbeitenAnsicht({ quelleId, aufSchliessen }: QuelleBearbeitenAnsichtProps) {
  const { t } = useTranslation('quellen')
  const abfrage = useQuelleDetail({ quelleId })

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
      {abfrage.isSuccess ? <QuelleBearbeitenInhalt quelleId={quelleId} daten={abfrage.data} /> : null}
    </Seitenschublade>
  )
}

export interface QuelleBearbeitenInhaltProps {
  readonly quelleId: string
  readonly daten: Aus<'abfrage:quelle.detail'>
}

/** Der eigentliche Pflege-Inhalt — Stammfelder-Abschnitt + Zitate-Abschnitt. Reine Props, kein
 * `useQuelleDetail` hier. */
export function QuelleBearbeitenInhalt({ quelleId, daten }: QuelleBearbeitenInhaltProps) {
  return (
    <>
      <QuelleKopfAbschnitt quelleId={quelleId} kopf={daten.kopf} />
      <ZitateAbschnitt quelleId={quelleId} zitate={daten.zitate} />
    </>
  )
}

// -------------------------------------------------------------------------------------------
// Stammfelder (§2.7 + §2.15 mündlich-Block)
// -------------------------------------------------------------------------------------------

function typOptionen(t: (schluessel: string) => string): readonly AuswahlfeldOption<z.infer<typeof QuelleTypEnum>>[] {
  return QuelleTypEnum.options.map((typ) => ({ wert: typ, beschriftung: t(quelleTypSchluessel(typ)) }))
}

function artOptionen(t: (schluessel: string) => string): readonly AuswahlfeldOption<QuelleArtAuswahlWert>[] {
  return [{ wert: '', beschriftung: t('art_unbestimmt') }, ...QuelleArtEnum.options.map((art) => ({ wert: art, beschriftung: t(quelleArtSchluessel(art)) }))]
}

function informationsartOptionen(t: (schluessel: string) => string): readonly AuswahlfeldOption<InformationsartAuswahlWert>[] {
  return [
    { wert: '', beschriftung: t('informationsart_unbestimmt_wert') },
    ...InformationsartEnum.options.map((wert) => ({ wert, beschriftung: t(informationsartSchluessel(wert)) })),
  ]
}

function formOptionen(t: (schluessel: string) => string): readonly AuswahlfeldOption<QuelleFormAuswahlWert>[] {
  return [{ wert: '', beschriftung: t('form_unbestimmt') }, ...QuelleFormEnum.options.map((form) => ({ wert: form, beschriftung: t(quelleFormSchluessel(form)) }))]
}

function unmittelbarkeitOptionen(t: (schluessel: string) => string): readonly AuswahlfeldOption<UnmittelbarkeitAuswahlWert>[] {
  return [
    { wert: '', beschriftung: t('unmittelbarkeit_unbestimmt_wert') },
    ...UnmittelbarkeitEnum.options.map((wert) => ({ wert, beschriftung: t(unmittelbarkeitSchluessel(wert)) })),
  ]
}

/** Stammfelder-Abschnitt — EIN debounce-committetes Entwurfsobjekt für alle Textfelder
 * (`useEntwurfMitVerzoegertemCommit`, Muster `OrtsnameFelder`), Auswahlfelder/Archiv-/
 * Informant-Auswahl committen sofort (`sofortAendern`, Muster `istBevorzugt` in
 * `ort-bearbeiten.tsx`). Archiv-/Informant-SUCHTEXT bleiben bewusst außerhalb des committeten
 * Objekts (Kopfkommentar `QuelleKopfEntwurfWerte.archivId`, `quelle-bearbeiten-logik.ts`). */
function QuelleKopfAbschnitt({ quelleId, kopf }: { readonly quelleId: string; readonly kopf: QuelleDetailKopf }) {
  const { t } = useTranslation('quellen')
  const quelleAendern = useQuelleAendern()
  const archivAnlegen = useArchivAnlegen()
  const personAnlegen = usePersonAnlegen()

  const wert = useMemo(() => quelleKopfEntwurfAusDetail(kopf), [kopf])
  const [entwurf, setEntwurf] = useEntwurfMitVerzoegertemCommit<QuelleKopfEntwurfWerte>(wert, (naechster) =>
    quelleAendern.mutate(quelleAendernEinAusEntwurf(quelleId, naechster)),
  )

  function sofortAendern(naechster: QuelleKopfEntwurfWerte): void {
    setEntwurf(naechster)
    quelleAendern.mutate(quelleAendernEinAusEntwurf(quelleId, naechster))
  }

  const [archivSuchtext, setArchivSuchtext] = useState(kopf.archiv_name ?? '')
  const [archivHervorgehobenerIndex, setArchivHervorgehobenerIndex] = useState<number | null>(null)
  const archivSucheAktiv = archivSuchtext.trim() !== ''
  const archivSucheAbfrage = useArchivSuche({ text: archivSuchtext }, { enabled: archivSucheAktiv })
  const archivZustand: ArchivfeldZustand = archivSucheAktiv ? (archivSucheAbfrage.isPending ? 'laedt' : 'bereit') : 'leer'
  const archivTreffer = archivSucheAbfrage.data?.treffer ?? []

  function archivAusgewaehlt(archivId: string): void {
    const treffergefunden = archivTreffer.find((eintrag) => eintrag.id === archivId)
    setArchivSuchtext(treffergefunden?.name ?? archivSuchtext)
    sofortAendern({ ...entwurf, archivId })
  }

  async function archivNeuAnlegen(): Promise<void> {
    const ergebnis = await archivAnlegen.mutateAsync(archivfeldNeuAnlegenEin(archivSuchtext))
    sofortAendern({ ...entwurf, archivId: ergebnis.id })
  }

  const [informantSuchtext, setInformantSuchtext] = useState(kopf.informant_anzeigename ?? '')
  const [informantHervorgehobenerIndex, setInformantHervorgehobenerIndex] = useState<number | null>(null)
  const [informantAnzeigename, setInformantAnzeigename] = useState<string | null>(kopf.informant_anzeigename)
  const informantSucheAktiv = informantSuchtext.trim() !== ''
  const informantSucheAbfrage = useSuche(ereignisPersonSucheEin(informantSuchtext), { enabled: informantSucheAktiv })
  const informantZustand: PersonenwaehlerZustand = informantSucheAktiv ? (informantSucheAbfrage.isPending ? 'laedt' : 'bereit') : 'leer'
  const informantTreffer = informantSucheAbfrage.data?.treffer ?? []

  function informantAusgewaehlt(personId: string): void {
    const treffergefunden = informantTreffer.find((eintrag) => eintrag.person_id === personId)
    setInformantAnzeigename(treffergefunden?.ist_platzhalter === true ? t('informant_platzhalter_bezeichnung') : (treffergefunden?.anzeigename ?? null))
    sofortAendern({ ...entwurf, informantPersonId: personId })
  }

  async function informantNeuAnlegen(): Promise<void> {
    const ergebnis = await personAnlegen.mutateAsync(personenwaehlerNeuAnlegenEin())
    setInformantAnzeigename(t('informant_neu_angelegt'))
    sofortAendern({ ...entwurf, informantPersonId: ergebnis.id })
  }

  async function informantPlatzhalterAnlegen(): Promise<void> {
    const ergebnis = await personAnlegen.mutateAsync(personenwaehlerPlatzhalterAnlegenEin())
    setInformantAnzeigename(t('informant_platzhalter_bezeichnung'))
    sofortAendern({ ...entwurf, informantPersonId: ergebnis.id })
  }

  return (
    <section className="wz-quelle-bearbeiten__abschnitt" aria-labelledby="wz-quelle-bearbeiten-kopf-titel">
      <Text rolle="titel-klein" als="h2" id="wz-quelle-bearbeiten-kopf-titel">
        {t('kopf_ueberschrift')}
      </Text>
      <div className="wz-quelle-bearbeiten__felder">
        <Formularfeld beschriftung={t('typ_beschriftung')}>
          <Auswahlfeld wert={entwurf.typ} optionen={typOptionen(t)} aufAenderung={(wert) => sofortAendern({ ...entwurf, typ: wert })} />
        </Formularfeld>
        <Formularfeld beschriftung={t('titel_beschriftung')}>
          <Textfeld wert={entwurf.titel} aufAenderung={(wert) => setEntwurf({ ...entwurf, titel: wert })} />
        </Formularfeld>
        <Formularfeld beschriftung={t('autor_beschriftung')}>
          <Textfeld wert={entwurf.autor} aufAenderung={(wert) => setEntwurf({ ...entwurf, autor: wert })} />
        </Formularfeld>
        <Formularfeld beschriftung={t('verlag_beschriftung')}>
          <Textfeld wert={entwurf.verlag} aufAenderung={(wert) => setEntwurf({ ...entwurf, verlag: wert })} />
        </Formularfeld>
        {/* `exactOptionalPropertyTypes` (CLAUDE.md §4, Muster `datumsfeld.tsx`s `eingabekoerperExtra`):
            `fehlertext` fehlt ganz statt explizit `undefined` zu tragen. */}
        <Formularfeld beschriftung={t('jahr_beschriftung')} {...(jahrTextIstGueltig(entwurf.jahrText) ? {} : { fehlertext: t('jahr_ungueltig') })}>
          <Zahlfeld
            wert={entwurf.jahrText}
            aufAenderung={(wert) => setEntwurf({ ...entwurf, jahrText: wert })}
            ungueltig={!jahrTextIstGueltig(entwurf.jahrText)}
          />
        </Formularfeld>
        <Formularfeld beschriftung={t('art_beschriftung')}>
          <Auswahlfeld wert={entwurf.art} optionen={artOptionen(t)} aufAenderung={(wert) => sofortAendern({ ...entwurf, art: wert })} />
        </Formularfeld>
        <Formularfeld beschriftung={t('informationsart_beschriftung')}>
          <Auswahlfeld
            wert={entwurf.informationsart}
            optionen={informationsartOptionen(t)}
            aufAenderung={(wert) => sofortAendern({ ...entwurf, informationsart: wert })}
          />
        </Formularfeld>
        <Formularfeld beschriftung={t('archiv_beschriftung')}>
          <Archivfeld
            text={archivSuchtext}
            aufAenderung={setArchivSuchtext}
            zustand={archivZustand}
            treffer={archivTreffer}
            hervorgehobenerIndex={archivHervorgehobenerIndex}
            aufHervorgehobenerIndexAenderung={setArchivHervorgehobenerIndex}
            aufAusgewaehlt={archivAusgewaehlt}
            aufNeuAnlegen={() => void archivNeuAnlegen()}
          />
        </Formularfeld>
        <Formularfeld beschriftung={t('signatur_beschriftung')}>
          <Textfeld wert={entwurf.signatur} aufAenderung={(wert) => setEntwurf({ ...entwurf, signatur: wert })} />
        </Formularfeld>
      </div>
      <Formularfeld beschriftung={t('notiz_beschriftung')}>
        <Langtextfeld wert={entwurf.notiz} aufAenderung={(wert) => setEntwurf({ ...entwurf, notiz: wert })} />
      </Formularfeld>

      {entwurf.typ === 'muendlich' ? (
        <div className="wz-quelle-bearbeiten__muendlich" aria-labelledby="wz-quelle-bearbeiten-muendlich-titel">
          <Text rolle="beschriftung" als="p" id="wz-quelle-bearbeiten-muendlich-titel">
            {t('muendlich_ueberschrift')}
          </Text>
          <div className="wz-quelle-bearbeiten__felder">
            <Formularfeld
              beschriftung={t('informant_beschriftung')}
              {...(informantAnzeigename === null ? {} : { hilfetext: t('informant_ausgewaehlt_hinweis', { name: informantAnzeigename }) })}
            >
              <Personenwaehler
                text={informantSuchtext}
                aufAenderung={setInformantSuchtext}
                zustand={informantZustand}
                treffer={informantTreffer}
                hervorgehobenerIndex={informantHervorgehobenerIndex}
                aufHervorgehobenerIndexAenderung={setInformantHervorgehobenerIndex}
                aufAusgewaehlt={informantAusgewaehlt}
                aufNeuAnlegen={() => void informantNeuAnlegen()}
                aufPlatzhalterAnlegen={() => void informantPlatzhalterAnlegen()}
              />
            </Formularfeld>
            <Formularfeld beschriftung={t('gespraechsdatum_beschriftung')}>
              <Datumsfeld
                text={entwurf.gespraechsdatumText}
                aufAenderung={(wert) => setEntwurf({ ...entwurf, gespraechsdatumText: wert })}
                kalender={entwurf.gespraechsdatumKalender}
                aufKalenderAenderung={(wert) => setEntwurf({ ...entwurf, gespraechsdatumKalender: wert })}
                kalenderErweitert={entwurf.gespraechsdatumKalenderErweitert}
                aufKalenderErweitertAenderung={(wert) => setEntwurf({ ...entwurf, gespraechsdatumKalenderErweitert: wert })}
              />
            </Formularfeld>
            <Formularfeld beschriftung={t('form_beschriftung')}>
              <Auswahlfeld wert={entwurf.form} optionen={formOptionen(t)} aufAenderung={(wert) => sofortAendern({ ...entwurf, form: wert })} />
            </Formularfeld>
            <Formularfeld beschriftung={t('unmittelbarkeit_beschriftung')}>
              <Auswahlfeld
                wert={entwurf.unmittelbarkeit}
                optionen={unmittelbarkeitOptionen(t)}
                aufAenderung={(wert) => sofortAendern({ ...entwurf, unmittelbarkeit: wert })}
              />
            </Formularfeld>
          </div>
        </div>
      ) : null}
    </section>
  )
}

// -------------------------------------------------------------------------------------------
// Zitate (dreistufige Liste, §3 Designsystem: Quelle [Abschnitt oben] → Zitat → Transkript)
// -------------------------------------------------------------------------------------------

function ZitateAbschnitt({ quelleId, zitate }: { readonly quelleId: string; readonly zitate: readonly QuelleDetailZitat[] }) {
  const { t } = useTranslation('quellen')
  return (
    <section className="wz-quelle-bearbeiten__abschnitt" aria-labelledby="wz-quelle-bearbeiten-zitate-titel">
      <Text rolle="titel-klein" als="h2" id="wz-quelle-bearbeiten-zitate-titel">
        {t('zitate_ueberschrift')}
      </Text>

      {zitate.length === 0 ? (
        <Text rolle="hilfe" als="p">
          {t('zitate_liste_leer')}
        </Text>
      ) : (
        <ul className="wz-quelle-bearbeiten__liste">
          {zitate.map((zeile) => (
            <li key={zeile.id} className="wz-quelle-bearbeiten__zeile">
              <ZitatFelder quelleId={quelleId} zitat={zeile} />
            </li>
          ))}
        </ul>
      )}

      <ZitatNeuFormular quelleId={quelleId} />
    </section>
  )
}

/** Inline-Bearbeiten EINES bestehenden Zitats — dieselbe Debounce-Commit-Form wie `OrtsnameFelder`
 * (Textfelder/Transkript debounced, `Konfidenzwaehler`/„Entfernen" sofort). */
function ZitatFelder({ quelleId, zitat: zeile }: { readonly quelleId: string; readonly zitat: QuelleDetailZitat }) {
  const { t } = useTranslation('quellen')
  const zitatAendern = useZitatAendern()
  const zitatLoeschen = useZitatLoeschen()

  const wert = useMemo(() => zitatEntwurfAusZeile(zeile), [zeile])
  const [entwurf, setEntwurf] = useEntwurfMitVerzoegertemCommit<ZitatEntwurfWerte>(wert, (naechster) =>
    zitatAendern.mutate(zitatAendernEinAusEntwurf(zeile.id, quelleId, naechster)),
  )

  function sofortAendern(naechster: ZitatEntwurfWerte): void {
    setEntwurf(naechster)
    zitatAendern.mutate(zitatAendernEinAusEntwurf(zeile.id, quelleId, naechster))
  }

  return (
    <>
      <div className="wz-quelle-bearbeiten__felder">
        <Formularfeld beschriftung={t('zitat_seite_beschriftung')}>
          <Textfeld wert={entwurf.seite} aufAenderung={(wert) => setEntwurf({ ...entwurf, seite: wert })} />
        </Formularfeld>
        <Formularfeld beschriftung={t('zitat_eintragsnummer_beschriftung')}>
          <Textfeld wert={entwurf.eintragsnummer} aufAenderung={(wert) => setEntwurf({ ...entwurf, eintragsnummer: wert })} />
        </Formularfeld>
        <Formularfeld beschriftung={t('zitat_digitalisat_url_beschriftung')}>
          <Textfeld wert={entwurf.digitalisatUrl} aufAenderung={(wert) => setEntwurf({ ...entwurf, digitalisatUrl: wert })} />
        </Formularfeld>
        <Formularfeld beschriftung={t('zitat_konfidenz_beschriftung')}>
          <Konfidenzwaehler wert={entwurf.konfidenz} aufAenderung={(stufe) => sofortAendern({ ...entwurf, konfidenz: stufe })} ariaLabel={t('zitat_konfidenz_beschriftung')} />
        </Formularfeld>
        <Schaltflaeche variante="gefaehrlich" aufKlick={() => zitatLoeschen.mutate({ id: zeile.id })}>
          {t('entfernen')}
        </Schaltflaeche>
      </div>
      <div className="wz-quelle-bearbeiten__transkript">
        <Formularfeld beschriftung={t('zitat_transkript_beschriftung')}>
          <Langtextfeld wert={entwurf.transkript} aufAenderung={(wert) => setEntwurf({ ...entwurf, transkript: wert })} />
        </Formularfeld>
      </div>
    </>
  )
}

function ZitatNeuFormular({ quelleId }: { readonly quelleId: string }) {
  const { t } = useTranslation('quellen')
  const zitatAnlegen = useZitatAnlegen()
  const [entwurf, setEntwurf] = useState<ZitatEntwurfWerte>(ZITAT_ENTWURF_LEER)

  function absenden(ereignis: FormEvent<HTMLFormElement>): void {
    ereignis.preventDefault()
    if (!zitatEntwurfHatInhalt(entwurf)) return
    zitatAnlegen.mutate(zitatAnlegenEinAusEntwurf(quelleId, entwurf))
    setEntwurf(ZITAT_ENTWURF_LEER)
  }

  return (
    <form className="wz-quelle-bearbeiten__neu" onSubmit={absenden} aria-labelledby="wz-quelle-bearbeiten-zitate-neu-titel">
      <Text rolle="beschriftung" als="p" id="wz-quelle-bearbeiten-zitate-neu-titel">
        {t('zitate_neu_ueberschrift')}
      </Text>
      <div className="wz-quelle-bearbeiten__felder">
        <Formularfeld beschriftung={t('zitat_seite_beschriftung')}>
          <Textfeld wert={entwurf.seite} aufAenderung={(wert) => setEntwurf({ ...entwurf, seite: wert })} />
        </Formularfeld>
        <Formularfeld beschriftung={t('zitat_eintragsnummer_beschriftung')}>
          <Textfeld wert={entwurf.eintragsnummer} aufAenderung={(wert) => setEntwurf({ ...entwurf, eintragsnummer: wert })} />
        </Formularfeld>
        <Formularfeld beschriftung={t('zitat_digitalisat_url_beschriftung')}>
          <Textfeld wert={entwurf.digitalisatUrl} aufAenderung={(wert) => setEntwurf({ ...entwurf, digitalisatUrl: wert })} />
        </Formularfeld>
        <Formularfeld beschriftung={t('zitat_konfidenz_beschriftung')}>
          <Konfidenzwaehler wert={entwurf.konfidenz} aufAenderung={(stufe) => setEntwurf({ ...entwurf, konfidenz: stufe })} ariaLabel={t('zitat_konfidenz_beschriftung')} />
        </Formularfeld>
      </div>
      <div className="wz-quelle-bearbeiten__transkript">
        <Formularfeld beschriftung={t('zitat_transkript_beschriftung')}>
          <Langtextfeld wert={entwurf.transkript} aufAenderung={(wert) => setEntwurf({ ...entwurf, transkript: wert })} />
        </Formularfeld>
      </div>
      <Schaltflaeche variante="sekundaer" typ="submit" gesperrt={!zitatEntwurfHatInhalt(entwurf)}>
        {t('zitate_hinzufuegen')}
      </Schaltflaeche>
    </form>
  )
}
