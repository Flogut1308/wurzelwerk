import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Trockenlaufbericht } from '../../shared/import/trockenlauf-bericht'
import { FehlerlisteImport } from './fehlerliste-import'
import { Text } from './text'
import './trockenlauf-bericht.css'

export interface TrockenlaufBerichtProps {
  readonly bericht: Trockenlaufbericht
}

/** Ein Block mit Überschrift, Zähler und Sprungmarke (`id`) — die Blockgrenzen aus 72 §S-11. */
function Block({ id, titel, anzahl, children }: { readonly id: string; readonly titel: string; readonly anzahl: number | null; readonly children: ReactNode }) {
  return (
    <section id={id} className="wz-tlb__block">
      <div className="wz-tlb__kopf">
        <Text rolle="titel-klein" als="h2">
          {titel}
        </Text>
        {anzahl !== null ? (
          <Text rolle="beschriftung" farbe="sekundaer" als="span">
            {String(anzahl)}
          </Text>
        ) : null}
      </div>
      {children}
    </section>
  )
}

/**
 * `TrockenlaufBericht` — Organismus (docs/71_Designsystem.md §2.3, 72 §S-11). Rendert die acht
 * Blöcke aus 56_Import_Vertrag.md §6.2 in **fixer Reihenfolge**, jeder mit Zähler und Sprungmarke;
 * „Nicht verarbeitetes Material" und „Gesundheitsdaten" sind **immer** sichtbar (auch leer), die
 * Rücknahme-Art steht ganz oben (die Information für die Entscheidung). Der Bericht zeigt nur, er
 * entscheidet nichts (Sperre in der Ansicht, aus `importSperrurteil`). Alle Texte über i18n
 * (Namespace `import`).
 *
 * Doku-Hinweis (CLAUDE.md §14 Fall 2): `71` §2.3 und der Fließtext in `56` §6.2 sprechen von
 * „sieben" Blöcken, die nummerierte Liste in `72`/`56` und der Typ `Trockenlaufbericht` haben
 * **acht** (Gesundheitsdaten als eigener Block). Gebaut sind acht — der Typ ist die Wahrheit
 * (docs/offene-fragen.md, U-1.4b-bloecke).
 */
