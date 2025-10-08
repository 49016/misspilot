/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import * as Bull from 'bullmq';
import * as Sentry from '@sentry/node';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { CheckModeratorsActivityProcessorService } from '@/queue/processors/CheckModeratorsActivityProcessorService.js';
import { UserWebhookDeliverProcessorService } from './processors/UserWebhookDeliverProcessorService.js';
import { SystemWebhookDeliverProcessorService } from './processors/SystemWebhookDeliverProcessorService.js';
import { EndedPollNotificationProcessorService } from './processors/EndedPollNotificationProcessorService.js';
import { PostScheduledNoteProcessorService } from './processors/PostScheduledNoteProcessorService.js';
import { DeliverProcessorService } from './processors/DeliverProcessorService.js';
import { InboxProcessorService } from './processors/InboxProcessorService.js';
import { DeleteDriveFilesProcessorService } from './processors/DeleteDriveFilesProcessorService.js';
import { ExportCustomEmojisProcessorService } from './processors/ExportCustomEmojisProcessorService.js';
import { ExportNotesProcessorService } from './processors/ExportNotesProcessorService.js';
import { ExportClipsProcessorService } from './processors/ExportClipsProcessorService.js';
import { ExportFollowingProcessorService } from './processors/ExportFollowingProcessorService.js';
import { ExportMutingProcessorService } from './processors/ExportMutingProcessorService.js';
import { ExportBlockingProcessorService } from './processors/ExportBlockingProcessorService.js';
import { ExportUserListsProcessorService } from './processors/ExportUserListsProcessorService.js';
import { ExportAntennasProcessorService } from './processors/ExportAntennasProcessorService.js';
import { ImportFollowingProcessorService } from './processors/ImportFollowingProcessorService.js';
import { ImportMutingProcessorService } from './processors/ImportMutingProcessorService.js';
import { ImportBlockingProcessorService } from './processors/ImportBlockingProcessorService.js';
import { ImportUserListsProcessorService } from './processors/ImportUserListsProcessorService.js';
import { ImportCustomEmojisProcessorService } from './processors/ImportCustomEmojisProcessorService.js';
import { ImportAntennasProcessorService } from './processors/ImportAntennasProcessorService.js';
import { DeleteAccountProcessorService } from './processors/DeleteAccountProcessorService.js';
import { ExportFavoritesProcessorService } from './processors/ExportFavoritesProcessorService.js';
import { CleanRemoteFilesProcessorService } from './processors/CleanRemoteFilesProcessorService.js';
import { DeleteFileProcessorService } from './processors/DeleteFileProcessorService.js';
import { RelationshipProcessorService } from './processors/RelationshipProcessorService.js';
import { TickChartsProcessorService } from './processors/TickChartsProcessorService.js';
import { ResyncChartsProcessorService } from './processors/ResyncChartsProcessorService.js';
import { CleanChartsProcessorService } from './processors/CleanChartsProcessorService.js';
import { CheckExpiredMutingsProcessorService } from './processors/CheckExpiredMutingsProcessorService.js';
import { BakeBufferedReactionsProcessorService } from './processors/BakeBufferedReactionsProcessorService.js';
import { CleanProcessorService } from './processors/CleanProcessorService.js';
import { AggregateRetentionProcessorService } from './processors/AggregateRetentionProcessorService.js';
import { CleanRemoteNotesProcessorService } from './processors/CleanRemoteNotesProcessorService.js';
import { QueueLoggerService } from './QueueLoggerService.js';
import { QUEUE, baseWorkerOptions } from './const.js';

/**
 * Constants for backoff strategy
 */
const BACKOFF_BASE_DELAY = 60 * 1000; // 1 minute
const BACKOFF_MAX_DELAY = 8 * 60 * 60 * 1000; // 8 hours
const BACKOFF_JITTER_FACTOR = 0.2; // 20% jitter

/**
 * Time thresholds for job age formatting
 */
const AGE_FORMAT_MINUTE_THRESHOLD = 60000; // 1 minute in ms
const AGE_FORMAT_SECOND_THRESHOLD = 10000; // 10 seconds in ms

/**
 * Exponential backoff strategy for HTTP-related job retries
 * Reference: https://github.com/misskey-dev/misskey/pull/7635#issue-971097019
 * 
 * @param attemptsMade - Number of attempts made so far
 * @returns Delay in milliseconds before next retry
 */
