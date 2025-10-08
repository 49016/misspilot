import { DataSource } from 'typeorm';
import { loadConfig } from './built/config.js';
import { entities } from './built/postgres.js';
import { isConcurrentIndexMigrationEnabled } from './migration/js/migration-config.js';

const MIGRATION_PATTERN = 'migration/*.js';
const DB_TYPE = 'postgres';

function createDataSourceConfig() {
	const config = loadConfig();
	const transactionMode = isConcurrentIndexMigrationEnabled() ? 'each' : 'all';

	return {
		type: DB_TYPE,
		host: config.db.host,
		port: config.db.port,
		username: config.db.user,
		password: config.db.pass,
		database: config.db.db,
		extra: config.db.extra,
		entities,
		migrations: [MIGRATION_PATTERN],
		migrationsTransactionMode: transactionMode,
	};
}

export default new DataSource(createDataSourceConfig());
