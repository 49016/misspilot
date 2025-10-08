/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Characters that need escaping in SQL LIKE patterns
const SQL_LIKE_SPECIAL_CHARS = /([\\%_])/g;
const ESCAPE_REPLACEMENT = '\\$1';

/**
 * Escape special characters in SQL LIKE patterns
 * @param s - String to escape
 * @returns Escaped string safe for SQL LIKE clauses
 */
export function sqlLikeEscape(s: string): string {
	return s.replace(SQL_LIKE_SPECIAL_CHARS, ESCAPE_REPLACEMENT);
}
