/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Type representing any valid JSON value
 */
export type JsonValue = JsonArray | JsonObject | string | number | boolean | null;

/**
 * Type representing a JSON object with string keys
 */
export type JsonObject = { [K in string]?: JsonValue };

/**
 * Type representing a JSON array
 */
export type JsonArray = JsonValue[];

/**
 * Type guard to check if a value is a JSON object
 * @param value - Value to check
 * @returns true if value is a non-null, non-array object
 */
export function isJsonObject(value: JsonValue | undefined): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