function httpRelatedBackoff(attemptsMade: number): number {
	// Calculate exponential backoff: (2^n - 1) * baseDelay
	let backoff = (Math.pow(2, attemptsMade) - 1) * BACKOFF_BASE_DELAY;
	
	// Cap at maximum backoff
	backoff = Math.min(backoff, BACKOFF_MAX_DELAY);
	
	// Add jitter (±20%) to prevent thundering herd
	const jitter = Math.round(backoff * Math.random() * BACKOFF_JITTER_FACTOR);
	backoff += jitter;
	
	return backoff;
}

/**
 * Formats job age into human-readable string
 * 
 * @param ageInMs - Age in milliseconds
 * @returns Formatted age string (e.g., "5m", "30s", "500ms")
 */
function formatJobAge(ageInMs: number): string {
	if (ageInMs > AGE_FORMAT_MINUTE_THRESHOLD) {
		return `${Math.floor(ageInMs / 1000 / 60)}m`;
	} else if (ageInMs > AGE_FORMAT_SECOND_THRESHOLD) {
		return `${Math.floor(ageInMs / 1000)}s`;
	} else {
		return `${ageInMs}ms`;
	}
}

/**
 * Gets formatted job information for logging
 * 
 * @param job - Bull job instance
 * @param increment - Whether to increment attempt count (for onActive/onCompleted handlers)
 * @returns Formatted job info string
 */
function getJobInfo(job: Bull.Job | undefined, increment = false): string {
	if (job == null) return '-';

	const age = Date.now() - job.timestamp;
	const formattedAge = formatJobAge(age);

	// onActive and onCompleted handlers report attemptsMade starting at 0, so increment
	const currentAttempts = job.attemptsMade + (increment ? 1 : 0);
	const maxAttempts = job.opts.attempts ?? 0;

	return `id=${job.id} attempts=${currentAttempts}/${maxAttempts} age=${formattedAge}`;
}

/**
 * Service that manages all Bull queue workers in Misskey
 * 
 * Responsibilities:
 * - Creates and configures 10 different queue workers
 * - Handles job processing with optional Sentry integration
 * - Implements exponential backoff for HTTP-related retries
 * - Provides structured logging for all queue operations
 * - Manages graceful startup and shutdown of all workers
 * 
 * Queue Types:
 * - System: Charts, cleanups, scheduled tasks
 * - DB: Exports, imports, account operations
 * - Deliver: ActivityPub delivery
 * - Inbox: ActivityPub inbox processing
 * - User/System Webhooks: Webhook delivery
 * - Relationship: Follow/block operations
 * - Object Storage: File operations
 * - Notifications: Poll and scheduled notes
 */
@Injectable()
export class QueueProcessorService implements OnApplicationShutdown {
	private logger: Logger;
	private systemQueueWorker: Bull.Worker;
	private dbQueueWorker: Bull.Worker;
	private deliverQueueWorker: Bull.Worker;
	private inboxQueueWorker: Bull.Worker;
	private userWebhookDeliverQueueWorker: Bull.Worker;
	private systemWebhookDeliverQueueWorker: Bull.Worker;
	private relationshipQueueWorker: Bull.Worker;
	private objectStorageQueueWorker: Bull.Worker;
	private endedPollNotificationQueueWorker: Bull.Worker;
	private postScheduledNoteQueueWorker: Bull.Worker;

	/**
	 * Creates a Bull worker with optional Sentry integration
	 */
	private createWorker(
		queueName: string,
		processor: (job: Bull.Job) => Promise<any>,
		options: Bull.WorkerOptions,
	): Bull.Worker {
		const wrappedProcessor = (job: Bull.Job) => {
			if (this.config.sentryForBackend) {
				const spanName = `Queue: ${queueName}${job.name ? ': ' + job.name : ''}`;
				return Sentry.startSpan({ name: spanName }, () => processor(job));
			} else {
				return processor(job);
			}
		};

		return new Bull.Worker(queueName, wrappedProcessor, options);
	}

