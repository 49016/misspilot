/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { MoreThan } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { DriveFilesRepository, NotesRepository, PagesRepository, UserProfilesRepository, UsersRepository } from '@/models/_.js';
import type Logger from '@/logger.js';
import { DriveService } from '@/core/DriveService.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiNote } from '@/models/Note.js';
import { EmailService } from '@/core/EmailService.js';
import { bindThis } from '@/decorators.js';
import { SearchService } from '@/core/SearchService.js';
import { PageService } from '@/core/PageService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { DbUserDeleteJobData } from '../types.js';

/**
 * Queue processor service for deleting user accounts and all associated data.
 * 
 * This service handles the complete deletion process:
 * 1. Delete all user notes (with search index cleanup)
 * 2. Delete all user drive files
 * 3. Delete all user pages
 * 4. Send deletion confirmation email
 * 5. Optionally perform physical deletion of user record (or soft delete)
 * 
 * Uses cursor-based pagination for each data type to handle large datasets
 * without memory issues. Each step is logged for audit trail.
 */
@Injectable()
export class DeleteAccountProcessorService {
	private logger: Logger;

	/** Batch size for note deletion */
	private readonly NOTE_BATCH_SIZE = 100;
	/** Batch size for file deletion (smaller due to file system operations) */
	private readonly FILE_BATCH_SIZE = 10;
	/** Batch size for page deletion */
	private readonly PAGE_BATCH_SIZE = 100;

	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.pagesRepository)
		private pagesRepository: PagesRepository,

		private driveService: DriveService,
		private pageService: PageService,
		private emailService: EmailService,
		private queueLoggerService: QueueLoggerService,
		private searchService: SearchService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('delete-account');
	}

	/**
	 * Process account deletion job.
	 * @returns Success message or void if user not found
	 */
	@bindThis
	public async process(job: Bull.Job<DbUserDeleteJobData>): Promise<string | void> {
		const userId = job.data.user.id;
		this.logger.info(`Starting account deletion for user ${userId}...`);

		const user = await this.usersRepository.findOneBy({ id: userId });
		if (!user) {
			this.logger.warn(`User ${userId} not found, skipping deletion.`);
			return;
		}

		try {
			// Delete all user data in sequence
			await this.deleteUserNotes(user.id);
			await this.deleteUserFiles(user.id);
			await this.deleteUserPages(user);
			await this.sendDeletionNotificationEmail(user.id);

			// Perform physical or soft delete based on job data
			if (job.data.soft) {
				this.logger.info(`Soft delete: User record preserved for ${userId}`);
			} else {
				await this.usersRepository.delete(userId);
				this.logger.info(`Physical delete: User record deleted for ${userId}`);
			}

			this.logger.succ(`Account deletion completed for user ${userId}`);
			return 'Account deleted';
		} catch (error) {
			this.logger.error(`Failed to delete account for user ${userId}:`, error);
			throw error;
		}
	}

	/**
	 * Delete all notes created by the user and remove them from search index.
	 */
	@bindThis
	private async deleteUserNotes(userId: string): Promise<void> {
		this.logger.info(`Deleting notes for user ${userId}...`);
		
		let cursor: MiNote['id'] | null = null;
		let totalDeleted = 0;

		while (true) {
			const notes = await this.notesRepository.find({
				where: {
					userId,
					...(cursor ? { id: MoreThan(cursor) } : {}),
				},
				take: this.NOTE_BATCH_SIZE,
				order: { id: 1 },
			}) as MiNote[];

			if (notes.length === 0) break;

			cursor = notes.at(-1)?.id ?? null;

			// Delete from database
			await this.notesRepository.delete(notes.map(note => note.id));

			// Remove from search index
			for (const note of notes) {
				await this.searchService.unindexNote(note);
			}

			totalDeleted += notes.length;
		}

		this.logger.succ(`Deleted ${totalDeleted} note(s) for user ${userId}`);
	}

	/**
	 * Delete all drive files uploaded by the user.
	 */
	@bindThis
	private async deleteUserFiles(userId: string): Promise<void> {
		this.logger.info(`Deleting files for user ${userId}...`);
		
		let cursor: MiDriveFile['id'] | null = null;
		let totalDeleted = 0;

		while (true) {
			const files = await this.driveFilesRepository.find({
				where: {
					userId,
					...(cursor ? { id: MoreThan(cursor) } : {}),
				},
				take: this.FILE_BATCH_SIZE,
				order: { id: 1 },
			}) as MiDriveFile[];

			if (files.length === 0) break;

			cursor = files.at(-1)?.id ?? null;

			// Delete files sequentially (file system operations)
			for (const file of files) {
				await this.driveService.deleteFileSync(file);
			}

			totalDeleted += files.length;
		}

		this.logger.succ(`Deleted ${totalDeleted} file(s) for user ${userId}`);
	}

	/**
	 * Delete all pages created by the user.
	 * This is necessary for decrementing pageCount of notes that referenced these pages.
	 */
	@bindThis
	private async deleteUserPages(user: any): Promise<void> {
		this.logger.info(`Deleting pages for user ${user.id}...`);
		
		let totalDeleted = 0;

		while (true) {
			const pages = await this.pagesRepository.find({
				where: { userId: user.id },
				take: this.PAGE_BATCH_SIZE,
				order: { id: 1 },
			});

			if (pages.length === 0) break;

			for (const page of pages) {
				await this.pageService.delete(user, page.id);
			}

			totalDeleted += pages.length;
		}

		this.logger.succ(`Deleted ${totalDeleted} page(s) for user ${user.id}`);
	}

	/**
	 * Send account deletion confirmation email to the user (if verified email exists).
	 */
	@bindThis
	private async sendDeletionNotificationEmail(userId: string): Promise<void> {
		try {
			const profile = await this.userProfilesRepository.findOneByOrFail({ userId });
			
			if (profile.email && profile.emailVerified) {
				await this.emailService.sendEmail(
					profile.email,
					'Account deleted',
					'Your account has been deleted.',
					'Your account has been deleted.'
				);
				this.logger.info(`Deletion notification email sent to user ${userId}`);
			} else {
				this.logger.info(`No verified email for user ${userId}, skipping notification email`);
			}
		} catch (error) {
			this.logger.warn(`Failed to send deletion notification email for user ${userId}:`, error);
			// Don't throw - email is non-critical
		}
	}
}
