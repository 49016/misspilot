/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Chart from '../../core.js';

/**
 * Chart name for ActivityPub request metrics
 */
export const name = 'apRequest';

/**
 * Schema for ActivityPub request chart
 * Tracks delivery and inbox metrics
 */
export const schema = {
	/** Failed delivery attempts */
	'deliverFailed': {},
	/** Successful delivery attempts */
	'deliverSucceeded': {},
	/** Received inbox requests */
	'inboxReceived': {},
} as const;

/**
 * Chart entity for ActivityPub requests
 */
export const entity = Chart.schemaToEntity(name, schema);
