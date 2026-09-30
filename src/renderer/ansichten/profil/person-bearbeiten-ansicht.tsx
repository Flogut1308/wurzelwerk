import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { kennungAnzeige } from '../../../core/person/kennung'
import type { EditorFeld } from '../../../core/person/offene-punkte'
import { REITER, type ReiterId } from '../../../core/person/reiter'
import { reiterZaehler } from '../../../core/person/reiter-zaehler'
import type { KontexttasteNutzlast } from '../../../shared/ipc/vertrag'
import { reiterZaehlerEingabeAus, type PersonDetailAus, type PersonDetailKopf } from '../../../shared/schemata/person-detail'
import { usePersonDetail } from '../../brücke/abfrage-hooks'
import { useKontexttasteAbo } from '../../brücke/befehl-hooks'
import { SchreibBeobachterKontext } from '../../brücke/schreib-beobachter'
import { LeerzustandBlock } from '../../bausteine/leerzustand-block'
import { personennameIstErsatz, personennameText } from '../../bausteine/personenname-anzeige'
import { Reiterleiste, reiterElementId, reiterInhaltId, type ReiterleisteReiter } from '../../bausteine/reiterleiste'
import { Schaltflaeche } from '../../bausteine/schaltflaeche'
import { SchaltflaecheSymbol } from '../../bausteine/schaltflaeche-symbol'
import { Speicherstatus } from '../../bausteine/speicherstatus'
import { Text } from '../../bausteine/text'
import { editorFeldId } from './editor-feld-id'
import { EditorRechteSpalte } from './editor-rechte-spalte'
import { sprungzielElement } from './editor-rechte-spalte-logik'
import { useEditorSpeicherstatus, type EditorSpeicherstatus } from './editor-speicherstatus'
import { tabImContainerHalten } from './fokusfang'
import { darfKontexttasteWirken } from './kontexttaste-logik'
import { EreignisseBearbeitenAbschnitt } from './profil-bearbeiten-ereignisse'
import { NamenBearbeitenAbschnitt } from './profil-bearbeiten-namen'
import { NotizBearbeitenAbschnitt } from './profil-bearbeiten-notiz'
import { reiterSchluessel } from './profil-schluessel'
import { NamenVorschau } from './reiter-namen-vorschau'
import { ReiterPerson } from './reiter-person'
import { UnlesbarNachfrage } from './unlesbar-nachfrage'
import { UnlesbareEingabenKontext, useUnlesbareEingaben, type UnlesbareEingabe } from './unlesbare-eingaben'
import { ProfilFehler, ProfilLaedt } from './profil-zustaende'
import './profil-ansicht.css'
import './person-bearbeiten-ansicht.css'

export interface PersonBearbeitenAnsichtProps {
  readonly personId: string
  /** „Fertig" und Escape: zurück in die Lesesicht derselben Person. */
  readonly aufFertig: () => void
  /** Schließen im Personenkopf: die ganze Personen-Überlagerung schließen (zurück zur Liste). */
  readonly aufSchliessen: () => void
}

/** Präfix der Element-IDs von Reitern und Inhaltsbereich (`Reiterleiste`). */
const ID_PRAEFIX = 'person-bearbeiten'

/** Was der Nutzer tun wollte, als die Nachfrage „Datum nicht lesbar" kam (U-130-9b-unlesbar). */
type Verlassen =
  | { readonly art: 'fertig' }
  | { readonly art: 'schliessen' }
  | { readonly art: 'reiter'; readonly reiter: ReiterId }
  | { readonly art: 'sprung'; readonly reiter: ReiterId; readonly feld: EditorFeld }
  /** Aktion im Reiter, die nur die Felder `feldIds` aushängt (hueter #167 H1, Tod-Gruppe ausblenden). */
  | { readonly art: 'aktion'; readonly aktion: () => void; readonly feldIds: readonly string[] }

/** Offene Nachfrage: die angefragte Aktion und die in dieser Nachfrage schon behandelten Felder. */
interface OffeneNachfrage {
  readonly verlassen: Verlassen
  readonly erledigt: readonly string[]
}

