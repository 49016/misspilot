/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

'use strict';

const ACCOUNT_STORAGE_KEY = 'account';
const API_BASE_PATH = '/api/';
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_NO_CONTENT = 204;

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

	const response = await window.fetch(buildApiUrl(endpoint), {
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

function createAdder(onAdd) {
	const adder = document.createElement('div');
	adder.classList.add('adder');
	
	const keyInput = document.createElement('input');
	const valueTextarea = document.createElement('textarea');
	const addButton = document.createElement('button');
	addButton.textContent = 'add';
	addButton.addEventListener('click', () => onAdd(keyInput.value, valueTextarea.value));

	adder.appendChild(keyInput);
	adder.appendChild(valueTextarea);
	adder.appendChild(addButton);
	
	return adder;
}

function createStorageRecord(key) {
	const record = document.createElement('div');
	record.classList.add('record');
	
	const header = document.createElement('header');
	header.textContent = key;
	
	const textarea = document.createElement('textarea');
	textarea.textContent = localStorage.getItem(key);
	
	const saveButton = document.createElement('button');
	saveButton.textContent = 'save';
	saveButton.addEventListener('click', () => {
		localStorage.setItem(key, textarea.value);
		location.reload();
	});
	
	const removeButton = document.createElement('button');
	removeButton.textContent = 'remove';
	removeButton.addEventListener('click', () => {
		localStorage.removeItem(key);
		location.reload();
	});
	
	record.appendChild(header);
	record.appendChild(textarea);
	record.appendChild(saveButton);
	record.appendChild(removeButton);
	
	return record;
}

function createLocalStorageEditor() {
	const lsEditor = document.createElement('div');
	lsEditor.id = 'lsEditor';

	const adder = createAdder((key, value) => {
		localStorage.setItem(key, value);
		location.reload();
	});
	lsEditor.appendChild(adder);

	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		const record = createStorageRecord(key);
		lsEditor.appendChild(record);
	}

	return lsEditor;
}

window.onload = async () => {
	const account = getStoredAccount();
	const api = createApi(account.token);

	const content = document.getElementById('content');

	document.getElementById('ls').addEventListener('click', () => {
		content.innerHTML = '';
		const lsEditor = createLocalStorageEditor();
		content.appendChild(lsEditor);
	});
};
