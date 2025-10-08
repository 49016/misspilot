/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { QueryFailedError } from 'typeorm';

// PostgreSQL error code for unique violation
const POSTGRES_UNIQUE_VIOLATION = '23505';

/**
 * Check if error is a duplicate key value error from PostgreSQL
 * @param e - Error to check
 * @returns true if error is a unique constraint violation
 */
export function isDuplicateKeyValueError(e: unknown | Error): boolean {
	return e instanceof QueryFailedError && e.driverError.code === POSTGRES_UNIQUE_VIOLATION;
}