/** `Reiterleiste` erwartet DOM-taugliche Kennungen aus Buchstaben, Ziffern und `-`; die Reiter-IDs
 * des Kerns tragen `_` (`belege_medien`). Umkehrbar, weil keine Kern-ID ein `-` enthält. */
function reiterDomId(reiter: ReiterId): string {
  return reiter.replace(/_/g, '-')
}

function reiterAusDomId(domId: string): ReiterId | undefined {
  return REITER.find((reiter) => reiterDomId(reiter) === domId)
}

/**
 * `PersonBearbeitenAnsicht` (AP-1.30 PR 7b, Artboard 1a, docs/80 §33 V-130-7-ansicht) — der Editor
 * als eigene Ansicht statt eines Zustands der Profilseite (ersetzt U-1.14a-struktur-colocation für
 * den Editor). Einstieg „Bearbeiten" in der Lesesicht, „Fertig" führt dorthin zurück. Derselbe
 * `usePersonDetail`-Schlüssel wie die Lesesicht: ein Cache, kein zweiter Datenweg; geschrieben wird
 * ausschließlich über die Befehle der einzelnen Abschnitte (CLAUDE.md §2).
 *
 * **Reiter:** die acht aus `src/core/person/reiter.ts`, Zähler und Punkt aus
 * `reiterZaehler(reiterZaehlerEingabeAus(detail))`. Beim Öffnen steht immer „Person" oben, die Wahl
 * lebt nur in dieser Instanz (nicht gemerkt, Abnahme AP-1.30). Nur der aktive Reiter wird gerendert
 * (`key` am Inhaltsbereich): ein Wechsel hängt den alten Inhalt aus, der Unmount-Flush des Debounce
 * (`profil-bearbeiten-debounce.ts`) schreibt einen noch ausstehenden Entwurf sofort — „Reiterwechsel
 * speichert, hält nichts zurück".
 *
 * **Vorläufige Anordnung (CLAUDE.md §14):** die bisherigen Bearbeiten-Abschnitte stehen in ihrem
 * Reiter — Namen → „Namen", Geschlecht/Platzhalter → „Person", Ereignisse → „Leben", Notiz →
 * „Notizen". Seit PR 9b trägt „Person" zusätzlich Lebensstatus, Geburt und Tod (`ReiterPerson`). Beziehungen, Belege & Medien, Gesundheit und Verwaltung zeigen bis zu ihren
 * Inhalts-PRs einen Leerzustand mit Verweis auf das Profil, das diese Angaben weiter zeigt.
 *
 * **Fokus:** beim Öffnen auf den aktiven Reiter (Pfeiltasten wechseln sofort); die Rückgabe an die
 * Listenzeile beim endgültigen Schließen besorgt `ProfilAnsicht` (eine Stelle für die ganze
 * Überlagerung). Escape und Tab-Fang wie in der Lesesicht; eine offene Schublade im Inhalt fängt
 * ihr Escape selbst ab (`Seitenschublade`).
 */
