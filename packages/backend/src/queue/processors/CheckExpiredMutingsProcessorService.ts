/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { MutingsRepository } from '@/models/_.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { UserMutingService } from '@/core/UserMutingService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';

/**
 * Queue processor service for checking and removing expired user muting relationships.
 * 
 * This service periodically scans for muting relationships that have passed their
 * expiration date and automatically unmutes them. This allows users to set
 * temporary mutes that expire after a specified duration.
 */
@Injectable()
export class CheckExpiredMutingsProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.mutingsRepository)
		private mutingsRepository: MutingsRepository,

		private userMutingService: UserMutingService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('check-expired-mutings');
	}

	/**
	 * Process expired mutings by finding and unmuting them.
	 */
	@bindThis
	public async process(): Promise<void> {
		this.logger.info('Checking expired mutings...');

		try {
			const expiredMutings = await this.findExpiredMutings();
			
			if (expiredMutings.length > 0) {
				this.logger.info(`Found ${expiredMutings.length} expired muting(s). Unmuting...`);
				await this.userMutingService.unmute(expiredMutings);
				this.logger.succ(`Successfully unmuted ${expiredMutings.length} expired muting(s).`);
			} else {
				this.logger.info('No expired mutings found.');
			}
		} catch (error) {
			this.logger.error('Failed to check expired mutings:', error);
			throw error;
		}
	}

	/**
	 * Find all muting relationships that have expired.
	 * 
	 * @returns Array of expired muting records with the mutee user joined
	 */
	@bindThis
	private async findExpiredMutings() {
		const now = new Date();
		
		return await this.mutingsRepository.createQueryBuilder('muting')
			.where('muting.expiresAt IS NOT NULL')
			.andWhere('muting.expiresAt < :now', { now })
			.innerJoinAndSelect('muting.mutee', 'mutee')
			.getMany();
	}
}
