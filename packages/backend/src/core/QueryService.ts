/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets, ObjectLiteral } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { MiUser } from '@/models/User.js';
import type { UserProfilesRepository, FollowingsRepository, ChannelFollowingsRepository, BlockingsRepository, NoteThreadMutingsRepository, MutingsRepository, RenoteMutingsRepository, MiMeta } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import type { SelectQueryBuilder } from 'typeorm';

/**
 * Service that provides database query generation utilities
 * 
 * Core Responsibilities:
 * - Pagination queries with ID or date-based cursors
 * - Filtering queries for mutes, blocks, and suspensions
 * - Visibility queries for note access control
 * - Instance-level blocking and suspension
 * 
 * @remarks
 * Query generation methods are used across timeline endpoints to ensure
 * consistent access control and filtering behavior.
 */
@Injectable()
export class QueryService {
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		@Inject(DI.channelFollowingsRepository)
		private channelFollowingsRepository: ChannelFollowingsRepository,

		@Inject(DI.blockingsRepository)
		private blockingsRepository: BlockingsRepository,

		@Inject(DI.noteThreadMutingsRepository)
		private noteThreadMutingsRepository: NoteThreadMutingsRepository,

		@Inject(DI.mutingsRepository)
		private mutingsRepository: MutingsRepository,

		@Inject(DI.renoteMutingsRepository)
		private renoteMutingsRepository: RenoteMutingsRepository,

		@Inject(DI.meta)
		private meta: MiMeta,

