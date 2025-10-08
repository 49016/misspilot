/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Bull from 'bullmq';
import { Not } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { InstancesRepository, MiMeta } from '@/models/_.js';
import type Logger from '@/logger.js';
import { ApRequestService } from '@/core/activitypub/ApRequestService.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import { FetchInstanceMetadataService } from '@/core/FetchInstanceMetadataService.js';
import { MemorySingleCache } from '@/misc/cache.js';
import type { MiInstance } from '@/models/Instance.js';
import InstanceChart from '@/core/chart/charts/instance.js';
import ApRequestChart from '@/core/chart/charts/ap-request.js';
import FederationChart from '@/core/chart/charts/federation.js';
import { StatusError } from '@/misc/status-error.js';
import { UtilityService } from '@/core/UtilityService.js';
import { bindThis } from '@/decorators.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type { DeliverJobData } from '../types.js';

/** Cache duration for suspended hosts list (1 hour) */
const SUSPENDED_HOSTS_CACHE_TTL_MS = 1000 * 60 * 60;

/** Duration after which non-responding instances are auto-suspended (7 days) */
const AUTO_SUSPEND_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 7;

/**
 * Queue processor service for delivering ActivityPub activities to remote instances.
 * 
 * This is a critical service that handles federated communication by:
 * - Delivering signed HTTP POST requests to remote ActivityPub inboxes
 * - Managing instance suspension states (manual, automatic, software-based)
 * - Tracking delivery success/failure metrics
 * - Auto-suspending instances that don't respond for 7+ days
 * - Handling HTTP 410 Gone responses (instance permanently closed)
 * 
 * The service implements intelligent retry logic and maintains charts for
 * monitoring federation health.
 */
