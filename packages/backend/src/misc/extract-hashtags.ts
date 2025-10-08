/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as mfm from 'mfm-js';
import { unique } from '@/misc/prelude/array.js';

const HASHTAG_NODE_TYPE = 'hashtag';

/**
 * Extract unique hashtags from MFM nodes
 * @param nodes - Array of MFM nodes to extract hashtags from
 * @returns Array of unique hashtag strings
 */
export function extractHashtags(nodes: mfm.MfmNode[]): string[] {
	const hashtagNodes = mfm.extract(nodes, (node) => node.type === HASHTAG_NODE_TYPE) as mfm.MfmHashtag[];
	const hashtags = unique(hashtagNodes.map(node => node.props.hashtag));

	return hashtags;
}
