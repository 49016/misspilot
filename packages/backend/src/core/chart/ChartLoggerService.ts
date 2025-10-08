/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';

const LOGGER_NAME = 'chart';
const LOGGER_COLOR = 'white';

/**
 * Logger service for chart operations
 * Provides a white-colored logger for chart-related activities
 */
@Injectable()
export class ChartLoggerService {
	public logger: Logger;

	constructor(
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger(LOGGER_NAME, LOGGER_COLOR);
	}
}