export function PersonBearbeitenAnsicht({ personId, aufFertig, aufSchliessen }: PersonBearbeitenAnsichtProps) {
  const { t } = useTranslation('profil')
  const { t: tAllgemein } = useTranslation('allgemein')
  const abfrage = usePersonDetail({ personId })
  const [aktiv, setAktiv] = useState<ReiterId>('person')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const speicherstatus = useEditorSpeicherstatus()
  const unlesbare = useUnlesbareEingaben((feldIds, aktion) => verlassenMitNachfrage({ art: 'aktion', aktion, feldIds }))
  const [nachfrage, setNachfrage] = useState<OffeneNachfrage | null>(null)
  /** Letzter Sprung aus der rechten Spalte (neues Objekt je Klick, auch auf denselben Punkt). */
  const [sprung, setSprung] = useState<{ readonly reiter: ReiterId; readonly feld: EditorFeld } | null>(null)

  // Sprung zu einem offenen Punkt (AP-1.30 PR 8): nach dem Rendern des gewählten Reiters das Feld
  // fokussieren (`editorFeldId`), sonst den Inhaltsbereich (`tabpanel`, tabIndex 0). Ein Effekt statt
  // eines direkten `focus()` im Klick, weil der neue Reiterinhalt erst mit dem nächsten Rendern da ist.
  useEffect(() => {
    if (sprung === null) return
    const ziel = sprungzielElement(editorFeldId(ID_PRAEFIX, sprung.feld), reiterInhaltId(ID_PRAEFIX, reiterDomId(sprung.reiter)), (id) =>
      document.getElementById(id),
    )
    ziel?.focus()
  }, [sprung])

  /** Reiter wählen und den Fokus auf ihn setzen (wie Pfeiltasten in der `Reiterleiste`): ein
   * fokussierter Knopf im alten Inhalt hängt beim Wechsel aus, der Fokus ginge sonst verloren. */
  const reiterWaehlen = useCallback((reiter: ReiterId) => {
    setAktiv(reiter)
    containerRef.current?.querySelector<HTMLElement>(`#${reiterElementId(ID_PRAEFIX, reiterDomId(reiter))}`)?.focus()
  }, [])

  function ausfuehren(verlassen: Verlassen): void {
    switch (verlassen.art) {
      case 'fertig':
        aufFertig()
        return
      case 'schliessen':
        aufSchliessen()
        return
      case 'reiter':
        reiterWaehlen(verlassen.reiter)
        return
      case 'sprung':
        setAktiv(verlassen.reiter)
        setSprung({ reiter: verlassen.reiter, feld: verlassen.feld })
        return
      case 'aktion':
        verlassen.aktion()
        return
    }
  }

  /** Die Felder, die `verlassen` aushängt und die noch nicht behandelt sind. */
  function betroffen(verlassen: Verlassen, erledigt: readonly string[]): readonly UnlesbareEingabe[] {
    return unlesbare.eingaben.filter(
      (eingabe) => !erledigt.includes(eingabe.feldId) && (verlassen.art !== 'aktion' || verlassen.feldIds.includes(eingabe.feldId)),
    )
  }

  /**
   * U-130-9b-unlesbar (Entscheidung B): hält ein Feld einen unlesbaren, ungespeicherten Datumstext,
   * wird vor dem Verlassen nachgefragt — sonst sofort ausgeführt. Ein Sprung innerhalb des Reiters
   * Person hängt kein Feld aus, darum ohne Nachfrage; Aktionen im Reiter, die Felder aushängen
   * (Tod-Gruppe ausblenden), kommen als `art: 'aktion'` mit ihren Feldern (hueter #167 H1). `erledigt`: in dieser
   * Nachfrage schon verworfene/gespeicherte Felder (ihre Abmeldung folgt erst mit dem nächsten Rendern).
   */
  function verlassenMitNachfrage(verlassen: Verlassen, erledigt: readonly string[] = []): void {
    const bleibt = (verlassen.art === 'reiter' || verlassen.art === 'sprung') && verlassen.reiter === aktiv
    if (bleibt || betroffen(verlassen, erledigt).length === 0) {
      setNachfrage(null)
      ausfuehren(verlassen)
      return
    }
    setNachfrage({ verlassen, erledigt })
  }

  const offeneEingabe = nachfrage === null ? undefined : betroffen(nachfrage.verlassen, nachfrage.erledigt)[0]

  const zuOffenemPunkt = (reiter: ReiterId, feld: EditorFeld) => verlassenMitNachfrage({ art: 'sprung', reiter, feld })

  useEffect(() => {
    const knoten = containerRef.current
    if (knoten === null) return
    const aktiverReiter = knoten.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    ;(aktiverReiter ?? knoten).focus()
    // Bewusst leere Abhängigkeitsliste: der Fokus wird genau einmal beim Einhängen gesetzt — ein
    // späteres Neuladen der Daten (z. B. nach `ereignis:datenGeaendert`) darf ihn nicht aus einem
    // Feld reißen, in dem gerade getippt wird.
  }, [])

  // Tasten 1…8 (AP-1.30 PR 7c, V-130-7-tasten): der Hauptprozess meldet die Ziffer, ohne sie zu
  // blockieren; hier wirkt sie nur außerhalb von Eingabeelementen und ohne offene Schublade. Der
  // Fokus folgt auf den gewählten Reiter (wie bei Pfeiltasten in der `Reiterleiste`) — auch, weil ein
  // fokussierter Knopf im alten Inhalt beim Wechsel aushängt und der Fokus sonst verloren ginge.
  // Über einen Ref: das Abo bleibt stabil, die Nachfrage sieht trotzdem den aktuellen Stand.
  const verlassenRef = useRef(verlassenMitNachfrage)
  useEffect(() => {
    verlassenRef.current = verlassenMitNachfrage
  })
  const kontexttaste = useCallback((taste: KontexttasteNutzlast) => {
    const knoten = containerRef.current
    const reiter = REITER[taste.reiterIndex]
    if (knoten === null || reiter === undefined) return
    if (!darfKontexttasteWirken(knoten, document)) return
    const reiterElement = knoten.querySelector<HTMLElement>(`#${reiterElementId(ID_PRAEFIX, reiterDomId(reiter))}`)
    // Ohne Reiterleiste (Laden, Fehler) gibt es nichts zu wählen.
    if (reiterElement === null) return
    verlassenRef.current({ art: 'reiter', reiter })
  }, [])
  useKontexttasteAbo(kontexttaste)

  function tastendruck(ereignis: KeyboardEvent<HTMLDivElement>) {
    if (ereignis.key === 'Escape') {
      ereignis.stopPropagation()
      verlassenMitNachfrage({ art: 'fertig' })
      return
    }
    tabImContainerHalten(ereignis, containerRef.current)
  }

  const name = abfrage.isSuccess ? personennameText(abfrage.data.kopf, tAllgemein) : null

  return (
    <SchreibBeobachterKontext.Provider value={speicherstatus.beobachter}>
      <UnlesbareEingabenKontext.Provider value={unlesbare.melder}>
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-label={t('bearbeiten_ansicht_titel')}
          tabIndex={-1}
          className="wz-person-bearbeiten"
          onKeyDown={tastendruck}
        >
          <header className="wz-person-bearbeiten__appleiste">
            <nav aria-label={t('brotkrume_beschriftung')}>
              <ol className="wz-person-bearbeiten__brotkrume">
                <li className="wz-person-bearbeiten__brotkrume-eintrag">
                  <Text rolle="titel-klein" als="span">
                    {t('brotkrume_app')}
                  </Text>
                </li>
                <li className="wz-person-bearbeiten__brotkrume-eintrag">
                  <Text rolle="koerper-klein" farbe="sekundaer" als="span">
                    {t('brotkrume_personen')}
                  </Text>
                </li>
                {name === null ? null : (
                  <li className="wz-person-bearbeiten__brotkrume-eintrag" aria-current="page">
                    <Text rolle="koerper-klein" als="span">
                      {name}
                    </Text>
                  </li>
                )}
              </ol>
            </nav>
          </header>

          {abfrage.isPending ? (
            <div className="wz-person-bearbeiten__koerper">
              <ProfilLaedt />
            </div>
          ) : null}
          {abfrage.isError && abfrage.error !== null ? (
            <div className="wz-person-bearbeiten__koerper">
              <ProfilFehler code={abfrage.error.code} />
            </div>
          ) : null}
          {abfrage.isSuccess ? (
            <>
              <PersonenKopf
                kopf={abfrage.data.kopf}
                speicherstatus={speicherstatus}
                unlesbar={unlesbare.eingaben.length > 0}
                aufSchliessen={() => verlassenMitNachfrage({ art: 'schliessen' })}
              />
              <Reiterleiste
                idPraefix={ID_PRAEFIX}
                beschriftung={t('reiterleiste_beschriftung')}
                reiter={reiterleisteReiter(abfrage.data, (reiter) => t(reiterSchluessel(reiter)))}
                aktiv={reiterDomId(aktiv)}
                aufWechsel={(domId) => {
                  const reiter = reiterAusDomId(domId)
                  if (reiter !== undefined) verlassenMitNachfrage({ art: 'reiter', reiter })
                }}
              />
              <div className="wz-person-bearbeiten__koerper-reihe">
                <div className="wz-person-bearbeiten__koerper">
                  <div
                    key={aktiv}
                    role="tabpanel"
                    id={reiterInhaltId(ID_PRAEFIX, reiterDomId(aktiv))}
                    aria-labelledby={reiterElementId(ID_PRAEFIX, reiterDomId(aktiv))}
                    tabIndex={0}
                    className="wz-person-bearbeiten__inhalt"
                  >
                    <ReiterInhalt
                      reiter={aktiv}
                      personId={personId}
                      daten={abfrage.data}
                      aufSprung={zuOffenemPunkt}
                      aufReiterWechsel={(reiter) => verlassenMitNachfrage({ art: 'reiter', reiter })}
                    />
                  </div>
                </div>
                <EditorRechteSpalte personId={personId} daten={abfrage.data} aufSprung={zuOffenemPunkt} />
              </div>
            </>
          ) : null}

          <footer className="wz-person-bearbeiten__fussleiste">
            <Text rolle="technisch" farbe="tertiaer" als="span">
              {t('bearbeitungsstatus_hinweis')}
            </Text>
            <Schaltflaeche variante="primaer" aufKlick={() => verlassenMitNachfrage({ art: 'fertig' })}>
              {t('fertig')}
            </Schaltflaeche>
          </footer>

          {nachfrage === null || offeneEingabe === undefined ? null : (
            <UnlesbarNachfrage
              key={offeneEingabe.feldId}
              eingabe={offeneEingabe}
              aufZurueck={() => {
                setNachfrage(null)
                document.getElementById(offeneEingabe.feldId)?.focus()
              }}
              aufVerwerfen={() => {
                offeneEingabe.verwerfen()
                verlassenMitNachfrage(nachfrage.verlassen, [...nachfrage.erledigt, offeneEingabe.feldId])
              }}
              aufAlsEtwa={() => {
                offeneEingabe.alsEtwaSpeichern()
                verlassenMitNachfrage(nachfrage.verlassen, [...nachfrage.erledigt, offeneEingabe.feldId])
              }}
            />
          )}
        </div>
      </UnlesbareEingabenKontext.Provider>
    </SchreibBeobachterKontext.Provider>
  )
}

