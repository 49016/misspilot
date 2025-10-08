/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IsNull, MoreThan } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import type { RetentionAggregationsRepository, UsersRepository } from '@/models/_.js';
import { deepClone } from '@/misc/clone.js';
import { IdService } from '@/core/IdService.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';

/** Time constants for retention calculations */
const ONE_DAY_MS = 1000 * 60 * 60 * 24;
const RETENTION_LOOKBACK_DAYS = 31;

/**
 * Queue processor service for aggregating user retention data.
 * 
 * This service:
 * - Tracks users registered today
 * - Compares against historically registered users to see who's still active
 * - Updates retention metrics for the past ~30 days
 * 
 * Handles race conditions when multiple workers process the same day.
 */
@Injectable()
export class AggregateRetentionProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.retentionAggregationsRepository)
		private retentionAggregationsRepository: RetentionAggregationsRepository,

		private idService: IdService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('aggregate-retention');
	}

	@bindThis
	public async process(): Promise<void> {
		this.logger.info('Aggregating retention...');

		const now = new Date();
		const dateKey = this.generateDateKey(now);

		try {
			// Fetch historical records (past ~30 days)
			const pastRecords = await this.fetchPastRetentionRecords(now);
			
			// Get users registered today (local users only)
			const targetUserIds = await this.fetchTodaysNewUsers(now);
			
			// Create today's retention record
			const recordCreated = await this.createTodaysRetentionRecord(now, dateKey, targetUserIds);
			if (!recordCreated) {
				return; // Already processed by another worker
			}

			// Get active users today
			const activeUserIds = await this.fetchTodaysActiveUsers(now);
			
			// Update past records with today's retention data
			await this.updatePastRecordsWithTodaysActivity(pastRecords, dateKey, activeUserIds, now);

			this.logger.succ(`Retention aggregated. New users: ${targetUserIds.length}, Active: ${activeUserIds.length}`);
		} catch (error) {
			this.logger.error('Failed to aggregate retention:', error);
			throw error;
		}
	}

	/**
	 * Generate date key in format: YYYY-M-D
	 */
	@bindThis
	private generateDateKey(date: Date): string {
		return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
	}

	/**
	 * Fetch retention aggregation records from the past ~30 days
	 */
	@bindThis
	private async fetchPastRetentionRecords(now: Date) {
		const cutoffDate = new Date(now.getTime() - (ONE_DAY_MS * RETENTION_LOOKBACK_DAYS));
		return await this.retentionAggregationsRepository.findBy({
			createdAt: MoreThan(cutoffDate),
		});
	}

	/**
	 * Fetch IDs of local users who registered today (within last 24 hours)
	 */
	@bindThis
	private async fetchTodaysNewUsers(now: Date): Promise<string[]> {
		const oneDayAgo = now.getTime() - ONE_DAY_MS;
		const users = await this.usersRepository.findBy({
			host: IsNull(), // Local users only
			id: MoreThan(this.idService.gen(oneDayAgo)),
		});
		return users.map(u => u.id);
	}

	/**
	 * Fetch IDs of local users who were active today (within last 24 hours)
	 */
	@bindThis
	private async fetchTodaysActiveUsers(now: Date): Promise<string[]> {
		const oneDayAgo = new Date(now.getTime() - ONE_DAY_MS);
		const users = await this.usersRepository.findBy({
			host: IsNull(), // Local users only
			lastActiveDate: MoreThan(oneDayAgo),
		});
		return users.map(u => u.id);
	}

	/**
	 * Create today's retention record. Returns false if already processed by another worker.
	 */
	@bindThis
	private async createTodaysRetentionRecord(
		now: Date, 
		dateKey: string, 
		userIds: string[]
	): Promise<boolean> {
		try {
			await this.retentionAggregationsRepository.insert({
				id: this.idService.gen(),
				createdAt: now,
				updatedAt: now,
				dateKey,
				userIds,
				usersCount: userIds.length,
			});
			return true;
		} catch (err) {
			if (isDuplicateKeyValueError(err)) {
				this.logger.succ('Skip because it has already been processed by another worker.');
				return false;
			}
			throw err;
		}
	}

	/**
	 * Update historical retention records with today's activity data.
	 * For each past record, count how many of those registered users are active today.
	 */
	@bindThis
	private async updatePastRecordsWithTodaysActivity(
		pastRecords: any[],
		dateKey: string,
		activeUserIds: string[],
		now: Date
	): Promise<void> {
		const activeUserIdSet = new Set(activeUserIds);
		
		const updatePromises = pastRecords.map(async (record) => {
			// Count how many users from this record are still active today
			const retainedCount = record.userIds.filter((id: string) => activeUserIdSet.has(id)).length;

			const data = deepClone(record.data);
			data[dateKey] = retainedCount;

			return this.retentionAggregationsRepository.update(record.id, {
				updatedAt: now,
				data,
			});
		});

		await Promise.all(updatePromises);
	}
}
