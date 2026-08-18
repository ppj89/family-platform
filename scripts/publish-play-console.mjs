import { google } from 'googleapis'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Uploads android/app/build/outputs/bundle/release/app-release.aab to Google
// Play Console via the Play Developer API, using the service account key
// already granted access to this app in Play Console.
//
// Usage:
//   node scripts/publish-play-console.mjs --track production [--notes "..."]
//
// Requires env var PLAY_SERVICE_ACCOUNT_JSON pointing at the service account
// key file (together-records-*.json).

const packageName = 'com.familyplatform.app'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}

async function main() {
  const track = arg('track', 'production')
  const notes = arg('notes', '')
  const keyPath = process.env.PLAY_SERVICE_ACCOUNT_JSON
  if (!keyPath) {
    throw new Error('Set PLAY_SERVICE_ACCOUNT_JSON to the service account key file path.')
  }

  const bundlePath = resolve('android/app/build/outputs/bundle/release/app-release.aab')
  await readFile(bundlePath) // throws if missing

  const auth = new google.auth.GoogleAuth({
    keyFile: keyPath,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  })
  const publisher = google.androidpublisher({ version: 'v3', auth })

  console.log(`Creating edit for ${packageName}...`)
  const edit = await publisher.edits.insert({ packageName })
  const editId = edit.data.id

  console.log(`Uploading ${bundlePath}...`)
  const bundleUpload = await publisher.edits.bundles.upload({
    packageName,
    editId,
    media: { mimeType: 'application/octet-stream', body: await import('node:fs').then((fs) => fs.createReadStream(bundlePath)) },
  })
  const versionCode = bundleUpload.data.versionCode
  console.log(`Uploaded bundle, versionCode=${versionCode}`)

  console.log(`Assigning versionCode ${versionCode} to track "${track}"...`)
  await publisher.edits.tracks.update({
    packageName,
    editId,
    track,
    requestBody: {
      track,
      releases: [
        {
          versionCodes: [String(versionCode)],
          status: 'completed',
          ...(notes ? { releaseNotes: [{ language: 'ko-KR', text: notes }] } : {}),
        },
      ],
    },
  })

  console.log('Committing edit...')
  await publisher.edits.commit({ packageName, editId })

  console.log(`Done. versionCode ${versionCode} submitted to track "${track}".`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
