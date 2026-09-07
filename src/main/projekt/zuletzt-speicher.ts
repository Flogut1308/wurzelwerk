import Store from 'electron-store'
import type { ZuletztEintrag } from '../../shared/ipc/vertrag'

/** G-04 vorgezogen (AP-0.4): eine begrenzte Liste reicht, ohne unbegrenzt zu wachsen. */
const MAX_EINTRAEGE = 10

interface ZuletztSpeicherSchema {
  zuletzt: readonly ZuletztEintrag[]
}

let speicher: Store<ZuletztSpeicherSchema> | undefined

function speicherHolen(): Store<ZuletztSpeicherSchema> {
  speicher ??= new Store<ZuletztSpeicherSchema>({
    name: 'zuletzt-geoeffnet',
    defaults: { zuletzt: [] },
  })
  return speicher
}

/** Neuester Eintrag zuerst — so wie er in der Start-Ansicht angezeigt wird. */
export function zuletztLesen(): readonly ZuletztEintrag[] {
  return speicherHolen().get('zuletzt')
}

/**
 * Fügt einen Eintrag vorne ein und entfernt ein zuvor vorhandenes Duplikat nach `pfad` (ein
 * erneut geöffnetes Projekt rückt an den Anfang, statt doppelt zu erscheinen). Begrenzt auf
 * `MAX_EINTRAEGE`.
 */
export function zuletztHinzufuegen(eintrag: ZuletztEintrag): void {
  const bisherige = zuletztLesen().filter((vorhandener) => vorhandener.pfad !== eintrag.pfad)
  const neu = [eintrag, ...bisherige].slice(0, MAX_EINTRAEGE)
  speicherHolen().set('zuletzt', neu)
}
