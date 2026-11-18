import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MessageKind,
  MessageVisibility,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  UserRole,
} from '@prisma/client';
import { createPrismaClient } from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/password.js';

function loadRootEnv(): void {
  const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const raw = readFileSync(file, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
    break;
  }
}

loadRootEnv();

function assertSafeIsolatedDatabase(): string {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed bloqueado em produção (NODE_ENV=production).');
  }
  if (process.env.SEED_CONFIRM_ISOLATED_DB !== 'true') {
    throw new Error(
      'Seed exige SEED_CONFIRM_ISOLATED_DB=true para confirmar banco isolado de desenvolvimento.',
    );
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL não definida.');
  }
  const parsed = new URL(url);
  const dbName = parsed.pathname.replace(/^\//, '');
  if (!dbName.startsWith('retorno_')) {
    throw new Error(
      `Seed abortado: nome do banco "${dbName}" não segue o prefixo isolado "retorno_".`,
    );
  }
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
    throw new Error(`Seed abortado: host "${parsed.hostname}" não é local isolado.`);
  }
  return dbName;
}

const minutesAgo = (minutes: number): Date => new Date(Date.now() - minutes * 60_000);
const hoursAgo = (hours: number): Date => new Date(Date.now() - hours * 3_600_000);

async function runSeed(): Promise<void> {
  const dbName = assertSafeIsolatedDatabase();
  const prisma = createPrismaClient(process.env.DATABASE_URL);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.ticketDraft.deleteMany();
      await tx.ticketMessage.deleteMany();
      await tx.ticket.deleteMany();
      await tx.ticketSequence.deleteMany();
      await tx.knowledgeArticle.deleteMany();
      await tx.session.deleteMany();
      await tx.user.deleteMany();
    });

    const staffPasswordHash = await hashPassword('Retorno!Dev2026');
    const requesterPasswordHash = await hashPassword('Cliente!Dev2026');

    const helena = await prisma.user.create({
      data: {
        name: 'Helena Moraes',
        email: 'helena.moraes@retorno.local',
        passwordHash: staffPasswordHash,
        role: UserRole.ADMIN,
        companyName: 'Equipe Retorno',
        isActive: true,
      },
    });

    const lucas = await prisma.user.create({
      data: {
        name: 'Lucas Almeida',
        email: 'lucas.almeida@retorno.local',
        passwordHash: staffPasswordHash,
        role: UserRole.AGENT,
        companyName: 'Equipe Retorno',
        isActive: true,
      },
    });

    const bianca = await prisma.user.create({
      data: {
        name: 'Bianca Souza',
        email: 'bianca.souza@retorno.local',
        passwordHash: staffPasswordHash,
        role: UserRole.AGENT,
        companyName: 'Equipe Retorno',
        isActive: true,
      },
    });

    const rafael = await prisma.user.create({
      data: {
        name: 'Rafael Costa',
        email: 'compras@mercadobompreco.local',
        passwordHash: requesterPasswordHash,
        role: UserRole.REQUESTER,
        companyName: 'Mercado Bom Preço',
        isActive: true,
      },
    });

    const patricia = await prisma.user.create({
      data: {
        name: 'Patrícia Lima',
        email: 'gerencia@farmaciacentral.local',
        passwordHash: requesterPasswordHash,
        role: UserRole.REQUESTER,
        companyName: 'Farmácia Central',
        isActive: true,
      },
    });

    const marcos = await prisma.user.create({
      data: {
        name: 'Marcos Teixeira',
        email: 'caixa@padariaaurora.local',
        passwordHash: requesterPasswordHash,
        role: UserRole.REQUESTER,
        companyName: 'Padaria Aurora',
        isActive: true,
      },
    });

    await prisma.user.create({
      data: {
        name: 'Carlos Inativo',
        email: 'desativado@lojateste.local',
        passwordHash: requesterPasswordHash,
        role: UserRole.REQUESTER,
        companyName: 'Loja Desativada',
        isActive: false,
      },
    });

    await prisma.knowledgeArticle.createMany({
      data: [
        {
          slug: 'impressora-nao-fiscal-usb-spooler',
          title: 'Impressora térmica do caixa não imprime após troca de USB ou queda de energia',
          category: TicketCategory.PRINTER_HARDWARE,
          summary:
            'Passos para destravar fila de spooler, conferir porta COM/USB virtual e testar comunicação com impressora de cupom Epson, Elgin ou Bematech.',
          tags: 'impressora, caixa, cupom, usb, spooler, epson, elgin, bematech',
          authorId: helena.id,
          isPublished: true,
          bodyMarkdown: [
            '## Diagnóstico inicial da impressora no PDV',
            '',
            'Quando a impressora do caixa deixa de responder de forma repentina, quase sempre o problema está na porta USB alterada pelo Windows ou na fila de impressão travada.',
            '',
            '### 1. Conferir alimentação e autoteste físico',
            '- Desligue a impressora no botão traseiro, aguarde 10 segundos e religue segurando **FEED** por 3 segundos para imprimir a folha de autoteste.',
            '- Se o autoteste não sair, verifique a fonte 24V e o encaixe da bobina térmica.',
            '',
            '### 2. Limpar fila e validar porta no gerenciador',
            '1. Abra **Dispositivos e Impressoras** e remova documentos presos na fila.',
            '2. Caso o cabo USB tenha sido trocado de entrada traseira, a porta virtual (`COM3`, `COM4` ou `USB001`) pode ter mudado.',
            '3. No **Configurador PDV > Periféricos > Impressora Não Fiscal**, selecione a porta ativa e clique em **Testar Cupom**.',
            '',
            '### 3. Quando acionar manutenção física',
            'Se o LED **ERROR** permanecer vermelho fixo mesmo após troca da bobina e reinício, encaminhe para substituição da cabeça térmica ou cabo lógico.',
          ].join('\n'),
        },
        {
          slug: 'divergencia-estoque-relatorio-fechamento',
          title: 'Divergência entre saldo de estoque na tela e relatório de movimentação',
          category: TicketCategory.INVENTORY_REPORTS,
          summary:
            'Procedimento para identificar cupons em contingência pendentes de sincronização, cancelamentos parciais e reprocessamento do índice de estoque.',
          tags: 'estoque, relatorio, divergencia, saldo, kardex, sincronizacao, contingencia',
          authorId: helena.id,
          isPublished: true,
          bodyMarkdown: [
            '## Causas comuns de diferença entre saldo e relatório',
            '',
            'A diferença entre a consulta rápida de produto e o relatório consolidado costuma ocorrer quando algum caixa ficou offline ou houve estorno sem recálculo do kardex.',
            '',
            '### 1. Verificar fila de sincronização dos caixas',
            '- Acesse **Retaguarda > Monitor de Caixas** e confira se todos os terminais estão com último envio inferior a 5 minutos.',
            '- Vendas emitidas offline reduzem o saldo local do PDV antes de subir para o relatório central.',
            '',
            '### 2. Conferir filtros do relatório',
            '- Valide se o relatório não está filtrando apenas **Depósito Principal** enquanto a venda saiu da loja.',
            '- Verifique notas de devolução ou cancelamento lançadas na mesma data.',
            '',
            '### 3. Recalcular posição consolidada',
            '1. Solicite o código interno do SKU afetado e o período do relatório.',
            '2. Na retaguarda, execute **Utilitários > Reprocessar Saldo Consolidado (Kardex)** para o item específico fora do horário de pico.',
          ].join('\n'),
        },
        {
          slug: 'acesso-bloqueado-troca-computador',
          title: 'Usuário sem acesso após troca de computador ou formatação de terminal',
          category: TicketCategory.ACCESS_TERMINAL,
          summary:
            'Checklist para vincular a nova máquina ao cadastro de terminais autorizados, reinstalar certificado digital A1 e liberar sessão presa.',
          tags: 'acesso, troca, computador, terminal, certificado, estacao, login, bloqueio',
          authorId: helena.id,
          isPublished: true,
          bodyMarkdown: [
            '## Liberação de acesso em computador novo',
            '',
            'Por segurança comercial, o módulo de frente de caixa e a retaguarda validam o identificador da máquina autorizada e o certificado instalado.',
            '',
            '### 1. Liberar estação antiga e cadastrar novo terminal',
            '1. Entre como supervisor em **Configurações > Terminais Autorizados**.',
            '2. Desative o registro do computador antigo (para não consumir licença ativa).',
            '3. Informe o novo **Hostname** ou código exibido na tela de bloqueio do sistema.',
            '',
            '### 2. Conferir data, hora e certificado A1',
            '- Em computadores recém-formatados, importe novamente o arquivo `.pfx` do certificado digital A1 no repositório do usuário atual.',
            '- Garanta que o fuso horário esteja configurado para Brasília (`UTC-03:00`).',
            '',
            '### 3. Limpar sessão presa',
            'Se o erro indicar *"Usuário já conectado em outra estação"*, encerre a sessão antiga em **Segurança > Sessões Ativas**.',
          ].join('\n'),
        },
        {
          slug: 'cadastro-operador-caixa-permissoes',
          title: 'Como cadastrar operador de caixa e liberar carga para os terminais',
          category: TicketCategory.OPERATOR_SETUP,
          summary:
            'Guia passo a passo para criar usuário operador, definir limite de desconto e enviar a carga de operadores para o PDV.',
          tags: 'operador, cadastrar, cadastro, caixa, permissao, carga, senha, vendedor',
          authorId: helena.id,
          isPublished: true,
          bodyMarkdown: [
            '## Cadastro completo de novo operador',
            '',
            'Para o operador conseguir abrir turno e registrar vendas no caixa, não basta criar o usuário na retaguarda: é obrigatório enviar a carga aos terminais.',
            '',
            '### 1. Criar ficha do operador na Retaguarda',
            '1. Acesse **Cadastros > Pessoas e Equipe > Operadores de PDV**.',
            '2. Clique em **Novo Operador**, preencha nome completo, CPF sem pontuação e código numérico de 4 dígitos.',
            '3. Escolha o perfil **Operador Padrão** (bloqueia cancelamento de cupom e sangria sem senha de fiscal).',
            '',
            '### 2. Enviar carga imediata ao PDV',
            '- Vá em **PDV > Carga de Tabelas > Operadores e Permissões** e clique em **Enviar para todos os caixas**.',
            '- No caixa, pressione **F9 > Atualizar Carga** ou reinicie o aplicativo do frente de caixa.',
            '',
            '### 3. Primeiro acesso',
            'A senha inicial padrão definida pelo supervisor deve ser trocada na primeira abertura de caixa.',
          ].join('\n'),
        },
        {
          slug: 'tef-pinpad-sem-comunicacao',
          title: 'Pinpad e TEF sem comunicação durante pagamento no cartão',
          category: TicketCategory.FISCAL_POS,
          summary:
            'Verificação do cabo USB do pinpad, serviço TEF local e porta COM configurada no módulo de pagamento.',
          tags: 'tef, pinpad, cartao, credito, debito, usb, com, pagamento',
          authorId: helena.id,
          isPublished: true,
          bodyMarkdown: [
            '## Restabelecendo a comunicação do Pinpad',
            '',
            '1. Observe no visor do Pinpad se a mensagem exibida é *"Aguardando"* ou se travou em *"Processando"*.',
            '2. Desconecte o cabo USB do Pinpad por 5 segundos e reconecte na mesma porta traseira.',
            '3. Confira no **Gerenciador de Dispositivos > Portas (COM e LPT)** qual número `COM` foi atribuído ao Pinpad.',
            '4. Reinicie o serviço **Agente TEF Local** e realize uma venda teste de R$ 1,00 ou consulta de tabelas.',
          ].join('\n'),
        },
        {
          slug: 'nfce-rejeicao-csc-contingencia',
          title: 'NFC-e em contingência ou erro de CSC na emissão fiscal',
          category: TicketCategory.FISCAL_POS,
          summary:
            'Como conferir ID do CSC, código token na Sefaz e retransmitir notas paradas em contingência offline.',
          tags: 'nfce, fiscal, csc, sefaz, contingencia, rejeicao, xml, cupom',
          authorId: helena.id,
          isPublished: true,
          bodyMarkdown: [
            '## Correção de rejeição de CSC e envio de contingência',
            '',
            '- Erro **Rejeição 462 / Código CSC inválido**: compare o **ID do CSC** (ex.: `000001`) e a chave alfanumérica no portal da Sefaz estadual com **Configurações Fiscais > NFC-e**.',
            '- Emissão travada em **Contingência Offline**: após validar conexão com a internet e horário do sistema, abra **Fiscal > Monitor NFC-e** e clique em **Transmitir Pendentes**.',
          ].join('\n'),
        },
        {
          slug: 'balanca-checkout-serial-peso',
          title: 'Balança de checkout não envia peso automático ao PDV',
          category: TicketCategory.PRINTER_HARDWARE,
          summary:
            'Parâmetros seriais padrão (9600 bps, 8N1) e protocolo contínuo para balanças Toledo Prix e Filizola no caixa.',
          tags: 'balanca, peso, serial, com, toledo, checkout, pdv',
          authorId: helena.id,
          isPublished: true,
          bodyMarkdown: [
            '## Conferência de balança integrada ao checkout',
            '',
            '1. Verifique se o cabo serial/adaptador RS-232 está firme na traseira do gabinete.',
            '2. No módulo **PDV > Periféricos > Balança**, confira taxa `9600`, `8` bits de dados, sem paridade (`N`), `1` stop bit.',
            '3. Garanta que o protocolo selecionado na balança seja **Prt2 / Contínuo** compatível com automação comercial.',
          ].join('\n'),
        },
      ],
    });

    const ticketsSeed = [
      {
        code: 'RET-0001',
        subject: 'Impressora do caixa 02 deixou de funcionar após queda de energia',
        customerName: rafael.companyName,
        requesterId: rafael.id,
        assigneeId: lucas.id,
        status: TicketStatus.IN_PROGRESS,
        priority: TicketPriority.URGENT,
        category: TicketCategory.PRINTER_HARDWARE,
        lastInteractionAt: minutesAgo(14),
        createdAt: hoursAgo(4),
        messages: [
          {
            authorId: rafael.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Bom dia! Acabou a energia aqui no mercado e, quando voltou, a impressora Epson TM-T20X do caixa 02 não imprime mais nenhum cupom. A fila está crescendo.',
            createdAt: hoursAgo(4),
          },
          {
            authorId: lucas.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Olá Rafael! Já estou verificando o chamado. Você consegue segurar o botão FEED ao religar a impressora para confirmar se sai a folha de autoteste?',
            createdAt: hoursAgo(3.5),
          },
          {
            authorId: rafael.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Fiz agora: a folha de autoteste saiu certinha, mas quando passo venda no PDV aparece erro "Porta COM4 indisponível".',
            createdAt: hoursAgo(2),
          },
          {
            authorId: lucas.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.INTERNAL,
            body: 'Nota interna: após pico de energia o adaptador USB-Serial subiu como COM6 no Windows. Vou orientar a troca no Configurador PDV e acompanhar o teste remoto.',
            createdAt: minutesAgo(20),
          },
          {
            authorId: lucas.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Perfeito, o hardware está íntegro. Abra Configurador PDV > Periféricos > Impressora Não Fiscal, altere a porta de COM4 para a porta ativa listada (COM6 ou USB001) e clique em Testar Cupom.',
            createdAt: minutesAgo(14),
          },
        ],
      },
      {
        code: 'RET-0002',
        subject: 'Divergência entre estoque na tela e relatório de fechamento',
        customerName: patricia.companyName,
        requesterId: patricia.id,
        assigneeId: bianca.id,
        status: TicketStatus.WAITING_CUSTOMER,
        priority: TicketPriority.HIGH,
        category: TicketCategory.INVENTORY_REPORTS,
        lastInteractionAt: minutesAgo(38),
        createdAt: hoursAgo(9),
        messages: [
          {
            authorId: patricia.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'No cadastro do produto Dipirona 500mg aparece saldo 42 unidades, mas no relatório de movimentação de ontem fecha com 48 unidades. Preciso fechar o balanço mensal.',
            createdAt: hoursAgo(9),
          },
          {
            authorId: bianca.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.INTERNAL,
            body: 'Nota interna: caixa 03 ficou 25 minutos offline ontem às 17h40; existem 6 cupons em fila de sincronização no monitor.',
            createdAt: hoursAgo(6),
          },
          {
            authorId: bianca.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Patrícia, identificamos vendas pendentes de sincronização no caixa 03. Pode abrir o Monitor de Caixas na retaguarda e confirmar se o terminal 03 aparece como conectado agora?',
            createdAt: minutesAgo(38),
          },
        ],
      },
      {
        code: 'RET-0003',
        subject: 'Usuário sem acesso após troca de computador da retaguarda',
        customerName: marcos.companyName,
        requesterId: marcos.id,
        assigneeId: null,
        status: TicketStatus.OPEN,
        priority: TicketPriority.HIGH,
        category: TicketCategory.ACCESS_TERMINAL,
        lastInteractionAt: minutesAgo(45),
        createdAt: minutesAgo(50),
        messages: [
          {
            authorId: marcos.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Trocamos o computador do escritório hoje cedo. Instalei o atalho do sistema, mas ao digitar meu usuário aparece "Estação não autorizada para este terminal" e não consigo emitir notas.',
            createdAt: minutesAgo(50),
          },
          {
            authorId: lucas.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.INTERNAL,
            body: 'Nota interna: conferir se a licença da Padaria Aurora tem limite de 2 estações simultâneas; provavelmente a máquina antiga ainda está ativa no cadastro de terminais.',
            createdAt: minutesAgo(45),
          },
        ],
      },
      {
        code: 'RET-0004',
        subject: 'Dificuldade para cadastrar um operador novo no caixa 01',
        customerName: rafael.companyName,
        requesterId: rafael.id,
        assigneeId: null,
        status: TicketStatus.OPEN,
        priority: TicketPriority.MEDIUM,
        category: TicketCategory.OPERATOR_SETUP,
        lastInteractionAt: hoursAgo(1.2),
        createdAt: hoursAgo(1.2),
        messages: [
          {
            authorId: rafael.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Cadastrei a nova operadora Juliana na retaguarda, mas quando ela tenta abrir o caixa 01 aparece "Operador não encontrado". Existe mais algum passo depois de salvar?',
            createdAt: hoursAgo(1.2),
          },
        ],
      },
      {
        code: 'RET-0005',
        subject: 'Pinpad do caixa 01 trava na tela Processando no crédito',
        customerName: marcos.companyName,
        requesterId: marcos.id,
        assigneeId: lucas.id,
        status: TicketStatus.IN_PROGRESS,
        priority: TicketPriority.URGENT,
        category: TicketCategory.FISCAL_POS,
        lastInteractionAt: hoursAgo(2),
        createdAt: hoursAgo(8),
        messages: [
          {
            authorId: marcos.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Toda venda no cartão de crédito está parando na mensagem Processando e depois dá erro de comunicação com Pinpad.',
            createdAt: hoursAgo(8),
          },
          {
            authorId: lucas.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.INTERNAL,
            body: 'Nota interna: cliente usa hub USB sem alimentação externa para teclado + pinpad; pedir para ligar direto na placa-mãe.',
            createdAt: hoursAgo(2),
          },
        ],
      },
      {
        code: 'RET-0006',
        subject: 'NFC-e com rejeição 462 (Código CSC inválido) após renovação',
        customerName: patricia.companyName,
        requesterId: patricia.id,
        assigneeId: bianca.id,
        status: TicketStatus.RESOLVED,
        priority: TicketPriority.HIGH,
        category: TicketCategory.FISCAL_POS,
        resolvedAt: hoursAgo(5),
        lastInteractionAt: hoursAgo(5),
        createdAt: hoursAgo(28),
        messages: [
          {
            authorId: patricia.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Geramos um CSC novo na Sefaz e todas as NFC-es passaram a dar rejeição 462.',
            createdAt: hoursAgo(28),
          },
          {
            authorId: bianca.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Atualizamos o ID do CSC de 000001 para 000002 nas Configurações Fiscais e retransmitimos as 4 notas em contingência. Tudo autorizado.',
            createdAt: hoursAgo(5.2),
          },
          {
            authorId: patricia.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Confirmado, notas saindo normalmente aqui.',
            createdAt: hoursAgo(5),
          },
          {
            authorId: bianca.id,
            kind: MessageKind.EVENT,
            visibility: MessageVisibility.PUBLIC,
            body: 'Chamado marcado como resolvido por Bianca Souza.',
            createdAt: hoursAgo(5),
          },
        ],
      },
      {
        code: 'RET-0007',
        subject: 'Balança Toledo do checkout não joga peso automático para o PDV',
        customerName: rafael.companyName,
        requesterId: rafael.id,
        assigneeId: lucas.id,
        status: TicketStatus.WAITING_CUSTOMER,
        priority: TicketPriority.MEDIUM,
        category: TicketCategory.PRINTER_HARDWARE,
        lastInteractionAt: hoursAgo(7),
        createdAt: hoursAgo(19),
        messages: [
          {
            authorId: rafael.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'No hortifruti temos que digitar o peso manual porque o sistema não lê a balança Toledo Prix.',
            createdAt: hoursAgo(19),
          },
          {
            authorId: lucas.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Conferimos que o protocolo estava em 2400 bps. Ajustamos para 9600 bps no PDV. Pode colocar 1 kg de teste na bandeja e avisar se o visor sincronizou?',
            createdAt: hoursAgo(7),
          },
        ],
      },
      {
        code: 'RET-0008',
        subject: 'Relatório de fechamento de caixa não bate com valor em dinheiro da gaveta',
        customerName: marcos.companyName,
        requesterId: marcos.id,
        assigneeId: bianca.id,
        status: TicketStatus.IN_PROGRESS,
        priority: TicketPriority.MEDIUM,
        category: TicketCategory.INVENTORY_REPORTS,
        lastInteractionAt: hoursAgo(10),
        createdAt: hoursAgo(24),
        messages: [
          {
            authorId: marcos.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'O turno da manhã fechou com R$ 140,00 a mais no relatório em relação ao dinheiro físico.',
            createdAt: hoursAgo(24),
          },
          {
            authorId: bianca.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.INTERNAL,
            body: 'Nota interna: verificar se houve sangria lançada como suprimento por engano pelo operador turno A.',
            createdAt: hoursAgo(10),
          },
        ],
      },
      {
        code: 'RET-0009',
        subject: 'Bloqueio de sessão "usuário já conectado" após queda de internet',
        customerName: patricia.companyName,
        requesterId: patricia.id,
        assigneeId: helena.id,
        status: TicketStatus.RESOLVED,
        priority: TicketPriority.MEDIUM,
        category: TicketCategory.ACCESS_TERMINAL,
        resolvedAt: hoursAgo(16),
        lastInteractionAt: hoursAgo(16),
        createdAt: hoursAgo(32),
        messages: [
          {
            authorId: patricia.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'A internet oscilou no caixa 02 e agora meu usuário não consegue logar dizendo que já está conectado em outra estação.',
            createdAt: hoursAgo(32),
          },
          {
            authorId: helena.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Encerramos a sessão órfã do terminal 02 no painel de segurança. Já pode acessar novamente.',
            createdAt: hoursAgo(16),
          },
          {
            authorId: helena.id,
            kind: MessageKind.EVENT,
            visibility: MessageVisibility.PUBLIC,
            body: 'Chamado marcado como resolvido por Helena Moraes.',
            createdAt: hoursAgo(16),
          },
        ],
      },
      {
        code: 'RET-0010',
        subject: 'Como limitar desconto máximo de 5% para novos operadores de caixa',
        customerName: rafael.companyName,
        requesterId: rafael.id,
        assigneeId: null,
        status: TicketStatus.OPEN,
        priority: TicketPriority.LOW,
        category: TicketCategory.OPERATOR_SETUP,
        lastInteractionAt: hoursAgo(18),
        createdAt: hoursAgo(18),
        messages: [
          {
            authorId: rafael.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Gostaria de saber onde configuramos o limite de 5% de desconto por item sem precisar digitar a senha do gerente a cada venda.',
            createdAt: hoursAgo(18),
          },
        ],
      },
      {
        code: 'RET-0011',
        subject: 'Gaveta de dinheiro não abre automaticamente ao finalizar venda em espécie',
        customerName: marcos.companyName,
        requesterId: marcos.id,
        assigneeId: lucas.id,
        status: TicketStatus.RESOLVED,
        priority: TicketPriority.LOW,
        category: TicketCategory.PRINTER_HARDWARE,
        resolvedAt: hoursAgo(22),
        lastInteractionAt: hoursAgo(22),
        createdAt: hoursAgo(40),
        messages: [
          {
            authorId: marcos.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Trocamos a impressora Elgin i9 e a gaveta conectada via RJ11 parou de abrir no pagamento em dinheiro.',
            createdAt: hoursAgo(40),
          },
          {
            authorId: lucas.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Ativamos o pulso de abertura da gaveta na aba Periféricos > Elgin i9 (pino 2, 100ms). Testado com o caixa.',
            createdAt: hoursAgo(22),
          },
          {
            authorId: lucas.id,
            kind: MessageKind.EVENT,
            visibility: MessageVisibility.PUBLIC,
            body: 'Chamado marcado como resolvido por Lucas Almeida.',
            createdAt: hoursAgo(22),
          },
        ],
      },
      {
        code: 'RET-0012',
        subject: 'Certificado A1 próximo do vencimento bloqueando envio de NF-e de entrada',
        customerName: patricia.companyName,
        requesterId: patricia.id,
        assigneeId: bianca.id,
        status: TicketStatus.WAITING_CUSTOMER,
        priority: TicketPriority.HIGH,
        category: TicketCategory.FISCAL_POS,
        lastInteractionAt: hoursAgo(25),
        createdAt: hoursAgo(46),
        messages: [
          {
            authorId: patricia.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Ao tentar manifestar notas de fornecedor aparece aviso de certificado expirado, mas já compramos a renovação ontem.',
            createdAt: hoursAgo(46),
          },
          {
            authorId: bianca.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'É necessário importar o novo arquivo .pfx nas configurações fiscais da retaguarda. Assim que estiver com o arquivo e a senha em mãos, me chame aqui.',
            createdAt: hoursAgo(25),
          },
        ],
      },
      {
        code: 'RET-0013',
        subject: 'Impressora Bematech cortando o QR Code da NFC-e pela metade',
        customerName: rafael.companyName,
        requesterId: rafael.id,
        assigneeId: lucas.id,
        status: TicketStatus.IN_PROGRESS,
        priority: TicketPriority.MEDIUM,
        category: TicketCategory.PRINTER_HARDWARE,
        lastInteractionAt: hoursAgo(29),
        createdAt: hoursAgo(52),
        messages: [
          {
            authorId: rafael.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'A guilhotina da Bematech MP-4200 está cortando o cupom bem no meio do QR Code no caixa 04.',
            createdAt: hoursAgo(52),
          },
          {
            authorId: lucas.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.INTERNAL,
            body: 'Nota interna: modelo configurado como 58mm no perfil de impressão em vez de 80mm; ajustar margens e linhas de avanço antes do corte.',
            createdAt: hoursAgo(29),
          },
        ],
      },
      {
        code: 'RET-0014',
        subject: 'Produto com estoque negativo após cancelamento de cupom fiscal',
        customerName: marcos.companyName,
        requesterId: marcos.id,
        assigneeId: bianca.id,
        status: TicketStatus.RESOLVED,
        priority: TicketPriority.MEDIUM,
        category: TicketCategory.INVENTORY_REPORTS,
        resolvedAt: hoursAgo(34),
        lastInteractionAt: hoursAgo(34),
        createdAt: hoursAgo(60),
        messages: [
          {
            authorId: marcos.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Cancelamos uma venda de 12 refrigerantes e o estoque ficou -12 no relatório.',
            createdAt: hoursAgo(60),
          },
          {
            authorId: bianca.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Reprocessamos o Kardex do SKU 0419 após corrigir a devolução duplicada. Saldo normalizado.',
            createdAt: hoursAgo(34),
          },
          {
            authorId: bianca.id,
            kind: MessageKind.EVENT,
            visibility: MessageVisibility.PUBLIC,
            body: 'Chamado marcado como resolvido por Bianca Souza.',
            createdAt: hoursAgo(34),
          },
        ],
      },
      {
        code: 'RET-0015',
        subject: 'Operador antigo desligado ainda aparece na lista do caixa 03',
        customerName: patricia.companyName,
        requesterId: patricia.id,
        assigneeId: helena.id,
        status: TicketStatus.OPEN,
        priority: TicketPriority.HIGH,
        category: TicketCategory.OPERATOR_SETUP,
        lastInteractionAt: hoursAgo(36),
        createdAt: hoursAgo(36),
        messages: [
          {
            authorId: patricia.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Inativamos o usuário do antigo gerente na retaguarda, mas o nome dele ainda aparece para login no caixa 03.',
            createdAt: hoursAgo(36),
          },
        ],
      },
      {
        code: 'RET-0016',
        subject: 'Terminal novo sem acesso ao servidor local após mudança de roteador',
        customerName: marcos.companyName,
        requesterId: marcos.id,
        assigneeId: lucas.id,
        status: TicketStatus.IN_PROGRESS,
        priority: TicketPriority.HIGH,
        category: TicketCategory.ACCESS_TERMINAL,
        lastInteractionAt: hoursAgo(42),
        createdAt: hoursAgo(70),
        messages: [
          {
            authorId: marcos.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'A operadora de internet trocou o roteador e agora o caixa 02 não acha o banco de dados do servidor.',
            createdAt: hoursAgo(70),
          },
          {
            authorId: lucas.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.INTERNAL,
            body: 'Nota interna: faixa de IP mudou de 192.168.0.x para 192.168.15.x. Fixar IP do servidor e atualizar string de conexão no PDV.',
            createdAt: hoursAgo(42),
          },
        ],
      },
      {
        code: 'RET-0017',
        subject: 'Dúvida sobre exportação de relatório XML mensal para contabilidade',
        customerName: patricia.companyName,
        requesterId: patricia.id,
        assigneeId: null,
        status: TicketStatus.RESOLVED,
        priority: TicketPriority.LOW,
        category: TicketCategory.INVENTORY_REPORTS,
        resolvedAt: hoursAgo(48),
        lastInteractionAt: hoursAgo(48),
        createdAt: hoursAgo(80),
        messages: [
          {
            authorId: patricia.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Como gero o pacote ZIP com todos os XMLs de NFC-e do mês passado para o contador?',
            createdAt: hoursAgo(80),
          },
          {
            authorId: bianca.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Em Fiscal > Exportação Contábil, selecione a competência desejada e clique em Gerar Lote XML. A cliente confirmou recebimento por telefone.',
            createdAt: hoursAgo(48),
          },
          {
            authorId: bianca.id,
            kind: MessageKind.EVENT,
            visibility: MessageVisibility.PUBLIC,
            body: 'Chamado marcado como resolvido por Bianca Souza.',
            createdAt: hoursAgo(48),
          },
        ],
      },
      {
        code: 'RET-0018',
        subject: 'Coletor RFID Zebra RFD40 não pareia com módulo de inventário móvel',
        customerName: rafael.companyName,
        requesterId: rafael.id,
        assigneeId: null,
        status: TicketStatus.OPEN,
        priority: TicketPriority.MEDIUM,
        category: TicketCategory.OTHER,
        lastInteractionAt: minutesAgo(8),
        createdAt: minutesAgo(8),
        messages: [
          {
            authorId: rafael.id,
            kind: MessageKind.MESSAGE,
            visibility: MessageVisibility.PUBLIC,
            body: 'Compramos um coletor RFID Zebra RFD40 com leitor UHF e estamos tentando parear via Bluetooth ou USB-C no módulo de contagem móvel, mas não aparece nenhuma opção de driver RFID no sistema.',
            createdAt: minutesAgo(8),
          },
        ],
      },
    ];

    for (const t of ticketsSeed) {
      await prisma.ticket.create({
        data: {
          code: t.code,
          subject: t.subject,
          customerName: t.customerName,
          status: t.status,
          priority: t.priority,
          category: t.category,
          requesterId: t.requesterId,
          assigneeId: t.assigneeId,
          resolvedAt: t.resolvedAt ?? null,
          lastInteractionAt: t.lastInteractionAt,
          createdAt: t.createdAt,
          messages: {
            create: t.messages.map((m) => ({
              authorId: m.authorId,
              kind: m.kind,
              visibility: m.visibility,
              body: m.body,
              createdAt: m.createdAt,
            })),
          },
        },
      });
    }

    await prisma.ticketSequence.create({
      data: { id: 1, lastNumber: ticketsSeed.length },
    });

    console.log(
      `Seed isolado concluído no banco "${dbName}": 7 usuários, 7 artigos KB e ${ticketsSeed.length} chamados.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

runSeed().catch((err) => {
  console.error('Erro no seed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
