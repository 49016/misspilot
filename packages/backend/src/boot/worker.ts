/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import cluster from 'node:cluster';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { envOption } from '@/env.js';
import { loadConfig } from '@/config.js';
import { jobQueue, server } from './common.js';

/**
 * Initialize and run worker process
 * Workers handle either server or job queue processing based on configuration
 */
export async function workerMain() {
	const config = loadConfig();

	// Initialize Sentry error tracking for backend if configured
	if (config.sentryForBackend) {
		try {
			Sentry.init({
				integrations: [
					...(config.sentryForBackend.enableNodeProfiling ? [nodeProfilingIntegration()] : []),
				],

				// Performance Monitoring - Capture 100% of transactions
				tracesSampleRate: 1.0,

				// Profiling - relative to tracesSampleRate
				profilesSampleRate: 1.0,

				// Disable breadcrumbs to reduce overhead
				maxBreadcrumbs: 0,

				...config.sentryForBackend.options,
			});
			console.log('Sentry initialized for backend monitoring');
		} catch (error) {
			console.error('Failed to initialize Sentry:', error);
		}
	}

	// Start appropriate service based on environment options
	try {
		if (envOption.onlyServer) {
			console.log('Starting server only mode...');
			await server();
		} else if (envOption.onlyQueue) {
			console.log('Starting queue processor only mode...');
			await jobQueue();
		} else {
			// Default: run job queue
			console.log('Starting default job queue mode...');
			await jobQueue();
		}
	} catch (error) {
		console.error('Worker initialization failed:', error);
		throw error;
	}

	// Notify parent process that worker is ready
	if (cluster.isWorker && process.send) {
		process.send('ready');
		console.log(`Worker ${cluster.worker?.id} is ready`);
	}
}
