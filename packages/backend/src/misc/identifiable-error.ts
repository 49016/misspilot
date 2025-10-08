/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const DEFAULT_ERROR_MESSAGE = '';

/**
 * Error with an identifier for easier tracking and debugging
 * ID付きエラー
 */
export class IdentifiableError extends Error {
	public message: string;
	public id: string;

	/**
	 * Create an identifiable error
	 * @param id - Unique identifier for the error
	 * @param message - Optional error message
	 */
	constructor(id: string, message?: string) {
		super(message);
		this.message = message ?? DEFAULT_ERROR_MESSAGE;
		this.id = id;
	}
}
