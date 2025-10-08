/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';

const LOGGER_NAME = 'remote';
const LOGGER_COLOR = 'cyan';

/**
 * Logger service for remote operations
 * Provides a cyan-colored logger for remote-related activities
 */
@Injectable()
export class RemoteLoggerService {
	public logger: Logger;

	constructor(
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger(LOGGER_NAME, LOGGER_COLOR);
	}
}
