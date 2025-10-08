/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Writable, WritableOptions } from 'node:stream';

/**
 * A writable stream that discards all data (similar to /dev/null)
 * Useful for testing or when output needs to be silenced
 */
export class DevNull extends Writable implements NodeJS.WritableStream {
	constructor(opts?: WritableOptions) {
		super(opts);
	}

	/**
	 * Write implementation that discards data immediately
	 * @param chunk - Data chunk to discard
	 * @param encoding - Character encoding
	 * @param cb - Callback to invoke after discarding
	 */
	_write(chunk: any, encoding: BufferEncoding, cb: (err?: Error | null) => void): void {
		setImmediate(cb);
	}
}