@Injectable()
export class DeliverProcessorService {
	private logger: Logger;
	private suspendedHostsCache: MemorySingleCache<MiInstance[]>;
	private latest: string | null;

	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		private utilityService: UtilityService,
		private federatedInstanceService: FederatedInstanceService,
		private fetchInstanceMetadataService: FetchInstanceMetadataService,
		private apRequestService: ApRequestService,
		private instanceChart: InstanceChart,
		private apRequestChart: ApRequestChart,
		private federationChart: FederationChart,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('deliver');
		this.suspendedHostsCache = new MemorySingleCache<MiInstance[]>(SUSPENDED_HOSTS_CACHE_TTL_MS);
	}

	/**
	 * Process ActivityPub delivery job.
	 * @returns Status message indicating success or skip reason
	 */
	@bindThis
	public async process(job: Bull.Job<DeliverJobData>): Promise<string> {
		const { host } = new URL(job.data.to);

		// Check if federation is allowed to this URI
		if (!this.utilityService.isFederationAllowedUri(job.data.to)) {
			return 'skip (blocked)';
		}

		// Check if host is suspended
		if (await this.isHostSuspended(host)) {
			return 'skip (suspended)';
		}

		// Fetch or register instance
		const instance = await this.getInstanceInfo(host);

		// Check for software-based suspension
		if (instance && this.utilityService.isDeliverSuspendedSoftware(instance)) {
			return 'skip (software suspended)';
		}

		try {
			await this.deliverActivity(job.data);
			await this.handleDeliverySuccess(host, instance);
			return 'Success';
		} catch (error) {
			await this.handleDeliveryFailure(host, job.data.isSharedInbox, error);
			throw error; // Re-throw for queue retry logic
		}
	}

	/**
	 * Check if a host is currently suspended (with caching).
	 */
	@bindThis
	private async isHostSuspended(host: string): Promise<boolean> {
		let suspendedHosts = this.suspendedHostsCache.get();
		
		if (!suspendedHosts) {
			suspendedHosts = await this.instancesRepository.find({
				where: {
					suspensionState: Not('none'),
				},
			});
			this.suspendedHostsCache.set(suspendedHosts);
		}

		const punyHost = this.utilityService.toPuny(host);
		return suspendedHosts.some(x => x.host === punyHost);
	}

	/**
	 * Get instance info, fetching or registering as needed based on settings.
	 */
	@bindThis
	private async getInstanceInfo(host: string): Promise<MiInstance | null> {
		return this.meta.enableStatsForFederatedInstances
			? await this.federatedInstanceService.fetchOrRegister(host)
			: await this.federatedInstanceService.fetch(host);
	}

	/**
	 * Perform the actual ActivityPub delivery.
	 */
	@bindThis
	private async deliverActivity(data: DeliverJobData): Promise<void> {
		await this.apRequestService.signedPost(
			data.user,
			data.to,
			data.content,
			data.digest
		);
	}

	/**
	 * Handle successful delivery by updating metrics and instance stats.
	 */
	@bindThis
	private async handleDeliverySuccess(host: string, instance: MiInstance | null): Promise<void> {
		// Update charts
		this.apRequestChart.deliverSucc();
		this.federationChart.deliverd(host, true);

		// Update instance stats asynchronously
		process.nextTick(async () => {
			if (!instance) return;

			// Clear not-responding status if it was set
			if (instance.isNotResponding) {
				await this.federatedInstanceService.update(instance.id, {
					isNotResponding: false,
					notRespondingSince: null,
				});
			}

			// Fetch fresh metadata if enabled
			if (this.meta.enableStatsForFederatedInstances) {
				this.fetchInstanceMetadataService.fetchInstanceMetadata(instance);
			}

			// Update instance chart if enabled
			if (this.meta.enableChartsForFederatedInstances) {
				this.instanceChart.requestSent(instance.host, true);
			}
		});
	}

	/**
	 * Handle delivery failure by updating metrics, instance stats, and determining retry behavior.
	 */
	@bindThis
	private async handleDeliveryFailure(
		host: string,
		isSharedInbox: boolean,
		error: any
	): Promise<void> {
		// Update charts
		this.apRequestChart.deliverFail();
		this.federationChart.deliverd(host, false);

		// Update instance not-responding status
		const instance = await this.federatedInstanceService.fetchOrRegister(host);
		await this.updateInstanceNotRespondingStatus(instance);

		// Update instance chart if enabled
		if (this.meta.enableChartsForFederatedInstances) {
			this.instanceChart.requestSent(instance.host, false);
		}

		// Handle HTTP status errors
		if (error instanceof StatusError) {
			this.handleHttpError(error, host, isSharedInbox);
		}
		// Other errors (DNS, socket, timeout) will be thrown for retry
	}

	/**
	 * Update instance not-responding status based on failure.
	 * Auto-suspends instances not responding for 7+ days.
	 */
	@bindThis
	private async updateInstanceNotRespondingStatus(instance: MiInstance): Promise<void> {
		if (!instance.isNotResponding) {
			// First time not responding - set status and timestamp
			await this.federatedInstanceService.update(instance.id, {
				isNotResponding: true,
				notRespondingSince: new Date(),
			});
		} else if (instance.notRespondingSince) {
			// Already not responding - check if we should auto-suspend
			const notRespondingDuration = Date.now() - instance.notRespondingSince.getTime();
			
			if (instance.suspensionState === 'none' && notRespondingDuration >= AUTO_SUSPEND_THRESHOLD_MS) {
				await this.federatedInstanceService.update(instance.id, {
					suspensionState: 'autoSuspendedForNotResponding',
				});
				this.logger.warn(`Auto-suspended ${instance.host} after ${Math.floor(notRespondingDuration / (1000 * 60 * 60 * 24))} days of not responding`);
			}
		} else {
			// isNotResponding is true but notRespondingSince is null (legacy data)
			// This can happen with old data before notRespondingSince was added
			await this.federatedInstanceService.update(instance.id, {
				notRespondingSince: new Date(),
			});
		}
	}

	/**
	 * Handle HTTP status errors and determine if they're retryable.
	 */
	@bindThis
	private handleHttpError(error: StatusError, host: string, isSharedInbox: boolean): never {
		if (!error.isRetryable) {
			// 4xx errors are generally not retryable
			
			// Special case: HTTP 410 Gone means instance is permanently closed
			if (isSharedInbox && error.statusCode === 410) {
				this.federatedInstanceService.fetchOrRegister(host).then(instance => {
					this.federatedInstanceService.update(instance.id, {
						suspensionState: 'goneSuspended',
					});
				});
				throw new Bull.UnrecoverableError(`${host} returned 410 Gone (permanently closed)`);
			}
			
			throw new Bull.UnrecoverableError(`${error.statusCode} ${error.statusMessage}`);
		}

		// 5xx errors and other retryable errors
		throw new Error(`${error.statusCode} ${error.statusMessage}`);
	}
}
