/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Chart from '../../core.js';

/**
 * Chart name for test metrics
 */
export const name = 'test';

/**
 * Schema for test chart
 * Used for testing chart functionality
 */
export const schema = {
	/** Total foo count (accumulated) */
	'foo.total': { accumulate: true },
	/** Foo increment */
	'foo.inc': {},
	/** Foo decrement */
	'foo.dec': {},
} as const;

/**
 * Chart entity for test metrics
 */
export const entity = Chart.schemaToEntity(name, schema);
