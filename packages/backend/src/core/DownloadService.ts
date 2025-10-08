/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import * as stream from 'node:stream/promises';
import { Inject, Injectable } from '@nestjs/common';
import chalk from 'chalk';
import got, * as Got from 'got';
import { parse } from 'content-disposition';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { createTemp } from '@/misc/create-temp.js';
import { StatusError } from '@/misc/status-error.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';

import { bindThis } from '@/decorators.js';

@Injectable()
export class DownloadService {
	private logger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,

		private httpRequestService: HttpRequestService,
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('download');
	}

	/**
	 * Download a file from a URL to a local path
	 * @param url Source URL to download from
	 * @param path Destination path to save the file
	 * @returns Object containing the filename
	 * @throws StatusError if HTTP error occurs
	 * @throws Error if download fails for other reasons
	 */
	@bindThis
	public async downloadUrl(url: string, path: string): Promise<{
		filename: string;
	}> {
		this.logger.info(`Downloading ${chalk.cyan(url)} to ${chalk.cyanBright(path)} ...`);

		// Timeout constants for various stages of the request
		const SOCKET_TIMEOUT = 30 * 1000; // 30 seconds per operation
		const OPERATION_TIMEOUT = 60 * 1000; // 60 seconds total
		const maxSize = this.config.maxFileSize;

		const urlObj = new URL(url);
		let filename = this.extractFilenameFromUrl(urlObj);

		const req = this.createDownloadStream(url, urlObj, SOCKET_TIMEOUT, OPERATION_TIMEOUT);
		
		// Handle response headers to extract filename and validate size
		req.on('response', (res: Got.Response) => {
			filename = this.handleResponseHeaders(res, filename, maxSize, req);
		});

		// Monitor download progress to enforce size limits
		req.on('downloadProgress', (progress: Got.Progress) => {
			if (progress.transferred > maxSize) {
				this.logger.warn(`Download size limit exceeded: ${progress.transferred} bytes > ${maxSize} bytes`);
				req.destroy();
			}
		});

		try {
			await stream.pipeline(req, fs.createWriteStream(path));
			this.logger.succ(`Download completed: ${chalk.cyan(url)}`);
		} catch (e) {
			this.logger.error(`Download failed for ${url}:`, e);
			if (e instanceof Got.HTTPError) {
				throw new StatusError(
					`HTTP ${e.response.statusCode}: ${e.response.statusMessage}`,
					e.response.statusCode,
					e.response.statusMessage
				);
			}
			throw new Error(`Download failed: ${e instanceof Error ? e.message : String(e)}`);
		}

		return { filename };
	}

	/**
	 * Extract filename from URL pathname
	 */
	@bindThis
	private extractFilenameFromUrl(urlObj: URL): string {
		const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
		return pathParts[pathParts.length - 1] || 'untitled';
	}

	/**
	 * Create a download stream with configured timeouts and security settings
	 */
	@bindThis
	private createDownloadStream(url: string, urlObj: URL, socketTimeout: number, operationTimeout: number): Got.GotEmitter & stream.Readable {
		return got.stream(url, {
			headers: {
				'User-Agent': this.config.userAgent,
			},
			timeout: {
				lookup: socketTimeout,
				connect: socketTimeout,
				secureConnect: socketTimeout,
				socket: socketTimeout,
				response: socketTimeout,
				send: socketTimeout,
				request: operationTimeout,
			},
			agent: {
				http: this.httpRequestService.getAgentForHttp(urlObj, true),
				https: this.httpRequestService.getAgentForHttps(urlObj, true),
			},
			http2: false,
			retry: { limit: 0 },
			enableUnixSockets: false,
		});
	}

	/**
	 * Handle response headers: validate size and extract filename
	 */
	@bindThis
	private handleResponseHeaders(
		res: Got.Response,
		defaultFilename: string,
		maxSize: number,
		req: Got.GotEmitter & stream.Readable
	): string {
		let filename = defaultFilename;

		// Validate content length
		const contentLength = res.headers['content-length'];
		if (contentLength) {
			const size = Number(contentLength);
			if (size > maxSize) {
				this.logger.warn(`Content-Length exceeds limit: ${size} bytes > ${maxSize} bytes`);
				req.destroy();
			}
		}

		// Extract filename from Content-Disposition header
		const contentDisposition = res.headers['content-disposition'];
		if (contentDisposition) {
			try {
				const parsed = parse(contentDisposition);
				if (parsed.parameters.filename) {
					filename = parsed.parameters.filename;
				}
			} catch (e) {
				this.logger.warn(`Failed to parse Content-Disposition header: ${contentDisposition}`, { error: e });
			}
		}

		return filename;
	}

	/**
	 * Download a text file from a URL and return its contents
	 * Uses a temporary file which is automatically cleaned up
	 * @param url URL of the text file to download
	 * @returns The text content of the file
	 * @throws Error if download or file read fails
	 */
	@bindThis
	public async downloadTextFile(url: string): Promise<string> {
		const [tempPath, cleanup] = await createTemp();

		this.logger.info(`Downloading text file to temporary path: ${tempPath}`);

		try {
			await this.downloadUrl(url, tempPath);
			const text = await fs.promises.readFile(tempPath, 'utf8');
			this.logger.info(`Successfully read ${text.length} characters from ${url}`);
			return text;
		} catch (error) {
			this.logger.error(`Failed to download or read text file from ${url}:`, error);
			throw new Error(`Text file download failed: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			cleanup();
		}
	}
}
