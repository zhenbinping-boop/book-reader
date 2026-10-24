import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyBrowserPatch, patchBrowserSources } from '../tools/patch_inappbrowser.mjs'

test('native build patch is idempotent on the actual installed plugin sources', async () => {
  const paths = [
    'android/src/main/java/ee/forgr/capacitor_inappbrowser/WebViewCallbacks.java',
    'android/src/main/java/ee/forgr/capacitor_inappbrowser/CapgoInAppBrowserPlugin.java',
    'android/src/main/java/ee/forgr/capacitor_inappbrowser/WebViewDialog.java',
    'ios/Sources/InAppBrowserPlugin/WKWebViewController.swift',
  ]
  const files = Object.fromEntries(await Promise.all(paths.map(async path => [path, await readFile(new URL(`../node_modules/@capgo/capacitor-inappbrowser/${path}`, import.meta.url), 'utf8')])))
  const once = patchBrowserSources(files)
  assert.deepEqual(patchBrowserSources(once), once)
})

test('changed upstream source cannot silently receive an incomplete patch', () => {
  assert.throws(() => patchBrowserSources({ 'WebViewCallbacks.java': 'interface Changed {}' }), /anchor changed/)
  assert.throws(() => patchBrowserSources({ 'unexpected.java': 'class Changed {}' }), /Unknown patch/)
})

test('a different upstream version is rejected before any source is rewritten', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reader-patch-test-'))
  try {
    const directory = join(root, 'node_modules/@capgo/capacitor-inappbrowser')
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'package.json'), JSON.stringify({ version: '99.0.0' }))
    assert.throws(() => applyBrowserPatch(root), /needs patch review/)
  } finally {
    const cleanupRoot = await realpath(root)
    assert.ok(cleanupRoot.startsWith(join(await realpath(tmpdir()), 'reader-patch-test-')))
    await rm(cleanupRoot, { recursive: true, force: true })
  }
})