	/**
	 * Attaches standard log handlers to a worker
	 */
	private attachWorkerLogHandlers(
		worker: Bull.Worker,
		loggerName: string,
		queueDisplayName: string,
		renderJob: (job?: Bull.Job) => string | object,
		renderError: (e?: Error) => string | object,
	): void {
		const logger = this.logger.createSubLogger(loggerName);

		worker
			.on('active', (job) => logger.debug(`active id=${job.id}`))
			.on('completed', (job, result) => logger.debug(`completed(${result}) id=${job.id}`))
			.on('failed', (job, err: Error) => {
				logger.error(`failed(${err.name}: ${err.message}) id=${job?.id ?? '?'}`, { 
					job: renderJob(job), 
					e: renderError(err) 
				});
				
				if (this.config.sentryForBackend) {
					Sentry.captureMessage(`Queue: ${queueDisplayName}: ${job?.name ?? '?'}: ${err.name}: ${err.message}`, {
						level: 'error',
						extra: { job, err },
					});
				}
			})
			.on('error', (err: Error) => logger.error(`error ${err.name}: ${err.message}`, { e: renderError(err) }))
			.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
	}

	/**
	 * Attaches log handlers to deliver/webhook workers (includes destination info)
	 */
	private attachDeliverWorkerLogHandlers(
		worker: Bull.Worker,
		loggerName: string,
		queueDisplayName: string,
		renderError: (e?: Error) => string | object,
	): void {
		const logger = this.logger.createSubLogger(loggerName);

		worker
			.on('active', (job) => logger.debug(`active ${getJobInfo(job, true)} to=${job.data.to}`))
			.on('completed', (job, result) => logger.debug(`completed(${result}) ${getJobInfo(job, true)} to=${job.data.to}`))
			.on('failed', (job, err: Error) => {
				const destination = job ? job.data.to : '-';
				logger.error(`failed(${err.name}: ${err.message}) ${getJobInfo(job)} to=${destination}`);
				
				if (this.config.sentryForBackend) {
					Sentry.captureMessage(`Queue: ${queueDisplayName}: ${err.name}: ${err.message}`, {
						level: 'error',
						extra: { job, err },
					});
				}
			})
			.on('error', (err: Error) => logger.error(`error ${err.name}: ${err.message}`, { e: renderError(err) }))
			.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
	}

	/**
	 * Attaches log handlers to inbox worker (includes activity info)
	 */
	private attachInboxWorkerLogHandlers(
		worker: Bull.Worker,
		renderJob: (job?: Bull.Job) => string | object,
		renderError: (e?: Error) => string | object,
	): void {
		const logger = this.logger.createSubLogger('inbox');

		worker
			.on('active', (job) => logger.debug(`active ${getJobInfo(job, true)}`))
			.on('completed', (job, result) => logger.debug(`completed(${result}) ${getJobInfo(job, true)}`))
			.on('failed', (job, err: Error) => {
				const activityId = job ? (job.data.activity ? job.data.activity.id : 'none') : '-';
				logger.error(
					`failed(${err.name}: ${err.message}) ${getJobInfo(job)} activity=${activityId}`, 
					{ job: renderJob(job), e: renderError(err) }
				);
				
				if (this.config.sentryForBackend) {
					Sentry.captureMessage(`Queue: Inbox: ${err.name}: ${err.message}`, {
						level: 'error',
						extra: { job, err },
					});
				}
			})
			.on('error', (err: Error) => logger.error(`error ${err.name}: ${err.message}`, { e: renderError(err) }))
			.on('stalled', (jobId) => logger.warn(`stalled id=${jobId}`));
	}

