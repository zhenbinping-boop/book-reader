/** Version-pinned native integration, documented in docs/BOOK_BROWSER.md.
 * Upstream handles cookies/redirects/blob transport, but opens a viewer before
 * notifying the host. Let this reader own parsing instead. This build tool is
 * reproducible, idempotent and rejects changes to the expected upstream API.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const BROWSER_PATCH_VERSION = '8.26.1'
const marker = '// book-reader managed-download handoff v2'
const previousMarker = '// book-reader managed-download handoff v1'

function replaceOnce(source, old, replacement) {
  const index = source.indexOf(old)
  if (index < 0 || source.indexOf(old, index + old.length) !== -1) throw new Error(`InAppBrowser patch anchor changed: ${old.slice(0, 90)}`)
  return source.slice(0, index) + replacement + source.slice(index + old.length)
}

function replaceRegion(source, start, end, replacement) {
  const first = source.indexOf(start)
  const last = source.indexOf(end, first + start.length)
  if (first < 0 || last < 0 || source.indexOf(start, first + start.length) !== -1) throw new Error(`InAppBrowser patch region changed: ${start}`)
  return source.slice(0, first) + replacement + source.slice(last)
}

export function patchBrowserSources(files) {
  return Object.fromEntries(Object.entries(files).map(([name, original]) => {
    if (original.includes(marker)) return [name, original]
    let source = original.replace(/\r\n/g, '\n')
    if (source.includes(previousMarker)) {
      source = replaceOnce(source, previousMarker, marker)
    } else if (name.endsWith('WebViewCallbacks.java')) {
      source = replaceOnce(source, '    public void downloadCompleted(', `    ${marker}
    public default void bookDownloadProgress(JSObject event) {}

    public void downloadCompleted(`)
    } else if (name.endsWith('CapgoInAppBrowserPlugin.java')) {
      source = replaceOnce(source, '            @Override\n            public void downloadCompleted(', `            ${marker}
            @Override
            public void bookDownloadProgress(JSObject event) {
                event.put("id", webViewId);
                notifyListeners("bookDownloadProgress", event);
            }

            @Override
            public void downloadCompleted(`)
    } else if (name.endsWith('WebViewDialog.java')) {
      source = replaceRegion(source, '    private void finalizeDownload(', '    private void showDownloadError(String message, Exception exception) {', `    ${marker}
    private void finalizeDownload(File outputFile, String mimeType, String sourceUrl) {
        mainHandler.post(() -> notifyDownloadCompleted(outputFile, mimeType, sourceUrl, "hostApp"));
    }

    private void notifyBookDownloadProgress(File file, String mimeType, String sourceUrl, long received, long total) {
        if (_options == null || _options.getCallbacks() == null) return;
        JSObject event = new JSObject();
        event.put("path", file.getAbsolutePath());
        event.put("fileName", file.getName());
        event.put("mimeType", mimeType);
        event.put("sourceUrl", sourceUrl);
        event.put("receivedBytes", received);
        event.put("totalBytes", Math.max(0L, total));
        mainHandler.post(() -> _options.getCallbacks().bookDownloadProgress(event));
    }

`)
      source = replaceOnce(source, `                inputStream = connection.getInputStream();
                try (FileOutputStream outputStream = new FileOutputStream(outputFile)) {
                    byte[] buffer = new byte[8192];
                    int bytesRead;
                    while ((bytesRead = inputStream.read(buffer)) != -1) {
                        outputStream.write(buffer, 0, bytesRead);
                    }
                }

                finalizeDownload(outputFile, resolvedMimeType, url);`, `                final long maximumBytes = 200L * 1024 * 1024;
                final long totalBytes = connection.getContentLengthLong();
                if (totalBytes > maximumBytes) throw new IOException("Book download exceeds 200 MB");
                long receivedBytes = 0;
                long lastProgress = 0;
                notifyBookDownloadProgress(outputFile, resolvedMimeType, url, 0, totalBytes);
                inputStream = connection.getInputStream();
                try (FileOutputStream outputStream = new FileOutputStream(outputFile)) {
                    byte[] buffer = new byte[8192];
                    int bytesRead;
                    while ((bytesRead = inputStream.read(buffer)) != -1) {
                        receivedBytes += bytesRead;
                        if (receivedBytes > maximumBytes) throw new IOException("Book download exceeds 200 MB");
                        outputStream.write(buffer, 0, bytesRead);
                        long now = android.os.SystemClock.elapsedRealtime();
                        if (now - lastProgress >= 300) {
                            notifyBookDownloadProgress(outputFile, resolvedMimeType, url, receivedBytes, totalBytes);
                            lastProgress = now;
                        }
                    }
                }
                if (totalBytes >= 0 && receivedBytes != totalBytes) throw new IOException("Incomplete book download");
                finalizeDownload(outputFile, resolvedMimeType, url);`)
    } else if (name.endsWith('WKWebViewController.swift')) {
      source = replaceRegion(source, '    private func previewDownloadedFile(', '    /// Returns false when the device', `    ${marker}
    private func previewDownloadedFile(_ fileURL: URL, mimeType: String?, sourceURL: String?) {
        DispatchQueue.main.async {
            self.emitDownloadCompleted(fileURL, mimeType: mimeType, sourceURL: sourceURL, handledBy: "hostApp")
        }
    }

`)
      source = replaceOnce(source, `            let destinationURL = try uniqueDownloadDestination(for: suggestedFilename)
            downloadStates[identifier] = WKDownloadState(destinationURL: destinationURL, mimeType: response.mimeType, sourceURL: sourceURL)
            completionHandler(destinationURL)`, `            if response.expectedContentLength > 200 * 1024 * 1024 {
                throw NSError(domain: "BookReader", code: 1, userInfo: [NSLocalizedDescriptionKey: "Book download exceeds 200 MB"])
            }
            let destinationURL = try uniqueDownloadDestination(for: suggestedFilename)
            downloadStates[identifier] = WKDownloadState(destinationURL: destinationURL, mimeType: response.mimeType, sourceURL: sourceURL)
            // Keep progress indeterminate until WKDownload completes.
            emit("bookDownloadProgress", data: [
                "path": destinationURL.path,
                "fileName": destinationURL.lastPathComponent,
                "mimeType": response.mimeType ?? "",
                "sourceUrl": sourceURL ?? "",
                "receivedBytes": 0,
                "totalBytes": 0
            ])
            completionHandler(destinationURL)`)
    } else throw new Error(`Unknown patch target: ${name}`)

    // Native cache paths are receipt identities. A new UUID directory prevents
    // a later download named "download.epub" reusing an already-imported path.
    if (name.endsWith('WebViewDialog.java')) {
      source = replaceOnce(source, '        File directory = downloadDirectory();', `        File directory = new File(downloadDirectory(), java.util.UUID.randomUUID().toString());
        if (!directory.mkdirs()) throw new IOException("Could not create unique book download directory");`)
    } else if (name.endsWith('WKWebViewController.swift')) {
      source = replaceOnce(source,
        '        let downloadsDirectory = FileManager.default.temporaryDirectory.appendingPathComponent("InAppBrowserDownloads", isDirectory: true)',
        '        let downloadsDirectory = FileManager.default.temporaryDirectory.appendingPathComponent("InAppBrowserDownloads", isDirectory: true).appendingPathComponent(UUID().uuidString, isDirectory: true)')
    }
    return [name, source]
  }))
}

export function applyBrowserPatch(root = fileURLToPath(new URL('../', import.meta.url))) {
  const dir = resolve(root, 'node_modules/@capgo/capacitor-inappbrowser')
  const { version } = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8'))
  if (version !== BROWSER_PATCH_VERSION) throw new Error(`InAppBrowser ${version} needs patch review; expected ${BROWSER_PATCH_VERSION}`)
  const targets = [
    'android/src/main/java/ee/forgr/capacitor_inappbrowser/WebViewCallbacks.java',
    'android/src/main/java/ee/forgr/capacitor_inappbrowser/CapgoInAppBrowserPlugin.java',
    'android/src/main/java/ee/forgr/capacitor_inappbrowser/WebViewDialog.java',
    'ios/Sources/InAppBrowserPlugin/WKWebViewController.swift',
  ]
  const before = Object.fromEntries(targets.map(name => [name, readFileSync(resolve(dir, name), 'utf8')]))
  const after = patchBrowserSources(before)
  for (const name of targets) if (after[name] !== before[name]) writeFileSync(resolve(dir, name), after[name])
  console.log(`InAppBrowser ${version}: book download handoff ready`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) applyBrowserPatch()
