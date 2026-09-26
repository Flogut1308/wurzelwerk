import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { NameTypEnum, SchriftEnum } from '../../../shared/schemata/name'
import type { PersonDetailName } from '../../../shared/schemata/person-detail'
import { Auswahlfeld, type AuswahlfeldOption } from '../../bausteine/auswahlfeld'
import { Formularfeld } from '../../bausteine/formularfeld'
import { Schaltflaeche } from '../../bausteine/schaltflaeche'
import { Text } from '../../bausteine/text'
import { Textfeld } from '../../bausteine/textfeld'
import { useNameAendern, useNameAnlegen, useNameLoeschen } from '../../brücke/befehl-hooks'
import { useEntwurfMitVerzoegertemCommit } from './profil-bearbeiten-debounce'
import {
  NAMEN_EINTRAG_LEER,
  auswahlWertZuSchrift,
  nameAendernEinAusEintrag,
  geaendertesNamensFeld,
  mitRufnameAusAuswahl,
  nameAnlegenEinAusEintrag,
  namenEintragAusPersonDetailName,
  namenEintragHatInhalt,
  rufnameAuswahlVornamen,
  rufnameAuswahlWert,
  schriftZuAuswahlWert,
  type NamenEintragWerte,
  type SchriftAuswahlWert,
} from './profil-bearbeiten-logik'
import { nameTypSchluessel, schriftSchluessel } from './profil-schluessel'
import './profil-bearbeiten-namen.css'

export interface NamenBearbeitenAbschnittProps {
  readonly personId: string
  readonly namen: readonly PersonDetailName[]
}

/**
 * `NamenBearbeitenAbschnitt` (AP-1.14a, S-20, Kernfelder): Liste bestehender `name`-Zeilen
 * (jede sofort über `name.aendern`/`name.loeschen` bearbeitbar) plus ein festes Formular für einen
 * neuen Namen (`name.anlegen`). KEIN Konfidenz-/Belegslot (ADR-026, s. `profil-bearbeiten-logik.ts`).
 */
export function NamenBearbeitenAbschnitt({ personId, namen }: NamenBearbeitenAbschnittProps) {
  const { t } = useTranslation('profil')

  return (
    <section className="wz-profil-ansicht__abschnitt" aria-labelledby="wz-profil-bearbeiten-namen-titel">
      <Text rolle="titel-klein" als="h2" id="wz-profil-bearbeiten-namen-titel">
        {t('abschnitt_namen_bearbeiten')}
      </Text>

      {namen.length === 0 ? (
        <Text rolle="hilfe" als="p">
          {t('name_liste_leer')}
        </Text>
      ) : (
        <ul className="wz-profil-bearbeiten-namen__liste">
          {namen.map((name) => (
            <li key={name.id} className="wz-profil-bearbeiten-namen__zeile">
              <NamenFelder name={name} />
            </li>
          ))}
        </ul>
      )}

      <NamenNeuFormular personId={personId} />
    </section>
  )
}

/** Auswahlfeld-Optionen für `typ`/`schrift` — außerhalb der Komponente, weil `t(...)` bei jedem
 * Aufruf dasselbe Ergebnis für dieselbe Sprache liefert und die Optionen sich innerhalb einer
 * Sitzung nie ändern; hier trotzdem als Funktionen (statt Modulkonstanten), weil `t` selbst ein
 * Hook-Ergebnis ist. */
function nameTypOptionen(t: (schluessel: string) => string): readonly AuswahlfeldOption<(typeof NameTypEnum.options)[number]>[] {
  return NameTypEnum.options.map((typ) => ({ wert: typ, beschriftung: t(nameTypSchluessel(typ)) }))
}

function schriftOptionen(t: (schluessel: string) => string): readonly AuswahlfeldOption<SchriftAuswahlWert>[] {
  return [{ wert: '', beschriftung: t('schrift_unbestimmt') }, ...SchriftEnum.options.map((schrift) => ({ wert: schrift, beschriftung: t(schriftSchluessel(schrift)) }))]
}

/** A-02, AP-1.30 (Fix Rufname-Anhängen): der Rufname einer BESTEHENDEN Zeile wird aus ihren Vornamen
 * gewählt (docs/20_Domaenenwissen.md §24: Markierung einer Position in der Vornamenkette), nicht
 * getippt — ein getippter Rufname ging mit jedem Autosave-Zwischenstand als zusätzlicher Vorname in
 * die Datenbank (`rufnameTextFuerAenderung`, `profil-bearbeiten-logik.ts`). */
function rufnameOptionen(t: (schluessel: string) => string, eintrag: NamenEintragWerte): readonly AuswahlfeldOption<string>[] {
  return [{ wert: '', beschriftung: t('name_rufname_unbestimmt') }, ...rufnameAuswahlVornamen(eintrag).map(({ wert, vorname }) => ({ wert, beschriftung: vorname }))]
}

