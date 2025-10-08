/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: MIT
 */
//@ts-check
(() => {
	const IFRAME_SELECTOR = 'iframe[data-misskey-embed-id]';
	const MESSAGE_TYPE_READY = 'misskey:embed:ready';
	const MESSAGE_TYPE_CHANGE_HEIGHT = 'misskey:embed:changeHeight';
	const MESSAGE_TYPE_REGISTER_ID = 'misskey:embedParent:registerIframeId';

	/** @type {NodeListOf<HTMLIFrameElement>} */
	const iframes = document.querySelectorAll(IFRAME_SELECTOR);

	function sendRegistrationMessage(iframe, iframeId) {
		iframe.contentWindow?.postMessage({
			type: MESSAGE_TYPE_REGISTER_ID,
			payload: {
				iframeId,
			},
		}, '*');
	}

	function updateIframeHeight(iframe, height) {
		iframe.style.height = `${height}px`;
	}

	function handleMessage(event) {
		iframes.forEach((iframe) => {
			if (event.source !== iframe.contentWindow) {
				return;
			}

			const iframeId = iframe.dataset.misskeyEmbedId;

			if (event.data.type === MESSAGE_TYPE_READY) {
				sendRegistrationMessage(iframe, iframeId);
			}

			if (event.data.type === MESSAGE_TYPE_CHANGE_HEIGHT && event.data.iframeId === iframeId) {
				updateIframeHeight(iframe, event.data.payload.height);
			}
		});
	}

	window.addEventListener('message', handleMessage);
})();
