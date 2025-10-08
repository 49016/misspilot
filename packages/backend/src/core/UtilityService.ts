/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { URL, domainToASCII } from 'node:url';
import { Inject, Injectable } from '@nestjs/common';
import RE2 from 're2';
import semver from 'semver';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { bindThis } from '@/decorators.js';
import { MiMeta, SoftwareSuspension } from '@/models/Meta.js';
import { MiInstance } from '@/models/Instance.js';

@Injectable()
export class UtilityService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,
	) {
	}

	@bindThis
	public getFullApAccount(username: string, host: string | null): string {
		return host ? `${username}@${this.toPuny(host)}` : `${username}@${this.toPuny(this.config.host)}`;
	}

	@bindThis
	public isSelfHost(host: string | null): boolean {
		if (host == null) return true;
		return this.toPuny(this.config.host) === this.toPuny(host);
	}

	@bindThis
	public isUriLocal(uri: string): boolean {
		return this.punyHost(uri) === this.toPuny(this.config.host);
	}

	/**
	 * Validate email address format
	 * Based on HTML5 specification: https://html.spec.whatwg.org/multipage/input.html#valid-e-mail-address
	 * @param email Email address to validate
	 * @returns true if email format is valid, false otherwise
	 */
	@bindThis
	public validateEmailFormat(email: string): boolean {
		if (!email || email.trim().length === 0) return false;
		
		const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
		return EMAIL_REGEX.test(email.trim());
	}

	@bindThis
	public isBlockedHost(blockedHosts: string[], host: string | null): boolean {
		if (host == null) return false;
		return blockedHosts.some(x => `.${host.toLowerCase()}`.endsWith(`.${x}`));
	}

	@bindThis
	public isSilencedHost(silencedHosts: string[] | undefined, host: string | null): boolean {
		if (!silencedHosts || host == null) return false;
		return silencedHosts.some(x => `.${host.toLowerCase()}`.endsWith(`.${x}`));
	}

	@bindThis
	public isMediaSilencedHost(silencedHosts: string[] | undefined, host: string | null): boolean {
		if (!silencedHosts || host == null) return false;
		return silencedHosts.some(x => host.toLowerCase() === x);
	}

	/**
	 * Concatenate note contents for keyword checking
	 * CW and text are concatenated without separator since they might be continuations of each other
	 * @param content Note content components
	 * @returns Combined string for keyword matching
	 */
	@bindThis
	public concatNoteContentsForKeyWordCheck(content: {
		cw?: string | null;
		text?: string | null;
		pollChoices?: string[] | null;
		others?: string[] | null;
	}): string {
		const cwText = content.cw ?? '';
		const mainText = content.text ?? '';
		const pollText = (content.pollChoices ?? []).join('\n');
		const otherText = (content.others ?? []).join('\n');
		
		return `${cwText}${mainText}\n${pollText}\n${otherText}`;
	}

	/**
	 * Check if text contains any of the specified keywords
	 * Supports both plain text matching and regex patterns
	 * @param text Text to search within
	 * @param keyWords Array of keywords or regex patterns (format: /pattern/flags)
	 * @returns true if any keyword matches, false otherwise
	 */
	@bindThis
	public isKeyWordIncluded(text: string, keyWords: string[]): boolean {
		if (keyWords.length === 0 || text === '') return false;

		const REGEX_PATTERN = /^\/(.+)\/(.*)$/;

		return keyWords.some(filter => {
			const regexMatch = filter.match(REGEX_PATTERN);
			
			if (!regexMatch) {
				// Plain text matching: all words must be present
				const words = filter.split(' ').filter(w => w.length > 0);
				return words.every(keyword => text.includes(keyword));
			}
			
			try {
				// Regex matching
				// TODO: Cache RE2 instances for better performance
				const pattern = regexMatch[1];
				const flags = regexMatch[2];
				return new RE2(pattern, flags).test(text);
			} catch (err) {
				// Invalid regex - log error and continue
				console.error(`Invalid regex pattern: ${filter}`, err);
				return false;
			}
		});
	}

	@bindThis
	public extractDbHost(uri: string): string {
		const url = new URL(uri);
		return this.toPuny(url.host);
	}

	@bindThis
	public toPuny(host: string): string {
		return domainToASCII(host.toLowerCase());
	}

	@bindThis
	public toPunyNullable(host: string | null | undefined): string | null {
		if (host == null) return null;
		return domainToASCII(host.toLowerCase());
	}

	@bindThis
	public punyHost(url: string): string {
		const urlObj = new URL(url);
		const host = `${this.toPuny(urlObj.hostname)}${urlObj.port.length > 0 ? ':' + urlObj.port : ''}`;
		return host;
	}

	@bindThis
	public isFederationAllowedHost(host: string): boolean {
		if (this.meta.federation === 'none') return false;
		if (this.meta.federation === 'specified' && !this.meta.federationHosts.some(x => `.${host.toLowerCase()}`.endsWith(`.${x}`))) return false;
		if (this.isBlockedHost(this.meta.blockedHosts, host)) return false;

		return true;
	}

	@bindThis
	public isFederationAllowedUri(uri: string): boolean {
		const host = this.extractDbHost(uri);
		return this.isFederationAllowedHost(host);
	}

	@bindThis
	public isDeliverSuspendedSoftware(software: Pick<MiInstance, 'softwareName' | 'softwareVersion'>): SoftwareSuspension | undefined {
		if (software.softwareName == null) return undefined;
		if (software.softwareVersion == null) {
			// software version is null; suspend iff versionRange is *
			return this.meta.deliverSuspendedSoftware.find(x =>
				x.software === software.softwareName
				&& x.versionRange.trim() === '*');
		} else {
			const softwareVersion = software.softwareVersion;
			return this.meta.deliverSuspendedSoftware.find(x =>
				x.software === software.softwareName
				&& semver.satisfies(softwareVersion, x.versionRange, { includePrerelease: true }));
		}
	}
}
