import type { Location } from '../db'

export interface ReaderStatus { label: string; first: boolean; last: boolean; contents: { title: string; target: string }[] }
export interface ReaderInput {
  element: HTMLDivElement; file: Blob; saved?: Location; signal: AbortSignal
  change: (location: Location, status: ReaderStatus) => void
  error: (e: unknown) => void
}
export interface ReaderAdapter {
  step: (n: number) => Promise<void>
  resizeText: (n: number) => Promise<void>
  jump: (location: Location | string) => Promise<void>
  location: (selected?: boolean) => Location | undefined
}