/** Reiter in fester Reihenfolge mit Zähler (nur wo der Reiter zählt) und Punkt. */
function reiterleisteReiter(daten: PersonDetailAus, beschriftung: (reiter: ReiterId) => string): readonly ReiterleisteReiter[] {
  const zaehler = reiterZaehler(reiterZaehlerEingabeAus(daten))
  return REITER.map((reiter) => {
    const eintrag = zaehler[reiter]
    return {
      id: reiterDomId(reiter),
      beschriftung: beschriftung(reiter),
      ...(eintrag.anzahl === undefined ? {} : { anzahl: eintrag.anzahl }),
      offenerPunkt: eintrag.offenerPunkt,
    }
  })
}

interface PersonenKopfProps {
  readonly kopf: PersonDetailKopf
  readonly speicherstatus: EditorSpeicherstatus
  /** Ein Feld hält einen nicht auflösbaren, ungespeicherten Datumstext (U-130-9b-unlesbar). */
  readonly unlesbar: boolean
  readonly aufSchliessen: () => void
}

/** Fester Personenkopf (Artboard 1a): Anzeigename über `personennameText`, Kennung, Speicherstatus,
 * Schließen. Lebensspanne, Status und Kurzbeschreibung kommen mit ihren eigenen PRs. */
function PersonenKopf({ kopf, speicherstatus, unlesbar, aufSchliessen }: PersonenKopfProps) {
  const { t } = useTranslation('profil')
  const { t: tAllgemein } = useTranslation('allgemein')
  return (
    <div className="wz-person-bearbeiten__kopf">
      <div className="wz-person-bearbeiten__kopf-text">
        <Text rolle="titel" farbe={personennameIstErsatz(kopf) ? 'tertiaer' : 'primaer'} als="h1">
          {personennameText(kopf, tAllgemein)}
        </Text>
        <Text rolle="technisch" farbe="tertiaer" als="span">
          {kennungAnzeige(kopf.kennung)}
        </Text>
      </div>
      <KopfSpeicherstatus status={speicherstatus} unlesbar={unlesbar} />
      <SchaltflaecheSymbol name="x" variante="unauffaellig" beschriftung={t('schliessen')} aufKlick={aufSchliessen} />
    </div>
  )
}

