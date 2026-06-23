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

function assertLegacyPatchInvariant(condition, message) {
  if (condition) return
  console.error(message)
  process.exit(1)
}

function validateLegacyPatchInvariants(source) {
  assertLegacyPatchInvariant(
    source.includes('function renderTravelPageFromApi(force)'),
    'travel API renderer is missing from legacy patch output',
  )
  assertLegacyPatchInvariant(
    source.includes('renderTravelPageFromApi(force)'),
    'refreshServerDataViews must call renderTravelPageFromApi(force)',
  )
  assertLegacyPatchInvariant(
    source.includes('class="trip-list-card api-trip-card"') &&
      source.includes('class="trip-card-main"') &&
      source.includes('data-api-trip-edit') &&
      source.includes('data-api-trip-delete'),
    'travel list must render cards with separate open/edit/delete actions',
  )
  assertLegacyPatchInvariant(
    source.includes('setTripDetailMode(panel, true)') &&
      source.includes('setTripDetailMode(panel, false)'),
    'travel detail/list mode toggles are required',
  )
  assertLegacyPatchInvariant(
    source.includes('window.__familyTravelForceListMode') &&
      source.includes('function resetTravelApiListMode(panel)') &&
      source.includes('resetTravelApiListMode(panel)'),
    'travel menu entry must reset to top-level trip list before detail opens',
  )
  assertLegacyPatchInvariant(
    source.includes("postJson('/trips?familyId=' + encodeURIComponent(familyId), payload)"),
    'travel trip creation must save through the trips API',
  )
  assertLegacyPatchInvariant(
    source.includes('function purgeStaleTravelCreateTripQueueOnce()') &&
      source.includes('family-platform-travel-create-trip-queue-cleaned-20260623-01'),
    'stale queued travel createTrip tasks must be purged before sync replay',
  )
}

validateLegacyPatchInvariants(output)

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
