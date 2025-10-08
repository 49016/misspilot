// @ts-check

/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import locales from '../../locales/index.js';
import meta from '../../package.json' with { type: 'json' };

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const WATCH_MODE_ARG = 'watch';
const BUILD_MODE_PRODUCTION = 'production';
const ENTRY_POINT = `${__dirname}/src/sw.ts`;
const OUTPUT_DIR = `${__dirname}/../../built/_sw_dist_`;
const TSCONFIG_PATH = `${__dirname}/tsconfig.json`;
const PERF_PREFIX = 'Misskey:';

const isWatchMode = process.argv[2]?.includes(WATCH_MODE_ARG);
const isProduction = process.env.NODE_ENV === BUILD_MODE_PRODUCTION;

function createDefines() {
	const nodeEnv = process.env.NODE_ENV ?? '';
	const langs = Object.entries(locales).map(([k, v]) => [k, v._lang_]);
	
	return {
		_DEV_: JSON.stringify(!isProduction),
		_ENV_: JSON.stringify(nodeEnv),
		_LANGS_: JSON.stringify(langs),
		_PERF_PREFIX_: JSON.stringify(PERF_PREFIX),
		_VERSION_: JSON.stringify(meta.version),
	};
}

/** @type {esbuild.BuildOptions} */
const buildOptions = {
	absWorkingDir: __dirname,
	bundle: true,
	define: createDefines(),
	entryPoints: [ENTRY_POINT],
	format: 'esm',
	loader: {
		'.ts': 'ts',
	},
	minify: isProduction,
	outbase: `${__dirname}/src`,
	outdir: OUTPUT_DIR,
	treeShaking: true,
	tsconfig: TSCONFIG_PATH,
};

async function buildServiceWorker() {
	console.log('Starting SW building...');
	
	if (!isWatchMode) {
		await esbuild.build(buildOptions);
		console.log('done');
	} else {
		const context = await esbuild.context(buildOptions);
		await context.watch();
		console.log('watching...');
	}
}

buildServiceWorker();
