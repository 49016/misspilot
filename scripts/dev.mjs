/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);
const rootDir = _dirname + '/../';

const execOptions = {
	cwd: rootDir,
	stdout: process.stdout,
	stderr: process.stderr,
};

function runCommand(args) {
	return execa('pnpm', args, execOptions);
}

await runCommand(['clean']);

await Promise.all([
	runCommand(['build-pre']),
	runCommand(['build-assets']),
	runCommand(['--filter', 'backend...', 'build']),
	// icons-subsetterは開発段階では使用されないが、型エラーを抑制するためにはじめの一度だけビルドする
	runCommand(['--filter', 'icons-subsetter', 'build']),
]);

const watchCommands = [
	['build-pre', '--watch'],
	['build-assets', '--watch'],
	['--filter', 'backend', 'dev'],
	['--filter', 'frontend-shared', 'watch', '--no-clean'],
	['--filter', 'frontend', 'watch'],
	['--filter', 'frontend-embed', 'watch'],
	['--filter', 'sw', 'watch'],
	['--filter', 'misskey-js', 'watch', '--no-clean'],
	['--filter', 'misskey-reversi', 'watch', '--no-clean'],
	['--filter', 'misskey-bubble-game', 'watch', '--no-clean'],
];

watchCommands.forEach(args => runCommand(args));
