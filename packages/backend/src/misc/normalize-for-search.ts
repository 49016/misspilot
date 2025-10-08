/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Unicode normalization form: Compatibility Composition
const NORMALIZATION_FORM = 'NFKC';

/**
 * Normalize text for search by applying Unicode normalization and lowercase
 * ref.
 * - https://analytics-note.xyz/programming/unicode-normalization-forms/
 * - https://maku77.github.io/js/string/normalize.html
 * @param tag - Text to normalize
 * @returns Normalized and lowercased text
 */
export function normalizeForSearch(tag: string): string {
	return tag.normalize(NORMALIZATION_FORM).toLowerCase();
}