/**
 * Speicherstatus im Kopf (AP-1.30 PR 7c, V-130-7-speicherfehler): erst ab dem ersten Schreibvorgang
 * dieses Editors (vorher kein Ruhezustand, V-130-6-bausteine); danach gespeichert / speichert /
 * Fehler mit „erneut versuchen". Der Fehler bleibt, bis dasselbe Feld erfolgreich geschrieben ist.
 *
 * U-130-9b-unlesbar: hält ein Feld einen unlesbaren, ungespeicherten Datumstext, steht „Nicht
 * gespeichert — Datum nicht lesbar" — auch vor dem ersten Schreiben. Ein Schreibfehler geht vor
 * (er trägt die Aktion „erneut versuchen"); beides ist „nicht gespeichert".
 */
function KopfSpeicherstatus({ status, unlesbar }: { readonly status: EditorSpeicherstatus; readonly unlesbar: boolean }) {
  const anzeige = status.anzeige
  const zeigeUnlesbar = unlesbar && anzeige.zustand !== 'fehler'
  if (anzeige.zustand === 'ruhe' && !zeigeUnlesbar) return null
  return (
    <div className="wz-person-bearbeiten__kopf-speicherstatus">
      {zeigeUnlesbar ? (
        <Speicherstatus zustand="unlesbar" />
      ) : anzeige.zustand === 'gespeichert' ? (
        <Speicherstatus zustand="gespeichert" gespeichertUm={anzeige.gespeichertUm} jetzt={status.jetzt} />
      ) : anzeige.zustand === 'speichert' ? (
        <Speicherstatus zustand="speichert" />
      ) : (
        <Speicherstatus zustand="fehler" aufErneutVersuchen={status.erneutVersuchen} />
      )}
    </div>
  )
}

