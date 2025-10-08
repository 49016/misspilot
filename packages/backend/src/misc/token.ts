/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { secureRndstr } from '@/misc/secure-rndstr.js';

const NATIVE_TOKEN_LENGTH = 16;

/**
 * Generate a secure random token for native users
 * @returns Random token string
 */
export const generateNativeUserToken = (): string => secureRndstr(NATIVE_TOKEN_LENGTH);

/**
 * Check if a token is a valid native user token
 * @param token - Token to validate
 * @returns true if token has correct length
 */
export const isNativeUserToken = (token: string): boolean => token.length === NATIVE_TOKEN_LENGTH;
