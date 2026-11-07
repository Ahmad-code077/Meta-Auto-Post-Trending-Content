// Splits a bulk-pasted block of text into one idea per line, in the order pasted.
export function parseIdeaLines(text: string): string[] {
    return text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
}
