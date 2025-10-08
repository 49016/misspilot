/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { NestFactory } from '@nestjs/core';
import { ChartManagementService } from '@/core/chart/ChartManagementService.js';
import { QueueProcessorService } from '@/queue/QueueProcessorService.js';
import { NestLogger } from '@/NestLogger.js';
import { QueueProcessorModule } from '@/queue/QueueProcessorModule.js';
import { QueueStatsService } from '@/daemons/QueueStatsService.js';
import { ServerStatsService } from '@/daemons/ServerStatsService.js';
import { ServerService } from '@/server/ServerService.js';
import { MainModule } from '@/MainModule.js';

/**
 * Initialize and start the main server application
 * This includes the HTTP server and background services for charts and stats
 * @returns The NestJS application context
 */
export async function server() {
	try {
		const app = await NestFactory.createApplicationContext(MainModule, {
			logger: new NestLogger(),
		});

		const serverService = app.get(ServerService);
		await serverService.launch();

		// Start background services (disabled during testing)
		if (process.env.NODE_ENV !== 'test') {
			const chartService = app.get(ChartManagementService);
			const queueStatsService = app.get(QueueStatsService);
			const serverStatsService = app.get(ServerStatsService);

			await Promise.all([
				chartService.start(),
				queueStatsService.start(),
				serverStatsService.start(),
			]);

			console.log('Background services started successfully');
		}

		return app;
	} catch (error) {
		console.error('Failed to initialize server:', error);
		throw new Error(`Server initialization failed: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/**
 * Initialize and start the job queue processor
 * Handles background jobs and chart management
 * @returns The NestJS application context for the job queue
 */
export async function jobQueue() {
	try {
		const jobQueue = await NestFactory.createApplicationContext(QueueProcessorModule, {
			logger: new NestLogger(),
		});

		const queueProcessor = jobQueue.get(QueueProcessorService);
		const chartManagement = jobQueue.get(ChartManagementService);

		await Promise.all([
			queueProcessor.start(),
			chartManagement.start(),
		]);

		console.log('Job queue processor started successfully');

		return jobQueue;
	} catch (error) {
		console.error('Failed to initialize job queue:', error);
		throw new Error(`Job queue initialization failed: ${error instanceof Error ? error.message : String(error)}`);
	}
}
