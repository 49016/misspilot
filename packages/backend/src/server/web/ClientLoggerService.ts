/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type Logger from '@/logger.js';
import { LoggerService } from '@/core/LoggerService.js';

const LOGGER_NAME = 'client';

/**
 * Logger service for client operations
 * Provides a logger for client-related activities
 */
@Injectable()
export class ClientLoggerService {
	public logger: Logger;

	constructor(
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger(LOGGER_NAME);
	}
}
