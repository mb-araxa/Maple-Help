import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SugestaoIaChamado } from '@/components/SugestaoIaChamado';
import type { ChamadoAdmin } from '@/types/database';

vi.mock('@/app/actions/chamados', () => ({
  gerarSugestaoIaChamado: vi.fn(),
}));

const chamadoAbertoComSugestao: ChamadoAdmin = {
  id: '22222222-2222-4222-8222-222222222222',
  solicitante: 'Professor Carlos',
  local: 'Sala 04',
  categoria: 'Televisão | Som',
  descricao: 'A TV da sala não exibe imagem ao conectar o cabo HDMI.',
  status: 'Pendente',
  resolucao: null,
  data_criacao: '2026-11-10T11:00:00.000Z',
  data_resolucao: null,
  responsavel: null,
  tempo_gasto: null,
  prioridade: 'alta',
  prioridade_origem: 'ia',
  ia_prioridade_sugerida: 'alta',
  ia_confianca: 92,
  ia_justificativa: 'Aula prejudicada por falta de projeção de conteúdo.',
  ia_sugestao_atendimento:
    'Testar outra porta HDMI na TV, substituir o cabo HDMI e confirmar a resolução de saída no notebook.',
  ia_modelo: 'qwen/qwen3.8-27b',
  ia_status: 'concluida',
  ia_analisado_em: '2026-11-10T11:00:05.000Z',
};

describe('Componente SugestaoIaChamado', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('17. chamados concluídos não exibem sugestão', () => {
    const concluido: ChamadoAdmin = {
      ...chamadoAbertoComSugestao,
      status: 'Concluído',
      resolucao: 'Cabo HDMI substituído.',
    };

    const { container } = render(<SugestaoIaChamado chamado={concluido} />);
    expect(container.innerHTML).toBe('');
    expect(screen.queryByText('Assistente de atendimento')).toBeNull();
    expect(screen.queryByText(/Testar outra porta HDMI/i)).toBeNull();
  });

  it('exibe sugestão nos chamados com status Pendente e Em Andamento', () => {
    const { rerender } = render(<SugestaoIaChamado chamado={chamadoAbertoComSugestao} />);

    expect(screen.getByText('Assistente de atendimento')).toBeTruthy();
    expect(screen.getByText('Prioridade definida pela IA')).toBeTruthy();
    expect(screen.getByText('Prioridade sugerida: Alta')).toBeTruthy();
    expect(screen.getByText('Confiança: 92%')).toBeTruthy();
    expect(screen.getByText('Aula prejudicada por falta de projeção de conteúdo.')).toBeTruthy();
    expect(screen.getByText(/Testar outra porta HDMI na TV/i)).toBeTruthy();
    expect(
      screen.getByText('A sugestão é um apoio à equipe e deve ser confirmada pelo técnico.')
    ).toBeTruthy();

    rerender(
      <SugestaoIaChamado
        chamado={{ ...chamadoAbertoComSugestao, status: 'Em Andamento', responsavel: 'TI' }}
      />
    );

    expect(screen.getByText('Assistente de atendimento')).toBeTruthy();
    expect(screen.getByText(/Testar outra porta HDMI na TV/i)).toBeTruthy();
  });

  it('exibe indicação clara quando a prioridade foi alterada manualmente preservando a sugestão da IA', () => {
    render(
      <SugestaoIaChamado
        chamado={{
          ...chamadoAbertoComSugestao,
          prioridade: 'media',
          prioridade_origem: 'manual',
          ia_prioridade_sugerida: 'alta',
        }}
      />
    );

    expect(screen.getByText('Prioridade alterada manualmente')).toBeTruthy();
    expect(screen.getByText('(A IA havia sugerido Alta)')).toBeTruthy();
  });

  it('16. permite retentar processamento cuja trava expirou e mantém desabilitado enquanto a trava for válida', async () => {
    const onGerar = vi.fn().mockResolvedValue(chamadoAbertoComSugestao);

    // 1. Trava ativa (no futuro): botão fica desabilitado
    const travaFutura = new Date(Date.now() + 60_000).toISOString();
    const { rerender } = render(
      <SugestaoIaChamado
        chamado={{
          ...chamadoAbertoComSugestao,
          ia_status: 'processando',
          ia_sugestao_atendimento: null,
          ia_execucao_id: '00000000-0000-4000-8000-000000000001',
          ia_iniciada_em: new Date().toISOString(),
          ia_trava_ate: travaFutura,
        }}
        onGerarSugestao={onGerar}
      />
    );

    expect(screen.getByText('Analisando o chamado...')).toBeTruthy();
    const botaoTravaAtiva = screen.getByRole('button') as HTMLButtonElement;
    expect(botaoTravaAtiva.disabled).toBe(true);

    // 2. Trava expirada (no passado): habilita botão "Tentar novamente" sem exigir edição manual no banco
    const travaExpirada = new Date(Date.now() - 5_000).toISOString();
    rerender(
      <SugestaoIaChamado
        chamado={{
          ...chamadoAbertoComSugestao,
          ia_status: 'processando',
          ia_sugestao_atendimento: null,
          ia_execucao_id: '00000000-0000-4000-8000-000000000001',
          ia_iniciada_em: new Date(Date.now() - 35_000).toISOString(),
          ia_trava_ate: travaExpirada,
        }}
        onGerarSugestao={onGerar}
      />
    );

    expect(
      screen.getByText('O processamento anterior expirou. Você pode tentar novamente.')
    ).toBeTruthy();
    const botaoRetentarExpirado = screen.getByRole('button', {
      name: 'Tentar novamente',
    }) as HTMLButtonElement;
    expect(botaoRetentarExpirado.disabled).toBe(false);

    fireEvent.click(botaoRetentarExpirado);

    await waitFor(() => {
      expect(onGerar).toHaveBeenCalledWith(chamadoAbertoComSugestao.id);
    });
  });

  it('botão de retentativa fica desabilitado enquanto uma requisição local está em andamento', async () => {
    let resolverPromessa!: (valor: ChamadoAdmin) => void;
    const promessaPendente = new Promise<ChamadoAdmin>((resolve) => {
      resolverPromessa = resolve;
    });

    const onGerar = vi.fn().mockReturnValue(promessaPendente);
    const chamadoFalha: ChamadoAdmin = {
      ...chamadoAbertoComSugestao,
      ia_status: 'falha',
      ia_sugestao_atendimento: null,
    };

    render(<SugestaoIaChamado chamado={chamadoFalha} onGerarSugestao={onGerar} />);

    expect(screen.getByText('Não foi possível gerar a sugestão neste momento.')).toBeTruthy();
    const botaoRetentar = screen.getByRole('button', { name: 'Tentar novamente' }) as HTMLButtonElement;
    expect(botaoRetentar.disabled).toBe(false);

    fireEvent.click(botaoRetentar);

    expect(screen.getByText('Analisando o chamado...')).toBeTruthy();
    const botaoDuranteProcessamento = screen.getByRole('button', {
      name: 'Tentar novamente',
    }) as HTMLButtonElement;
    expect(botaoDuranteProcessamento.disabled).toBe(true);

    resolverPromessa(chamadoAbertoComSugestao);
    await waitFor(() => {
      expect(onGerar).toHaveBeenCalledTimes(1);
    });
  });
});
