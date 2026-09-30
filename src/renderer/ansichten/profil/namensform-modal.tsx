import { useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { anzeigeArtFolge } from '../../../core/name/anzeigename'
import type { AppFehler } from '../../../shared/fehler/app-fehler'
import { NameFormRolleEnum, SchriftEnum } from '../../../shared/schemata/name'
import type { PersonDetailName } from '../../../shared/schemata/person-detail'
import { Abzeichen } from '../../bausteine/abzeichen'
import { Auswahlfeld, type AuswahlfeldOption } from '../../bausteine/auswahlfeld'
import { Formularfeld } from '../../bausteine/formularfeld'
import { Kontrollkaestchen } from '../../bausteine/kontrollkaestchen'
import { Modal } from '../../bausteine/modal'
import { Schaltflaeche } from '../../bausteine/schaltflaeche'
import { Text } from '../../bausteine/text'
import { Textfeld } from '../../bausteine/textfeld'
import { useNamensformUebernehmen } from '../../brücke/befehl-hooks'
import { NachladenKontext, wartetAufRuecknahme } from '../../brücke/nachladen-stand'
import { tabImContainerHalten } from './fokusfang'
import {
  entwurfAusForm,
  entwurfGeaendert,
  entwurfVorschau,
  formVonAussen,
  hatInhalt,
  istLeer,
  neuerEntwurf,
  rufnameSetzen,
  teilHinzufuegen,
  teilWertSetzen,
  uebernehmenEin,
  vornamenMitLeerraum,
  type NamensformEntwurf,
} from './namensform-entwurf'
import { nameTypSchluessel, schriftSchluessel } from './profil-schluessel'
import {
  NEU_ANLEGBARE_ARTEN,
  anzeigetextDerForm,
  artNummern,
  namensteilNeuSchluessel,
  namensteilSchluessel,
  reihenfolgeSchluessel,
  spracheOptionen,
  vorschauSpracheBeschriftung,
} from './reiter-namen-logik'
import './reiter-namen.css'
import './unlesbar-nachfrage.css'

export interface NamensformModalProps {
  readonly personId: string
  /** Die bearbeitete Form, `null` = „+ Namensform" (neue Form). */
  readonly formId: string | null
  /** Alle Formen der Person aus dem aktuellen Lesemodell (Stand der Form, erste Form ja/nein). */
  readonly namen: readonly PersonDetailName[]
  readonly aufSchliessen: () => void
  /** Ersatzziel für den Fokus, falls der Auslöser beim Schließen nicht mehr im Dokument hängt. */
  readonly fokusNachSchliessen?: () => HTMLElement | null
}

/** Kennung eines Teilfelds (Ziel für Fokus und Tests). Es ist immer höchstens ein Modal offen. */
export function namensteilFeldId(schluessel: string): string {
  return `namensform-teil-${schluessel}`
}

/** Ein Fehler des Befehls gilt für genau den Entwurf, mit dem übernommen wurde; jede Eingabe blendet ihn aus. */
interface EntwurfFehler {
  readonly fehler: AppFehler
  readonly entwurf: NamensformEntwurf
}

function startEntwurf(live: PersonDetailName | undefined, namen: readonly PersonDetailName[]): NamensformEntwurf {
  return (live === undefined ? null : entwurfAusForm(live)) ?? neuerEntwurf(namen.length === 0)
}

/**
 * Modal „Namensform bearbeiten" (AP-1.30 PR 11c-1, Artboard 2a, Vorgaben §3.5; docs/80 §33 V-130-11-E1, E4,
 * E8, E9): die einzige Stelle mit ausdrücklichem „Übernehmen", weil es eine zusammengesetzte Einheit
 * bearbeitet. Der Entwurf lebt nur in diesem Modal (KEIN Autosave-Hook); „Übernehmen" schreibt genau einmal
 * über `befehl:namensform.uebernehmen` mit der vollständigen Zielliste (ein Undo-Schritt). Ein unveränderter
 * Entwurf schließt ohne Aufruf.
 *
 * **Undo bei offenem Modal („Undo gewinnt"):** ⌘Z läuft im Hauptprozess und wirkt auch jetzt. Ändert sich
 * die bearbeitete Form im Lesemodell (nach `ereignis:datenGeaendert`), verwirft das Modal den Entwurf,
 * zeigt den gespeicherten Stand und sagt es — sonst schriebe „Übernehmen" das Undo still zurück. Solange
 * eine Rücknahme gemeldet, ihr Stand aber noch nicht geladen ist (`nachladen-stand.ts`), ist „Übernehmen"
 * gesperrt: der Vergleich fände die Änderung sonst zu spät. Während des eigenen Schreibens wird nicht
 * verglichen (das Echo des Übernehmens ist keine fremde Änderung). Verschwindet die Form ganz, schließt der
 * Reiter das Modal (`reiter-namen.tsx`).
 *
 * **Keine Kombinationsfelder (Review #199 H4):** Kopf-Felder und Rufname sind native Auswahlfelder, die
 * Teile Textfelder. Ein natives `<select>` schließt seine offene Liste mit Escape selbst, das Modal sieht
 * dieses Escape nicht; ein Kombinationsfeld (Orts-, Personen-, Archivfeld) behandelt Escape nicht und
 * schlösse das ganze Modal. Solange keins gebraucht wird, gibt es hier keins.
 */
export function NamensformModal({ personId, formId, namen, aufSchliessen, fokusNachSchliessen }: NamensformModalProps) {
  const { t } = useTranslation('profil')
  const { t: tFehler } = useTranslation('fehler')
  const uebernehmen = useNamensformUebernehmen()
  const nachladen = useContext(NachladenKontext)
  const stand = useSyncExternalStore(nachladen.abonnieren, nachladen.lesen, nachladen.lesen)
  const wartet = wartetAufRuecknahme(stand)
  const bestandteileId = useId()

  const live = formId === null ? undefined : namen.find((name) => name.id === formId)
  const [basisForm, setBasisForm] = useState<PersonDetailName | null>(live ?? null)
  const [basis, setBasis] = useState<NamensformEntwurf>(() => startEntwurf(live, namen))
  const [entwurf, setEntwurf] = useState<NamensformEntwurf>(basis)
  const [gesehen, setGesehen] = useState(live)
  const [vonAussen, setVonAussen] = useState(false)
  const [nachfrage, setNachfrage] = useState(false)
  const [fehler, setFehler] = useState<EntwurfFehler | null>(null)
  const [naechsteNr, setNaechsteNr] = useState(1)
  const [fokusZiel, setFokusZiel] = useState<string | null>(null)

  // Änderung der Form von außen: Zustand während des Renderns anpassen (Muster
  // `useEntwurfMitVerzoegertemCommit`), kein Effekt — sonst stünde einen Rendervorgang lang der alte Entwurf da.
  const schreibt = uebernehmen.isPending || uebernehmen.isSuccess
  if (live !== gesehen) {
    setGesehen(live)
    const neu = live === undefined || schreibt || formVonAussen(basisForm, live) !== 'geaendert' ? null : entwurfAusForm(live)
    if (live !== undefined && neu !== null) {
      setBasisForm(live)
      setBasis(neu)
      setEntwurf(neu)
      setVonAussen(true)
      setNachfrage(false)
      setFehler(null)
    }
  }

  useEffect(() => {
    if (fokusZiel !== null) document.getElementById(namensteilFeldId(fokusZiel))?.focus()
  }, [fokusZiel])

  const geaendert = entwurfGeaendert(basis, entwurf)
  const aktiverFehler = fehler !== null && fehler.entwurf === entwurf ? fehler.fehler : null
  const fehlertext = aktiverFehler === null ? null : t('name_fehler', { titel: tFehler(`${aktiverFehler.code}.titel`), was_tun: tFehler(`${aktiverFehler.code}.was_tun`) })
  const leerraumFelder = aktiverFehler?.code === 'VALIDIERUNG_NAMENSTEIL_LEERRAUM' ? vornamenMitLeerraum(basis, entwurf) : []
  const amRufnamen = aktiverFehler?.code === 'VALIDIERUNG_RUFNAME_KEIN_VORNAME' || aktiverFehler?.code === 'VALIDIERUNG_RUFNAME_VERDOPPELT'
  const allgemein = fehlertext !== null && leerraumFelder.length === 0 && !amRufnamen ? fehlertext : null
  const gesperrt = wartet || schreibt || (entwurf.formId === null && !hatInhalt(entwurf))
  // Umschrift (rolle NULL): Bezug nur anzeigen, keine Rollenwahl, kein Hauptname-Schalter. Ob eine Umschrift
  // Hauptname sein darf, entscheidet keine Regel (`hauptname.wechseln` prüft es nicht, keine Invariante) —
  // im Zweifel ausgeblendet, wie „Als Hauptname" auf ihrer Karte (docs/80 §33 V-130-11c-1).
  const umschrift = basis.rolle === null
  const ursprung = umschrift && basis.umschriftVon !== null ? namen.find((name) => name.id === basis.umschriftVon) : undefined

  function abbrechen(): void {
    if (entwurfGeaendert(basis, entwurf)) setNachfrage(true)
    else aufSchliessen()
  }

  function uebernehmenKlick(): void {
    if (gesperrt) return
    if (!geaendert) {
      aufSchliessen()
      return
    }
    const angewendet = entwurf
    uebernehmen.mutate(uebernehmenEin(personId, basis, angewendet), {
      onSuccess: () => aufSchliessen(),
      onError: (grund) => setFehler({ fehler: grund, entwurf: angewendet }),
    })
  }

  function teilNeu(art: (typeof NEU_ANLEGBARE_ARTEN)[number]): void {
    const schluessel = `neu-${naechsteNr}`
    setNaechsteNr(naechsteNr + 1)
    setEntwurf(teilHinzufuegen(entwurf, art, schluessel))
    setFokusZiel(schluessel)
  }

  // Zeilen in Anzeigefolge (Wortfolge des Kerns); innerhalb einer Art in Entwurfsfolge (= Zielfolge).
  const folge = anzeigeArtFolge(entwurf.reihenfolge)
  const zeilen = [...entwurf.teile].sort((a, b) => folge.indexOf(a.art) - folge.indexOf(b.art))
  const nummern = artNummern(zeilen)
  const vornamen = entwurf.teile.filter((eintrag) => eintrag.art === 'vorname' && !istLeer(eintrag))
  const rufnameWert = vornamen.some((eintrag) => eintrag.schluessel === entwurf.rufname) && entwurf.rufname !== null ? entwurf.rufname : ''

  const rolleOptionen: readonly AuswahlfeldOption<(typeof NameFormRolleEnum.options)[number]>[] = NameFormRolleEnum.options.map((rolle) => ({
    wert: rolle,
    beschriftung: t(nameTypSchluessel(rolle)),
  }))
  const sprachOptionen: readonly AuswahlfeldOption<string>[] = [
    { wert: '', beschriftung: t('sprache_unbestimmt') },
    ...spracheOptionen(basis.sprache).map((sprache) => ({ wert: sprache, beschriftung: vorschauSpracheBeschriftung(sprache, t) })),
  ]
  const schriftOptionen: readonly AuswahlfeldOption<'' | (typeof SchriftEnum.options)[number]>[] = [
    { wert: '', beschriftung: t('schrift_unbestimmt') },
    ...SchriftEnum.options.map((schrift) => ({ wert: schrift, beschriftung: t(schriftSchluessel(schrift)) })),
  ]
  const reihenfolgeOptionen: readonly AuswahlfeldOption<'' | 'vorname_zuerst' | 'nachname_zuerst'>[] = [
    { wert: '', beschriftung: t(reihenfolgeSchluessel(null)) },
    { wert: 'vorname_zuerst', beschriftung: t(reihenfolgeSchluessel('vorname_zuerst')) },
    { wert: 'nachname_zuerst', beschriftung: t(reihenfolgeSchluessel('nachname_zuerst')) },
  ]
  const rufnameOptionen: readonly AuswahlfeldOption<string>[] = [
    { wert: '', beschriftung: t('name_rufname_unbestimmt') },
    ...vornamen.map((eintrag) => ({ wert: eintrag.schluessel, beschriftung: eintrag.wert.trim() })),
  ]

  return (
    <Modal
      titel={t(formId === null ? 'namensform_modal_neu' : 'namensform_modal_bearbeiten')}
      offen
      beiSchliessen={abbrechen}
      {...(fokusNachSchliessen === undefined ? {} : { fokusNachSchliessen })}
      fussaktionen={
        <>
          <span className="wz-namensform-modal__vorschau" aria-live="polite">
            <span className="wz-namensform-modal__vorschau-beschriftung">{t('namensform_vorschau')}</span>
            <span className="wz-namensform-modal__vorschau-text">{entwurfVorschau(entwurf)}</span>
          </span>
          <Schaltflaeche variante="sekundaer" aufKlick={abbrechen}>
            {t('namensform_abbrechen')}
          </Schaltflaeche>
          <Schaltflaeche variante="primaer" gesperrt={gesperrt} ladend={uebernehmen.isPending} aufKlick={uebernehmenKlick}>
            {t('namensform_uebernehmen')}
          </Schaltflaeche>
        </>
      }
    >
      {vonAussen ? (
        <p className="wz-namensform-modal__hinweis" role="status">
          {t('namensform_von_aussen')}
        </p>
      ) : null}
      {umschrift ? (
        <p className="wz-namensform-modal__umschrift">
          <Abzeichen variante={ursprung === undefined ? 'warnung' : 'neutral'}>
            {ursprung === undefined ? t('namensform_umschrift_ohne_ursprung') : t('namensform_umschrift_von', { name: anzeigetextDerForm(ursprung) })}
          </Abzeichen>
        </p>
      ) : null}
      <div className="wz-namensform-modal__kopf-felder">
        {entwurf.rolle === null ? null : (
          <Formularfeld beschriftung={t('name_typ_beschriftung')}>
            <Auswahlfeld wert={entwurf.rolle} optionen={rolleOptionen} aufAenderung={(rolle) => setEntwurf({ ...entwurf, rolle })} />
          </Formularfeld>
        )}
        <Formularfeld beschriftung={t('sprache_beschriftung')}>
          <Auswahlfeld wert={entwurf.sprache ?? ''} optionen={sprachOptionen} aufAenderung={(sprache) => setEntwurf({ ...entwurf, sprache: sprache === '' ? null : sprache })} />
        </Formularfeld>
        <Formularfeld beschriftung={t('name_schrift_beschriftung')}>
          <Auswahlfeld wert={entwurf.schrift ?? ''} optionen={schriftOptionen} aufAenderung={(schrift) => setEntwurf({ ...entwurf, schrift: schrift === '' ? null : schrift })} />
        </Formularfeld>
        <Formularfeld beschriftung={t('reihenfolge_beschriftung')}>
          <Auswahlfeld
            wert={entwurf.reihenfolge ?? ''}
            optionen={reihenfolgeOptionen}
            aufAenderung={(reihenfolge) => setEntwurf({ ...entwurf, reihenfolge: reihenfolge === '' ? null : reihenfolge })}
          />
        </Formularfeld>
      </div>

      <div role="group" aria-labelledby={bestandteileId} className="wz-namensform-modal__bestandteile">
        <Text rolle="beschriftung" als="span" id={bestandteileId}>
          {t('namensform_bestandteile')}
        </Text>
        {zeilen.map((zeile, index) => {
          const nummer = nummern[index] ?? null
          const art = t(namensteilSchluessel(zeile.art))
          const beschriftung = nummer === null ? art : t('namensteil_nummeriert', { art, nummer: String(nummer) })
          const amFeld = leerraumFelder.includes(zeile.schluessel) && fehlertext !== null ? { fehlertext } : {}
          return (
            <Formularfeld key={zeile.schluessel} beschriftung={beschriftung} {...(istLeer(zeile) ? { hilfetext: t('namensteil_leer_hinweis') } : {})} {...amFeld}>
              <Textfeld id={namensteilFeldId(zeile.schluessel)} wert={zeile.wert} ungueltig={'fehlertext' in amFeld} aufAenderung={(wert) => setEntwurf(teilWertSetzen(entwurf, zeile.schluessel, wert))} />
            </Formularfeld>
          )
        })}
        <div className="wz-namensform-modal__neu">
          {NEU_ANLEGBARE_ARTEN.map((art) => (
            <Schaltflaeche key={art} variante="sekundaer" aufKlick={() => teilNeu(art)}>
              {t(namensteilNeuSchluessel(art))}
            </Schaltflaeche>
          ))}
        </div>
        <Formularfeld beschriftung={t('name_rufname_beschriftung')} {...(amRufnamen && fehlertext !== null ? { fehlertext } : {})}>
          <Auswahlfeld wert={rufnameWert} optionen={rufnameOptionen} aufAenderung={(wert) => setEntwurf(rufnameSetzen(entwurf, wert === '' ? null : wert))} />
        </Formularfeld>
      </div>

      {umschrift ? null : (
      <div className="wz-namensform-modal__hauptname">
        <label className="wz-namensform-modal__hauptname-zeile">
          <Kontrollkaestchen
            zustand={entwurf.hauptname ? 'ein' : 'aus'}
            bezeichnung={t('namensform_hauptname_schalter')}
            gesperrt={basis.hauptname}
            aufAenderung={(zustand) => setEntwurf({ ...entwurf, hauptname: zustand === 'ein' })}
          />
          <Text rolle="koerper" als="span">
            {t('namensform_hauptname_schalter')}
          </Text>
        </label>
        {basis.hauptname && basis.formId !== null ? (
          <Text rolle="hilfe" als="p">
            {t('namensform_hauptname_bleibt')}
          </Text>
        ) : null}
      </div>
      )}

      {allgemein === null ? null : (
        <p className="wz-namensform-modal__fehler" role="alert">
          {allgemein}
        </p>
      )}

      {nachfrage ? <VerwerfenNachfrage aufWeiter={() => setNachfrage(false)} aufVerwerfen={aufSchliessen} /> : null}
    </Modal>
  )
}

interface VerwerfenNachfrageProps {
  readonly aufWeiter: () => void
  readonly aufVerwerfen: () => void
}

/**
 * Nachfrage beim Abbrechen mit geändertem Entwurf (V-130-11-E9), Muster „Datum nicht lesbar"
 * (`unlesbar-nachfrage.tsx`, dieselben Klassen): `alertdialog`, Fokus auf der sicheren Wahl „Weiter
 * bearbeiten", Tab bleibt in der Nachfrage, Escape wirkt wie „Weiter bearbeiten" und schließt nicht das
 * Modal dahinter. Beim Schließen kehrt der Fokus dorthin zurück, wo er vorher stand.
 */
function VerwerfenNachfrage({ aufWeiter, aufVerwerfen }: VerwerfenNachfrageProps) {
  const { t } = useTranslation('profil')
  const titelId = useId()
  const textId = useId()
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const vorher = document.activeElement
    containerRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => {
      if (vorher instanceof HTMLElement && vorher.isConnected) vorher.focus()
    }
  }, [])

  function tastendruck(ereignis: KeyboardEvent<HTMLDivElement>) {
    if (ereignis.key === 'Escape') {
      ereignis.stopPropagation()
      aufWeiter()
      return
    }
    if (ereignis.key === 'Tab') {
      tabImContainerHalten(ereignis, containerRef.current)
      ereignis.stopPropagation()
    }
  }

  return (
    <div className="wz-unlesbar-nachfrage">
      <div ref={containerRef} role="alertdialog" aria-modal="true" aria-labelledby={titelId} aria-describedby={textId} className="wz-unlesbar-nachfrage__karte" onKeyDown={tastendruck}>
        <Text rolle="titel-klein" als="h2" id={titelId}>
          {t('namensform_nachfrage_titel')}
        </Text>
        <Text rolle="koerper" als="p" id={textId}>
          {t('namensform_nachfrage_text')}
        </Text>
        <div className="wz-unlesbar-nachfrage__aktionen">
          <Schaltflaeche variante="primaer" aufKlick={aufWeiter}>
            {t('namensform_nachfrage_weiter')}
          </Schaltflaeche>
          <Schaltflaeche variante="unauffaellig" aufKlick={aufVerwerfen}>
            {t('namensform_nachfrage_verwerfen')}
          </Schaltflaeche>
        </div>
      </div>
    </div>
  )
}
