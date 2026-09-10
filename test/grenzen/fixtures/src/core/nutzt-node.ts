import { readFileSync } from 'node:fs'

export function liesDatei(pfad: string): string {
  return readFileSync(pfad, 'utf8')
}
