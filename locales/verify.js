import locales from './index.js';

const PARAMETER_REGEXP = /\{[^}]+\}/g;
const ORIGINAL_LOCALE = 'ja-JP';

let valid = true;

function writeError(type, lang, tree, data) {
	const errorData = JSON.stringify({ type, lang, tree, data });
	process.stderr.write(errorData);
	process.stderr.write('\n');
	valid = false;
}

function buildTracePath(trace, key) {
	return trace ? `${trace}.${key}` : key;
}

function extractParameterNames(text) {
	return new Set(text.match(PARAMETER_REGEXP)?.map((s) => s.slice(1, -1)));
}

function verifyStringParameters(expected, actual, lang, tracePath) {
	const expectedParameters = extractParameterNames(expected);
	const actualParameters = extractParameterNames(actual);
	for (const parameter of expectedParameters) {
		if (!actualParameters.has(parameter)) {
			writeError('missing_parameter', lang, tracePath, { parameter });
		}
	}
}

function verifyValue(expected, actual, lang, trace, key) {
	const tracePath = buildTracePath(trace, key);
	
	if (typeof expected === 'object') {
		if (typeof actual !== 'object') {
			writeError('mismatched_type', lang, tracePath, { expected: 'object', actual: typeof actual });
			return;
		}
		verify(expected, actual, lang, tracePath);
	} else if (typeof expected === 'string' && typeof actual === 'string') {
		verifyStringParameters(expected, actual, lang, tracePath);
	} else if (typeof expected === 'string' && typeof actual === 'object') {
		writeError('mismatched_type', lang, tracePath, { expected: 'string', actual: 'object' });
	}
}

function verify(expected, actual, lang, trace) {
	for (const key in expected) {
		if (!Object.prototype.hasOwnProperty.call(actual, key)) {
			continue;
		}
		verifyValue(expected[key], actual[key], lang, trace, key);
	}
}

function verifyAllLocales() {
	const { [ORIGINAL_LOCALE]: original, ...verifiees } = locales;

	for (const lang in verifiees) {
		if (!Object.prototype.hasOwnProperty.call(locales, lang)) {
			continue;
		}
		verify(original, verifiees[lang], lang);
	}
}

verifyAllLocales();

if (!valid) {
	process.exit(1);
}
