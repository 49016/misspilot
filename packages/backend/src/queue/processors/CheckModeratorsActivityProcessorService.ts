/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { MetaService } from '@/core/MetaService.js';
import { RoleService } from '@/core/RoleService.js';
import { EmailService } from '@/core/EmailService.js';
import { MiUser, type UserProfilesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { SystemWebhookService } from '@/core/SystemWebhookService.js';
import { AnnouncementService } from '@/core/AnnouncementService.js';
import { QueueLoggerService } from '../QueueLoggerService.js';

/** Number of days of moderator inactivity before switching to invitation-only mode */
const MODERATOR_INACTIVITY_LIMIT_DAYS = 7;
/** Warning threshold: Send warnings when this many days remain */
const MODERATOR_INACTIVITY_WARNING_REMAINING_DAYS = 2;
/** Send notifications every N hours once in warning period */
const MODERATOR_INACTIVITY_WARNING_NOTIFY_INTERVAL_HOURS = 6;
/** Time constants in milliseconds */
const ONE_HOUR_MS = 1000 * 60 * 60;
const ONE_DAY_MS = ONE_HOUR_MS * 24;

export type ModeratorInactivityEvaluationResult = {
	isModeratorsInactive: boolean;
	inactiveModerators: MiUser[];
	remainingTime: ModeratorInactivityRemainingTime;
};

export type ModeratorInactivityRemainingTime = {
	time: number;
	asHours: number;
	asDays: number;
};

/**
 * Generate bilingual email for moderator inactivity warning.
 * @param remainingTime Time remaining before switching to invitation-only mode
 * @returns Email subject, HTML body, and plain text body
 */
function generateModeratorInactivityMail(remainingTime: ModeratorInactivityRemainingTime) {
	const subject = 'Moderator Inactivity Warning / モデレーター不在の通知';

	const timeEnglish = remainingTime.asDays === 0 
		? `${remainingTime.asHours} hours` 
		: `${remainingTime.asDays} days`;
	const timeJapanese = remainingTime.asDays === 0 
		? `${remainingTime.asHours} 時間` 
		: `${remainingTime.asDays} 日間`;
	
	const message = [
		'To Moderators,',
		'',
		`A moderator has been inactive for a period of time. If there are ${timeEnglish} of inactivity left, it will switch to invitation only.`,
		'If you do not wish to move to invitation only, you must log into Misskey and update your last active date and time.',
		'',
		'---------------',
		'',
		'モデレーター各位',
		'',
		`モデレーターが一定期間活動していないようです。あと${timeJapanese}活動していない状態が続くと招待制に切り替わります。`,
		'招待制に切り替わることを望まない場合は、Misskeyにログインして最終アクティブ日時を更新してください。',
		'',
	];

	return {
		subject,
		html: message.join('<br>'),
		text: message.join('\n'),
	};
}

/**
 * Generate bilingual email notifying that instance has switched to invitation-only mode.
 * @returns Email subject, HTML body, and plain text body
 */
function generateInvitationOnlyChangedMail() {
	const subject = 'Change to Invitation-Only / 招待制に変更されました';

	const message = [
		'To Moderators,',
		'',
		`Changed to invitation only because no moderator activity was detected for ${MODERATOR_INACTIVITY_LIMIT_DAYS} days.`,
		'To cancel the invitation only, you need to access the control panel.',
		'',
		'---------------',
		'',
		'モデレーター各位',
		'',
		`モデレーターの活動が${MODERATOR_INACTIVITY_LIMIT_DAYS}日間検出されなかったため、招待制に変更されました。`,
		'招待制を解除するには、コントロールパネルにアクセスする必要があります。',
		'',
	];

	return {
		subject,
		html: message.join('<br>'),
		text: message.join('\n'),
	};
}

/**
 * Queue processor service for monitoring moderator activity and enforcing
 * automatic invitation-only mode when moderators are inactive.
 * 
 * This service:
 * - Monitors moderator/admin last active dates
 * - Sends warnings when approaching the inactivity threshold
 * - Automatically switches to invitation-only mode if all moderators inactive for 7+ days
 * - Sends notifications via email, announcements, and system webhooks
 * 
 * This helps protect instances from abandonment and spam.
 */
@Injectable()
export class CheckModeratorsActivityProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,
		private metaService: MetaService,
		private roleService: RoleService,
		private emailService: EmailService,
		private announcementService: AnnouncementService,
		private systemWebhookService: SystemWebhookService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('check-moderators-activity');
	}

	/**
	 * Main process entry point. Skips if already in invitation-only mode.
	 */
	@bindThis
	public async process(): Promise<void> {
		this.logger.info('Checking moderators activity...');

		try {
			const meta = await this.metaService.fetch(false);
			if (!meta.disableRegistration) {
				await this.processImpl();
			} else {
				this.logger.info('Instance is already in invitation-only mode. Skipping check.');
			}
			
			this.logger.succ('Moderators activity check completed.');
		} catch (error) {
			this.logger.error('Failed to check moderators activity:', error);
			throw error;
		}
	}

	/**
	 * Implementation of the moderator activity check logic.
	 * Either switches to invitation-only or sends warnings based on activity.
	 */
	@bindThis
	private async processImpl() {
		const evaluateResult = await this.evaluateModeratorsInactiveDays();
		
		if (evaluateResult.isModeratorsInactive) {
			await this.handleInactiveModerators();
		} else {
			await this.handleWarningPeriod(evaluateResult.remainingTime);
		}
	}

	/**
	 * Handle the case where all moderators are inactive for the threshold period.
	 * Switches to invitation-only mode and notifies all moderators.
	 */
	@bindThis
	private async handleInactiveModerators() {
		this.logger.warn(`All moderators have been inactive for ${MODERATOR_INACTIVITY_LIMIT_DAYS}+ days. Switching to invitation-only mode.`);
		
		await this.changeToInvitationOnly();
		await this.notifyChangeToInvitationOnly();
	}

	/**
	 * Handle the warning period before switching to invitation-only.
	 * Sends periodic warnings if within the threshold.
	 */
	@bindThis
	private async handleWarningPeriod(remainingTime: ModeratorInactivityRemainingTime) {
		if (remainingTime.asDays > MODERATOR_INACTIVITY_WARNING_REMAINING_DAYS) {
			return; // Not in warning period yet
		}

		const timeDescription = remainingTime.asDays === 0 
			? `${remainingTime.asHours} hours` 
			: `${remainingTime.asDays} days`;
		
		this.logger.warn(`Moderators approaching inactivity threshold. ${timeDescription} remaining before invitation-only mode.`);

		// Send notifications every N hours to avoid spam
		// Once under 2 days remaining, notify every 6 hours
		if (this.shouldSendWarningNotification(remainingTime)) {
			await this.notifyInactiveModeratorsWarning(remainingTime);
		}
	}

	/**
	 * Determine if a warning notification should be sent based on remaining time.
	 * Sends every N hours to avoid notification spam.
	 */
	@bindThis
	private shouldSendWarningNotification(remainingTime: ModeratorInactivityRemainingTime): boolean {
		return remainingTime.asHours % MODERATOR_INACTIVITY_WARNING_NOTIFY_INTERVAL_HOURS === 0;
	}

	/**
	 * Evaluate whether moderators are inactive and calculate remaining time.
	 * 
	 * Checks all users with moderator, administrator, or root roles.
	 * Compares their lastActiveDate against the inactivity threshold (7 days).
	 * Users with null lastActiveDate are excluded from the check.
	 * 
	 * Returns true for isModeratorsInactive if ALL moderators with a lastActiveDate
	 * are inactive (haven't been active within the threshold).
	 * 
	 * Example scenarios (threshold = 7 days, current time = 2022-01-30 12:00:00):
	 * 
	 * Scenario 1 (At least one active):
	 * - ModeratorA: lastActiveDate = 2022-01-20 00:00:00 → Inactive
	 * - ModeratorB: lastActiveDate = 2022-01-23 12:00:00 → Active (exactly on threshold)
	 * - ModeratorC: lastActiveDate = 2022-01-23 11:59:59 → Inactive (1 second past threshold)
	 * - ModeratorD: lastActiveDate = null → Ignored
	 * Result: isModeratorsInactive = false (B is active)
	 * 
	 * Scenario 2 (All inactive):
	 * - ModeratorA: lastActiveDate = 2022-01-20 00:00:00 → Inactive
	 * - ModeratorB: lastActiveDate = 2022-01-22 12:00:00 → Inactive
	 * - ModeratorC: lastActiveDate = 2022-01-23 11:59:59 → Inactive
	 * - ModeratorD: lastActiveDate = null → Ignored
	 * Result: isModeratorsInactive = true (all are inactive)
	 * 
	 * @returns Evaluation result with inactivity status and remaining time
	 */
	@bindThis
	public async evaluateModeratorsInactiveDays(): Promise<ModeratorInactivityEvaluationResult> {
		const today = new Date();
		const inactivityThreshold = this.calculateInactivityThreshold(today);

		// Get all moderators with a last active date
		const moderators = await this.fetchModerators()
			.then(mods => mods.filter(mod => mod.lastActiveDate != null));

		// Find which moderators are inactive (past the threshold)
		const inactiveModerators = moderators
			.filter(mod => mod.lastActiveDate!.getTime() < inactivityThreshold.getTime());

		// Calculate remaining time based on the most recently active moderator
		// This shows the grace period before all moderators are considered inactive
		const remainingTime = this.calculateRemainingTime(moderators, inactivityThreshold);

		return {
			isModeratorsInactive: inactiveModerators.length === moderators.length,
			inactiveModerators,
			remainingTime,
		};
	}

	/**
	 * Calculate the inactivity threshold date (current date minus threshold days)
	 */
	@bindThis
	private calculateInactivityThreshold(currentDate: Date): Date {
		const threshold = new Date(currentDate);
		threshold.setDate(currentDate.getDate() - MODERATOR_INACTIVITY_LIMIT_DAYS);
		return threshold;
	}

	/**
	 * Calculate remaining time before all moderators are considered inactive.
	 * Based on the most recently active moderator.
	 */
	@bindThis
	private calculateRemainingTime(
		moderators: Array<{ lastActiveDate: Date | null }>,
		inactivityThreshold: Date
	): ModeratorInactivityRemainingTime {
		// Find the most recent activity among all moderators
		const mostRecentActivity = new Date(
			Math.max(...moderators.map(mod => mod.lastActiveDate!.getTime()))
		);

		const remainingMs = mostRecentActivity.getTime() - inactivityThreshold.getTime();
		
		return {
			time: remainingMs,
			asHours: Math.floor(remainingMs / ONE_HOUR_MS),
			asDays: Math.floor(remainingMs / ONE_DAY_MS),
		};
	}

	/**
	 * Switch instance to invitation-only mode
	 */
	@bindThis
	private async changeToInvitationOnly() {
		await this.metaService.update({ disableRegistration: true });
		this.logger.info('Instance switched to invitation-only mode.');
	}

	/**
	 * Send warning notifications to all moderators about approaching inactivity threshold.
	 * Notifications are sent via email and system webhooks.
	 */
	@bindThis
	public async notifyInactiveModeratorsWarning(remainingTime: ModeratorInactivityRemainingTime) {
		const moderators = await this.fetchModerators();
		const mail = generateModeratorInactivityMail(remainingTime);

		// Send emails to moderators with verified email addresses
		await this.sendEmailsToModerators(moderators, mail);

		// Trigger system webhook
		await this.systemWebhookService.enqueueSystemWebhook(
			'inactiveModeratorsWarning',
			{ remainingTime },
		);

		this.logger.info(`Warning notifications sent to ${moderators.length} moderators.`);
	}

	/**
	 * Send notifications to all moderators that instance has switched to invitation-only mode.
	 * Notifications are sent via email, announcements, and system webhooks.
	 */
	@bindThis
	public async notifyChangeToInvitationOnly() {
		const moderators = await this.fetchModerators();
		const mail = generateInvitationOnlyChangedMail();

		// Create announcements and send emails to all moderators
		await this.notifyModeratorsOfSwitch(moderators, mail);

		// Trigger system webhook
		await this.systemWebhookService.enqueueSystemWebhook(
			'inactiveModeratorsInvitationOnlyChanged',
			{},
		);

		this.logger.info(`Invitation-only notifications sent to ${moderators.length} moderators.`);
	}

	/**
	 * Send emails to moderators with verified email addresses
	 */
	@bindThis
	private async sendEmailsToModerators(
		moderators: MiUser[],
		mail: { subject: string; html: string; text: string }
	) {
		const profiles = await this.fetchModeratorProfiles(moderators);

		for (const moderator of moderators) {
			const profile = profiles.get(moderator.id);
			if (profile?.email && profile.emailVerified) {
				this.emailService.sendEmail(profile.email, mail.subject, mail.html, mail.text);
			}
		}
	}

	/**
	 * Create announcements and send emails to moderators about invitation-only switch
	 */
	@bindThis
	private async notifyModeratorsOfSwitch(
		moderators: MiUser[],
		mail: { subject: string; html: string; text: string }
	) {
		const profiles = await this.fetchModeratorProfiles(moderators);

		for (const moderator of moderators) {
			// Create personal announcement
			this.announcementService.create({
				title: mail.subject,
				text: mail.text,
				forExistingUsers: true,
				needConfirmationToRead: true,
				userId: moderator.id,
			});

			// Send email if verified
			const profile = profiles.get(moderator.id);
			if (profile?.email && profile.emailVerified) {
				this.emailService.sendEmail(profile.email, mail.subject, mail.html, mail.text);
			}
		}
	}

	/**
	 * Fetch moderator profiles and return as a map for efficient lookup
	 */
	@bindThis
	private async fetchModeratorProfiles(moderators: MiUser[]) {
		const profiles = await this.userProfilesRepository.findBy({ 
			userId: In(moderators.map(mod => mod.id)) 
		});
		return new Map(profiles.map(profile => [profile.userId, profile]));
	}

	/**
	 * Fetch all moderators (includes admins and root users).
	 * TODO: Consider other users with special permissions in the future.
	 */
	@bindThis
	private async fetchModerators() {
		return this.roleService.getModerators({
			includeAdmins: true,
			includeRoot: true,
			excludeExpire: true,
		});
	}
}
