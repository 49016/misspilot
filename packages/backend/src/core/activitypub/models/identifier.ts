/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * ActivityPub Identifier interface
 * Represents a property value pair identifier
 */
export type IIdentifier = {
	/** Type of identifier (e.g., 'PropertyValue') */
	type: string;
	/** Name/label of the identifier */
	name: string;
	/** Value of the identifier */
	value: string;
};
