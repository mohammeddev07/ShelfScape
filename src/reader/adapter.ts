import type { HighlightColor, Location } from '../db'

export type Paint = { key: string; location: Location; style: HighlightColor | 'bookmark' }
export interface ReaderStatus {
  label: string; first: boolean; last: boolean; contents: { title: string; target: string }[]
  progress: number; where: string   // progress 0..1; where: "Page N" or the current chapter title
}
export interface ReaderInput {
  element: HTMLDivElement; file: Blob; saved?: Location; locations?: string; signal: AbortSignal
  change: (location: Location, status: ReaderStatus) => void
  select: (active: boolean) => void   // a non-collapsed selection appeared or cleared
  activate: (key: string) => void     // a painted mark was clicked
  error: (e: unknown) => void
}
export interface ReaderAdapter {
  step: (n: number) => Promise<void>
  resizeText: (n: number) => Promise<void>
  jump: (location: Location | string) => Promise<void>
  location: (selected?: boolean) => Location | undefined
  measure: (signal: AbortSignal) => Promise<{ words: number; locations?: string }>
  paint: (marks: Paint[]) => void                  // replaces the painted set
  selectionRect: () => DOMRect | undefined         // viewport coordinates
  theme: (mode: 'light' | 'dark') => void
  visible: (location: Location) => boolean        // that spot is on the page now shown
  excerpt: () => string                            // opening words of the page now shown, for bookmark lists
}
