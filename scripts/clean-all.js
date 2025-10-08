/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

function removePath(relativePath) {
	const fullPath = path.join(rootDir, relativePath);
	fs.rmSync(fullPath, { recursive: true, force: true });
}

function cleanPackage(packageName, includeBuild = true, includeNodeModules = true) {
	if (includeBuild) {
		removePath(`packages/${packageName}/built`);
	}
	if (includeNodeModules) {
		removePath(`packages/${packageName}/node_modules`);
	}
}

(async () => {
	const packages = [
		'backend',
		'frontend-shared',
		'frontend',
		'frontend-embed',
		'sw',
		'misskey-js',
		'misskey-reversi',
		'misskey-bubble-game',
	];

	packages.forEach(pkg => cleanPackage(pkg));
	cleanPackage('frontend-builder', false, true);

	removePath('built');
	removePath('node_modules');

	execSync('pnpm store prune', {
		cwd: rootDir,
		stdio: 'inherit',
	});
})();
