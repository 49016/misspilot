/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from '@/models/User.js';

/**
 * Check if a note is a reply to another user's note
 * @param note - Note to check
 * @param viewerId - ID of the viewing user (optional)
 * @returns true if note is a reply to a different user (not self-reply or reply to viewer)
 */
export function isReply(note: any, viewerId?: MiUser['id'] | undefined | null): boolean {
	return Boolean(note.replyId) && 
		note.replyUserId !== note.userId && 
		note.replyUserId !== viewerId;
}
