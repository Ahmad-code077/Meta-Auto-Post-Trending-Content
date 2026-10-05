// Text normalization shared by skill matching, evidence scoring and validation.

const STOPWORDS = new Set([
    'with', 'that', 'this', 'from', 'your', 'their', 'have', 'will', 'work', 'team', 'using',
    'experience', 'ability', 'strong', 'knowledge', 'including', 'across', 'role', 'years',
    'able', 'such', 'also', 'more', 'into', 'about', 'other', 'based', 'within', 'they',
]);

// Lowercase, with punctuation other than + # turned into spaces.
// "Node.js" becomes "node js", "C++" stays "c++".
export function normalizeText(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9+#]+/g, ' ')
        .trim();
}

export function tokens(value: string): string[] {
    return normalizeText(value)
        .split(' ')
        .filter((word) => word.length >= 4 && !STOPWORDS.has(word));
}

// True when `phrase` appears as whole words in `text`. Both must be normalized.
export function containsPhrase(normalizedText: string, normalizedPhrase: string): boolean {
    if (!normalizedPhrase) return false;
    return ` ${normalizedText} `.includes(` ${normalizedPhrase} `);
}
