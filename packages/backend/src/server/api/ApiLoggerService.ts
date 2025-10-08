/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';

const LOGGER_NAME = 'api';

/**
 * Logger service for API operations
 * Provides a logger for API-related activities
 */
@Injectable()
export class ApiLoggerService {
	public logger: Logger;

	constructor(
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger(LOGGER_NAME);
	}
}
