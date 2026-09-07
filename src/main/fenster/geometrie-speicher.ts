import Store from 'electron-store'

/** Fenstergeometrie, App-Ebene (nicht projektspezifisch) — 55_Architektur.md Ordnerstruktur. */
export interface Geometrie {
  readonly breite: number
  readonly hoehe: number
  readonly x?: number
  readonly y?: number
}

interface GeometrieSpeicherSchema {
  fenstergeometrie: Geometrie
}

const STANDARD_GEOMETRIE: Geometrie = { breite: 1200, hoehe: 800 }

let speicher: Store<GeometrieSpeicherSchema> | undefined

function speicherHolen(): Store<GeometrieSpeicherSchema> {
  speicher ??= new Store<GeometrieSpeicherSchema>({
    name: 'fenstergeometrie',
    defaults: { fenstergeometrie: STANDARD_GEOMETRIE },
  })
  return speicher
}

export function geometrieLesen(): Geometrie {
  return speicherHolen().get('fenstergeometrie')
}

export function geometrieSchreiben(geometrie: Geometrie): void {
  speicherHolen().set('fenstergeometrie', geometrie)
}
