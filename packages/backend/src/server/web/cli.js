/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

'use strict';

const ACCOUNT_STORAGE_KEY = 'account';
const API_BASE_PATH = '/api/';
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_NO_CONTENT = 204;
const CONTENT_TYPE_JSON = 'application/json';

function getStoredAccount() {
	return JSON.parse(localStorage.getItem(ACCOUNT_STORAGE_KEY));
}

function isExternalUrl(url) {
	return url.indexOf('://') > -1;
}

function buildApiUrl(endpoint) {
	return isExternalUrl(endpoint) ? endpoint : `${API_BASE_PATH}${endpoint}`;
}

async function fetchApi(endpoint, data, token) {
	const payload = { ...data };
	if (token) {
		payload.i = token;
	}

	const response = await fetch(buildApiUrl(endpoint), {
		headers: {
			'Content-Type': CONTENT_TYPE_JSON,
		},
		method: 'POST',
		body: JSON.stringify(payload),
		credentials: 'omit',
		cache: 'no-cache',
	});

	const body = response.status === HTTP_STATUS_NO_CONTENT ? null : await response.json();

	if (response.status === HTTP_STATUS_OK) {
		return body;
	} else if (response.status === HTTP_STATUS_NO_CONTENT) {
		return;
	} else {
		throw body.error;
	}
}

function createApi(token) {
	return (endpoint, data = {}) => fetchApi(endpoint, data, token);
}

function createNoteElement(note) {
	const el = document.createElement('div');
	
	const name = document.createElement('header');
	name.textContent = `${note.user.name} @${note.user.username}`;
	
	const text = document.createElement('div');
	text.textContent = `${note.text}`;
	
	el.appendChild(name);
	el.appendChild(text);
	
	return el;
}

function renderTimeline(notes, timelineElement) {
	for (const note of notes) {
		const noteElement = createNoteElement(note);
		timelineElement.appendChild(noteElement);
	}
}

async function handleSubmit(api) {
	const textInput = document.getElementById('text');
	await api('notes/create', { text: textInput.value });
	location.reload();
}

async function initTimeline(api) {
	const notes = await api('notes/timeline');
	const timelineElement = document.getElementById('tl');
	renderTimeline(notes, timelineElement);
}

window.onload = async () => {
	const account = getStoredAccount();
	const api = createApi(account.token);

	document.getElementById('submit').addEventListener('click', () => handleSubmit(api));
	
	await initTimeline(api);
};
