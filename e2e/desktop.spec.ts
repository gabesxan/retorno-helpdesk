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

test('Fluxo completo desktop: abertura, XSS persistente, IA com fontes e sem docs, nota interna isolada, falha 503 e admin', async ({
  page,
}) => {
  // 1. Tela de login e verificação de foco por teclado
  await page.goto('/login');
  await assertNoHorizontalOverflow(page);
  await page.keyboard.press('Tab');
  const focusedOutline = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return '';
    return window.getComputedStyle(el).outlineStyle;
  });
  expect(focusedOutline).not.toBe('none');
  await page.screenshot({ path: join(EVIDENCES_DIR, '01-login.png'), fullPage: true });

  // 2. Login como Solicitante, abertura de chamado com texto longo + payload XSS persistente
  await loginThroughUi(page, 'compras@mercadobompreco.local', 'Cliente!Dev2026');
  await expect(page.getByRole('link', { name: /Base de conhecimento/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Usuários/i })).toHaveCount(0);

  // Nenhum token de sessão em localStorage
  const localStorageLen = await page.evaluate(() => window.localStorage.length);
  expect(localStorageLen).toBe(0);

  await page.getByRole('button', { name: /Novo chamado/i }).click();
  const longToken = 'ERR_PDV_CAIXA_05_SINCRONIZACAO_LONGA_SEM_ESPACOS_1234567890ABCDEF';
  await page
    .getByLabel('Assunto do chamado')
    .fill(`Impressora USB travada com código ${longToken}`);
  await page
    .getByLabel('Descrição do ocorrido')
    .fill(
      `A impressora do caixa 05 deixou de imprimir (${longToken}). <img src=x onerror="window.__xssTriggered=true"> [link malicioso](javascript:window.__xssTriggered=true)`,
    );
  await page.getByRole('button', { name: 'Registrar chamado' }).click();

  await expect(page.getByRole('heading', { name: new RegExp(longToken) })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  const xssExecutedRequester = await page.evaluate(
    () => (window as unknown as { __xssTriggered?: boolean }).__xssTriggered,
  );
  expect(xssExecutedRequester).toBeUndefined();

  // Solicitante não vê nota interna em RET-0001 nem na UI nem na API
  await page.getByRole('listitem').filter({ hasText: 'RET-0001' }).click();
  await expect(page.getByText(/Impressora do caixa 02 deixou de funcionar/i)).toBeVisible();
  await expect(page.getByText('NOTA INTERNA — EQUIPE')).toHaveCount(0);

  const ret1Url = page.url();
  const ret1Id = ret1Url.split('/').pop()!;
  const apiDetail = await page.evaluate(async (id) => {
    const r = await fetch(`/api/tickets/${id}`, { credentials: 'include' });
    return r.json();
  }, ret1Id);
  expect(
    apiDetail.ticket.messages.every((m: { visibility: string }) => m.visibility === 'PUBLIC'),
  ).toBe(true);

  await page.getByRole('button', { name: 'Sair da sessão' }).click();
  await expect(page).toHaveURL(/\/login/);

  // 3. Login como Atendente
  await loginThroughUi(page, 'lucas.almeida@retorno.local', 'Retorno!Dev2026');
  await expect(page.getByRole('link', { name: /Base de conhecimento/i })).toBeVisible();
  await page.getByRole('listitem').filter({ hasText: 'RET-0001' }).click();
  await expect(page.getByText('NOTA INTERNA — EQUIPE')).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: join(EVIDENCES_DIR, '02-fila-desktop.png') });

  // 4. Painel recolhível Contexto & IA: sugestão + fontes + nota interna + rascunho persistente
  await page.getByRole('button', { name: /Contexto & IA/i }).click();
  await page.getByRole('button', { name: 'Sugerir classificação' }).click();
  await expect(page.getByText(/Simulação local identificada/i)).toBeVisible();

  await page.getByRole('button', { name: 'Preparar resposta' }).click();
  await expect(page.getByText('Fontes da base consultadas')).toBeVisible();
  await page.screenshot({ path: join(EVIDENCES_DIR, '03-chamado-nota-interna-ia.png') });

  // Consultar artigo fonte via modal
  await page.getByRole('button', { name: 'Consultar artigo fonte' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Fechar' }).click();

  // Registrar nota interna distinta
  await page.getByRole('tab', { name: /Nota interna/i }).click();
  await page
    .getByPlaceholder(/visível apenas para a equipe/i)
    .fill('Nota interna E2E: porta COM6 confirmada com o suporte.');
  await page.getByRole('button', { name: 'Registrar nota interna' }).click();
  await expect(
    page.getByText('Nota interna E2E: porta COM6 confirmada com o suporte.'),
  ).toBeVisible();

  // Rascunho preservado após reload
  await page.getByRole('tab', { name: 'Resposta pública' }).click();
  const replyBox = page.getByPlaceholder(/Escreva a resposta para o chamado/i);
  await replyBox.fill('Rascunho antes de recarregar o navegador.');
  await page.reload();
  await expect(page.getByPlaceholder(/Escreva a resposta para o chamado/i)).toHaveValue(
    'Rascunho antes de recarregar o navegador.',
  );

  // Simular falha 503 da IA e provar que atendimento manual segue funcionando
  await page.route('**/api/tickets/*/ai/draft-reply', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'AI_UNAVAILABLE', message: 'Serviço de IA indisponível no momento.' },
      }),
    }),
  );
  await page.getByRole('button', { name: /Contexto & IA/i }).click();
  await page.getByRole('button', { name: 'Preparar resposta' }).click();
  await expect(page.getByText(/Serviço de IA indisponível no momento/i)).toBeVisible();
  await page.unroute('**/api/tickets/*/ai/draft-reply');

  // Envia resposta pública manualmente apesar do erro anterior da IA
  await page
    .getByPlaceholder(/Escreva a resposta para o chamado/i)
    .fill('Resposta pública E2E enviada manualmente após validação da porta COM6.');
  await page.getByRole('button', { name: 'Enviar resposta pública' }).click();
  await expect(
    page.getByText('Resposta pública E2E enviada manualmente após validação da porta COM6.'),
  ).toBeVisible();

  // 5. Chamado sem documentação na base (RET-0018)
  await page.getByRole('searchbox').fill('RET-0018');
  await page.getByRole('listitem').filter({ hasText: 'RET-0018' }).click();
  await expect(page.getByRole('heading', { name: /Coletor RFID Zebra RFD40/i })).toBeVisible();
  await page.getByRole('button', { name: 'Preparar resposta' }).click();
  await expect(page.getByText(/Documentação insuficiente:/i)).toBeVisible();
  await expect(page.getByText(/Pergunta sugerida ao cliente:/i)).toBeVisible();
  await page.screenshot({ path: join(EVIDENCES_DIR, '04-sem-documentacao.png') });

  // 6. Base de conhecimento
  await page.getByRole('link', { name: /Base de conhecimento/i }).click();
  await expect(page.getByRole('heading', { name: 'Base de conhecimento' })).toBeVisible();
  await page.getByPlaceholder(/Buscar por erro/i).fill('TEF');
  await expect(page.getByText(/Pinpad e TEF sem comunicação/i).first()).toBeVisible();
  await page.screenshot({ path: join(EVIDENCES_DIR, '05-base-conhecimento.png') });

  // 7. Verifica como solicitante que a resposta pública chegou, mas a nota interna E2E não
  await page.getByRole('button', { name: 'Sair da sessão' }).click();
  await loginThroughUi(page, 'compras@mercadobompreco.local', 'Cliente!Dev2026');
  await page.getByRole('listitem').filter({ hasText: 'RET-0001' }).click();
  await expect(
    page.getByText('Resposta pública E2E enviada manualmente após validação da porta COM6.'),
  ).toBeVisible();
  await expect(
    page.getByText('Nota interna E2E: porta COM6 confirmada com o suporte.'),
  ).toHaveCount(0);

  // 8. Acesso administrativo à gestão de usuários
  await page.getByRole('button', { name: 'Sair da sessão' }).click();
  await loginThroughUi(page, 'helena.moraes@retorno.local', 'Retorno!Dev2026');
  await page.getByRole('link', { name: /Usuários/i }).click();
  await expect(page.getByRole('heading', { name: 'Usuários e permissões' })).toBeVisible();
  await expect(page.getByText('helena.moraes@retorno.local')).toBeVisible();
});
