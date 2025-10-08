/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const HTTPS_PREFIX = 'https://';
const HTTP_PREFIX = 'http://';
const PRODUCTION_ENV = 'production';

/**
 * Check if URL uses HTTPS (or HTTP in non-production)
 * @param url - URL to check
 * @returns true if URL is secure or in development mode
 */
export function checkHttps(url: string): boolean {
	return url.startsWith(HTTPS_PREFIX) ||
		(url.startsWith(HTTP_PREFIX) && process.env.NODE_ENV !== PRODUCTION_ENV);
}
