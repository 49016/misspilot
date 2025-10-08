/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';

const LOGGER_NAME = 'queue';
const LOGGER_COLOR = 'orange';

/**
 * Logger service for queue operations
 * Provides an orange-colored logger for queue-related activities
 */
@Injectable()
export class QueueLoggerService {
	public logger: Logger;

	constructor(
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger(LOGGER_NAME, LOGGER_COLOR);
	}
}
