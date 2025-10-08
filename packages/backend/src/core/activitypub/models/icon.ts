/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * ActivityPub Icon interface
 * Represents an icon or avatar in ActivityPub
 */
export type IIcon = {
	/** Type of the icon (e.g., 'Image') */
	type: string;
	/** MIME type of the icon media */
	mediaType?: string;
	/** URL to the icon resource */
	url?: string;
};