interface NamenFelderProps {
  readonly name: PersonDetailName
}

/** Die editierbaren Felder EINER bestehenden Namenszeile. `name.aendern` schreibt alle Spalten in
 * einem `UPDATE` (`name-repo.ts::aktualisieren`) — der Entwurf wird darum als EIN Objekt geführt
 * und als Ganzes debounced committet (`useEntwurfMitVerzoegertemCommit`, das auch auf eine von
 * außen geänderte `name`-Referenz synchronisiert — Undo, `ereignis:datenGeaendert`), nicht
 * feldweise. `typ`/`schrift` sind Auswahlfelder ohne Tippgeschwindigkeit — die committen sofort
 * bei Änderung (kein Grund, auf eine Ruhephase zu warten), aktualisieren aber denselben Entwurf.
 *
 * **Bugfix (AP-1.15 PR-A, entdeckt über `ablauf-05-ereignis-erfassen.spec.ts`):**
 * `namenEintragAusPersonDetailName(name)` MUSS über `useMemo` an `name` gebunden sein. Der
 * Sync-Zweig von `useEntwurfMitVerzoegertemCommit` vergleicht seinen `wert`-Parameter bewusst über
 * Referenzgleichheit (Kopfkommentar `profil-bearbeiten-debounce.ts`) — ein bei JEDEM Aufruf frisch
 * gebautes, nicht memoisiertes Objekt wäre bei JEDEM Render „von außen geändert", auch ohne dass
 * sich `name` selbst geändert hat. Das übernimmt den frischen Wert per `setEntwurf`, was den
 * nächsten Render mit wiederum einem neuen `wert` auslöst: eine sich selbst tragende
 * Render-Schleife, sobald IRGENDEIN unabhängiger Schreibvorgang (z. B. `ereignis.anlegen`) einen
 * Rerender auslöst, während eine Person mit bestehendem Namen im Bearbeiten-Zustand offen ist
 * (`test/einheit/profil-bearbeiten-namen-rerender.test.tsx`). */
function NamenFelder({ name }: NamenFelderProps) {
  const { t } = useTranslation('profil')
  const nameAendern = useNameAendern()
  const nameLoeschen = useNameLoeschen()

  const wert = useMemo(() => namenEintragAusPersonDetailName(name), [name])
  // AP-1.30 PR 4: `feld` nennt das eine geänderte Feld gegenüber dem zuletzt gelesenen Stand (`wert`)
  // — nur dann fasst der Bus schnelle Folgeänderungen zu einem Undo-Schritt zusammen.
  const [eintrag, setEintrag, sofortSchreiben] = useEntwurfMitVerzoegertemCommit<NamenEintragWerte>(wert, (naechster) =>
    nameAendern.mutate(nameAendernEinAusEintrag(name.id, naechster, geaendertesNamensFeld(wert, naechster))),
  )

  function sofortAendern(naechster: NamenEintragWerte): void {
    setEintrag(naechster)
    nameAendern.mutate(nameAendernEinAusEintrag(name.id, naechster, geaendertesNamensFeld(wert, naechster)))
  }

  return (
    <div className="wz-profil-bearbeiten-namen__felder">
      <Formularfeld beschriftung={t('name_typ_beschriftung')}>
        <Auswahlfeld wert={eintrag.typ} optionen={nameTypOptionen(t)} aufAenderung={(wert) => sofortAendern({ ...eintrag, typ: wert })} />
      </Formularfeld>
      <Formularfeld beschriftung={t('name_schrift_beschriftung')}>
        <Auswahlfeld
          wert={schriftZuAuswahlWert(eintrag.schrift)}
          optionen={schriftOptionen(t)}
          aufAenderung={(wert) => sofortAendern({ ...eintrag, schrift: auswahlWertZuSchrift(wert) })}
        />
      </Formularfeld>
      <Formularfeld beschriftung={t('name_vornamen_beschriftung')}>
        <Textfeld wert={eintrag.vornamen} aufAenderung={(wert) => setEintrag({ ...eintrag, vornamen: wert })} aufVerlassen={sofortSchreiben} />
      </Formularfeld>
      <Formularfeld beschriftung={t('name_nachname_beschriftung')}>
        <Textfeld wert={eintrag.nachname} aufAenderung={(wert) => setEintrag({ ...eintrag, nachname: wert })} aufVerlassen={sofortSchreiben} />
      </Formularfeld>
      <Formularfeld beschriftung={t('name_rufname_beschriftung')}>
        <Auswahlfeld
          wert={rufnameAuswahlWert(eintrag)}
          optionen={rufnameOptionen(t, eintrag)}
          aufAenderung={(wert) => sofortAendern(mitRufnameAusAuswahl(eintrag, wert))}
        />
      </Formularfeld>
      <Formularfeld beschriftung={t('name_praefix_beschriftung')}>
        <Textfeld wert={eintrag.praefix} aufAenderung={(wert) => setEintrag({ ...eintrag, praefix: wert })} aufVerlassen={sofortSchreiben} />
      </Formularfeld>
      <Formularfeld beschriftung={t('name_titel_vor_beschriftung')}>
        <Textfeld wert={eintrag.titelVor} aufAenderung={(wert) => setEintrag({ ...eintrag, titelVor: wert })} aufVerlassen={sofortSchreiben} />
      </Formularfeld>
      <Formularfeld beschriftung={t('name_zusatz_nach_beschriftung')}>
        <Textfeld wert={eintrag.zusatzNach} aufAenderung={(wert) => setEintrag({ ...eintrag, zusatzNach: wert })} aufVerlassen={sofortSchreiben} />
      </Formularfeld>
      <Schaltflaeche variante="gefaehrlich" aufKlick={() => nameLoeschen.mutate({ id: name.id })}>
        {t('name_entfernen')}
      </Schaltflaeche>
    </div>
  )
}

