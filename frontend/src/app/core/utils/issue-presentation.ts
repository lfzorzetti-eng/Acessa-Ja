import { IssueCategory, IssueNeed } from '../models/issue.model';

export interface PresentationStyle {
  label: string;
  icon: string;
  color: string;
  pale: string;
}

export const NEEDS: IssueNeed[] = [
  'wheelchair',
  'blind',
  'low_vision',
  'deaf',
  'mobility',
  'elderly',
  'general'
];

export const NEED_STYLES: Record<IssueNeed, PresentationStyle & { description: string }> = {
  wheelchair: {
    label: 'Cadeirantes',
    icon: 'accessible',
    color: '#2563eb',
    pale: '#e4edff',
    description: 'Rampas, rebaixos, degraus e passagens largas o suficiente para cadeira de rodas ou scooter.'
  },
  blind: {
    label: 'Pessoas cegas',
    icon: 'touch_app',
    color: '#7c3aed',
    pale: '#f0e8ff',
    description: 'Piso tátil, bordas detectáveis pela bengala e obstáculos na altura do corpo ou da cabeça.'
  },
  low_vision: {
    label: 'Baixa visão',
    icon: 'visibility',
    color: '#c2410c',
    pale: '#ffeadf',
    description: 'Contraste, sinalização visual e travessias fáceis de enxergar.'
  },
  deaf: {
    label: 'Surdos ou deficientes auditivos',
    icon: 'hearing_disabled',
    color: '#0f766e',
    pale: '#dcf5f1',
    description: 'Sinais visuais e perigos que normalmente seriam percebidos pelo som.'
  },
  mobility: {
    label: 'Mobilidade reduzida',
    icon: 'directions_walk',
    color: '#4d7c0f',
    pale: '#edf6dc',
    description: 'Bengalas, andadores, pisos irregulares, rampas e desvios longos.'
  },
  elderly: {
    label: 'Idosos',
    icon: 'elderly',
    color: '#a16207',
    pale: '#fbf0d4',
    description: 'Superfícies escorregadias, falta de corrimãos, locais para descanso e tempo de travessia.'
  },
  general: {
    label: 'Todos',
    icon: 'groups',
    color: '#475569',
    pale: '#e9edf2',
    description: 'Barreira que afeta a população em geral.'
  }
};

const CATEGORY_STYLES: Record<IssueCategory, PresentationStyle> = {
  sidewalk: { label: 'Calçada', icon: 'add_road', color: '#42695c', pale: '#e2eee7' },
  curb_ramp: { label: 'Rampa de acesso', icon: 'stairs', color: '#2563eb', pale: '#e4edff' },
  tactile_paving: { label: 'Piso tátil', icon: 'grain', color: '#7c3aed', pale: '#f0e8ff' },
  obstruction: { label: 'Obstrução', icon: 'block', color: '#c2410c', pale: '#ffeadf' },
  crossing: { label: 'Travessia', icon: 'traffic', color: '#a16207', pale: '#fbf0d4' },
  public_transport: { label: 'Transporte público', icon: 'directions_bus', color: '#0f766e', pale: '#dcf5f1' },
  other: { label: 'Outra necessidade', icon: 'more_horiz', color: '#475569', pale: '#e9edf2' }
};

export function needStyle(need: IssueNeed | string | null | undefined): PresentationStyle & { description: string } {
  return NEED_STYLES[(need ?? 'general') as IssueNeed] ?? NEED_STYLES.general;
}

export function categoryStyle(category: IssueCategory | string | null | undefined): PresentationStyle {
  return CATEGORY_STYLES[(category ?? 'other') as IssueCategory] ?? CATEGORY_STYLES.other;
}

const SEVERITY_LABELS: Record<string, string> = {
  low: 'baixa',
  medium: 'média',
  high: 'alta'
};

export function severityLabel(severity: string | null | undefined): string {
  return SEVERITY_LABELS[(severity ?? 'low').toLowerCase()] ?? 'baixa';
}
