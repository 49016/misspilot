/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'pass';
const TEST_USER = 'alice';
const TEST_PASSWORD = 'alice1234';
const SETUP_WIZARD_TIMEOUT = 30000;
const WAIT_AFTER_WIZARD_CLOSE = 500;
const REDIRECT_TEST_ROUTE = '/redirect-test';

describe('Router transition', () => {
	describe('Redirect', () => {
		// サーバの初期化。ルートのテストに関しては各describeごとに1度だけ実行で十分だと思う（使いまわした方が早い）
		before(() => {
			cy.resetState();
			cy.registerUser(ADMIN_USERNAME, ADMIN_PASSWORD, true);
			cy.registerUser(TEST_USER, TEST_PASSWORD);
			cy.login(TEST_USER, TEST_PASSWORD);

			// アカウント初期設定ウィザード
			// 表示に時間がかかるのでデフォルト秒数だとタイムアウトする
			cy.get('[data-cy-user-setup] [data-cy-modal-window-close]', { timeout: SETUP_WIZARD_TIMEOUT }).click();
			cy.wait(WAIT_AFTER_WIZARD_CLOSE);
			cy.get('[data-cy-modal-dialog-ok]').click();
		});

		it('redirect to user profile', () => {
			// テストのためだけに用意されたリダイレクト用ルートに飛ぶ
			cy.visit(REDIRECT_TEST_ROUTE);

			// プロフィールページのURLであることを確認する
			cy.url().should('include', `/@${TEST_USER}`);
		});
	});
});