	constructor(
		@Inject(DI.config)
		private config: Config,

		private queueLoggerService: QueueLoggerService,
		private userWebhookDeliverProcessorService: UserWebhookDeliverProcessorService,
		private systemWebhookDeliverProcessorService: SystemWebhookDeliverProcessorService,
		private endedPollNotificationProcessorService: EndedPollNotificationProcessorService,
		private postScheduledNoteProcessorService: PostScheduledNoteProcessorService,
		private deliverProcessorService: DeliverProcessorService,
		private inboxProcessorService: InboxProcessorService,
		private deleteDriveFilesProcessorService: DeleteDriveFilesProcessorService,
		private exportCustomEmojisProcessorService: ExportCustomEmojisProcessorService,
		private exportNotesProcessorService: ExportNotesProcessorService,
		private exportClipsProcessorService: ExportClipsProcessorService,
		private exportFavoritesProcessorService: ExportFavoritesProcessorService,
		private exportFollowingProcessorService: ExportFollowingProcessorService,
		private exportMutingProcessorService: ExportMutingProcessorService,
		private exportBlockingProcessorService: ExportBlockingProcessorService,
		private exportUserListsProcessorService: ExportUserListsProcessorService,
		private exportAntennasProcessorService: ExportAntennasProcessorService,
		private importFollowingProcessorService: ImportFollowingProcessorService,
		private importMutingProcessorService: ImportMutingProcessorService,
		private importBlockingProcessorService: ImportBlockingProcessorService,
		private importUserListsProcessorService: ImportUserListsProcessorService,
		private importCustomEmojisProcessorService: ImportCustomEmojisProcessorService,
		private importAntennasProcessorService: ImportAntennasProcessorService,
		private deleteAccountProcessorService: DeleteAccountProcessorService,
		private deleteFileProcessorService: DeleteFileProcessorService,
		private cleanRemoteFilesProcessorService: CleanRemoteFilesProcessorService,
		private relationshipProcessorService: RelationshipProcessorService,
		private tickChartsProcessorService: TickChartsProcessorService,
		private resyncChartsProcessorService: ResyncChartsProcessorService,
		private cleanChartsProcessorService: CleanChartsProcessorService,
		private aggregateRetentionProcessorService: AggregateRetentionProcessorService,
		private checkExpiredMutingsProcessorService: CheckExpiredMutingsProcessorService,
		private bakeBufferedReactionsProcessorService: BakeBufferedReactionsProcessorService,
		private checkModeratorsActivityProcessorService: CheckModeratorsActivityProcessorService,
		private cleanProcessorService: CleanProcessorService,
		private cleanRemoteNotesProcessorService: CleanRemoteNotesProcessorService,
	) {
		this.logger = this.queueLoggerService.logger;

		/**
		 * Renders error information for logging
		 * Note: Sometimes error comes as undefined from the queue system
		 */
		function renderError(e?: Error): string | object {
			if (!e) return '?';

			// For unrecoverable or abort errors, just return simple string
			if (e instanceof Bull.UnrecoverableError || e.name === 'AbortError') {
				return `${e.name}: ${e.message}`;
			}

			// For other errors, return detailed object for structured logging
			return {
				name: e.name,
				message: e.message,
				stack: e.stack,
			};
		}

		/**
		 * Renders job information for logging
		 */
		function renderJob(job?: Bull.Job): string | object {
			if (!job) return '?';

			return {
				name: job.name || undefined,
				info: getJobInfo(job),
				failedReason: job.failedReason || undefined,
				data: job.data,
			};
		}

		//#region system
		{
			const processer = (job: Bull.Job) => {
				switch (job.name) {
					case 'tickCharts': return this.tickChartsProcessorService.process();
					case 'resyncCharts': return this.resyncChartsProcessorService.process();
					case 'cleanCharts': return this.cleanChartsProcessorService.process();
					case 'aggregateRetention': return this.aggregateRetentionProcessorService.process();
					case 'checkExpiredMutings': return this.checkExpiredMutingsProcessorService.process();
					case 'bakeBufferedReactions': return this.bakeBufferedReactionsProcessorService.process();
					case 'checkModeratorsActivity': return this.checkModeratorsActivityProcessorService.process();
					case 'clean': return this.cleanProcessorService.process();
					case 'cleanRemoteNotes': return this.cleanRemoteNotesProcessorService.process(job);
					default: throw new Error(`unrecognized job type ${job.name} for system queue`);
				}
			};

			this.systemQueueWorker = this.createWorker(QUEUE.SYSTEM, processer, {
				...baseWorkerOptions(this.config, QUEUE.SYSTEM),
				autorun: false,
			});

			this.attachWorkerLogHandlers(this.systemQueueWorker, 'system', 'System', renderJob, renderError);
		}
		//#endregion

		//#region db
		{
			const processer = (job: Bull.Job) => {
				switch (job.name) {
					case 'deleteDriveFiles': return this.deleteDriveFilesProcessorService.process(job);
					case 'exportCustomEmojis': return this.exportCustomEmojisProcessorService.process(job);
					case 'exportNotes': return this.exportNotesProcessorService.process(job);
					case 'exportClips': return this.exportClipsProcessorService.process(job);
					case 'exportFavorites': return this.exportFavoritesProcessorService.process(job);
					case 'exportFollowing': return this.exportFollowingProcessorService.process(job);
					case 'exportMuting': return this.exportMutingProcessorService.process(job);
					case 'exportBlocking': return this.exportBlockingProcessorService.process(job);
					case 'exportUserLists': return this.exportUserListsProcessorService.process(job);
					case 'exportAntennas': return this.exportAntennasProcessorService.process(job);
					case 'importFollowing': return this.importFollowingProcessorService.process(job);
					case 'importFollowingToDb': return this.importFollowingProcessorService.processDb(job);
					case 'importMuting': return this.importMutingProcessorService.process(job);
					case 'importBlocking': return this.importBlockingProcessorService.process(job);
					case 'importBlockingToDb': return this.importBlockingProcessorService.processDb(job);
					case 'importUserLists': return this.importUserListsProcessorService.process(job);
					case 'importCustomEmojis': return this.importCustomEmojisProcessorService.process(job);
					case 'importAntennas': return this.importAntennasProcessorService.process(job);
					case 'deleteAccount': return this.deleteAccountProcessorService.process(job);
					default: throw new Error(`unrecognized job type ${job.name} for db queue`);
				}
			};

			this.dbQueueWorker = this.createWorker(QUEUE.DB, processer, {
				...baseWorkerOptions(this.config, QUEUE.DB),
				autorun: false,
			});

			this.attachWorkerLogHandlers(this.dbQueueWorker, 'db', 'DB', renderJob, renderError);
		}
		//#endregion

		//#region deliver
		{
			const processer = (job: Bull.Job) => this.deliverProcessorService.process(job);

			this.deliverQueueWorker = this.createWorker(QUEUE.DELIVER, processer, {
				...baseWorkerOptions(this.config, QUEUE.DELIVER),
				autorun: false,
				concurrency: this.config.deliverJobConcurrency ?? 128,
				limiter: {
					max: this.config.deliverJobPerSec ?? 128,
					duration: 1000,
				},
				settings: {
					backoffStrategy: httpRelatedBackoff,
				},
			});

			this.attachDeliverWorkerLogHandlers(this.deliverQueueWorker, 'deliver', 'Deliver', renderError);
		}
		//#endregion

		//#region inbox
		{
			const processer = (job: Bull.Job) => this.inboxProcessorService.process(job);

			this.inboxQueueWorker = this.createWorker(QUEUE.INBOX, processer, {
				...baseWorkerOptions(this.config, QUEUE.INBOX),
				autorun: false,
				concurrency: this.config.inboxJobConcurrency ?? 16,
				limiter: {
					max: this.config.inboxJobPerSec ?? 32,
					duration: 1000,
				},
				settings: {
					backoffStrategy: httpRelatedBackoff,
				},
			});

			this.attachInboxWorkerLogHandlers(this.inboxQueueWorker, renderJob, renderError);
		}
		//#endregion

		//#region user-webhook deliver
		{
			const processer = (job: Bull.Job) => this.userWebhookDeliverProcessorService.process(job);

			this.userWebhookDeliverQueueWorker = this.createWorker(QUEUE.USER_WEBHOOK_DELIVER, processer, {
				...baseWorkerOptions(this.config, QUEUE.USER_WEBHOOK_DELIVER),
				autorun: false,
				concurrency: 64,
				limiter: {
					max: 64,
					duration: 1000,
				},
				settings: {
					backoffStrategy: httpRelatedBackoff,
				},
			});

			this.attachDeliverWorkerLogHandlers(this.userWebhookDeliverQueueWorker, 'user-webhook', 'UserWebhookDeliver', renderError);
		}
		//#endregion

		//#region system-webhook deliver
		{
			const processer = (job: Bull.Job) => this.systemWebhookDeliverProcessorService.process(job);

			this.systemWebhookDeliverQueueWorker = this.createWorker(QUEUE.SYSTEM_WEBHOOK_DELIVER, processer, {
				...baseWorkerOptions(this.config, QUEUE.SYSTEM_WEBHOOK_DELIVER),
				autorun: false,
				concurrency: 16,
				limiter: {
					max: 16,
					duration: 1000,
				},
				settings: {
					backoffStrategy: httpRelatedBackoff,
				},
			});

			this.attachDeliverWorkerLogHandlers(this.systemWebhookDeliverQueueWorker, 'system-webhook', 'SystemWebhookDeliver', renderError);
		}
		//#endregion

		//#region relationship
		{
			const processer = (job: Bull.Job) => {
				switch (job.name) {
					case 'follow': return this.relationshipProcessorService.processFollow(job);
					case 'unfollow': return this.relationshipProcessorService.processUnfollow(job);
					case 'block': return this.relationshipProcessorService.processBlock(job);
					case 'unblock': return this.relationshipProcessorService.processUnblock(job);
					default: throw new Error(`unrecognized job type ${job.name} for relationship queue`);
				}
			};

			this.relationshipQueueWorker = this.createWorker(QUEUE.RELATIONSHIP, processer, {
				...baseWorkerOptions(this.config, QUEUE.RELATIONSHIP),
				autorun: false,
				concurrency: this.config.relationshipJobConcurrency ?? 16,
				limiter: {
					max: this.config.relationshipJobPerSec ?? 64,
					duration: 1000,
				},
			});

			this.attachWorkerLogHandlers(this.relationshipQueueWorker, 'relationship', 'Relationship', renderJob, renderError);
		}
		//#endregion

		//#region object storage
		{
			const processer = (job: Bull.Job) => {
				switch (job.name) {
					case 'deleteFile': return this.deleteFileProcessorService.process(job);
					case 'cleanRemoteFiles': return this.cleanRemoteFilesProcessorService.process(job);
					default: throw new Error(`unrecognized job type ${job.name} for objectStorage queue`);
				}
			};

			this.objectStorageQueueWorker = this.createWorker(QUEUE.OBJECT_STORAGE, processer, {
				...baseWorkerOptions(this.config, QUEUE.OBJECT_STORAGE),
				autorun: false,
				concurrency: 16,
			});

			this.attachWorkerLogHandlers(this.objectStorageQueueWorker, 'objectStorage', 'ObjectStorage', renderJob, renderError);
		}
		//#endregion

		//#region ended poll notification
		{
			const processer = (job: Bull.Job) => this.endedPollNotificationProcessorService.process(job);

			this.endedPollNotificationQueueWorker = this.createWorker(QUEUE.ENDED_POLL_NOTIFICATION, processer, {
				...baseWorkerOptions(this.config, QUEUE.ENDED_POLL_NOTIFICATION),
				autorun: false,
			});
		}
		//#endregion

		//#region post scheduled note
		{
			const processer = (job: Bull.Job) => this.postScheduledNoteProcessorService.process(job);

			this.postScheduledNoteQueueWorker = this.createWorker(QUEUE.POST_SCHEDULED_NOTE, processer, {
				...baseWorkerOptions(this.config, QUEUE.POST_SCHEDULED_NOTE),
				autorun: false,
			});
		}
		//#endregion
	}

