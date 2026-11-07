// Client-only OCR via tesseract.js. One worker is created lazily on first use and shared for the
// rest of the page session -- recreating it per image would reload the WASM core and traineddata
// (several MB) every time. tesseract.js is dynamically imported so its payload is never in the
// initial bundle for users who never attach an image.

import type { Worker } from 'tesseract.js';
import { loadImageToCanvas, preprocessForOcr } from './preprocess';

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
    if (!workerPromise) {
        workerPromise = (async () => {
            const { createWorker, PSM } = await import('tesseract.js');
            const worker = await createWorker('eng');
            await worker.setParameters({
                // A screenshot is one coherent block, not a multi-column page.
                tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
                // Keeps code indentation closer to faithful.
                preserve_interword_spaces: '1',
            });
            return worker;
        })();
    }
    return workerPromise;
}

export async function recognizeImage(file: File): Promise<string> {
    const canvas = await loadImageToCanvas(file);
    preprocessForOcr(canvas);
    const worker = await getWorker();
    const { data } = await worker.recognize(canvas);
    return data.text.trim();
}

export async function terminateOcrEngine(): Promise<void> {
    if (!workerPromise) return;
    const pending = workerPromise;
    workerPromise = null;
    const worker = await pending;
    await worker.terminate();
}
