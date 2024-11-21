export function roundToNearestEven(x: number): number {
    return roundToNearestK(x, 2);
}

/**
 * Rounds to the nearest number which is evenly divisible by k.
 */
export function roundToNearestK(x: number, k: number): number {
    return Math.round(x / k) * k;
}

// This may not be a math function, strictly speaking, but it's at least
// math adjacent.
/**
 * Convert all Unicode digits in a string to ASCII digits.
 */
// adapted from https://stackoverflow.com/questions/17024985/javascript-cant-convert-hindi-arabic-numbers-to-real-numeric-variables
export function normalizeDigits(str): string | undefined {
    if (!str || str === "cover") {
        return undefined; // not a number we can parse
    }
    if (/^\d+$/.test(str)) {
        return str; // entire string is ASCII decimal digits
    }
    try {
        // find all characters which are DecimalNumber (property Nd), except for ASCII 0-9
        return str.replace(/(?![0-9])\p{Nd}/gu, (g) => {
            // all Nd blocks start at 0x...0 or end at 0x...F (and starts at 0x...6)
            // if it starts at 0x...0, the ASCII decimal number is (i & 0xf)
            // if it ends at 0x...F, the ASCII decimal number is (i & 0xf) - 6
            // we recognize the 2 cases by testing if code | 0xf == 0x...F is still a decimal number
            const code = g.charCodeAt(0);
            return (
                (code & 0xf) -
                6 * (/\p{Nd}/u.test(String.fromCodePoint(code | 0xf)) ? 1 : 0)
            );
        });
    } catch (e) {
        return undefined;
    }
}
