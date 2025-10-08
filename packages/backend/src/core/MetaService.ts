/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import { MiMeta } from '@/models/Meta.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { bindThis } from '@/decorators.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import { FeaturedService } from '@/core/FeaturedService.js';
import type { OnApplicationShutdown } from '@nestjs/common';

@Injectable()
export class MetaService implements OnApplicationShutdown {
	private cache: MiMeta | undefined;
	private intervalId: NodeJS.Timeout;

	constructor(
		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.db)
		private db: DataSource,

		private featuredService: FeaturedService,
		private globalEventService: GlobalEventService,
	) {
		//this.onMessage = this.onMessage.bind(this);

		if (process.env.NODE_ENV !== 'test') {
			this.intervalId = setInterval(() => {
				this.fetch(true).then(meta => {
					// fetch内でもセットしてるけど仕様変更の可能性もあるため一応
					this.cache = meta;
				});
			}, 1000 * 60 * 5);
		}

		this.redisForSub.on('message', this.onMessage);
	}

	@bindThis
	private async onMessage(_channel: string, data: string): Promise<void> {
		try {
			const obj = JSON.parse(data);

			if (obj.channel === 'internal') {
				const { type, body } = obj.message as GlobalEvents['internal']['payload'];
				switch (type) {
					case 'metaUpdated': {
						// TODO: Deserialization logic should be exported from model files
						this.cache = {
							...body.after,
							// Joined columns are not normally fetched, so reset them
							rootUser: null,
						};
						break;
					}
					default:
						break;
				}
			}
		} catch (error) {
			console.error('Failed to process meta update message:', error);
		}
	}

	/**
	 * Fetch metadata from database
	 * @param noCache If true, bypass cache and fetch fresh data
	 * @returns Meta instance
	 */
	@bindThis
	public async fetch(noCache = false): Promise<MiMeta> {
		// Return cached value if available and caching is enabled
		if (!noCache && this.cache) {
			return this.cache;
		}

		return await this.db.transaction(async transactionalEntityManager => {
			// Due to past bugs, multiple records might exist - prioritize newest ID
			const metas = await transactionalEntityManager.find(MiMeta, {
				order: { id: 'DESC' },
			});

			const existingMeta = metas[0];

			if (existingMeta) {
				this.cache = existingMeta;
				return existingMeta;
			}

			// No meta exists - create one using upsert to handle race conditions
			// (when multiple fetch calls occur simultaneously)
			try {
				const result = await transactionalEntityManager.upsert(
					MiMeta,
					{ id: 'x' },
					['id']
				);
				
				const savedMeta = await transactionalEntityManager.findOneByOrFail(
					MiMeta,
					result.identifiers[0]
				);

				this.cache = savedMeta;
				return savedMeta;
			} catch (error) {
				console.error('Failed to initialize meta record:', error);
				throw new Error('Meta initialization failed');
			}
		});
	}

	/**
	 * Update metadata in database
	 * @param data Partial meta data to update
	 * @returns Updated meta instance
	 */
	@bindThis
	public async update(data: Partial<MiMeta>): Promise<MiMeta> {
		let before: MiMeta | undefined;

		const updated = await this.db.transaction(async transactionalEntityManager => {
			const metas = await transactionalEntityManager.find(MiMeta, {
				order: { id: 'DESC' },
			});

			before = metas[0];

			if (before) {
				await transactionalEntityManager.update(MiMeta, before.id, data);
			} else {
				await transactionalEntityManager.save(MiMeta, {
					...data,
					id: 'x',
				});
			}

			const updatedMetas = await transactionalEntityManager.find(MiMeta, {
				order: { id: 'DESC' },
			});

			return updatedMetas[0];
		});

		// Handle hidden tags changes asynchronously
		if (data.hiddenTags && before) {
			this.handleHiddenTagsUpdate(data.hiddenTags, before.hiddenTags);
		}

		// Publish update event
		this.globalEventService.publishInternalEvent('metaUpdated', { before, after: updated });

		return updated;
	}

	/**
	 * Handle changes to hidden tags by removing newly hidden tags from ranking
	 */
	@bindThis
	private handleHiddenTagsUpdate(newHiddenTags: string[], oldHiddenTags: string[]): void {
		process.nextTick(() => {
			const newlyHiddenTags = new Set(newHiddenTags);
			
			// Remove tags that were already hidden (they're not newly hidden)
			for (const oldTag of oldHiddenTags) {
				newlyHiddenTags.delete(oldTag);
			}

			// Remove newly hidden tags from ranking
			for (const tag of newlyHiddenTags) {
				this.featuredService.removeHashtagsFromRanking(tag);
			}
		});
	}

	@bindThis
	public dispose(): void {
		clearInterval(this.intervalId);
		this.redisForSub.off('message', this.onMessage);
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
