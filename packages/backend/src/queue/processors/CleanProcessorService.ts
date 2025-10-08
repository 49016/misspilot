/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In, LessThan } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { AntennasRepository, RoleAssignmentsRepository, UserIpsRepository } from '@/models/_.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import type { Config } from '@/config.js';
import { ReversiService } from '@/core/ReversiService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';

/** Retention period for user IP address logs (90 days) */
const USER_IP_RETENTION_DAYS = 90;
const ONE_DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Queue processor service for general database cleaning tasks.
 * 
 * This service periodically cleans up:
 * - Old user IP address logs (older than 90 days)
 * - Unused antennas (based on configured threshold)
 * - Expired role assignments
 * - Outdated reversi games
 * 
 * Helps maintain database performance and comply with data retention policies.
 */
@Injectable()
export class CleanProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.userIpsRepository)
		private userIpsRepository: UserIpsRepository,

		@Inject(DI.antennasRepository)
		private antennasRepository: AntennasRepository,

		@Inject(DI.roleAssignmentsRepository)
		private roleAssignmentsRepository: RoleAssignmentsRepository,

		private queueLoggerService: QueueLoggerService,
		private reversiService: ReversiService,
		private idService: IdService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('clean');
	}

	/**
	 * Perform all cleaning operations in sequence.
	 */
	@bindThis
	public async process(): Promise<void> {
		this.logger.info('Starting general database cleaning...');

		try {
			await this.cleanOldUserIpLogs();
			await this.deactivateUnusedAntennas();
			await this.removeExpiredRoleAssignments();
			await this.cleanOutdatedReversiGames();

			this.logger.succ('General database cleaning completed.');
		} catch (error) {
			this.logger.error('Failed during general database cleaning:', error);
			throw error;
		}
	}

	/**
	 * Delete user IP address logs older than 90 days for privacy/compliance.
	 */
	@bindThis
	private async cleanOldUserIpLogs() {
		const cutoffDate = new Date(Date.now() - (USER_IP_RETENTION_DAYS * ONE_DAY_MS));
		
		await this.userIpsRepository.delete({
			createdAt: LessThan(cutoffDate),
		});
		
		this.logger.info(`Cleaned user IP logs older than ${USER_IP_RETENTION_DAYS} days.`);
	}

	/**
	 * Deactivate antennas that haven't been used within the configured threshold.
	 * Only runs if threshold is configured (> 0).
	 */
	@bindThis
	private async deactivateUnusedAntennas() {
		if (this.config.deactivateAntennaThreshold <= 0) {
			this.logger.info('Antenna deactivation is disabled (threshold = 0).');
			return;
		}

		const thresholdDate = new Date(Date.now() - this.config.deactivateAntennaThreshold);
		
		await this.antennasRepository.update({
			lastUsedAt: LessThan(thresholdDate),
		}, {
			isActive: false,
		});

		const thresholdDays = Math.floor(this.config.deactivateAntennaThreshold / ONE_DAY_MS);
		this.logger.info(`Deactivated unused antennas (threshold: ${thresholdDays} days).`);
	}

	/**
	 * Remove role assignments that have passed their expiration date.
	 */
	@bindThis
	private async removeExpiredRoleAssignments() {
		const expiredAssignments = await this.roleAssignmentsRepository.createQueryBuilder('assign')
			.where('assign.expiresAt IS NOT NULL')
			.andWhere('assign.expiresAt < :now', { now: new Date() })
			.getMany();

		if (expiredAssignments.length > 0) {
			await this.roleAssignmentsRepository.delete({
				id: In(expiredAssignments.map(x => x.id)),
			});
			this.logger.info(`Removed ${expiredAssignments.length} expired role assignment(s).`);
		} else {
			this.logger.info('No expired role assignments found.');
		}
	}

	/**
	 * Clean up outdated reversi game records.
	 */
	@bindThis
	private async cleanOutdatedReversiGames() {
		await this.reversiService.cleanOutdatedGames();
		this.logger.info('Cleaned outdated reversi games.');
	}
}
