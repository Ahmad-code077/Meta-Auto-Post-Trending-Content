// Pure-logic tests for the image OCR queue. Canvas preprocessing and real OCR need a browser and
// are verified manually (see the plan); only the DOM-free decisions are covered here.

import test from 'node:test'
import assert from 'node:assert/strict'
import { isDarkBackground } from '../lib/ocr/preprocess'
import { buildConcatenatedText, reorderImages, type QueuedImage } from '../lib/ocr/queue'

function image(overrides: Partial<QueuedImage> = {}): QueuedImage {
    return {
        id: 'img-1',
        order: 0,
        fileName: 'screenshot.png',
        thumbnailUrl: 'blob:fake',
        status: 'done',
        text: '',
        ...overrides,
    }
}

test('isDarkBackground is true when sampled luminance averages below the threshold', () => {
    assert.equal(isDarkBackground([10, 20, 15, 5]), true)
})

test('isDarkBackground is false when sampled luminance averages above the threshold', () => {
    assert.equal(isDarkBackground([230, 240, 210, 250]), false)
})

test('isDarkBackground is false for an empty sample, rather than dividing by zero', () => {
    assert.equal(isDarkBackground([]), false)
})

test('buildConcatenatedText joins done images in order with one blank line between them', () => {
    const images = [
        image({ id: 'a', order: 1, status: 'done', text: 'second block' }),
        image({ id: 'b', order: 0, status: 'done', text: 'first block' }),
    ]
    assert.equal(buildConcatenatedText(images), 'first block\n\nsecond block')
})

test('buildConcatenatedText skips images that are not done yet', () => {
    const images = [
        image({ id: 'a', order: 0, status: 'done', text: 'ready' }),
        image({ id: 'b', order: 1, status: 'running', text: '' }),
        image({ id: 'c', order: 2, status: 'error', text: '' }),
        image({ id: 'd', order: 3, status: 'pending', text: '' }),
    ]
    assert.equal(buildConcatenatedText(images), 'ready')
})

test('buildConcatenatedText skips a done image whose extracted text is blank', () => {
    const images = [
        image({ id: 'a', order: 0, status: 'done', text: '   ' }),
        image({ id: 'b', order: 1, status: 'done', text: 'real text' }),
    ]
    assert.equal(buildConcatenatedText(images), 'real text')
})

test('buildConcatenatedText returns an empty string when nothing is done', () => {
    assert.equal(buildConcatenatedText([image({ status: 'pending' })]), '')
})

test('reorderImages renumbers order to match the given id sequence', () => {
    const images = [image({ id: 'a', order: 0 }), image({ id: 'b', order: 1 }), image({ id: 'c', order: 2 })]
    const reordered = reorderImages(images, ['c', 'a', 'b'])
    assert.deepEqual(reordered.map((img) => [img.id, img.order]), [['c', 0], ['a', 1], ['b', 2]])
})

test('reorderImages drops ids that no longer exist in the image list', () => {
    const images = [image({ id: 'a', order: 0 }), image({ id: 'b', order: 1 })]
    const reordered = reorderImages(images, ['b', 'ghost', 'a'])
    assert.deepEqual(reordered.map((img) => img.id), ['b', 'a'])
})
