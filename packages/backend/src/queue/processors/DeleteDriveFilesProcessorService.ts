/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { MoreThan } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { UsersRepository, DriveFilesRepository, MiDriveFile } from '@/models/_.js';
import type Logger from '@/logger.js';
import { DriveService } from '@/core/DriveService.js';
import { bindThis } from '@/decorators.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { DbJobDataWithUser } from '../types.js';

/** Batch size for file deletion operations */
const FILE_BATCH_SIZE = 100;

/**
 * Queue processor service for deleting all drive files belonging to a specific user.
 * 
 * This is typically used when:
 * - User is being deleted
 * - User requested all their files to be removed
 * - Administrative action to clear user content
 * 
 * Uses cursor-based pagination with progress tracking to handle large file collections
 * without memory issues.
 */
@Injectable()
export class DeleteDriveFilesProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private driveService: DriveService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('delete-drive-files');
	}

	/**
	 * Process deletion of all drive files for a user.
	 */
	@bindThis
	public async process(job: Bull.Job<DbJobDataWithUser>): Promise<void> {
		const userId = job.data.user.id;
		this.logger.info(`Starting drive files deletion for user ${userId}...`);

		const user = await this.usersRepository.findOneBy({ id: userId });
		if (!user) {
			this.logger.warn(`User ${userId} not found, skipping deletion.`);
			return;
		}

		try {
			const totalFiles = await this.countUserFiles(userId);
			this.logger.info(`Found ${totalFiles} file(s) to delete for user ${userId}`);

			if (totalFiles === 0) {
				job.updateProgress(100);
				this.logger.info(`No files to delete for user ${userId}`);
				return;
			}

			const deletedCount = await this.deleteFilesInBatches(job, userId, totalFiles);

			this.logger.succ(`Successfully deleted all ${deletedCount} drive file(s) for user ${userId}`);
		} catch (error) {
			this.logger.error(`Failed to delete drive files for user ${userId}:`, error);
			throw error;
		}
	}

	/**
	 * Count total number of files owned by the user.
	 */
	@bindThis
	private async countUserFiles(userId: string): Promise<number> {
		return await this.driveFilesRepository.countBy({ userId });
	}

	/**
	 * Delete user files in batches with progress tracking.
	 * Returns the total number of files deleted.
	 */
	@bindThis
	private async deleteFilesInBatches(
		job: Bull.Job,
		userId: string,
		totalFiles: number
	): Promise<number> {
		let deletedCount = 0;
		let cursor: MiDriveFile['id'] | null = null;

		while (true) {
			const files = await this.fetchNextFileBatch(userId, cursor);

			if (files.length === 0) {
				job.updateProgress(100);
				break;
			}

			cursor = files.at(-1)?.id ?? null;

			// Delete files sequentially (file system operations)
			for (const file of files) {
				await this.driveService.deleteFileSync(file);
				deletedCount++;
			}

			// Update progress
			const progress = (deletedCount / totalFiles) * 100;
			job.updateProgress(Math.min(progress, 100));

			if (deletedCount % 100 === 0) {
				this.logger.info(`Progress: ${deletedCount}/${totalFiles} files deleted (${progress.toFixed(1)}%)`);
			}
		}

		return deletedCount;
	}

	/**
	 * Fetch the next batch of files for deletion.
	 */
	@bindThis
	private async fetchNextFileBatch(
		userId: string,
		cursor: MiDriveFile['id'] | null
	): Promise<MiDriveFile[]> {
		return await this.driveFilesRepository.find({
			where: {
				userId,
				...(cursor ? { id: MoreThan(cursor) } : {}),
			},
			take: FILE_BATCH_SIZE,
			order: { id: 1 },
		});
	}
}