export function TrockenlaufBericht({ bericht }: TrockenlaufBerichtProps) {
  const { t } = useTranslation('import')
  const z = bericht.zusammenfassung
  const keineErsetzung = bericht.wirdErgaenzt.every((e) => !e.istKonflikt)

  return (
    <div className="wz-tlb">
      <Block id="tlb-zusammenfassung" titel={t('block_zusammenfassung')} anzahl={null}>
        <Text rolle="koerper" farbe="akzent" als="p">
          {z.ruecknahmeArt === 'schnappschuss' ? t('zus_ruecknahme_schnappschuss') : t('zus_ruecknahme_undo')}
        </Text>
        <Text rolle="koerper-klein" als="p">
          {t('zus_datei', { datei: z.datei })}
        </Text>
        {z.vertragWerkzeug !== null ? (
          <Text rolle="hilfe" als="p">
            {t('zus_werkzeug', { werkzeug: z.vertragWerkzeug })}
          </Text>
        ) : null}
        {z.pruefsummeQuelltext !== null ? (
          <Text rolle="technisch" als="p">
            {t('zus_pruefsumme', { pruefsumme: z.pruefsummeQuelltext })}
          </Text>
        ) : null}
        {z.bereitsImportiertAm !== null ? (
          <Text rolle="koerper-klein" farbe="akzent" als="p">
            {t('zus_bereits_importiert', { datum: z.bereitsImportiertAm })}
          </Text>
        ) : null}
        <Text rolle="koerper-klein" als="p">
          {t('zus_geaenderte_zeilen', { anzahl: z.geaenderteZeilenAnzahl })}
        </Text>
        <Text rolle="koerper-klein" als="p">
          {`${t('zus_fehler_anzahl', { anzahl: z.fehlerAnzahl })} · ${t('zus_hinweis_anzahl', { anzahl: z.hinweisAnzahl })}`}
        </Text>
      </Block>

      <Block id="tlb-angelegt" titel={t('block_wird_angelegt')} anzahl={bericht.wirdAngelegt.length}>
        <ul className="wz-tlb__liste">
          {bericht.wirdAngelegt.map((eintrag) => (
            <li key={eintrag.tabelle}>
              <Text rolle="koerper-klein" als="span">
                {t('angelegt_zeile', { tabelle: eintrag.tabelle, anzahl: eintrag.anzahl })}
              </Text>
            </li>
          ))}
        </ul>
      </Block>

      <Block id="tlb-ergaenzt" titel={t('block_wird_ergaenzt')} anzahl={bericht.wirdErgaenzt.length}>
        {keineErsetzung ? (
          <Text rolle="hilfe" als="p">
            {t('ergaenzt_kein_ersatz')}
          </Text>
        ) : null}
        <ul className="wz-tlb__liste">
          {bericht.wirdErgaenzt.map((eintrag, index) => (
            <li key={`${eintrag.subjektKennung}-${eintrag.praedikat}-${String(index)}`} className={eintrag.istKonflikt ? 'wz-tlb__ergaenzt--konflikt' : undefined}>
              <Text rolle="koerper-klein" als="span">
                {`${eintrag.subjektKennung} · ${eintrag.praedikat}: ${eintrag.wertText ?? (eintrag.wertZahl === null ? '' : String(eintrag.wertZahl))}`}
              </Text>
              {eintrag.istKonflikt ? (
                <Text rolle="beschriftung" farbe="akzent" als="span">
                  {` — ${t('ergaenzt_konflikt')}`}
                </Text>
              ) : null}
            </li>
          ))}
        </ul>
      </Block>

      <Block id="tlb-dubletten" titel={t('block_moegliche_dubletten')} anzahl={bericht.moeglicheDubletten.length}>
        <ul className="wz-tlb__liste">
          {bericht.moeglicheDubletten.map((eintrag, index) => (
            <li key={`${eintrag.neueKennung}-${eintrag.bestehendeKennung}-${String(index)}`}>
              <Text rolle="koerper-klein" als="p">
                {t('dublette_zeile', { neu: eintrag.neueKennung, bestehend: eintrag.bestehendeKennung })}
              </Text>
              <Text rolle="hilfe" als="p">
                {`${t('dublette_punktwert', { punktwert: eintrag.punktwert })} · ${eintrag.begruendung}`}
              </Text>
            </li>
          ))}
        </ul>
        {bericht.moeglicheDubletten.length > 0 ? (
          <Text rolle="hilfe" als="p">
            {t('dublette_getrennt_hinweis')}
          </Text>
        ) : null}
      </Block>

      <Block id="tlb-fehler" titel={t('block_fehler')} anzahl={bericht.fehler.length}>
        <FehlerlisteImport befunde={bericht.fehler} gruppierung="code" />
      </Block>

      <Block id="tlb-hinweise" titel={t('block_hinweise')} anzahl={bericht.hinweise.length}>
        <FehlerlisteImport befunde={bericht.hinweise} gruppierung="code" />
      </Block>

      <Block id="tlb-nicht-verarbeitet" titel={t('block_nicht_verarbeitet')} anzahl={bericht.nichtVerarbeitetesMaterial.length}>
        {bericht.nichtVerarbeitetesMaterial.length === 0 ? (
          <>
            <Text rolle="hilfe" als="p">
              {t('nicht_verarbeitet_leer')}
            </Text>
            <Text rolle="hilfe" farbe="akzent" als="p">
              {t('nicht_verarbeitet_warnung')}
            </Text>
          </>
        ) : (
          <ul className="wz-tlb__liste">
            {bericht.nichtVerarbeitetesMaterial.map((eintrag, index) => (
              <li key={`${eintrag.warum}-${String(index)}`}>
                <Text rolle="original" als="p">
                  {eintrag.text}
                </Text>
                <Text rolle="hilfe" als="p">
                  {eintrag.warum}
                </Text>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block id="tlb-gesundheit" titel={t('block_gesundheitsdaten')} anzahl={null}>
        <Text rolle="koerper-klein" als="p">
          {`${t('gesundheit_diagnosen', { anzahl: bericht.gesundheitsdaten.diagnosenAnzahl })} · ${t('gesundheit_risikofaktoren', { anzahl: bericht.gesundheitsdaten.risikofaktorenAnzahl })}`}
        </Text>
        <Text rolle="beschriftung" farbe="akzent" als="p">
          {t('gesundheit_sperrvermerk')}
        </Text>
      </Block>
    </div>
  )
}
