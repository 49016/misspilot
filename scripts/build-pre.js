/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const builtDir = path.join(rootDir, 'built');
const metaJsonPath = path.join(builtDir, 'meta.json');

function build() {
	try {
		const json = fs.readFileSync(packageJsonPath, 'utf-8');
		const meta = JSON.parse(json);
		fs.mkdirSync(builtDir, { recursive: true });
		fs.writeFileSync(metaJsonPath, JSON.stringify({ version: meta.version }), 'utf-8');
	} catch (e) {
		console.error(e);
	}
}

build();

if (process.argv.includes('--watch')) {
	fs.watch(packageJsonPath, (event, filename) => {
		console.log(`update ${filename} ...`);
		build();
	});
}
