// Reports which screenshots in test-results/screens/ changed during a test run,
// so only those need looking at.
//   node scripts/screens.ts before   # record hashes
//   node scripts/screens.ts after    # list new / changed / removed screenshots
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'test-results/screens'
const hashFile = join(dir, '.before.json')

function hashes(): Record<string, string> {
  if (!existsSync(dir)) return {}
  const result: Record<string, string> = {}
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.png')).sort()) {
    result[name] = createHash('sha256').update(readFileSync(join(dir, name))).digest('hex')
  }
  return result
}

const mode = process.argv[2]
if (mode === 'before') {
  mkdirSync(dir, { recursive: true })
  writeFileSync(hashFile, JSON.stringify(hashes()))
} else if (mode === 'after') {
  const before = existsSync(hashFile)
    ? (JSON.parse(readFileSync(hashFile, 'utf8')) as Record<string, string>)
    : {}
  const after = hashes()
  const added = Object.keys(after).filter((name) => !(name in before))
  const changed = Object.keys(after).filter((name) => name in before && before[name] !== after[name])
  const unchanged = Object.keys(after).length - added.length - changed.length
  const list = (names: string[]) => names.map((name) => join(dir, name)).join(', ')
  console.log(`Screenshots: ${added.length} new, ${changed.length} changed, ${unchanged} unchanged`)
  if (added.length) console.log(`  new: ${list(added)}`)
  if (changed.length) console.log(`  changed: ${list(changed)}`)
} else {
  console.error('Usage: node scripts/screens.ts before|after')
  process.exit(1)
}