	/**
	 * Starts all queue workers in parallel
	 */
	@bindThis
	public async start(): Promise<void> {
		await Promise.all([
			this.systemQueueWorker.run(),
			this.dbQueueWorker.run(),
			this.deliverQueueWorker.run(),
			this.inboxQueueWorker.run(),
			this.userWebhookDeliverQueueWorker.run(),
			this.systemWebhookDeliverQueueWorker.run(),
			this.relationshipQueueWorker.run(),
			this.objectStorageQueueWorker.run(),
			this.endedPollNotificationQueueWorker.run(),
			this.postScheduledNoteQueueWorker.run(),
		]);
	}

	/**
	 * Stops all queue workers gracefully in parallel
	 */
	@bindThis
	public async stop(): Promise<void> {
		await Promise.all([
			this.systemQueueWorker.close(),
			this.dbQueueWorker.close(),
			this.deliverQueueWorker.close(),
			this.inboxQueueWorker.close(),
			this.userWebhookDeliverQueueWorker.close(),
			this.systemWebhookDeliverQueueWorker.close(),
			this.relationshipQueueWorker.close(),
			this.objectStorageQueueWorker.close(),
			this.endedPollNotificationQueueWorker.close(),
			this.postScheduledNoteQueueWorker.close(),
		]);
	}

	/**
	 * Handles application shutdown by stopping all workers
	 * 
	 * @param signal - Optional shutdown signal
	 */
	@bindThis
	public async onApplicationShutdown(signal?: string | undefined): Promise<void> {
		await this.stop();
	}
}
