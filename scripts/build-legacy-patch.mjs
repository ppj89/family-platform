import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { legacyPatchParts } from '../src/legacy-patch-manifest.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = path.join(repoRoot, 'src')
const outputPath = path.join(repoRoot, 'public', 'legacy-patch.js')
const checkOnly = process.argv.includes('--check')

const chunks = await Promise.all(
  legacyPatchParts.map((part) => readFile(path.join(sourceRoot, part), 'utf8')),
)
const output = chunks.join('')

if (checkOnly) {
  const current = await readFile(outputPath, 'utf8')
  if (current !== output) {
    console.error('public/legacy-patch.js is out of sync with src feature/shared legacy-patch sources')
    process.exit(1)
  }
  console.log('legacy patch feature/shared sources are in sync')
} else {
  await writeFile(outputPath, output, 'utf8')
  console.log(`wrote ${path.relative(repoRoot, outputPath)} from ${legacyPatchParts.length} parts`)
}
