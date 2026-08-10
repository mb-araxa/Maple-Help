export interface DateRange {
  startDate: string; // ISO format (YYYY-MM-DD)
  endDate: string;   // ISO format (YYYY-MM-DD)
}

export interface MetricTrend {
  value: number;
  trend: 'up' | 'down' | 'neutral';
  percentageChange: number;
}

export interface DashboardMetrics {
  totalChamados: number;
  chamadosAbertos: number;
  chamadosEmAndamento: number;
  chamadosConcluidos: number;
  tempoMedioResolucaoHoras: number;
  slaAtingidoPercentual: number;
  
  // Opcionais/Tendências
  tendenciaTotal?: MetricTrend;
  tendenciaTempoMedio?: MetricTrend;
  
  // Categorizações
  porArea?: { area: string; count: number }[];
  porCategoria?: { categoria: string; count: number }[];
  porPrioridade?: { prioridade: string; count: number }[];
}

export interface FilterOptions {
  dateRange?: DateRange;
  area?: string;
  tecnicoId?: string;
  categoria?: string;
}
