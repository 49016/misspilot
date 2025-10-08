/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Reference to track if the application is ready
 * Used to coordinate initialization across modules
 */
export const readyRef = { value: false };
