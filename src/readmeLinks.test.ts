import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'

/**
 * Every relative link in every README under src/ must resolve to a real file
 * or directory. The per-directory READMEs are the codebase's map — 45 broken
 * links accumulated after a restructure precisely because nothing checked
 * them; this does.
 */

function findReadmes(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...findReadmes(p))
    else if (name.toLowerCase() === 'readme.md') out.push(p)
  }
  return out
}

/** Markdown links + inline-code file mentions we can check: [x](./y) form only. */
const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g

function relativeTargets(md: string): string[] {
  const out: string[] = []
  for (const m of md.matchAll(LINK_RE)) {
    const target = m[1].trim()
    if (/^[a-z]+:/i.test(target)) continue // http:, mailto:, …
    if (target.startsWith('#')) continue // in-page anchor
    out.push(target.split('#')[0]) // strip anchors from file links
  }
  return out.filter(Boolean)
}

const SRC = resolve(__dirname)

describe('README relative links', () => {
  const readmes = findReadmes(SRC)

  it('finds the per-directory READMEs', () => {
    expect(readmes.length).toBeGreaterThan(5)
  })

  for (const readme of readmes) {
    it(`${readme.slice(SRC.length + 1)} has no broken links`, () => {
      const md = readFileSync(readme, 'utf8')
      const broken = relativeTargets(md).filter(
        (target) => !existsSync(resolve(dirname(readme), target))
      )
      expect(broken, `broken links in ${readme}`).toEqual([])
    })
  }
})
