/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { LoggerService } from '@nestjs/common';
import Logger from '@/logger.js';

const logger = new Logger('core', 'cyan');
const nestLogger = logger.createSubLogger('nest', 'green');

/**
 * Custom Nest.js logger implementation that integrates with Misskey's logging system.
 * Provides structured logging with context and environment-aware filtering.
 */
export class NestLogger implements LoggerService {
	private readonly isProduction = process.env.NODE_ENV === 'production';

	/**
	 * Format log message with context
	 */
	private formatMessage(context: string | undefined, message: any): string {
		return context ? `[${context}] ${message}` : String(message);
	}

	/**
	 * Write a 'log' level log
	 * @param message - Log message
	 * @param optionalParams - Additional parameters, first one is typically the context
	 */
	log(message: any, ...optionalParams: any[]): void {
		const context = optionalParams[0] as string | undefined;
		nestLogger.info(this.formatMessage(context, message));
	}

	/**
	 * Write an 'error' level log
	 * @param message - Error message
	 * @param optionalParams - Additional parameters including stack trace
	 */
	error(message: any, ...optionalParams: any[]): void {
		const context = optionalParams[0] as string | undefined;
		const trace = optionalParams[1] as string | undefined;
		nestLogger.error(this.formatMessage(context, message), trace);
	}

	/**
	 * Write a 'warn' level log
	 * @param message - Warning message
	 * @param optionalParams - Additional parameters, first one is typically the context
	 */
	warn(message: any, ...optionalParams: any[]): void {
		const context = optionalParams[0] as string | undefined;
		nestLogger.warn(this.formatMessage(context, message));
	}

	/**
	 * Write a 'debug' level log
	 * Only logs in non-production environments
	 */
	debug?(message: any, ...optionalParams: any[]): void {
		if (this.isProduction) return;
		const context = optionalParams[0] as string | undefined;
		nestLogger.debug(this.formatMessage(context, message));
	}

	/**
	 * Write a 'verbose' level log
	 * Only logs in non-production environments
	 */
	verbose?(message: any, ...optionalParams: any[]): void {
		if (this.isProduction) return;
		const context = optionalParams[0] as string | undefined;
		nestLogger.debug(this.formatMessage(context, message));
	}
}
