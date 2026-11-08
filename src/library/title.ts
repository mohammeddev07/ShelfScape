// Download sites append their name to titles and filenames, e.g. "Atomic Habits ( PDFDrive.com )".
// Returns the title without that tail, or undefined when there is nothing to strip.
export function cleanTitle(title: string) {
  const clean = title.replace(/[\s._\-–—]*[([{]?\s*(?:www\.)?pdf\s*drive(?:\.com)?\s*[)\]}]?[\s._\-–—]*$/i, '').trim()
  return clean && clean !== title.trim() ? clean : undefined
}
