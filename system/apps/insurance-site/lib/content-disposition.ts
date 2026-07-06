/**
 * Build a RFC 5987 Content-Disposition header safe for Node fetch / NextResponse.
 * The quoted `filename=` segment must be Latin-1; non-ASCII names use `filename*`.
 */
export function contentDispositionHeader (
  filename: string,
  inline: boolean
): string {
  const trimmed = filename.trim() || 'document'
  const encoded = encodeURIComponent(trimmed)
  const asciiFallback = trimmed
    .replace(/[\r\n"]/g, '_')
    .replace(/[^\x20-\x7E]/g, '_')
    .trim() || 'document'
  const mode = inline ? 'inline' : 'attachment'
  return `${mode}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`
}
