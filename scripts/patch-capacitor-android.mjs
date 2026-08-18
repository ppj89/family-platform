import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Capacitor Push Notifications 8.0.0 still references the legacy default
// ProGuard configuration. AGP 9 rejects that file because it disables R8
// optimization. Keep this small compatibility patch applied after every npm
// install until the upstream plugin publishes the same update.
const buildFile = resolve(
  'node_modules/@capacitor/push-notifications/android/build.gradle',
)
const legacyRule = "getDefaultProguardFile('proguard-android.txt')"
const optimizedRule = "getDefaultProguardFile('proguard-android-optimize.txt')"

const source = await readFile(buildFile, 'utf8')
if (source.includes(optimizedRule)) {
  process.exit(0)
}
if (!source.includes(legacyRule)) {
  throw new Error(`Expected Capacitor ProGuard rule was not found: ${buildFile}`)
}

await writeFile(buildFile, source.replace(legacyRule, optimizedRule), 'utf8')
