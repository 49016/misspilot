#!/usr/bin/env node
import child_process from 'node:child_process';
import path from 'node:path';
import url from 'node:url';

import semver from 'semver';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPPORTED_NODE_VERSION = '^20.17.0 || ^22.0.0';
const JEST_BIN = 'node_modules/jest/bin/jest.js';
const SIGNAL_EXIT_CODE_OFFSET = 128;

function buildJestArgs() {
	const experimentalFlags = [
		...semver.satisfies(process.version, SUPPORTED_NODE_VERSION) ? ['--no-experimental-require-module'] : [],
		'--experimental-vm-modules',
		'--experimental-import-meta-resolve',
	];
	
	return [
		...experimentalFlags,
		path.join(__dirname, JEST_BIN),
		...process.argv.slice(2),
	];
}

function handleChildError(err) {
	console.error('Failed to start Jest:', err);
	process.exit(1);
}

function handleChildExit(code, signal) {
	if (code === null) {
		process.exit(SIGNAL_EXIT_CODE_OFFSET + signal);
	} else {
		process.exit(code);
	}
}

const args = buildJestArgs();
const child = child_process.spawn(process.execPath, args, { stdio: 'inherit' });

child.on('error', handleChildError);
child.on('exit', handleChildExit);
