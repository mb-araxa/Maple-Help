import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConfiguracaoSlaPage from '@/app/adm/sla/page';
import { obterPoliticasSla, salvarPoliticasSla } from '@/app/actions/chamados';
vi.mock('@/app/actions/chamados', () => ({ obterPoliticasSla: vi.fn(), salvarPoliticasSla: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('Configuração de SLA pela equipe', () => {
  it('não inventa prazos e salva as quatro prioridades em horas corridas', async () => {
    vi.mocked(obterPoliticasSla).mockResolvedValue([]);
    vi.mocked(salvarPoliticasSla).mockResolvedValue(undefined);
    render(<ConfiguracaoSlaPage />);
    const salvar = screen.getByRole('button', { name: 'Salvar prazos' });
    await waitFor(() => expect((salvar as HTMLButtonElement).disabled).toBe(false));
    const prazos = [['Baixa — horas', '72'], ['Média — horas', '24'], ['Alta — horas', '4'], ['Crítica — horas', '0.5']];
    for (const [nome, valor] of prazos) {
      const input = screen.getByLabelText(nome) as HTMLInputElement;
      expect(input.value).toBe('');
      fireEvent.change(input, { target: { value: valor } });
    }
    fireEvent.click(salvar);
    await screen.findByText('Prazos salvos.');
    expect(salvarPoliticasSla).toHaveBeenCalledWith([
      { prioridade: 'baixa', prazo_horas: 72 }, { prioridade: 'media', prazo_horas: 24 },
      { prioridade: 'alta', prazo_horas: 4 }, { prioridade: 'critica', prazo_horas: 0.5 },
    ]);
  });
  it('informa erro ao carregar a política, sem apresentar sucesso', async () => {
    vi.mocked(obterPoliticasSla).mockRejectedValue(new Error('Verifique a migração de SLA.'));
    render(<ConfiguracaoSlaPage />);
    expect((await screen.findByRole('alert')).textContent).toContain('migração');
    expect(screen.queryByText('Prazos salvos.')).toBeNull();
  });
});
