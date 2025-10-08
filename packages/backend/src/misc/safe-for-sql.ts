/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Characters that are unsafe for SQL
const UNSAFE_SQL_CHARS = /[\0\x08\x09\x1a\n\r"'\\\%]/g;

/**
 * Check if text is safe for SQL queries
 * @param text - Text to check
 * @returns true if text contains no unsafe SQL characters
 */
export function safeForSql(text: string): boolean {
	return !UNSAFE_SQL_CHARS.test(text);
}
