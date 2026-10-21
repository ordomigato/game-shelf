/** Reads the barcodes visible in one video frame. */
export type BarcodeReader = (
  video: HTMLVideoElement,
) => Promise<{ value: string; format: string }[]>

interface Detector {
  detect(
    source: HTMLVideoElement,
  ): Promise<{ rawValue: string; format: string }[]>
}
interface DetectorClass {
  new (options: { formats: string[] }): Detector
  getSupportedFormats?: () => Promise<string[]>
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

/**
 * A barcode reader for game boxes (EAN-13, EAN-8, UPC-A, UPC-E). The
 * browser's own BarcodeDetector is used when it reads all of them. Without
 * it (Safari, Firefox) the `barcode-detector` package decodes frames in
 * WebAssembly, with the .wasm file served from this site, since the page's
 * security policy only allows its own origin. Only loaded when the scanner
 * opens its camera.
 */
export async function createBarcodeReader(): Promise<BarcodeReader> {
  const native = (globalThis as { BarcodeDetector?: DetectorClass })
    .BarcodeDetector
  let Detector: DetectorClass | undefined
  if (native) {
    const supported = (await native.getSupportedFormats?.()) ?? []
    if (FORMATS.every((format) => supported.includes(format))) Detector = native
  }
  if (!Detector) {
    const [{ BarcodeDetector, setZXingModuleOverrides }, wasm] =
      await Promise.all([
        import('barcode-detector/ponyfill'),
        import('zxing-wasm/reader/zxing_reader.wasm?url'),
      ])
    setZXingModuleOverrides({
      locateFile: (path: string, prefix: string) =>
        path.endsWith('.wasm') ? wasm.default : prefix + path,
    })
    Detector = BarcodeDetector as unknown as DetectorClass
  }
  const detector = new Detector({ formats: FORMATS })
  return async (video) =>
    (await detector.detect(video)).map((found) => ({
      value: found.rawValue,
      format: found.format,
    }))
}
