/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

'use strict';

(() => {
	const STORAGE_KEY_LOCALE = 'locale';
	const SELECTOR_RELOAD_ELEMENTS = '[data-i18n-reload]';
	const SELECTOR_I18N_ELEMENTS = '[data-i18n]';
	const DEFAULT_RELOAD_TEXT = 'Reload';

	const DEFAULT_MESSAGES = {
		title: 'Failed to initialize Misskey',
		serverError: 'If reloading after a period of time does not resolve the problem, contact the server administrator with the following ERROR ID.',
		solution: 'The following actions may solve the problem.',
		solution1: 'Update your os and browser',
		solution2: 'Disable an adblocker',
		solution3: 'Clear the browser cache',
		solution4: '(Tor Browser) Set dom.webaudio.enabled to true',
		otherOption: 'Other options',
		otherOption1: 'Clear preferences and cache',
		otherOption2: 'Start the simple client',
		otherOption3: 'Start the repair tool',
	};

	function loadLocale() {
		return JSON.parse(localStorage.getItem(STORAGE_KEY_LOCALE) || '{}');
	}

	function getMessages(locale) {
		return Object.assign({}, DEFAULT_MESSAGES, locale?._bootErrors || {});
	}

	function updateReloadElements(text) {
		const reloadElements = document.querySelectorAll(SELECTOR_RELOAD_ELEMENTS);
		for (const el of reloadElements) {
			el.textContent = text;
		}
	}

	function updateI18nElements(messages) {
		const i18nElements = document.querySelectorAll(SELECTOR_I18N_ELEMENTS);
		for (const el of i18nElements) {
			const key = el.dataset.i18n;
			if (key && messages[key]) {
				el.textContent = messages[key];
			}
		}
	}

	function initializeErrorPage() {
		const locale = loadLocale();
		const messages = getMessages(locale);
		const reloadText = locale?.reload || DEFAULT_RELOAD_TEXT;

		updateReloadElements(reloadText);
		updateI18nElements(messages);
	}

	document.addEventListener('DOMContentLoaded', initializeErrorPage);
})();
