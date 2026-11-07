'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    arrayMove,
    horizontalListSortingStrategy,
    sortableKeyboardCoordinates,
    useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertCircle, Loader2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { recognizeImage } from '@/lib/ocr/engine'
import { buildConcatenatedText, MAX_IMAGES, reorderImages, type QueuedImage } from '@/lib/ocr/queue'

interface ImageOcrQueueProps {
    onTextChange: (text: string) => void
}

// Attaches up to MAX_IMAGES screenshots of a job posting, OCRs each one client-side
// (lib/ocr/engine.ts), and keeps the caller's text in sync with the concatenation of their
// extracted text in drag-reorderable order. Nothing here leaves the browser: no image is
// uploaded, stored, or kept once it's removed, submitted, or this component unmounts.
export function ImageOcrQueue({ onTextChange }: ImageOcrQueueProps) {
    const { toast } = useToast()
    const [images, setImages] = useState<QueuedImage[]>([])
    const [activeId, setActiveId] = useState<string | null>(null)
    const [previewId, setPreviewId] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    // Files aren't part of React state (only their derived thumbnail/text are) -- this ref is the
    // one place the actual bytes live, so a failed image can be retried without re-attaching it.
    const filesRef = useRef<Map<string, File>>(new Map())
    // Skips the one sync-effect run on mount, when images is always [] and there is nothing to
    // tell the caller that it doesn't already know.
    const hasMounted = useRef(false)

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    // The one place onTextChange is called. Runs as an effect -- never inside a setState updater
    // -- so it can never fire while React is still rendering this component or its parent.
    useEffect(() => {
        if (!hasMounted.current) {
            hasMounted.current = true
            return
        }
        onTextChange(buildConcatenatedText(images))
    }, [images, onTextChange])

    useEffect(() => {
        const files = filesRef.current
        return () => {
            for (const image of images) URL.revokeObjectURL(image.thumbnailUrl)
            files.clear()
        }
        // Only on unmount -- the cleanup above handles every image present at that point.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const runOcr = useCallback((id: string) => {
        const file = filesRef.current.get(id)
        if (!file) return

        setImages((prev) => prev.map((image) => (image.id === id ? { ...image, status: 'running' } : image)))
        recognizeImage(file)
            .then((text) => {
                setImages((prev) => prev.map((image) => (image.id === id ? { ...image, status: 'done' as const, text } : image)))
            })
            .catch((error) => {
                console.error('OCR failed:', error)
                setImages((prev) => prev.map((image) => (image.id === id ? { ...image, status: 'error' as const } : image)))
            })
    }, [])

    const attach = (fileList: FileList | null) => {
        if (!fileList || fileList.length === 0) return
        const files = Array.from(fileList)
        const freeSlots = MAX_IMAGES - images.length
        const accepted = files.slice(0, freeSlots)
        if (files.length > accepted.length) {
            toast({
                title: 'Only 5 images at a time',
                description: `${files.length - accepted.length} image(s) were not added.`,
            })
        }

        const newImages: QueuedImage[] = accepted.map((file, index) => {
            const id = crypto.randomUUID()
            filesRef.current.set(id, file)
            return {
                id,
                order: images.length + index,
                fileName: file.name,
                thumbnailUrl: URL.createObjectURL(file),
                status: 'pending',
                text: '',
            }
        })

        setImages((prev) => [...prev, ...newImages])
        for (const image of newImages) runOcr(image.id)

        if (inputRef.current) inputRef.current.value = ''
    }

    const removeImage = (id: string) => {
        setImages((prev) => {
            const removed = prev.find((image) => image.id === id)
            if (removed) URL.revokeObjectURL(removed.thumbnailUrl)
            filesRef.current.delete(id)

            return prev
                .filter((image) => image.id !== id)
                .sort((a, b) => a.order - b.order)
                .map((image, index) => ({ ...image, order: index }))
        })
        setPreviewId((current) => (current === id ? null : current))
    }

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(String(event.active.id))
    }

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        setActiveId(null)
        if (!over || active.id === over.id) return

        setImages((prev) => {
            const orderedIds = prev
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((image) => image.id)
            const oldIndex = orderedIds.indexOf(String(active.id))
            const newIndex = orderedIds.indexOf(String(over.id))
            if (oldIndex === -1 || newIndex === -1) return prev

            return reorderImages(prev, arrayMove(orderedIds, oldIndex, newIndex))
        })
    }

    const sortedImages = images.slice().sort((a, b) => a.order - b.order)
    const atCapacity = images.length >= MAX_IMAGES
    const activeImage = activeId ? sortedImages.find((image) => image.id === activeId) ?? null : null
    const previewImage = previewId ? images.find((image) => image.id === previewId) ?? null : null

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Attach screenshots (optional)</p>
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    className="sr-only"
                    id="job-posting-images"
                    disabled={atCapacity}
                    onChange={(event) => attach(event.target.files)}
                />
                <Button asChild variant="outline" size="sm">
                    <label
                        htmlFor="job-posting-images"
                        className={cn('cursor-pointer', atCapacity && 'pointer-events-none opacity-50')}
                    >
                        <Upload />
                        Attach images ({images.length}/{MAX_IMAGES})
                    </label>
                </Button>
            </div>

            {sortedImages.length > 0 && (
                <>
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext items={sortedImages.map((image) => image.id)} strategy={horizontalListSortingStrategy}>
                            <div className="flex gap-3 overflow-x-auto pb-1">
                                {sortedImages.map((image, index) => (
                                    <SortableThumbnail
                                        key={image.id}
                                        image={image}
                                        index={index}
                                        onRemove={() => removeImage(image.id)}
                                        onRetry={() => runOcr(image.id)}
                                        onPreview={() => setPreviewId(image.id)}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                        <DragOverlay>
                            {activeImage && <ThumbnailVisual image={activeImage} index={sortedImages.indexOf(activeImage)} floating />}
                        </DragOverlay>
                    </DndContext>
                    <p className="text-xs text-muted-foreground">
                        Click a thumbnail to preview it, or drag to reorder. The job description below is rebuilt from
                        the images in this order -- edits made there are replaced the next time an image is attached,
                        removed, or reordered.
                    </p>
                </>
            )}

            <Dialog open={previewImage !== null} onOpenChange={(open) => !open && setPreviewId(null)}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{previewImage?.fileName}</DialogTitle>
                    </DialogHeader>
                    {previewImage && (
                        // eslint-disable-next-line @next/next/no-img-element -- a local blob: URL preview, not an optimizable remote asset
                        <img src={previewImage.thumbnailUrl} alt={previewImage.fileName} className="max-h-[70vh] w-full object-contain" />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}

function SortableThumbnail({
    image,
    index,
    onRemove,
    onRetry,
    onPreview,
}: {
    image: QueuedImage
    index: number
    onRemove: () => void
    onRetry: () => void
    onPreview: () => void
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: image.id })
    const style = { transform: CSS.Transform.toString(transform), transition }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="cursor-grab touch-none active:cursor-grabbing"
            {...attributes}
            {...listeners}
        >
            <ThumbnailVisual
                image={image}
                index={index}
                isDragging={isDragging}
                onRemove={onRemove}
                onRetry={onRetry}
                onClick={onPreview}
            />
        </div>
    )
}

// Shared visual for a thumbnail. Used both for the real, interactive, sortable item and for the
// DragOverlay's floating copy (which has no drag/remove/retry wiring of its own -- the overlay is
// a presentation-only ghost that follows the pointer while the real item is being reordered).
function ThumbnailVisual({
    image,
    index,
    isDragging,
    floating,
    onRemove,
    onRetry,
    onClick,
}: {
    image: QueuedImage
    index: number
    isDragging?: boolean
    floating?: boolean
    onRemove?: () => void
    onRetry?: () => void
    onClick?: () => void
}) {
    return (
        <div
            className={cn(
                'relative flex h-32 w-28 shrink-0 flex-col overflow-hidden rounded-md border bg-muted',
                isDragging && 'opacity-40',
                floating && 'shadow-xl'
            )}
        >
            <div className="absolute left-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-background/90 text-xs font-medium text-foreground shadow">
                {index + 1}
            </div>
            {onRemove && (
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation()
                        onRemove()
                    }}
                    className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow hover:text-destructive"
                    aria-label={`Remove ${image.fileName}`}
                >
                    <X className="h-3 w-3" />
                </button>
            )}
            <button
                type="button"
                onClick={onClick}
                disabled={!onClick}
                className={cn('flex-1', onClick && 'cursor-zoom-in')}
            >
                {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: URL, never an optimizable remote asset */}
                <img src={image.thumbnailUrl} alt={image.fileName} className="h-full w-full object-cover" />
            </button>
            <div className="flex items-center justify-center gap-1 border-t bg-background/90 py-1 text-xs">
                {image.status === 'pending' && <span className="text-muted-foreground">Waiting</span>}
                {image.status === 'running' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                {image.status === 'done' && <span className="text-muted-foreground">Extracted</span>}
                {image.status === 'error' && onRetry && (
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation()
                            onRetry()
                        }}
                        className="flex items-center gap-1 text-destructive hover:underline"
                    >
                        <AlertCircle className="h-3 w-3" />
                        Retry
                    </button>
                )}
            </div>
        </div>
    )
}
