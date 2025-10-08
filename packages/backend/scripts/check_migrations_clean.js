/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// This script checks if the database migrations has been generated correctly.

import dataSource from '../ormconfig.js';

function logQueries(queries) {
	for (const query of queries) {
		console.error(`- ${query.query}`);
	}
}

function checkMigrations(sqlInMemory) {
	const hasPendingMigrations = sqlInMemory.upQueries.length > 0 || sqlInMemory.downQueries.length > 0;
	
	if (hasPendingMigrations) {
		console.error('There are several pending migrations. Please make sure you have generated the migrations correctly, or configured entities class correctly.');
		logQueries(sqlInMemory.upQueries);
		logQueries(sqlInMemory.downQueries);
		return false;
	}
	
	console.log('All migrations are clean.');
	return true;
}

await dataSource.initialize();

const sqlInMemory = await dataSource.driver.createSchemaBuilder().log();
const isClean = checkMigrations(sqlInMemory);

process.exit(isClean ? 0 : 1);
