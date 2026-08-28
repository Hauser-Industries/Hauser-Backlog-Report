import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('report table scrolling', () => {
  it('keeps horizontal and vertical scrolling inside the table viewport', () => {
    const css = readFileSync(resolve('src/renderer/src/styles/global.css'), 'utf8')

    expect(css).toMatch(/\.report-table-scroll\s*\{[^}]*overflow-x:\s*scroll;/s)
    expect(css).toMatch(/\.report-table-scroll\s*\{[^}]*overflow-y:\s*auto;/s)
    expect(css).toMatch(/\.report-table-scroll\s*\{[^}]*scrollbar-gutter:\s*stable;/s)
    expect(css).toMatch(/\.report-table--grouped\s*\{[^}]*min-width:\s*2315px;/s)
    expect(css).toMatch(/\.report-table-actions\s*\{[^}]*justify-content:\s*flex-end;/s)
    expect(css).toMatch(/\.column-resize-handle\s*\{[^}]*cursor:\s*col-resize;/s)
    expect(css).toMatch(/\.built-value--none\s*\{[^}]*background:\s*#fde8e6;/s)
    expect(css).toMatch(/\.built-value--partial\s*\{[^}]*background:\s*#fff2cc;/s)
    expect(css).toMatch(/\.built-value--complete\s*\{[^}]*background:\s*#dff1e9;/s)
    expect(css).toMatch(/\.report-table thead\s*\{[^}]*position:\s*sticky;/s)
    expect(css).toMatch(/\.app-shell\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s)
    expect(css).toMatch(/\.report-section\s*\{[^}]*max-width:\s*100%;/s)
  })

  it('defines a readable, wrapped, expanded Letter-landscape PDF layout', () => {
    const css = readFileSync(resolve('src/renderer/src/styles/global.css'), 'utf8')

    expect(css).toMatch(/@page\s*\{[^}]*size:\s*Letter landscape;/s)
    expect(css).toMatch(/\.print-report\s*\{[^}]*font-size:\s*7\.5pt;/s)
    expect(css).toMatch(/\.print-report__table thead\s*\{[^}]*table-header-group;/s)
    expect(css).toMatch(/\.print-report__table th,[\s\S]*?overflow-wrap:\s*anywhere;/s)
    expect(css).toMatch(/\.print-report__table th,[\s\S]*?white-space:\s*normal;/s)
    expect(css).toMatch(/\.print-report\s*\{[^}]*display:\s*none;/s)
    expect(css).toMatch(/@media print[\s\S]*?\.print-report\s*\{[^}]*display:\s*block !important;/s)
  })
})
