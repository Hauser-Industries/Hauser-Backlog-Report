import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('report table scrolling', () => {
  it('keeps horizontal and vertical scrolling inside the table viewport', () => {
    const css = readFileSync(resolve('src/renderer/src/styles/global.css'), 'utf8')

    expect(css).toMatch(/\.report-table-scroll\s*\{[^}]*overflow-x:\s*scroll;/s)
    expect(css).toMatch(/\.report-table-scroll\s*\{[^}]*overflow-y:\s*auto;/s)
    expect(css).toMatch(/\.report-table-scroll\s*\{[^}]*scrollbar-gutter:\s*stable;/s)
    expect(css).toMatch(/\.report-table--grouped\s*\{[^}]*min-width:\s*2725px;/s)
    expect(css).toMatch(/\.report-table thead\s*\{[^}]*position:\s*sticky;/s)
    expect(css).toMatch(/\.app-shell\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s)
    expect(css).toMatch(/\.report-section\s*\{[^}]*max-width:\s*100%;/s)
  })
})
