/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const ID_TYPE = 'varchar' as const;
const ID_LENGTH = 32;

/**
 * TypeORM column definition for ID fields
 * @returns Column definition object for varchar ID with length 32
 */
export const id = () => ({
	type: ID_TYPE,
	length: ID_LENGTH,
});
