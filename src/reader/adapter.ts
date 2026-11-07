import type { Location } from '../db'

export interface ReaderStatus {
  label: string; first: boolean; last: boolean; contents: { title: string; target: string }[]
  progress: number; where: string   // progress 0..1; where: "Page N" or the current chapter title
}
export interface ReaderInput {
  element: HTMLDivElement; file: Blob; saved?: Location; locations?: string; signal: AbortSignal
  change: (location: Location, status: ReaderStatus) => void
  error: (e: unknown) => void
}
export interface ReaderAdapter {
  step: (n: number) => Promise<void>
  resizeText: (n: number) => Promise<void>
  jump: (location: Location | string) => Promise<void>
  location: (selected?: boolean) => Location | undefined
  measure: (signal: AbortSignal) => Promise<{ words: number; locations?: string }>
}
