import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TicketContextPanel } from '../components/TicketContextPanel';
import { TicketDetail } from '../components/TicketDetail';
import { api } from '../lib/api';
import { loadLocalDraft } from '../lib/drafts';
import type { TicketDetailData } from '../lib/types';

const sampleTicket: TicketDetailData = {
  id: 'tkt-1',
  code: 'RET-0001',
  subject: 'Impressora do caixa deixou de funcionar',
  customerName: 'Mercado Bom Preço',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  category: 'PRINTER_HARDWARE',
  version: 2,
  resolvedAt: null,
  lastInteractionAt: '2026-11-18T12:00:00.000Z',
  createdAt: '2026-11-18T10:00:00.000Z',
  updatedAt: '2026-11-18T12:00:00.000Z',
  requesterId: 'req-1',
  assigneeId: 'ag-1',
  requester: { id: 'req-1', name: 'Rafael Costa', companyName: 'Mercado Bom Preço' },
  assignee: { id: 'ag-1', name: 'Lucas Almeida' },
  messages: [
    {
      id: 'm1',
      kind: 'MESSAGE',
      visibility: 'PUBLIC',
      body: 'Impressora parou de imprimir após queda de energia.',
      createdAt: '2026-11-18T10:00:00.000Z',
      author: { id: 'req-1', name: 'Rafael Costa', role: 'REQUESTER' },
    },
    {
      id: 'm2',
      kind: 'MESSAGE',
      visibility: 'INTERNAL',
      body: 'Conferir porta COM6 no configurador remoto.',
      createdAt: '2026-11-18T11:00:00.000Z',
      author: { id: 'ag-1', name: 'Lucas Almeida', role: 'AGENT' },
    },
  ],
  drafts: [],
};

describe('Componentes de atendimento e IA', () => {
  it('distingue nota interna de resposta pública, preserva rascunho e oculta aba interna para solicitante', () => {
    window.sessionStorage.clear();

    const { rerender } = render(
      <TicketDetail
        ticket={sampleTicket}
        loading={false}
        error={null}
        currentUserId="ag-1"
        role="AGENT"
        contextOpen={false}
        onToggleContext={vi.fn()}
        onBackMobile={vi.fn()}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText('RESPOSTA PÚBLICA')).toBeInTheDocument();
    expect(screen.getByText('NOTA INTERNA — EQUIPE')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Nota interna/i })).toBeInTheDocument();

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Rascunho preservado durante digitação' } });
    expect(loadLocalDraft('ag-1', 'tkt-1', 'PUBLIC')).toBe('Rascunho preservado durante digitação');

    rerender(
      <TicketDetail
        ticket={{
          ...sampleTicket,
          messages: sampleTicket.messages.filter((m) => m.visibility === 'PUBLIC'),
        }}
        loading={false}
        error={null}
        currentUserId="req-1"
        role="REQUESTER"
        contextOpen={false}
        onToggleContext={vi.fn()}
        onBackMobile={vi.fn()}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.queryByRole('tab', { name: /Nota interna/i })).not.toBeInTheDocument();
    expect(screen.queryByText('NOTA INTERNA — EQUIPE')).not.toBeInTheDocument();
  });

  it('exibe selo de simulação, falta de documentação e alerta de chamado desatualizado no painel de IA', async () => {
    const spy = vi.spyOn(api, 'prepareDraftReply').mockResolvedValueOnce({
      draft: {
        mode: 'simulated',
        providerLabel: 'Simulação local identificada (sem chave Gemini)',
        ticketId: sampleTicket.id,
        ticketVersionAtStart: 1,
        staleDuringGeneration: true,
        usedInternalNotes: false,
        sufficientDocumentation: false,
        limitationNotice: 'Sem artigo publicado para este equipamento.',
        suggestedQuestion: 'Qual o modelo exato na etiqueta inferior?',
        draftText: '',
        citations: [],
      },
    });

    const onInsert = vi.fn();

    render(
      <TicketContextPanel
        ticket={sampleTicket}
        role="AGENT"
        agents={[{ id: 'ag-1', name: 'Lucas Almeida', role: 'AGENT' }]}
        onClosePanel={vi.fn()}
        onTicketUpdated={vi.fn().mockResolvedValue(undefined)}
        onInsertAiDraft={onInsert}
        onPreviewArticle={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Preparar resposta' }));

    await waitFor(() => {
      expect(screen.getByText(/Simulação local identificada/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/mudou após a geração deste rascunho/i)).toBeInTheDocument();
    expect(screen.getByText(/Documentação insuficiente:/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Usar pergunta no editor' }));
    expect(onInsert).toHaveBeenCalledWith('Qual o modelo exato na etiqueta inferior?');

    spy.mockRestore();
  });
});
