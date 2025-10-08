/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type Logger from '@/logger.js';
import { RemoteLoggerService } from '@/core/RemoteLoggerService.js';

const LOGGER_NAME = 'ap';
const LOGGER_COLOR = 'magenta';

/**
 * Logger service for ActivityPub operations
 * Creates a magenta-colored sub-logger under the remote logger
 */
@Injectable()
export class ApLoggerService {
	public logger: Logger;

	constructor(
		private remoteLoggerService: RemoteLoggerService,
	) {
		this.logger = this.remoteLoggerService.logger.createSubLogger(LOGGER_NAME, LOGGER_COLOR);
	}
}
