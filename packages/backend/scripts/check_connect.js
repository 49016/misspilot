/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Redis from 'ioredis';
import { loadConfig } from '../built/config.js';
import { createPostgresDataSource } from '../built/postgres.js';

const config = loadConfig();

async function connectToPostgres() {
	const source = createPostgresDataSource(config);
	await source.initialize();
	await source.destroy();
}

async function connectToRedis(redisOptions) {
	return new Promise((resolve, reject) => {
		const redis = new Redis({
			...redisOptions,
			lazyConnect: true,
			reconnectOnError: false,
			showFriendlyErrorStack: true,
		});
		redis.on('error', e => reject(e));

		redis.connect()
			.then(() => resolve())
			.catch(e => reject(e))
			.finally(() => redis.disconnect(false));
	});
}

function getUniqueRedisConfigs() {
	// If not all of these are defined, the default one gets reused.
	// so we use a Set to only try connecting once to each **unique** redis.
	return Array.from(new Set([
		config.redis,
		config.redisForPubsub,
		config.redisForJobQueue,
		config.redisForTimelines,
		config.redisForReactions,
	]));
}

const redisConnections = getUniqueRedisConfigs().map(connectToRedis);
const allConnections = [...redisConnections, connectToPostgres()];

await Promise.all(allConnections);
