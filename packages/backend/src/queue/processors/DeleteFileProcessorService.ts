/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type Logger from '@/logger.js';
import { DriveService } from '@/core/DriveService.js';
import { bindThis } from '@/decorators.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { ObjectStorageFileJobData } from '../types.js';

/**
 * Queue processor service for deleting a single file from object storage.
 * 
 * This is a lightweight service that handles deletion of individual files
 * from S3-compatible object storage. It's typically queued when:
 * - A drive file is deleted from the database
 * - Old cached files are being cleaned up
 * - Thumbnail/preview files need to be removed
 * 
 * The actual deletion is handled by DriveService which manages the
 * object storage connection.
 */
@Injectable()
export class DeleteFileProcessorService {
	private logger: Logger;

	constructor(
		private driveService: DriveService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('delete-file');
	}

	/**
	 * Process deletion of a single object storage file.
	 * @param job Job containing the storage key of the file to delete
	 * @returns Success message
	 */
	@bindThis
	public async process(job: Bull.Job<ObjectStorageFileJobData>): Promise<string> {
		const key = job.data.key;

		try {
			this.logger.info(`Deleting object storage file: ${key}`);
			await this.driveService.deleteObjectStorageFile(key);
			this.logger.info(`Successfully deleted object storage file: ${key}`);
			return 'Success';
		} catch (error) {
			this.logger.error(`Failed to delete object storage file ${key}:`, error);
			throw error;
		}
	}
}
