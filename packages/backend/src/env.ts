/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const ENV_PREFIX = 'MK_';
const TEST_ENV = 'test';

/**
 * Environment options for Misskey configuration
 */
const envOption = {
	onlyQueue: false,
	onlyServer: false,
	noDaemons: false,
	disableClustering: false,
	verbose: false,
	withLogTime: false,
	quiet: false,
};

/**
 * Convert camelCase to SNAKE_CASE with prefix
 * @param key - camelCase string
 * @returns SNAKE_CASE string with MK_ prefix
 */
function toEnvKey(key: string): string {
	return ENV_PREFIX + key.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase();
}

/**
 * Parse environment variables to set options
 */
for (const key of Object.keys(envOption) as (keyof typeof envOption)[]) {
	if (process.env[toEnvKey(key)]) {
		envOption[key] = true;
	}
}

/**
 * Apply test environment overrides
 */
if (process.env.NODE_ENV === TEST_ENV) {
	envOption.disableClustering = true;
	envOption.quiet = true;
	envOption.noDaemons = true;
}

export { envOption };
