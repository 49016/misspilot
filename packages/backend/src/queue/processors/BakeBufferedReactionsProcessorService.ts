/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { ReactionsBufferingService } from '@/core/ReactionsBufferingService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import { MiMeta } from '@/models/_.js';
import { DI } from '@/di-symbols.js';

/**
 * Queue processor service for baking (persisting) buffered reactions to the database.
 * 
 * When reactions buffering is enabled, reactions are temporarily held in memory/Redis
 * for performance. This service periodically commits those buffered reactions to the
 * database to ensure durability.
 * 
 * This helps reduce database write pressure during high traffic by batching reactions.
 */
@Injectable()
export class BakeBufferedReactionsProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		private reactionsBufferingService: ReactionsBufferingService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('bake-buffered-reactions');
	}

	/**
	 * Process the baking of buffered reactions.
	 * Skips if reactions buffering is disabled in the instance settings.
	 */
	@bindThis
	public async process(): Promise<void> {
		if (!this.isReactionsBufferingEnabled()) {
			this.logger.info('Reactions buffering is disabled. Skipping...');
			return;
		}

		try {
			this.logger.info('Baking buffered reactions...');
			
			await this.reactionsBufferingService.bake();
			
			this.logger.succ('All buffered reactions baked successfully.');
		} catch (error) {
			this.logger.error('Failed to bake buffered reactions:', error);
			throw error;
		}
	}

	/**
	 * Check if reactions buffering is enabled in instance meta settings
	 */
	@bindThis
	private isReactionsBufferingEnabled(): boolean {
		return this.meta.enableReactionsBuffering === true;
	}
}
