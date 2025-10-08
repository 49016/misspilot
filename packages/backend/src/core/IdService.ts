/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { genAid, isSafeAidT, parseAid, parseAidFull } from '@/misc/id/aid.js';
import { genAidx, isSafeAidxT, parseAidx, parseAidxFull } from '@/misc/id/aidx.js';
import { genMeid, isSafeMeidT, parseMeid, parseMeidFull } from '@/misc/id/meid.js';
import { genMeidg, isSafeMeidgT, parseMeidg, parseMeidgFull } from '@/misc/id/meidg.js';
import { genObjectId, isSafeObjectIdT, parseObjectId, parseObjectIdFull } from '@/misc/id/object-id.js';
import { bindThis } from '@/decorators.js';
import { parseUlid, parseUlidFull } from '@/misc/id/ulid.js';

@Injectable()
export class IdService {
	private method: string;

	constructor(
		@Inject(DI.config)
		private config: Config,
	) {
		this.method = config.id.toLowerCase();
	}

	@bindThis
	public isSafeT(t: number): boolean {
		switch (this.method) {
			case 'aid': return isSafeAidT(t);
			case 'aidx': return isSafeAidxT(t);
			case 'meid': return isSafeMeidT(t);
			case 'meidg': return isSafeMeidgT(t);
			case 'ulid': return t > 0;
			case 'objectid': return isSafeObjectIdT(t);
			default: throw new Error('unrecognized id generation method');
		}
	}

	/**
	 * Generate an ID based on the specified timestamp (defaults to current time)
	 * @param time Timestamp in milliseconds (optional, defaults to now)
	 * @returns Generated ID string
	 * @throws Error if ID generation method is not recognized
	 */
	@bindThis
	public gen(time?: number): string {
		// Use current time if not provided or if provided time is in the future
		const timestamp = (!time || (time > Date.now())) ? Date.now() : time;

		try {
			switch (this.method) {
				case 'aid': return genAid(timestamp);
				case 'aidx': return genAidx(timestamp);
				case 'meid': return genMeid(timestamp);
				case 'meidg': return genMeidg(timestamp);
				case 'ulid': return ulid(timestamp);
				case 'objectid': return genObjectId(timestamp);
				default: throw new Error(`Unrecognized ID generation method: ${this.method}`);
			}
		} catch (error) {
			console.error(`Failed to generate ID using method '${this.method}':`, error);
			throw error;
		}
	}

	/**
	 * Parse an ID to extract its creation date
	 * @param id ID string to parse
	 * @returns Object containing the Date when the ID was created
	 * @throws Error if ID generation method is not recognized or parsing fails
	 */
	@bindThis
	public parse(id: string): { date: Date; } {
		try {
			switch (this.method) {
				case 'aid': return parseAid(id);
				case 'aidx': return parseAidx(id);
				case 'objectid': return parseObjectId(id);
				case 'meid': return parseMeid(id);
				case 'meidg': return parseMeidg(id);
				case 'ulid': return parseUlid(id);
				default: throw new Error(`Unrecognized ID generation method: ${this.method}`);
			}
		} catch (error) {
			console.error(`Failed to parse ID '${id}' using method '${this.method}':`, error);
			throw error;
		}
	}

	/**
	 * Parse an ID to extract both creation timestamp and additional data
	 * @param id ID string to parse
	 * @returns Object containing the timestamp (in milliseconds) and additional data (up to 64 bits)
	 * @throws Error if ID generation method is not recognized or parsing fails
	 */
	@bindThis
	public parseFull(id: string): { date: number; additional: bigint; } {
		try {
			switch (this.method) {
				case 'aid': return parseAidFull(id);
				case 'aidx': return parseAidxFull(id);
				case 'objectid': return parseObjectIdFull(id);
				case 'meid': return parseMeidFull(id);
				case 'meidg': return parseMeidgFull(id);
				case 'ulid': return parseUlidFull(id);
				default: throw new Error(`Unrecognized ID generation method: ${this.method}`);
			}
		} catch (error) {
			console.error(`Failed to parse full ID '${id}' using method '${this.method}':`, error);
			throw error;
		}
	}
}