		private idService: IdService,
	) {
	}

	/**
	 * Helper method to add range condition and sorting to query
	 */
	private applyPaginationRange<T extends ObjectLiteral>(
		q: SelectQueryBuilder<T>,
		column: string,
		sinceId: string | null | undefined,
		untilId: string | null | undefined,
	): void {
		const ascending = sinceId && !untilId;
		
		if (sinceId) {
			q.andWhere(`${column} > :sinceId`, { sinceId });
		}
		if (untilId) {
			q.andWhere(`${column} < :untilId`, { untilId });
		}
		
		q.orderBy(column, ascending ? 'ASC' : 'DESC');
	}

	/**
	 * Adds pagination to a query builder
	 * 
	 * Supports both ID-based and date-based pagination:
	 * - ID-based: Uses since/untilId for cursor pagination
	 * - Date-based: Converts since/untilDate to IDs using IdService
	 * 
	 * Ordering Logic:
	 * - ASC when only sinceId/sinceDate (newer items)
	 * - DESC when untilId/untilDate or both (older items)
	 * 
	 * @param q - Query builder to modify
	 * @param sinceId - Return items after this ID (exclusive)
	 * @param untilId - Return items before this ID (exclusive)  
	 * @param sinceDate - Return items after this timestamp
	 * @param untilDate - Return items before this timestamp
	 * @param targetColumn - Column to paginate on (default: 'id')
	 * @returns Modified query builder for chaining
	 */
	public makePaginationQuery<T extends ObjectLiteral>(
		q: SelectQueryBuilder<T>,
		sinceId?: string | null,
		untilId?: string | null,
		sinceDate?: number | null,
		untilDate?: number | null,
		targetColumn = 'id',
	): SelectQueryBuilder<T> {
		const column = `${q.alias}.${targetColumn}`;
		
		// Convert dates to IDs if provided
		const effectiveSinceId = sinceDate ? this.idService.gen(sinceDate) : sinceId;
		const effectiveUntilId = untilDate ? this.idService.gen(untilDate) : untilId;
		
		this.applyPaginationRange(q, column, effectiveSinceId, effectiveUntilId);
		
		return q;
	}

	/**
	 * Helper method to exclude users from note queries based on a subquery
	 * Applies to note author, reply author, and renote author
	 */
	private excludeUsersFromNote(
		q: SelectQueryBuilder<any>,
		noteColumn: string,
		subquery: SelectQueryBuilder<any>,
		userFields: string[] = ['userId', 'replyUserId', 'renoteUserId'],
	): void {
		for (const field of userFields) {
			q.andWhere(new Brackets(qb => {
				qb
					.where(`${noteColumn}.${field} IS NULL`)
					.orWhere(`${noteColumn}.${field} NOT IN (${subquery.getQuery()})`);
			}));
		}
		q.setParameters(subquery.getParameters());
	}

	/**
	 * Generates base filtering for all timeline queries
	 * 
	 * Applies common filters for:
	 * - Blocked/suspended hosts
	 * - Suspended users  
	 * - Muted users and instances
	 * - Blocked users
	 * 
	 * @remarks
	 * IMPORTANT: This query generation must stay synchronized with FanoutTimelineEndpointService.
	 * Changes here may also require updates to:
	 * - FanoutTimelineEndpointService filtering logic
	 * - packages/backend/src/server/api/endpoints/clips/notes.ts
	 * 
	 * @param query - Query builder to modify
	 * @param me - Current user (null for anonymous)
	 * @param options - Filter options
	 */
	@bindThis
	public generateBaseNoteFilteringQuery(
		query: SelectQueryBuilder<any>,
		me: { id: MiUser['id'] } | null,
		{
			excludeUserFromMute,
			excludeAuthor,
		}: {
			excludeUserFromMute?: MiUser['id'],
			excludeAuthor?: boolean,
		} = {},
	): void {
		// Apply instance-level filters
		this.generateBlockedHostQueryForNote(query, excludeAuthor);
		this.generateSuspendedUserQueryForNote(query, excludeAuthor);
		
		// Apply user-level filters if authenticated
		if (me) {
			// Filter main note
			this.generateMutedUserQueryForNotes(query, me, { excludeUserFromMute });
			this.generateBlockedUserQueryForNotes(query, me);
			
			// Filter renotes (applies same filters to renoted content)
			this.generateMutedUserQueryForNotes(query, me, { noteColumn: 'renote', excludeUserFromMute });
			this.generateBlockedUserQueryForNotes(query, me, { noteColumn: 'renote' });
		}
	}

	/**
	 * Filters notes from users who have blocked the current user
	 * 
	 * Excludes notes where:
	 * - Note author has blocked me
	 * - Reply author has blocked me
	 * - Renote author has blocked me
	 */
	@bindThis
	public generateBlockedUserQueryForNotes(
		q: SelectQueryBuilder<any>,
		me: { id: MiUser['id'] },
		{
			noteColumn = 'note',
		}: {
			noteColumn?: string,
		} = {},
	): void {
		const blockingQuery = this.blockingsRepository.createQueryBuilder('blocking')
			.select('blocking.blockerId')
			.where('blocking.blockeeId = :blockeeId', { blockeeId: me.id });

		this.excludeUsersFromNote(q, noteColumn, blockingQuery);
	}

	@bindThis
	public generateBlockQueryForUsers(q: SelectQueryBuilder<any>, me: { id: MiUser['id'] }): void {
		const blockingQuery = this.blockingsRepository.createQueryBuilder('blocking')
			.select('blocking.blockeeId')
			.where('blocking.blockerId = :blockerId', { blockerId: me.id });

		const blockedQuery = this.blockingsRepository.createQueryBuilder('blocking')
			.select('blocking.blockerId')
			.where('blocking.blockeeId = :blockeeId', { blockeeId: me.id });

		q.andWhere(`user.id NOT IN (${ blockingQuery.getQuery() })`);
		q.setParameters(blockingQuery.getParameters());

		q.andWhere(`user.id NOT IN (${ blockedQuery.getQuery() })`);
		q.setParameters(blockedQuery.getParameters());
	}

	@bindThis
	public generateMutedNoteThreadQuery(q: SelectQueryBuilder<any>, me: { id: MiUser['id'] }): void {
		const mutedQuery = this.noteThreadMutingsRepository.createQueryBuilder('threadMuted')
			.select('threadMuted.threadId')
			.where('threadMuted.userId = :userId', { userId: me.id });

		q.andWhere(`note.id NOT IN (${ mutedQuery.getQuery() })`);
		q.andWhere(new Brackets(qb => {
			qb
				.where('note.threadId IS NULL')
				.orWhere(`note.threadId NOT IN (${ mutedQuery.getQuery() })`);
		}));

		q.setParameters(mutedQuery.getParameters());
	}

	/**
	 * Filters notes from muted users and instances
	 * 
	 * Excludes notes where:
	 * - Note/reply/renote author is muted by me
	 * - Note/reply/renote author's instance is muted by me
	 * 
	 * @param q - Query builder to modify
	 * @param me - Current user
	 * @param options - Mute filter options
	 */
	@bindThis
	public generateMutedUserQueryForNotes(
		q: SelectQueryBuilder<any>,
		me: { id: MiUser['id'] },
		{
			excludeUserFromMute,
			noteColumn = 'note',
		}: {
			excludeUserFromMute?: MiUser['id'],
			noteColumn?: string,
		} = {},
	): void {
		// Query for muted users
		const mutingQuery = this.mutingsRepository.createQueryBuilder('muting')
			.select('muting.muteeId')
			.where('muting.muterId = :muterId', { muterId: me.id });

		if (excludeUserFromMute) {
			mutingQuery.andWhere('muting.muteeId != :excludeId', { excludeId: excludeUserFromMute });
		}

		// Query for muted instances
		const mutingInstanceQuery = this.userProfilesRepository.createQueryBuilder('user_profile')
			.select('user_profile.mutedInstances')
			.where('user_profile.userId = :muterId', { muterId: me.id });

		// Exclude muted users from note/reply/renote
		this.excludeUsersFromNote(q, noteColumn, mutingQuery);

		// Exclude muted instances from note/reply/renote
		const hostFields = ['userHost', 'replyUserHost', 'renoteUserHost'];
		for (const field of hostFields) {
			q.andWhere(new Brackets(qb => {
				qb
					.where(`${noteColumn}.${field} IS NULL`)
					.orWhere(`NOT ((${mutingInstanceQuery.getQuery()})::jsonb ? ${noteColumn}.${field})`);
			}));
		}

		q.setParameters(mutingInstanceQuery.getParameters());
	}

	@bindThis
	public generateMutedUserQueryForUsers(q: SelectQueryBuilder<any>, me: { id: MiUser['id'] }): void {
		const mutingQuery = this.mutingsRepository.createQueryBuilder('muting')
			.select('muting.muteeId')
			.where('muting.muterId = :muterId', { muterId: me.id });

		q.andWhere(`user.id NOT IN (${ mutingQuery.getQuery() })`);

		q.setParameters(mutingQuery.getParameters());
	}

	@bindThis
	public generateVisibilityQuery(q: SelectQueryBuilder<any>, me?: { id: MiUser['id'] } | null): void {
		// This code must always be synchronized with the checks in Notes.isVisibleForMe.
		if (me == null) {
			q.andWhere(new Brackets(qb => {
				qb
					.where('note.visibility = \'public\'')
					.orWhere('note.visibility = \'home\'');
			}));
		} else {
			const followingQuery = this.followingsRepository.createQueryBuilder('following')
				.select('following.followeeId')
				.where('following.followerId = :meId');

			q.andWhere(new Brackets(qb => {
				qb
				// 公開投稿である
					.where(new Brackets(qb => {
						qb
							.where('note.visibility = \'public\'')
							.orWhere('note.visibility = \'home\'');
					}))
				// または 自分自身
					.orWhere('note.userId = :meId')
				// または 自分宛て
					.orWhere(':meIdAsList <@ note.visibleUserIds')
					.orWhere(':meIdAsList <@ note.mentions')
					.orWhere(new Brackets(qb => {
						qb
						// または フォロワー宛ての投稿であり、
							.where('note.visibility = \'followers\'')
							.andWhere(new Brackets(qb => {
								qb
								// 自分がフォロワーである
									.where(`note.userId IN (${ followingQuery.getQuery() })`)
								// または 自分の投稿へのリプライ
									.orWhere('note.replyUserId = :meId');
							}));
					}));
			}));

			q.setParameters({ meId: me.id, meIdAsList: [me.id] });
		}
	}

	@bindThis
	public generateMutedUserRenotesQueryForNotes(q: SelectQueryBuilder<any>, me: { id: MiUser['id'] }): void {
		const mutingQuery = this.renoteMutingsRepository.createQueryBuilder('renote_muting')
			.select('renote_muting.muteeId')
			.where('renote_muting.muterId = :muterId', { muterId: me.id });

		q.andWhere(new Brackets(qb => {
			qb
				.where(new Brackets(qb => {
					qb.where('note.renoteId IS NOT NULL');
					qb.andWhere('note.text IS NULL');
					qb.andWhere(`note.userId NOT IN (${ mutingQuery.getQuery() })`);
				}))
				.orWhere('note.renoteId IS NULL')
				.orWhere('note.text IS NOT NULL');
		}));

		q.setParameters(mutingQuery.getParameters());
	}

	@bindThis
	public generateBlockedHostQueryForNote(q: SelectQueryBuilder<any>, excludeAuthor?: boolean): void {
		let nonBlockedHostQuery: (part: string) => string;
		if (this.meta.blockedHosts.length === 0) {
			nonBlockedHostQuery = () => '1=1';
		} else {
			nonBlockedHostQuery = (match: string) => `${match} NOT ILIKE ALL(ARRAY[:...blocked])`;
			q.setParameters({ blocked: this.meta.blockedHosts.flatMap(x => [x, `%.${x}`]) });
		}

		if (excludeAuthor) {
			const instanceSuspension = (user: string) => new Brackets(qb => qb
				.where(`note.${user}Id IS NULL`) // no corresponding user
				.orWhere(`note.userId = note.${user}Id`)
				.orWhere(`note.${user}Host IS NULL`) // local
				.orWhere(nonBlockedHostQuery(`note.${user}Host`)));

			q
				.andWhere(instanceSuspension('replyUser'))
				.andWhere(instanceSuspension('renoteUser'));
		} else {
			const instanceSuspension = (user: string) => new Brackets(qb => qb
				.where(`note.${user}Id IS NULL`) // no corresponding user
				.orWhere(`note.${user}Host IS NULL`) // local
				.orWhere(nonBlockedHostQuery(`note.${user}Host`)));

			q
				.andWhere(instanceSuspension('user'))
				.andWhere(instanceSuspension('replyUser'))
				.andWhere(instanceSuspension('renoteUser'));
		}
	}

	// Requirements: user replyUser renoteUser must be joined
	@bindThis
	public generateSuspendedUserQueryForNote(q: SelectQueryBuilder<any>, excludeAuthor?: boolean): void {
		if (excludeAuthor) {
			const brakets = (user: string) => new Brackets(qb => qb
				.where(`${user}.id IS NULL`) // そもそもreplyやrenoteではない、もしくはleftjoinなどでuserが存在しなかった場合を考慮
				.orWhere(`user.id = ${user}.id`)
				.orWhere(`${user}.isSuspended = FALSE`));
			q
				.andWhere(brakets('replyUser'))
				.andWhere(brakets('renoteUser'));
		} else {
			const brakets = (user: string) => new Brackets(qb => qb
				.where(`${user}.id IS NULL`) // そもそもreplyやrenoteではない、もしくはleftjoinなどでuserが存在しなかった場合を考慮
				.orWhere(`${user}.isSuspended = FALSE`));
			q
				.andWhere('user.isSuspended = FALSE')
				.andWhere(brakets('replyUser'))
				.andWhere(brakets('renoteUser'));
		}
	}
}
