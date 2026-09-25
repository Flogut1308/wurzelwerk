import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { BeteiligungRolleEnum } from '../../../shared/schemata/beteiligung'
import { EreignisTypEnum } from '../../../shared/schemata/ereignis'
import type { PersonDetailEreignis } from '../../../shared/schemata/person-detail'
import { Auswahlfeld, type AuswahlfeldOption } from '../../bausteine/auswahlfeld'
import { Datumsfeld } from '../../bausteine/datumsfeld'
import { Formularfeld } from '../../bausteine/formularfeld'
import { Konfidenzwaehler } from '../../bausteine/konfidenzwaehler'
import { Ortsfeld, type OrtsfeldZustand } from '../../bausteine/ortsfeld'
import { ortsfeldNeuAnlegenEin } from '../../bausteine/ortsfeld-logik'
import { PERSONENNAME_SCHLUESSEL, personennameText } from '../../bausteine/personenname-anzeige'
import { Personenwaehler, type PersonenwaehlerZustand } from '../../bausteine/personenwaehler'
import { personenwaehlerNeuAnlegenEin, personenwaehlerPlatzhalterAnlegenEin } from '../../bausteine/personenwaehler-logik'
import { Schaltflaeche } from '../../bausteine/schaltflaeche'
import { Text } from '../../bausteine/text'
import { useOrtSuche, useSuche } from '../../brücke/abfrage-hooks'
import { useBeteiligungLoeschen, useEreignisAnlegen, useEreignisLoeschen, useOrtAnlegen, usePersonAnlegen } from '../../brücke/befehl-hooks'
import { OrtBearbeitenAnsicht } from '../orte/ort-bearbeiten'
import {
  EREIGNIS_ENTWURF_LEER,
  ereignisAnlegenEinAusEntwurf,
  ereignisEntwurfAbsendbar,
  ereignisEntwurfJdn,
  ereignisPersonSucheEin,
  weitererBeteiligterLeer,
  type EreignisEntwurfWerte,
  type WeitererBeteiligterEntwurf,
} from './profil-bearbeiten-logik'
import { beteiligungRolleSchluessel, ereignisTypSchluessel } from './profil-schluessel'
import './profil-bearbeiten-ereignisse.css'

export interface EreignisseBearbeitenAbschnittProps {
  readonly personId: string
  readonly ereignisse: readonly PersonDetailEreignis[]
}

/**
 * `EreignisseBearbeitenAbschnitt` (AP-1.15 PR-A, Variante A): Liste bestehender Ereignis-
 * Teilnahmen dieser Person (jede mit „Beteiligung entfernen" — nur die eigene Teilnahme,
 * `befehl:beteiligung.loeschen` — UND, klar davon abgesetzt, „Ereignis löschen" — das GESAMTE
 * Ereignis samt aller Beteiligten, `befehl:ereignis.loeschen`) plus ein festes Formular für ein
 * NEUES Ereignis (`befehl:ereignis.anlegen`, MIT allen gesammelten Beteiligten in einem Aufruf).
 * KEIN `beteiligung.anlegen`/`ereignis.aendern` in diesem Arbeitspaket — nachträgliches Ergänzen
 * eines bestehenden Ereignisses bleibt zurückgestellt (`docs/80_Offene_Fragen.md` §27).
 */
export function EreignisseBearbeitenAbschnitt({ personId, ereignisse }: EreignisseBearbeitenAbschnittProps) {
  const { t } = useTranslation('profil')

  return (
    <section className="wz-profil-ansicht__abschnitt" aria-labelledby="wz-profil-bearbeiten-ereignisse-titel">
      <Text rolle="titel-klein" als="h2" id="wz-profil-bearbeiten-ereignisse-titel">
        {t('abschnitt_ereignisse_bearbeiten')}
      </Text>

      {ereignisse.length === 0 ? (
        <Text rolle="hilfe" als="p">
          {t('ereignisse_liste_leer')}
        </Text>
      ) : (
        <ul className="wz-profil-bearbeiten-ereignisse__liste">
          {ereignisse.map((ereignis) => (
            <li key={ereignis.beteiligung_id} className="wz-profil-bearbeiten-ereignisse__zeile">
              <EreignisZeile ereignis={ereignis} />
            </li>
          ))}
        </ul>
      )}

      <EreignisNeuFormular personId={personId} />
    </section>
  )
}

