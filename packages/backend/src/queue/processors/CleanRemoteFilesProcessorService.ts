/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IsNull, MoreThan, Not } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { MiDriveFile, DriveFilesRepository } from '@/models/_.js';
import type Logger from '@/logger.js';
import { DriveService } from '@/core/DriveService.js';
import { bindThis } from '@/decorators.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';

/** Number of files to process in each batch */
const BATCH_SIZE = 8;

/**
 * Queue processor service for cleaning cached remote files from the database.
 * 
 * This service deletes all cached remote files (files from other instances that
 * were stored locally). This is useful for:
 * - Freeing up storage space
 * - Clearing the local cache to force re-fetching fresh content
 * - Maintenance operations
 * 
 * Files are deleted in small batches with progress tracking to avoid
 * overwhelming the database and storage system.
 */
@Injectable()
export class CleanRemoteFilesProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private driveService: DriveService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('clean-remote-files');
	}

	/**
	 * Process deletion of all cached remote files.
	 * Uses cursor-based pagination to handle large datasets efficiently.
	 */
	@bindThis
	public async process(job: Bull.Job<Record<string, unknown>>): Promise<void> {
		this.logger.info('Starting deletion of cached remote files...');

		try {
			const totalFiles = await this.countRemoteFiles();
			this.logger.info(`Found ${totalFiles} cached remote file(s) to delete.`);

			if (totalFiles === 0) {
				job.updateProgress(100);
				this.logger.info('No cached remote files to delete.');
				return;
			}

			const deletedCount = await this.deleteRemoteFilesBatch(job, totalFiles);

			this.logger.succ(`Successfully deleted ${deletedCount} cached remote file(s).`);
		} catch (error) {
			this.logger.error('Failed to delete cached remote files:', error);
			throw error;
		}
	}

	/**
	 * Count total number of cached remote files to be deleted.
	 */
	@bindThis
	private async countRemoteFiles(): Promise<number> {
		return await this.driveFilesRepository.countBy({
			userHost: Not(IsNull()), // Remote files (not local)
			isLink: false, // Cached files (not just links)
		});
	}

	/**
	 * Delete remote files in batches with progress tracking.
	 * Returns the total number of files deleted.
	 */
	@bindThis
	private async deleteRemoteFilesBatch(job: Bull.Job, totalFiles: number): Promise<number> {
		let deletedCount = 0;
		let cursor: MiDriveFile['id'] | null = null;

		while (true) {
			const files = await this.fetchNextBatch(cursor);

			if (files.length === 0) {
				job.updateProgress(100);
				break;
			}

			cursor = files.at(-1)?.id ?? null;

			// Delete files in parallel within the batch
			await Promise.all(files.map(file => 
				this.driveService.deleteFileSync(file, true)
			));

			deletedCount += files.length;

			// Update progress
			const progress = totalFiles > 0 ? (deletedCount / totalFiles) * 100 : 100;
			job.updateProgress(Math.min(progress, 100));

			if (deletedCount % 100 === 0) {
				this.logger.info(`Progress: ${deletedCount}/${totalFiles} files deleted (${progress.toFixed(1)}%)`);
			}
		}

		return deletedCount;
	}

	/**
	 * Fetch the next batch of remote files to delete.
	 */
	@bindThis
	private async fetchNextBatch(cursor: MiDriveFile['id'] | null): Promise<MiDriveFile[]> {
		return await this.driveFilesRepository.find({
			where: {
				userHost: Not(IsNull()),
				isLink: false,
				...(cursor ? { id: MoreThan(cursor) } : {}),
			},
			take: BATCH_SIZE,
			order: {
				id: 1,
			},
		});
	}
}
