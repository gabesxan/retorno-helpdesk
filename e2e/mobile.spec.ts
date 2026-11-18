import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const EVIDENCES_DIR = join(process.cwd(), 'docs', 'evidencias');

async function assertNoHorizontalOverflow(page: Page) {
  const dims = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(dims.scrollWidth).toBeLessThanOrEqual(dims.innerWidth + 1);
}

async function loginThroughUi(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail de acesso').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar na fila de atendimento' }).click();
  await expect(page).toHaveURL(/\/chamados/);
}

test.beforeAll(() => {
  mkdirSync(EVIDENCES_DIR, { recursive: true });
});

test('Fluxo mobile: lista para detalhe preservando rascunhos e sem overflow horizontal', async ({
  page,
}) => {
  await loginThroughUi(page, 'lucas.almeida@retorno.local', 'Retorno!Dev2026');
  await expect(page.locator('[data-mobile-view="list"]')).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: join(EVIDENCES_DIR, '06-mobile-lista.png') });

  await page.getByRole('listitem').filter({ hasText: 'RET-0001' }).click();
  await expect(page.locator('[data-mobile-view="detail"]')).toBeVisible();
  await assertNoHorizontalOverflow(page);

  const mobileBox = page.getByPlaceholder(/Escreva a resposta para o chamado/i);
  await mobileBox.fill('Rascunho preservado no celular');
  await page.screenshot({ path: join(EVIDENCES_DIR, '07-mobile-detalhe.png') });

  await page.getByRole('button', { name: /Voltar à fila/i }).click();
  await expect(page.locator('[data-mobile-view="list"]')).toBeVisible();

  await page.getByRole('listitem').filter({ hasText: 'RET-0001' }).click();
  await expect(page.getByPlaceholder(/Escreva a resposta para o chamado/i)).toHaveValue(
    'Rascunho preservado no celular',
  );
});
