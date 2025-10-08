/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { FILE_TYPE_BROWSERSAFE } from '@/const.js';

/**
 * Dictionary of MIME types categorized by image processing capabilities
 */
const MIME_TYPE_DICTIONARY = {
	'safe-file': FILE_TYPE_BROWSERSAFE,
	'sharp-convertible-image': ['image/jpeg', 'image/tiff', 'image/png', 'image/gif', 'image/apng', 'image/vnd.mozilla.apng', 'image/webp', 'image/avif', 'image/svg+xml'],
	'sharp-animation-convertible-image': ['image/jpeg', 'image/tiff', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml'],
	'sharp-convertible-image-with-bmp': ['image/jpeg', 'image/tiff', 'image/png', 'image/gif', 'image/apng', 'image/vnd.mozilla.apng', 'image/webp', 'image/avif', 'image/svg+xml', 'image/x-icon', 'image/bmp'],
	'sharp-animation-convertible-image-with-bmp': ['image/jpeg', 'image/tiff', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml', 'image/x-icon', 'image/bmp'],
} as const;

/**
 * Check if a MIME type is in a specific category
 * @param mime - MIME type to check
 * @param type - Category type to check against
 * @returns true if MIME type is in the specified category
 */
export const isMimeImage = (mime: string, type: keyof typeof MIME_TYPE_DICTIONARY): boolean => 
	MIME_TYPE_DICTIONARY[type].includes(mime);
