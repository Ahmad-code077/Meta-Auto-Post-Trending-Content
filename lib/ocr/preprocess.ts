// Canvas-based preprocessing for OCR. Tesseract's LSTM engine is tuned for dark text on a light
// background and does noticeably better above a minimum font size -- both of these are the common
// failure modes for screenshots of code/terminal output, which are frequently small and dark-mode.

// Below this image width, the image is upscaled 2x before OCR.
const MIN_WIDTH_BEFORE_UPSCALE = 1000;
// Average sampled luminance (0-255) below this is treated as a dark background.
const DARK_BACKGROUND_LUMINANCE = 128;
// Pixels are sampled at this stride rather than read individually -- fast enough for a live upload.
const LUMINANCE_SAMPLE_STRIDE = 97; // prime, so it doesn't line up with common image row widths

// Pure: given sampled per-pixel luminance values, decide whether the image looks like a dark-mode
// screenshot that should be inverted before OCR. Exported separately from the canvas sampling so
// it can be unit-tested with plain arrays.
export function isDarkBackground(luminanceSamples: number[]): boolean {
    if (luminanceSamples.length === 0) return false;
    const average = luminanceSamples.reduce((sum, value) => sum + value, 0) / luminanceSamples.length;
    return average < DARK_BACKGROUND_LUMINANCE;
}

function sampleLuminance(ctx: CanvasRenderingContext2D, width: number, height: number): number[] {
    const { data } = ctx.getImageData(0, 0, width, height);
    const samples: number[] = [];
    for (let i = 0; i < data.length; i += LUMINANCE_SAMPLE_STRIDE * 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        samples.push(0.299 * r + 0.587 * g + 0.114 * b);
    }
    return samples;
}

function invert(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'difference';
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
}

// Draws the file onto a fresh canvas, upscaling small images, ready for recognizeImage() in
// lib/ocr/engine.ts to run OCR on it.
export async function loadImageToCanvas(file: File): Promise<HTMLCanvasElement> {
    const bitmap = await createImageBitmap(file);
    try {
        const scale = bitmap.width < MIN_WIDTH_BEFORE_UPSCALE ? 2 : 1;
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width * scale;
        canvas.height = bitmap.height * scale;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas is not supported in this browser');
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        return canvas;
    } finally {
        bitmap.close();
    }
}

// Mutates the canvas in place: inverts it if it looks like a dark-mode screenshot.
export function preprocessForOcr(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const samples = sampleLuminance(ctx, canvas.width, canvas.height);
    if (isDarkBackground(samples)) invert(ctx, canvas.width, canvas.height);
    return canvas;
}