function NamenNeuFormular({ personId }: { readonly personId: string }) {
  const { t } = useTranslation('profil')
  const nameAnlegen = useNameAnlegen()
  const [eintrag, setEintrag] = useState<NamenEintragWerte>(NAMEN_EINTRAG_LEER)

  function absenden(ereignis: FormEvent<HTMLFormElement>): void {
    ereignis.preventDefault()
    if (!namenEintragHatInhalt(eintrag)) return
    nameAnlegen.mutate(nameAnlegenEinAusEintrag(personId, eintrag))
    setEintrag(NAMEN_EINTRAG_LEER)
  }

  return (
    <form className="wz-profil-bearbeiten-namen__neu" onSubmit={absenden} aria-labelledby="wz-profil-bearbeiten-namen-neu-titel">
      <Text rolle="beschriftung" als="p" id="wz-profil-bearbeiten-namen-neu-titel">
        {t('name_neu_ueberschrift')}
      </Text>
      <div className="wz-profil-bearbeiten-namen__felder">
        <Formularfeld beschriftung={t('name_typ_beschriftung')}>
          <Auswahlfeld wert={eintrag.typ} optionen={nameTypOptionen(t)} aufAenderung={(wert) => setEintrag({ ...eintrag, typ: wert })} />
        </Formularfeld>
        <Formularfeld beschriftung={t('name_schrift_beschriftung')}>
          <Auswahlfeld
            wert={schriftZuAuswahlWert(eintrag.schrift)}
            optionen={schriftOptionen(t)}
            aufAenderung={(wert) => setEintrag({ ...eintrag, schrift: auswahlWertZuSchrift(wert) })}
          />
        </Formularfeld>
        <Formularfeld beschriftung={t('name_vornamen_beschriftung')}>
          <Textfeld wert={eintrag.vornamen} aufAenderung={(wert) => setEintrag({ ...eintrag, vornamen: wert })} />
        </Formularfeld>
        <Formularfeld beschriftung={t('name_nachname_beschriftung')}>
          <Textfeld wert={eintrag.nachname} aufAenderung={(wert) => setEintrag({ ...eintrag, nachname: wert })} />
        </Formularfeld>
        <Formularfeld beschriftung={t('name_rufname_beschriftung')}>
          <Textfeld wert={eintrag.rufname} aufAenderung={(wert) => setEintrag({ ...eintrag, rufname: wert })} />
        </Formularfeld>
        <Formularfeld beschriftung={t('name_praefix_beschriftung')}>
          <Textfeld wert={eintrag.praefix} aufAenderung={(wert) => setEintrag({ ...eintrag, praefix: wert })} />
        </Formularfeld>
        <Formularfeld beschriftung={t('name_titel_vor_beschriftung')}>
          <Textfeld wert={eintrag.titelVor} aufAenderung={(wert) => setEintrag({ ...eintrag, titelVor: wert })} />
        </Formularfeld>
        <Formularfeld beschriftung={t('name_zusatz_nach_beschriftung')}>
          <Textfeld wert={eintrag.zusatzNach} aufAenderung={(wert) => setEintrag({ ...eintrag, zusatzNach: wert })} />
        </Formularfeld>
      </div>
      <Schaltflaeche variante="sekundaer" typ="submit" gesperrt={!namenEintragHatInhalt(eintrag)}>
        {t('name_hinzufuegen')}
      </Schaltflaeche>
    </form>
  )
}