function EreignisZeile({ ereignis }: { readonly ereignis: PersonDetailEreignis }) {
  const { t } = useTranslation('profil')
  const beteiligungLoeschen = useBeteiligungLoeschen()
  const ereignisLoeschen = useEreignisLoeschen()

  return (
    <div className="wz-profil-bearbeiten-ereignisse__zeile-inhalt">
      <div className="wz-profil-bearbeiten-ereignisse__zeile-text">
        <Text rolle="koerper" als="span">
          {t(ereignisTypSchluessel(ereignis.typ))}
        </Text>
        <Text rolle="beschriftung" als="span">
          {t(beteiligungRolleSchluessel(ereignis.rolle))}
        </Text>
        <Text rolle="koerper-klein" als="span">
          {ereignis.datum_wert1 ?? t('wert_unbekannt')}
        </Text>
      </div>
      <div className="wz-profil-bearbeiten-ereignisse__zeile-aktionen">
        <Schaltflaeche variante="unauffaellig" aufKlick={() => beteiligungLoeschen.mutate({ id: ereignis.beteiligung_id })}>
          {t('ereignis_zeile_beteiligung_entfernen')}
        </Schaltflaeche>
        <Schaltflaeche variante="gefaehrlich" aufKlick={() => ereignisLoeschen.mutate({ id: ereignis.ereignis_id })}>
          {t('ereignis_zeile_loeschen')}
        </Schaltflaeche>
      </div>
    </div>
  )
}

function ereignisTypOptionen(t: (schluessel: string) => string): readonly AuswahlfeldOption<(typeof EreignisTypEnum.options)[number]>[] {
  return EreignisTypEnum.options.map((typ) => ({ wert: typ, beschriftung: t(ereignisTypSchluessel(typ)) }))
}

function beteiligungRolleOptionen(t: (schluessel: string) => string): readonly AuswahlfeldOption<(typeof BeteiligungRolleEnum.options)[number]>[] {
  return BeteiligungRolleEnum.options.map((rolle) => ({ wert: rolle, beschriftung: t(beteiligungRolleSchluessel(rolle)) }))
}

interface WeitererBeteiligterZeileProps {
  readonly eintrag: WeitererBeteiligterEntwurf
  readonly aufAenderung: (naechster: WeitererBeteiligterEntwurf) => void
  readonly aufEntfernen: () => void
}

/** EINE Zeile „weiterer Beteiligter" — eigener `Personenwaehler`-Suchzustand (Tippsuche +
 * hervorgehobener Index bleiben lokal, analog `listen-ansicht.tsx`), bis eine Person gewählt ist;
 * danach zeigt die Zeile nur noch den gewählten Namen (bzw. einen Platzhalter-Hinweis) — ein
 * zweites Auswahlfeld für die Rolle bleibt in JEDEM Zustand bedienbar. */
function WeitererBeteiligterZeile({ eintrag, aufAenderung, aufEntfernen }: WeitererBeteiligterZeileProps) {
  const { t } = useTranslation('profil')
  const { t: tAllgemein } = useTranslation('allgemein')
  const personAnlegen = usePersonAnlegen()
  const [suchtext, setSuchtext] = useState('')
  const [hervorgehobenerIndex, setHervorgehobenerIndex] = useState<number | null>(null)
  const [gewaehlterName, setGewaehlterName] = useState<string | null>(null)

  const sucheAktiv = suchtext.trim() !== ''
  const sucheAbfrage = useSuche(ereignisPersonSucheEin(suchtext), { enabled: sucheAktiv })
  const zustand: PersonenwaehlerZustand = sucheAktiv ? (sucheAbfrage.isPending ? 'laedt' : 'bereit') : 'leer'
  const treffer = sucheAbfrage.data?.treffer ?? []

  function ausgewaehlt(personId: string) {
    const treffergefunden = treffer.find((eintragTreffer) => eintragTreffer.person_id === personId)
    setGewaehlterName(treffergefunden === undefined ? null : personennameText(treffergefunden, tAllgemein))
    aufAenderung({ ...eintrag, personId })
  }

  async function neuAnlegen() {
    const ergebnis = await personAnlegen.mutateAsync(personenwaehlerNeuAnlegenEin())
    setGewaehlterName(t('ereignis_neu_weiterer_beteiligter_neu_angelegt'))
    aufAenderung({ ...eintrag, personId: ergebnis.id })
  }

  async function platzhalterAnlegen() {
    const ergebnis = await personAnlegen.mutateAsync(personenwaehlerPlatzhalterAnlegenEin())
    setGewaehlterName(tAllgemein(PERSONENNAME_SCHLUESSEL.platzhalter))
    aufAenderung({ ...eintrag, personId: ergebnis.id })
  }

  return (
    <div className="wz-profil-bearbeiten-ereignisse__beteiligter">
      {eintrag.personId === null ? (
        <Formularfeld beschriftung={t('ereignis_neu_weiterer_beteiligter_person_beschriftung')}>
          <Personenwaehler
            text={suchtext}
            aufAenderung={setSuchtext}
            zustand={zustand}
            treffer={treffer}
            hervorgehobenerIndex={hervorgehobenerIndex}
            aufHervorgehobenerIndexAenderung={setHervorgehobenerIndex}
            aufAusgewaehlt={ausgewaehlt}
            aufNeuAnlegen={() => void neuAnlegen()}
            aufPlatzhalterAnlegen={() => void platzhalterAnlegen()}
          />
        </Formularfeld>
      ) : (
        <Text rolle="koerper" als="span">
          {gewaehlterName ?? t('ereignis_neu_weiterer_beteiligter_ausgewaehlt')}
        </Text>
      )}
      <Formularfeld beschriftung={t('ereignis_neu_weiterer_beteiligter_rolle_beschriftung')}>
        <Auswahlfeld wert={eintrag.rolle} optionen={beteiligungRolleOptionen(t)} aufAenderung={(wert) => aufAenderung({ ...eintrag, rolle: wert })} />
      </Formularfeld>
      <Schaltflaeche variante="unauffaellig" aufKlick={aufEntfernen}>
        {t('ereignis_neu_weiterer_beteiligter_entfernen')}
      </Schaltflaeche>
    </div>
  )
}

