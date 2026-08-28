import { describe, expect, it } from 'vitest';
import { contarCategoriasParaGrafico, contarChamadosPorDiaUtil } from '@/lib/reportCharts';
import { Chamado } from '@/types/database';

function chamado(categoria: string, ano: number, mes: number, dia: number): Chamado {
  return {
    id: crypto.randomUUID(),
    solicitante: 'Usuário',
    local: 'Sala',
    categoria,
    descricao: 'Descrição',
    status: 'Pendente',
    resolucao: null,
    data_criacao: new Date(ano, mes - 1, dia, 10).toISOString(),
    data_resolucao: null,
    responsavel: null,
    tempo_gasto: null,
  };
}

describe('dados dos gráficos mensais', () => {
  it('ordena as categorias pela quantidade de solicitações', () => {
    const dados = [
      chamado('Internet', 2026, 8, 3),
      chamado('Equipamento', 2026, 8, 4),
      chamado('Internet', 2026, 8, 5),
    ];

    expect(contarCategoriasParaGrafico(dados)).toEqual([
      { nome: 'Internet', quantidade: 2 },
      { nome: 'Equipamento', quantidade: 1 },
    ]);
  });

  it('inclui cada dia de segunda a sexta, inclusive com quantidade zero', () => {
    const dados = [
      chamado('Internet', 2026, 8, 3),
      chamado('Internet', 2026, 8, 3),
      chamado('Equipamento', 2026, 8, 8), // sábado: não vira barra
    ];

    const dias = contarChamadosPorDiaUtil(dados, 8, 2026);

    expect(dias).toHaveLength(21);
    expect(dias[0]).toEqual({ dia: 3, rotulo: '03', quantidade: 2 });
    expect(dias[1]).toEqual({ dia: 4, rotulo: '04', quantidade: 0 });
    expect(dias.some(item => item.dia === 8)).toBe(false);
    expect(dias.at(-1)).toEqual({ dia: 31, rotulo: '31', quantidade: 0 });
  });
});
