import { defineConfig } from 'cypress';

const BASE_URL = 'http://localhost:61812';

export default defineConfig({
	e2e: {
		baseUrl: BASE_URL,
	},
});
