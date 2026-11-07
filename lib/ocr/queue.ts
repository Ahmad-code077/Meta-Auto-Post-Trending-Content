// Pure, DOM-free state transforms for the image OCR queue. Kept separate from the React component
// so the ordering/concatenation logic can be unit-tested without a browser.

export const MAX_IMAGES = 5;

export type QueuedImageStatus = 'pending' | 'running' | 'done' | 'error';

export interface QueuedImage {
    id: string;
    order: number;
    fileName: string;
    thumbnailUrl: string;
    status: QueuedImageStatus;
    text: string;
}

// The job-description text: images in order, one blank line between each, skipping anything not
// yet extracted (pending/running/error) -- it fills in once that image's OCR resolves and this is
// called again.
export function buildConcatenatedText(images: QueuedImage[]): string {
    return images
        .slice()
        .sort((a, b) => a.order - b.order)
        .filter((image) => image.status === 'done' && image.text.trim().length > 0)
        .map((image) => image.text.trim())
        .join('\n\n');
}

// Reassigns contiguous order values from a new visual sequence of ids (e.g. after a drag-and-drop
// reorder). Unknown ids are dropped; this never re-runs OCR, it only renumbers.
export function reorderImages(images: QueuedImage[], orderedIds: string[]): QueuedImage[] {
    const byId = new Map(images.map((image) => [image.id, image]));
    const reordered: QueuedImage[] = [];
    orderedIds.forEach((id, index) => {
        const image = byId.get(id);
        if (image) reordered.push({ ...image, order: index });
    });
    return reordered;
}
