/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { execa } from 'execa';
import { writeFileSync, existsSync } from 'node:fs';

const OUTPUT_PATH = './built/api.json';
const BUILT_DIR = './built';

async function buildIfNeeded() {
	if (!process.argv.includes('--no-build')) {
		await execa('pnpm', ['run', 'build'], {
			stdout: process.stdout,
			stderr: process.stderr,
		});
	}
}

function validateBuiltDirectory() {
	if (!existsSync(BUILT_DIR)) {
		throw new Error('`built` directory does not exist.');
	}
}

async function generateApiSpec() {
	/** @type {import('../src/config.js')} */
	const { loadConfig } = await import('../built/config.js');

	/** @type {import('../src/server/api/openapi/gen-spec.js')} */
	const { genOpenapiSpec } = await import('../built/server/api/openapi/gen-spec.js');

	const config = loadConfig();
	const spec = genOpenapiSpec(config, true);

	writeFileSync(OUTPUT_PATH, JSON.stringify(spec), 'utf-8');
}

async function main() {
	await buildIfNeeded();
	validateBuiltDirectory();
	await generateApiSpec();
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
