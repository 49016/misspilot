/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

function removePath(relativePath) {
	const fullPath = path.join(rootDir, relativePath);
	fs.rmSync(fullPath, { recursive: true, force: true });
}

(async () => {
	const packages = [
		'backend',
		'frontend-shared',
		'frontend',
		'frontend-embed',
		'icons-subsetter',
		'sw',
		'misskey-js',
		'misskey-reversi',
		'misskey-bubble-game',
	];

	packages.forEach(pkg => removePath(`packages/${pkg}/built`));
	removePath('built');
})();
