import 'fake-indexeddb/auto'

// jsdom's Blob predates Blob.prototype.arrayBuffer(), which every real browser
// has shipped for years. Polyfill it so storage tests exercise the real code
// path rather than a weakened one.
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(this)
    })
  }
}

// jsdom has no object URLs. The app makes one per stored portrait, so without
// these the storage tests exercise the error path rather than the real one.
if (typeof URL !== 'undefined' && !URL.createObjectURL) {
  let n = 0
  URL.createObjectURL = () => `blob:mushaf-test/${++n}`
  URL.revokeObjectURL = () => {}
}
