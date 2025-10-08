/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { substring } from 'stringz';

const TRUNCATE_START_INDEX = 0;

/**
 * Truncate a string to a maximum size (Unicode-aware)
 * @param input - String to truncate
 * @param size - Maximum size in characters
 * @returns Truncated string
 */
export function truncate(input: string, size: number): string;

/**
 * Truncate a string to a maximum size (Unicode-aware), handles undefined
 * @param input - String to truncate or undefined
 * @param size - Maximum size in characters
 * @returns Truncated string or undefined if input is undefined
 */
export function truncate(input: string | undefined, size: number): string | undefined;

export function truncate(input: string | undefined, size: number): string | undefined {
	if (!input) {
		return input;
	}
	return substring(input, TRUNCATE_START_INDEX, size);
}
