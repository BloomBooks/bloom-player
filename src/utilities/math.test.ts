import { roundToNearestK, normalizeDigits } from "./mathUtils";

const roundToNearestEvenCases = [
    [0, 0],
    [1, 2],
    [2, 2],
    [2.99, 2],
    [3, 4],
    [3.99, 4],
    [4, 4],
];
test.each(roundToNearestEvenCases)(
    "roundToNearestK, k=2",
    (input, expected) => {
        const result = roundToNearestK(input, 2);
        expect(result).toEqual(expected);
    },
);

const roundToNearest4Cases = [
    [0, 0],
    [1, 0],
    [1.99, 0],
    [2, 4],
    [3, 4],
    [3.99, 4],
    [4, 4],
];

test.each(roundToNearest4Cases)("roundToNearestK, k=4", (input, expected) => {
    const result = roundToNearestK(input, 4);
    expect(result).toEqual(expected);
});

test("normalizeDigits from mathUtils.ts", () => {
    expect(normalizeDigits("1234567890")).toEqual("1234567890");
    expect(normalizeDigits("١٢٣٤٥٦٧٨٩٠")).toEqual("1234567890");
    expect(normalizeDigits("०१२३४५६७८९")).toEqual("0123456789");
    expect(normalizeDigits("٦٧٨٩٠١٢٣٤٥")).toEqual("6789012345");
    expect(normalizeDigits("१२३४५६७८९०١٢٣٤٥٦٧٨٩٠")).toEqual(
        "12345678901234567890",
    );
    expect(normalizeDigits("١٢٣٤٥٦٧٨٩٠cover")).toEqual("1234567890cover");
    expect(normalizeDigits("test")).toEqual("test");
    expect(normalizeDigits("cover")).toBeUndefined(); // special case
    expect(normalizeDigits("")).toBeUndefined();
    expect(normalizeDigits(undefined)).toBeUndefined();
    expect(normalizeDigits(null)).toBeUndefined();
});
