/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// test is located in test/extract-mentions

import * as mfm from 'mfm-js';

const MENTION_NODE_TYPE = 'mention';

/**
 * Extract mention properties from MFM nodes
 * @param nodes - Array of MFM nodes to extract mentions from
 * @returns Array of mention properties
 * @todo Remove duplicates
 */
export function extractMentions(nodes: mfm.MfmNode[]): mfm.MfmMention['props'][] {
	const mentionNodes = mfm.extract(nodes, (node) => node.type === MENTION_NODE_TYPE) as mfm.MfmMention[];
	const mentions = mentionNodes.map(node => node.props);

	return mentions;
}