interface ReiterInhaltProps {
  readonly reiter: ReiterId
  readonly personId: string
  readonly daten: PersonDetailAus
  /** Sprung in einen Reiter und auf ein Feld (dieselbe Mechanik wie die rechte Spalte). */
  readonly aufSprung: (reiter: ReiterId, feld: EditorFeld) => void
  /** Reiterwechsel aus einem Reiter heraus (PR 9c: Verweis in den Reiter „Namen"), wie die Reiterleiste. */
  readonly aufReiterWechsel: (reiter: ReiterId) => void
}

function ReiterInhalt({ reiter, personId, daten, aufSprung, aufReiterWechsel }: ReiterInhaltProps) {
  switch (reiter) {
    case 'person':
      return <ReiterPerson personId={personId} daten={daten} idPraefix={ID_PRAEFIX} aufSprung={aufSprung} aufReiterWechsel={aufReiterWechsel} />
    case 'namen':
      // AP-1.30 PR 11b: die Vorschau steht über der (noch flachen) Namensmaske; beide lesen dieselben
      // `daten.namen`. Liste und Modal ersetzen die Maske in 11c-1 (V-130-11-zuschnitt).
      return (
        <>
          <NamenVorschau namen={daten.namen} istPlatzhalter={daten.kopf.ist_platzhalter} />
          <NamenBearbeitenAbschnitt personId={personId} namen={daten.namen} />
        </>
      )
    case 'leben':
      return <EreignisseBearbeitenAbschnitt personId={personId} ereignisse={daten.ereignisse} />
    case 'notizen':
      return <NotizBearbeitenAbschnitt personId={personId} notiz={daten.notiz} />
    case 'beziehungen':
    case 'belege_medien':
    case 'gesundheit':
    case 'verwaltung':
      return <ReiterSpaeter reiter={reiter} />
  }
}

/** Leerzustand eines Reiters, dessen Inhalt ein späterer PR bringt (Muster „leer" der
 * Zustandsbibliothek). Keine Funktion geht verloren: die Lesesicht zeigt diese Angaben weiter — außer
 * „Verwaltung“, deren Inhalte (Herkunft, Verlauf, Löschen) es noch nirgends gibt; dort ein eigener Text
 * (hueter #160, 8). */
function ReiterSpaeter({ reiter }: { readonly reiter: ReiterId }) {
  const { t } = useTranslation('profil')
  return <LeerzustandBlock symbol="tray" titel={t('reiter_spaeter_titel', { reiter: t(reiterSchluessel(reiter)) })} text={t(reiter === 'verwaltung' ? 'reiter_spaeter_text_verwaltung' : 'reiter_spaeter_text')} />
}
