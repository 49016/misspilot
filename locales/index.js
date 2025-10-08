/**
 * Languages Loader
 */

import * as fs from 'node:fs';
import * as yaml from 'js-yaml';

const BACKSPACE_CODE = 0x08;
const BASE_LOCALE = 'ja-JP';
const FALLBACK_LOCALE = 'en-US';
const SPECIAL_LOCALES = ['ja-KS'];

const LANGUAGES = [
	'ar-SA',
	'ca-ES',
	'cs-CZ',
	'da-DK',
	'de-DE',
	'en-US',
	'es-ES',
	'fr-FR',
	'id-ID',
	'it-IT',
	'ja-JP',
	'ja-KS',
	'kab-KAB',
	'kn-IN',
	'ko-KR',
	'nl-NL',
	'no-NO',
	'pl-PL',
	'pt-PT',
	'ru-RU',
	'sk-SK',
	'th-TH',
	'tr-TR',
	'ug-CN',
	'uk-UA',
	'vi-VN',
	'zh-CN',
	'zh-TW',
];

const PRIMARY_REGIONS = {
	'en': 'US',
	'ja': 'JP',
	'zh': 'CN',
};

function deepMerge(...objects) {
	return objects.reduce((accumulator, current) => ({
		...accumulator,
		...current,
		...Object.entries(accumulator)
			.filter(([key]) => current && typeof current[key] === 'object')
			.reduce((merged, [key, value]) => {
				merged[key] = deepMerge(value, current[key]);
				return merged;
			}, {}),
	}), {});
}

// 何故か文字列にバックスペース文字が混入することがあり、YAMLが壊れるので取り除く
function cleanText(text) {
	const backspaceRegex = new RegExp(String.fromCodePoint(BACKSPACE_CODE), 'g');
	return text.replace(backspaceRegex, '');
}

function loadLocaleFile(language, metaUrl) {
	const fileContent = fs.readFileSync(new URL(`${language}.yml`, metaUrl), 'utf-8');
	return yaml.load(cleanText(fileContent)) || {};
}

function loadAllLocales(metaUrl) {
	return LANGUAGES.reduce((accumulator, language) => {
		accumulator[language] = loadLocaleFile(language, metaUrl);
		return accumulator;
	}, {});
}

// 空文字列が入ることがあり、フォールバックが動作しなくなるのでプロパティごと消す
function removeEmptyStrings(obj) {
	for (const [key, value] of Object.entries(obj)) {
		if (value === '') {
			delete obj[key];
		} else if (typeof value === 'object') {
			removeEmptyStrings(value);
		}
	}
	return obj;
}

function getLanguageCode(locale) {
	return locale.split('-')[0];
}

function getPrimaryLocale(lang) {
	const region = PRIMARY_REGIONS[lang];
	return region ? `${lang}-${region}` : null;
}

function mergeLocale(localeKey, localeData, allLocales) {
	if (localeKey === BASE_LOCALE) {
		return localeData;
	}

	if (localeKey === FALLBACK_LOCALE || SPECIAL_LOCALES.includes(localeKey)) {
		return deepMerge(allLocales[BASE_LOCALE], localeData);
	}

	const lang = getLanguageCode(localeKey);
	const primaryLocale = getPrimaryLocale(lang);
	const primaryData = primaryLocale ? (allLocales[primaryLocale] ?? {}) : {};

	return deepMerge(
		allLocales[BASE_LOCALE],
		allLocales[FALLBACK_LOCALE],
		primaryData,
		localeData,
	);
}

export function build() {
	// vitestの挙動を調整するため、一度ローカル変数化する必要がある
	// https://github.com/vitest-dev/vitest/issues/3988#issuecomment-1686599577
	// https://github.com/misskey-dev/misskey/pull/14057#issuecomment-2192833785
	const metaUrl = import.meta.url;
	const locales = loadAllLocales(metaUrl);
	removeEmptyStrings(locales);

	return Object.entries(locales).reduce((accumulator, [localeKey, localeData]) => {
		accumulator[localeKey] = mergeLocale(localeKey, localeData, locales);
		return accumulator;
	}, {});
}

export default build();
