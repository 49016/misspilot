/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Global, Inject, Module } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { MeiliSearch } from 'meilisearch';
import { MiMeta } from '@/models/Meta.js';
import { DI } from './di-symbols.js';
import { Config, loadConfig } from './config.js';
import { createPostgresDataSource } from './postgres.js';
import { RepositoryModule } from './models/RepositoryModule.js';
import { allSettled } from './misc/promise-tracker.js';
import { GlobalEvents } from './core/GlobalEventService.js';
import type { Provider, OnApplicationShutdown } from '@nestjs/common';

const $config: Provider = {
	provide: DI.config,
	useValue: loadConfig(),
};

const $db: Provider = {
	provide: DI.db,
	useFactory: async (config) => {
		try {
			const db = createPostgresDataSource(config);
			const connection = await db.initialize();
			console.log('Database connection established successfully');
			return connection;
		} catch (e) {
			console.error('Failed to initialize database connection:', e);
			// Provide more context about the error
			if (e instanceof Error) {
				console.error('Error details:', {
					message: e.message,
					stack: e.stack,
				});
			}
			throw new Error(`Database initialization failed: ${e instanceof Error ? e.message : String(e)}`);
		}
	},
	inject: [DI.config],
};

const $meilisearch: Provider = {
	provide: DI.meilisearch,
	useFactory: (config: Config) => {
		if (config.fulltextSearch?.provider === 'meilisearch') {
			if (!config.meilisearch) {
				throw new Error('MeiliSearch is enabled but no configuration is provided');
			}

			return new MeiliSearch({
				host: `${config.meilisearch.ssl ? 'https' : 'http'}://${config.meilisearch.host}:${config.meilisearch.port}`,
				apiKey: config.meilisearch.apiKey,
			});
		} else {
			return null;
		}
	},
	inject: [DI.config],
};

const $redis: Provider = {
	provide: DI.redis,
	useFactory: (config: Config) => {
		return new Redis.Redis(config.redis);
	},
	inject: [DI.config],
};

const $redisForPub: Provider = {
	provide: DI.redisForPub,
	useFactory: (config: Config) => {
		const redis = new Redis.Redis(config.redisForPubsub);
		return redis;
	},
	inject: [DI.config],
};

const $redisForSub: Provider = {
	provide: DI.redisForSub,
	useFactory: (config: Config) => {
		const redis = new Redis.Redis(config.redisForPubsub);
		redis.subscribe(config.host);
		return redis;
	},
	inject: [DI.config],
};

const $redisForTimelines: Provider = {
	provide: DI.redisForTimelines,
	useFactory: (config: Config) => {
		return new Redis.Redis(config.redisForTimelines);
	},
	inject: [DI.config],
};

const $redisForReactions: Provider = {
	provide: DI.redisForReactions,
	useFactory: (config: Config) => {
		return new Redis.Redis(config.redisForReactions);
	},
	inject: [DI.config],
};

const $meta: Provider = {
	provide: DI.meta,
	useFactory: async (db: DataSource, redisForSub: Redis.Redis) => {
		const meta = await db.transaction(async transactionalEntityManager => {
			// Due to past bugs, there might be multiple records. Prioritize the newest ID
			const metas = await transactionalEntityManager.find(MiMeta, {
				order: {
					id: 'DESC',
				},
			});

			const existingMeta = metas[0];

			if (existingMeta) {
				return existingMeta;
			}

			// If meta is empty and fetchMeta is called simultaneously, 
			// use failsafe upsert to prevent race conditions
			try {
				const saved = await transactionalEntityManager
					.upsert(
						MiMeta,
						{
							id: 'x',
						},
						['id'],
					)
					.then((result) => transactionalEntityManager.findOneByOrFail(MiMeta, result.identifiers[0]));

				return saved;
			} catch (error) {
				console.error('Failed to initialize meta record:', error);
				throw new Error('Meta record initialization failed');
			}
		});

		async function handleRedisMessage(_channel: string, data: string): Promise<void> {
			try {
				const obj = JSON.parse(data);

				if (obj.channel === 'internal') {
					const { type, body } = obj.message as GlobalEvents['internal']['payload'];
					switch (type) {
						case 'metaUpdated': {
							// Update meta properties with new values
							Object.assign(meta, body.after);
							// Reset joined columns that aren't normally fetched
							meta.rootUser = null;
							break;
						}
						default:
							break;
					}
				}
			} catch (error) {
				console.error('Failed to process Redis message:', error);
			}
		}

		redisForSub.on('message', handleRedisMessage);

		return meta;
	},
	inject: [DI.db, DI.redisForSub],
};

@Global()
@Module({
	imports: [RepositoryModule],
	providers: [$config, $db, $meta, $meilisearch, $redis, $redisForPub, $redisForSub, $redisForTimelines, $redisForReactions],
	exports: [$config, $db, $meta, $meilisearch, $redis, $redisForPub, $redisForSub, $redisForTimelines, $redisForReactions, RepositoryModule],
})
export class GlobalModule implements OnApplicationShutdown {
	constructor(
		@Inject(DI.db) private db: DataSource,
		@Inject(DI.redis) private redisClient: Redis.Redis,
		@Inject(DI.redisForPub) private redisForPub: Redis.Redis,
		@Inject(DI.redisForSub) private redisForSub: Redis.Redis,
		@Inject(DI.redisForTimelines) private redisForTimelines: Redis.Redis,
		@Inject(DI.redisForReactions) private redisForReactions: Redis.Redis,
	) { }

	public async dispose(): Promise<void> {
		console.log('Starting graceful shutdown...');
		
		try {
			// Wait for all potential DB queries to complete
			await allSettled();
			console.log('All pending database queries completed');
			
			// Disconnect from all services in parallel
			await Promise.all([
				this.db.destroy().catch(err => console.error('Error destroying database connection:', err)),
				this.redisClient.disconnect().catch(err => console.error('Error disconnecting Redis client:', err)),
				this.redisForPub.disconnect().catch(err => console.error('Error disconnecting Redis pub:', err)),
				this.redisForSub.disconnect().catch(err => console.error('Error disconnecting Redis sub:', err)),
				this.redisForTimelines.disconnect().catch(err => console.error('Error disconnecting Redis timelines:', err)),
				this.redisForReactions.disconnect().catch(err => console.error('Error disconnecting Redis reactions:', err)),
			]);
			
			console.log('All connections closed successfully');
		} catch (error) {
			console.error('Error during disposal:', error);
			throw error;
		}
	}

	async onApplicationShutdown(signal: string): Promise<void> {
		await this.dispose();
	}
}