function EreignisNeuFormular({ personId }: { readonly personId: string }) {
  const { t } = useTranslation('profil')
  const ereignisAnlegen = useEreignisAnlegen()
  const ortAnlegen = useOrtAnlegen()
  const [entwurf, setEntwurf] = useState<EreignisEntwurfWerte>(EREIGNIS_ENTWURF_LEER)
  const [ortSuchtext, setOrtSuchtext] = useState('')
  const [ortHervorgehobenerIndex, setOrtHervorgehobenerIndex] = useState<number | null>(null)
  // Einstiegspunkt in die Orte-Pflege-Ansicht (AP-1.16 PR-C, docs/80_Offene_Fragen.md) — der
  // wenigst aufdringliche, tastaturerreichbare Ort: ein Link direkt am gewählten Ort dieses
  // Formulars, KEIN globaler Header-„Orte"-Eintrag (der bleibt S-35, Phase 2/3). Lokaler Zustand
  // genügt, `OrtBearbeitenAnsicht` ist eine `position: fixed`-Seitenschublade (analog `ProfilAnsicht`/
  // `Seitenschublade`) und braucht keinen Kontext eines übergeordneten Routers.
  const [ortBearbeitenOffen, setOrtBearbeitenOffen] = useState(false)
  // Reiner Zähler für React-Listenschlüssel der „weiterer Beteiligter"-Zeilen (KEINE fachliche
  // ID) — `useRef`, nicht `Math.random()`/`crypto.randomUUID()`: ein einfacher, im Renderer
  // erlaubter Zähler genügt (CLAUDE.md §4 verbietet `Math.random`/`Date.now` nur in `src/core`).
  const naechsterSchluessel = useRef(0)

  const ortSucheAktiv = ortSuchtext.trim() !== ''
  // `jdn` aus dem Ereignis-Datumstext (AP-1.16 PR-C) — die Ortsfeld-Hierarchiezeile (docs/71 §3.2)
  // braucht einen konkreten Gültigkeitszeitpunkt; ohne auflösbares Datum bleibt sie leer (kein
  // `jdn`, `exactOptionalPropertyTypes` verbietet ein explizites `jdn: undefined`).
  const ereignisJdn = ereignisEntwurfJdn(entwurf.datumText)
  const ortSucheAbfrage = useOrtSuche({ text: ortSuchtext, ...(ereignisJdn === undefined ? {} : { jdn: ereignisJdn }) }, { enabled: ortSucheAktiv })
  const ortZustand: OrtsfeldZustand = ortSucheAktiv ? (ortSucheAbfrage.isPending ? 'laedt' : 'bereit') : 'leer'
  const ortTreffer = ortSucheAbfrage.data?.treffer ?? []

  function ortAusgewaehlt(ortId: string) {
    const treffergefunden = ortTreffer.find((eintrag) => eintrag.id === ortId)
    setEntwurf({ ...entwurf, ortId, ortText: treffergefunden?.anzeigename ?? ortSuchtext })
    setOrtSuchtext(treffergefunden?.anzeigename ?? ortSuchtext)
  }

  async function ortNeuAnlegen() {
    const ergebnis = await ortAnlegen.mutateAsync(ortsfeldNeuAnlegenEin(ortSuchtext))
    setEntwurf({ ...entwurf, ortId: ergebnis.id, ortText: ortSuchtext })
  }

  function weitererBeteiligterHinzufuegen() {
    const schluessel = `weiterer-beteiligter-${naechsterSchluessel.current}`
    naechsterSchluessel.current += 1
    setEntwurf({ ...entwurf, weitereBeteiligte: [...entwurf.weitereBeteiligte, weitererBeteiligterLeer(schluessel)] })
  }

  function weitererBeteiligterAendern(naechster: WeitererBeteiligterEntwurf) {
    setEntwurf({
      ...entwurf,
      weitereBeteiligte: entwurf.weitereBeteiligte.map((eintrag) => (eintrag.schluessel === naechster.schluessel ? naechster : eintrag)),
    })
  }

  function weitererBeteiligterEntfernen(schluessel: string) {
    setEntwurf({ ...entwurf, weitereBeteiligte: entwurf.weitereBeteiligte.filter((eintrag) => eintrag.schluessel !== schluessel) })
  }

  function absenden(ereignis: FormEvent<HTMLFormElement>): void {
    ereignis.preventDefault()
    const nutzlast = ereignisAnlegenEinAusEntwurf(personId, entwurf)
    if (nutzlast === null) return
    ereignisAnlegen.mutate(nutzlast)
    setEntwurf(EREIGNIS_ENTWURF_LEER)
    setOrtSuchtext('')
  }

  return (
    <>
      <form className="wz-profil-bearbeiten-ereignisse__neu" onSubmit={absenden} aria-labelledby="wz-profil-bearbeiten-ereignisse-neu-titel">
        <Text rolle="beschriftung" als="p" id="wz-profil-bearbeiten-ereignisse-neu-titel">
          {t('ereignis_neu_ueberschrift')}
        </Text>

        <div className="wz-profil-bearbeiten-ereignisse__felder">
          <Formularfeld beschriftung={t('ereignis_neu_typ_beschriftung')}>
            <Auswahlfeld wert={entwurf.typ} optionen={ereignisTypOptionen(t)} aufAenderung={(wert) => setEntwurf({ ...entwurf, typ: wert })} />
          </Formularfeld>
          <Formularfeld beschriftung={t('ereignis_neu_datum_beschriftung')}>
            <Datumsfeld
              text={entwurf.datumText}
              aufAenderung={(wert) => setEntwurf({ ...entwurf, datumText: wert })}
              kalender={entwurf.kalender}
              aufKalenderAenderung={(wert) => setEntwurf({ ...entwurf, kalender: wert })}
              kalenderErweitert={entwurf.kalenderErweitert}
              aufKalenderErweitertAenderung={(wert) => setEntwurf({ ...entwurf, kalenderErweitert: wert })}
            />
          </Formularfeld>
          <Formularfeld beschriftung={t('ereignis_neu_ort_beschriftung')}>
            <Ortsfeld
              text={ortSuchtext}
              aufAenderung={setOrtSuchtext}
              zustand={ortZustand}
              treffer={ortTreffer}
              hervorgehobenerIndex={ortHervorgehobenerIndex}
              aufHervorgehobenerIndexAenderung={setOrtHervorgehobenerIndex}
              aufAusgewaehlt={ortAusgewaehlt}
              aufNeuAnlegen={() => void ortNeuAnlegen()}
            />
            {entwurf.ortId === null ? null : (
              <Schaltflaeche variante="unauffaellig" aufKlick={() => setOrtBearbeitenOffen(true)}>
                {t('ereignis_neu_ort_bearbeiten')}
              </Schaltflaeche>
            )}
          </Formularfeld>
          <Formularfeld beschriftung={t('ereignis_neu_konfidenz_beschriftung')}>
            <Konfidenzwaehler
              wert={entwurf.konfidenz}
              aufAenderung={(stufe) => setEntwurf({ ...entwurf, konfidenz: stufe })}
              ariaLabel={t('ereignis_neu_konfidenz_beschriftung')}
            />
          </Formularfeld>
        </div>

        <Text rolle="beschriftung" als="p">
          {t('ereignis_neu_weitere_beteiligte_ueberschrift')}
        </Text>
        {entwurf.weitereBeteiligte.map((eintrag) => (
          <WeitererBeteiligterZeile
            key={eintrag.schluessel}
            eintrag={eintrag}
            aufAenderung={weitererBeteiligterAendern}
            aufEntfernen={() => weitererBeteiligterEntfernen(eintrag.schluessel)}
          />
        ))}
        <Schaltflaeche variante="unauffaellig" aufKlick={weitererBeteiligterHinzufuegen}>
          {t('ereignis_neu_weiterer_beteiligter_hinzufuegen')}
        </Schaltflaeche>

        <Schaltflaeche variante="sekundaer" typ="submit" gesperrt={!ereignisEntwurfAbsendbar(entwurf)}>
          {t('ereignis_neu_hinzufuegen')}
        </Schaltflaeche>
      </form>
      {ortBearbeitenOffen && entwurf.ortId !== null ? (
        <OrtBearbeitenAnsicht ortId={entwurf.ortId} aufSchliessen={() => setOrtBearbeitenOffen(false)} />
      ) : null}
    </>
  )
}
