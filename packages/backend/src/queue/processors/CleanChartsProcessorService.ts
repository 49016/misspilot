/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type Logger from '@/logger.js';
import FederationChart from '@/core/chart/charts/federation.js';
import NotesChart from '@/core/chart/charts/notes.js';
import UsersChart from '@/core/chart/charts/users.js';
import ActiveUsersChart from '@/core/chart/charts/active-users.js';
import InstanceChart from '@/core/chart/charts/instance.js';
import PerUserNotesChart from '@/core/chart/charts/per-user-notes.js';
import PerUserPvChart from '@/core/chart/charts/per-user-pv.js';
import DriveChart from '@/core/chart/charts/drive.js';
import PerUserReactionsChart from '@/core/chart/charts/per-user-reactions.js';
import PerUserFollowingChart from '@/core/chart/charts/per-user-following.js';
import PerUserDriveChart from '@/core/chart/charts/per-user-drive.js';
import ApRequestChart from '@/core/chart/charts/ap-request.js';
import { bindThis } from '@/decorators.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';

/**
 * Queue processor service for cleaning old chart data.
 * 
 * This service periodically cleans up old time-series chart data to prevent
 * unbounded growth of the database. Each chart type has its own retention
 * policy defined in the chart class.
 * 
 * Charts are cleaned sequentially (not in parallel) to avoid overwhelming
 * the database with simultaneous delete operations.
 */
@Injectable()
export class CleanChartsProcessorService {
	private logger: Logger;

	/** All chart types that need periodic cleaning */
	private readonly charts: Array<{ name: string; chart: { clean: () => Promise<void> } }>;

	constructor(
		private federationChart: FederationChart,
		private notesChart: NotesChart,
		private usersChart: UsersChart,
		private activeUsersChart: ActiveUsersChart,
		private instanceChart: InstanceChart,
		private perUserNotesChart: PerUserNotesChart,
		private perUserPvChart: PerUserPvChart,
		private driveChart: DriveChart,
		private perUserReactionsChart: PerUserReactionsChart,
		private perUserFollowingChart: PerUserFollowingChart,
		private perUserDriveChart: PerUserDriveChart,
		private apRequestChart: ApRequestChart,

		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('clean-charts');
		
		// Initialize chart list for easy iteration
		this.charts = [
			{ name: 'federation', chart: this.federationChart },
			{ name: 'notes', chart: this.notesChart },
			{ name: 'users', chart: this.usersChart },
			{ name: 'activeUsers', chart: this.activeUsersChart },
			{ name: 'instance', chart: this.instanceChart },
			{ name: 'perUserNotes', chart: this.perUserNotesChart },
			{ name: 'perUserPv', chart: this.perUserPvChart },
			{ name: 'drive', chart: this.driveChart },
			{ name: 'perUserReactions', chart: this.perUserReactionsChart },
			{ name: 'perUserFollowing', chart: this.perUserFollowingChart },
			{ name: 'perUserDrive', chart: this.perUserDriveChart },
			{ name: 'apRequest', chart: this.apRequestChart },
		];
	}

	/**
	 * Clean all charts sequentially.
	 * Sequential execution prevents overwhelming the database with parallel DELETE operations.
	 */
	@bindThis
	public async process(): Promise<void> {
		this.logger.info(`Starting chart cleanup for ${this.charts.length} chart types...`);

		try {
			let cleanedCount = 0;
			
			for (const { name, chart } of this.charts) {
				try {
					await chart.clean();
					cleanedCount++;
					this.logger.info(`Cleaned ${name} chart (${cleanedCount}/${this.charts.length})`);
				} catch (error) {
					this.logger.error(`Failed to clean ${name} chart:`, error);
					// Continue with other charts even if one fails
				}
			}

			this.logger.succ(`Chart cleanup completed. Successfully cleaned ${cleanedCount}/${this.charts.length} chart types.`);
		} catch (error) {
			this.logger.error('Unexpected error during chart cleanup:', error);
			throw error;
		}
	}
}
