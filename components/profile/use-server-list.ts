'use client'

import { useState } from 'react'

// Local copy of a list that comes from the server, so it can change optimistically.
// When the server sends new data (after revalidation), the local copy is replaced.
export function useServerList<T>(serverItems: T[]) {
    const [items, setItems] = useState(serverItems)
    const [source, setSource] = useState(serverItems)

    if (source !== serverItems) {
        setSource(serverItems)
        setItems(serverItems)
    }

    return [items, setItems] as const
}
