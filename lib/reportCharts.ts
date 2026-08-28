import { Chamado } from '@/types/database';

export interface CategoriaGrafico {
  nome: string;
  quantidade: number;
}

export interface DiaUtilGrafico {
  dia: number;
  rotulo: string;
  quantidade: number;
}

export interface GraficoSvg {
  svg: string;
  width: number;
  height: number;
}

const CORES_CATEGORIAS = [
  '#E31837', '#2563EB', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#0891B2', '#65A30D', '#EA580C', '#52525B',
];

function escaparXml(valor: string) {
  return valor
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function pontoPolar(cx: number, cy: number, raio: number, angulo: number) {
  const radianos = ((angulo - 90) * Math.PI) / 180;
  return {
    x: cx + raio * Math.cos(radianos),
    y: cy + raio * Math.sin(radianos),
  };
}

export function contarCategoriasParaGrafico(chamados: Chamado[]): CategoriaGrafico[] {
  const contagem = chamados.reduce((acc, chamado) => {
    acc[chamado.categoria] = (acc[chamado.categoria] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(contagem)
    .map(([nome, quantidade]) => ({ nome, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function contarChamadosPorDiaUtil(
  chamados: Chamado[],
  mes: number,
  ano: number
): DiaUtilGrafico[] {
  const contagemPorDia = chamados.reduce((acc, chamado) => {
    const data = new Date(chamado.data_criacao);
    if (data.getFullYear() === ano && data.getMonth() === mes - 1) {
      const dia = data.getDate();
      acc[dia] = (acc[dia] || 0) + 1;
    }
    return acc;
  }, {} as Record<number, number>);

  const diasNoMes = new Date(ano, mes, 0).getDate();
  const resultado: DiaUtilGrafico[] = [];

  for (let dia = 1; dia <= diasNoMes; dia += 1) {
    const diaDaSemana = new Date(ano, mes - 1, dia).getDay();
    if (diaDaSemana === 0 || diaDaSemana === 6) continue;

    resultado.push({
      dia,
      rotulo: dia.toString().padStart(2, '0'),
      quantidade: contagemPorDia[dia] || 0,
    });
  }

  return resultado;
}

export function criarGraficoPizzaCategorias(dados: CategoriaGrafico[]): GraficoSvg {
  const width = 760;
  const height = Math.max(360, 90 + dados.length * 28);
  const cx = 180;
  const cy = height / 2 + 15;
  const raio = 118;
  const total = dados.reduce((soma, item) => soma + item.quantidade, 0);

  let anguloAtual = 0;
  const fatias = dados.map((item, index) => {
    const angulo = total > 0 ? (item.quantidade / total) * 360 : 0;
    const cor = CORES_CATEGORIAS[index % CORES_CATEGORIAS.length];

    if (angulo >= 359.999) {
      anguloAtual += angulo;
      return `<circle cx="${cx}" cy="${cy}" r="${raio}" fill="${cor}" />`;
    }

    const inicio = pontoPolar(cx, cy, raio, anguloAtual);
    const fim = pontoPolar(cx, cy, raio, anguloAtual + angulo);
    const arcoMaior = angulo > 180 ? 1 : 0;
    anguloAtual += angulo;

    return `<path d="M ${cx} ${cy} L ${inicio.x.toFixed(2)} ${inicio.y.toFixed(2)} A ${raio} ${raio} 0 ${arcoMaior} 1 ${fim.x.toFixed(2)} ${fim.y.toFixed(2)} Z" fill="${cor}" stroke="#FFFFFF" stroke-width="2" />`;
  }).join('');

  const legenda = dados.map((item, index) => {
    const y = 80 + index * 28;
    const percentual = total > 0 ? Math.round((item.quantidade / total) * 100) : 0;
    const cor = CORES_CATEGORIAS[index % CORES_CATEGORIAS.length];
    return `
      <rect x="360" y="${y - 12}" width="14" height="14" rx="3" fill="${cor}" />
      <text x="384" y="${y}" font-size="13" fill="#27272A">${escaparXml(item.nome)}</text>
      <text x="720" y="${y}" text-anchor="end" font-size="13" font-weight="700" fill="#27272A">${item.quantidade} (${percentual}%)</text>`;
  }).join('');

  const vazio = total === 0
    ? `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="14" fill="#71717A">Sem dados</text>`
    : '';

  return {
    width,
    height,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" rx="18" fill="#FFFFFF" />
      <text x="28" y="38" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#18181B">Categorias mais solicitadas</text>
      <text x="28" y="60" font-family="Arial, sans-serif" font-size="12" fill="#71717A">Participação de cada categoria nos chamados abertos no mês</text>
      <g font-family="Arial, sans-serif">${fatias}${vazio}${legenda}</g>
    </svg>`,
  };
}

export function criarGraficoBarrasDiasUteis(dados: DiaUtilGrafico[]): GraficoSvg {
  const width = 960;
  const height = 400;
  const margem = { top: 82, right: 28, bottom: 58, left: 50 };
  const larguraGrafico = width - margem.left - margem.right;
  const alturaGrafico = height - margem.top - margem.bottom;
  const maiorValor = Math.max(1, ...dados.map(item => item.quantidade));
  const passo = Math.max(1, Math.ceil(maiorValor / 5));
  const limiteY = Math.ceil(maiorValor / passo) * passo;
  const espaco = larguraGrafico / Math.max(1, dados.length);
  const larguraBarra = Math.max(8, espaco * 0.62);

  const linhas = Array.from({ length: Math.floor(limiteY / passo) + 1 }, (_, index) => index * passo)
    .map(valor => {
      const y = margem.top + alturaGrafico - (valor / limiteY) * alturaGrafico;
      return `
        <line x1="${margem.left}" y1="${y}" x2="${width - margem.right}" y2="${y}" stroke="#E4E4E7" stroke-width="1" />
        <text x="${margem.left - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="#71717A">${valor}</text>`;
    }).join('');

  const barras = dados.map((item, index) => {
    const altura = (item.quantidade / limiteY) * alturaGrafico;
    const x = margem.left + index * espaco + (espaco - larguraBarra) / 2;
    const y = margem.top + alturaGrafico - altura;
    return `
      <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${larguraBarra.toFixed(2)}" height="${altura.toFixed(2)}" rx="3" fill="#E31837" />
      <text x="${(x + larguraBarra / 2).toFixed(2)}" y="${Math.max(margem.top - 4, y - 6).toFixed(2)}" text-anchor="middle" font-size="10" font-weight="700" fill="#27272A">${item.quantidade}</text>
      <text x="${(x + larguraBarra / 2).toFixed(2)}" y="${margem.top + alturaGrafico + 20}" text-anchor="middle" font-size="10" fill="#52525B">${item.rotulo}</text>`;
  }).join('');

  return {
    width,
    height,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" rx="18" fill="#FFFFFF" />
      <text x="28" y="36" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#18181B">Chamados abertos por dia útil</text>
      <text x="28" y="58" font-family="Arial, sans-serif" font-size="12" fill="#71717A">Todos os dias de segunda a sexta do mês, inclusive os dias sem chamados</text>
      <g font-family="Arial, sans-serif">${linhas}${barras}</g>
      <text x="${width / 2}" y="${height - 14}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#71717A">Dia do mês</text>
    </svg>`,
  };
}

export async function converterSvgParaPngBase64(grafico: GraficoSvg): Promise<string> {
  const blob = new Blob([grafico.svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const imagem = new window.Image();
    imagem.decoding = 'async';

    await new Promise<void>((resolve, reject) => {
      imagem.onload = () => resolve();
      imagem.onerror = () => reject(new Error('Não foi possível renderizar o gráfico.'));
      imagem.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = grafico.width;
    canvas.height = grafico.height;
    const contexto = canvas.getContext('2d');
    if (!contexto) throw new Error('Canvas indisponível para gerar o gráfico.');

    contexto.fillStyle = '#FFFFFF';
    contexto.fillRect(0, 0, grafico.width, grafico.height);
    contexto.drawImage(imagem, 0, 0, grafico.width, grafico.height);

    return canvas.toDataURL('image/png').split(',')[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}
