// Turning rows into a CSV a spreadsheet will actually open correctly.
//
// Nobody in construction lives in a web app all day; they live in Excel, and a
// list you cannot get out of the browser is a list that gets retyped by hand.
// So this is deliberately boring and deliberately careful, because CSV is a
// format with more edge cases than it looks.

/**
 * Escape one field.
 *
 * Quotes are doubled and the field is wrapped whenever it contains a comma,
 * quote or newline — planning descriptions contain all three routinely, and an
 * unescaped one silently shifts every later column on that row, which looks
 * like corrupted data rather than a formatting bug.
 *
 * Leading =, +, - and @ are prefixed with a single quote. A cell beginning with
 * those is executed as a formula by Excel and Sheets on open, so a description
 * starting "=- demolition" is a live formula, and a malicious one is a CSV
 * injection attack against whoever opens the file. The prefix is invisible in
 * the cell and disarms it.
 */
function escapeField(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s = String(value)

  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`

  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export interface CsvColumn<T> {
  header: string
  value: (row: T) => unknown
}

/**
 * Build a CSV document.
 *
 * CRLF line endings and a UTF-8 byte order mark, both for Excel's benefit:
 * without the BOM it decodes the file as the system codepage, so an address
 * containing an en dash or a name with an accent arrives visibly mangled. It
 * costs three bytes and removes an entire category of "your export is broken".
 */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => escapeField(c.header)).join(',')
  const body = rows.map((row) => columns.map((c) => escapeField(c.value(row))).join(','))
  return '﻿' + [head, ...body].join('\r\n') + '\r\n'
}

/** A filename that sorts chronologically and cannot break a Content-Disposition header. */
export function csvFilename(prefix: string): string {
  const stamp = new Date().toISOString().slice(0, 10)
  const safe = prefix.replace(/[^a-z0-9-]/gi, '-').toLowerCase()
  return `${safe}-${stamp}.csv`
}
