/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import cd from 'content-disposition';

// Regex to sanitize filename for fallback (keep only word chars, dots, and hyphens)
const FILENAME_SANITIZE_REGEX = /[^\w.-]/g;
const SANITIZE_REPLACEMENT = '_';

/**
 * Generate Content-Disposition header value
 * @param type - Disposition type ('inline' or 'attachment')
 * @param filename - Original filename
 * @returns Content-Disposition header value with sanitized fallback
 */
export function contentDisposition(type: 'inline' | 'attachment', filename: string): string {
	const fallback = filename.replace(FILENAME_SANITIZE_REGEX, SANITIZE_REPLACEMENT);
	return cd(filename, { type, fallback });
}
