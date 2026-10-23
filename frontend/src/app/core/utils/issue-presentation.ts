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
    label: 'Wheelchair users',
    icon: 'accessible',
    color: '#2563eb',
    pale: '#e4edff',
    description: 'Ramps, curb cuts, steps and passages wide enough for a wheelchair or scooter.'
  },
  blind: {
    label: 'Blind people',
    icon: 'touch_app',
    color: '#7c3aed',
    pale: '#f0e8ff',
    description: 'Tactile paving, cane-detectable edges and obstacles at body or head height.'
  },
  low_vision: {
    label: 'Low vision',
    icon: 'visibility',
    color: '#c2410c',
    pale: '#ffeadf',
    description: 'Contrast, visual markings and crossings that are easy to see.'
  },
  deaf: {
    label: 'Deaf or hard of hearing',
    icon: 'hearing_disabled',
    color: '#0f766e',
    pale: '#dcf5f1',
    description: 'Visual signals and hazards that would normally be noticed by sound.'
  },
  mobility: {
    label: 'Limited mobility',
    icon: 'directions_walk',
    color: '#4d7c0f',
    pale: '#edf6dc',
    description: 'Canes, walkers, uneven surfaces, slopes and long detours.'
  },
  elderly: {
    label: 'Older people',
    icon: 'elderly',
    color: '#a16207',
    pale: '#fbf0d4',
    description: 'Slippery surfaces, missing handrails, rest areas and crossing time.'
  },
  general: {
    label: 'Everyone',
    icon: 'groups',
    color: '#475569',
    pale: '#e9edf2',
    description: 'A barrier that affects the general public.'
  }
};

const CATEGORY_STYLES: Record<IssueCategory, PresentationStyle> = {
  sidewalk: { label: 'Sidewalk', icon: 'add_road', color: '#42695c', pale: '#e2eee7' },
  curb_ramp: { label: 'Curb ramp', icon: 'stairs', color: '#2563eb', pale: '#e4edff' },
  tactile_paving: { label: 'Tactile paving', icon: 'grain', color: '#7c3aed', pale: '#f0e8ff' },
  obstruction: { label: 'Obstruction', icon: 'block', color: '#c2410c', pale: '#ffeadf' },
  crossing: { label: 'Crossing', icon: 'traffic', color: '#a16207', pale: '#fbf0d4' },
  public_transport: { label: 'Public transport', icon: 'directions_bus', color: '#0f766e', pale: '#dcf5f1' },
  other: { label: 'Other need', icon: 'more_horiz', color: '#475569', pale: '#e9edf2' }
};

export function needStyle(need: IssueNeed | string | null | undefined): PresentationStyle & { description: string } {
  return NEED_STYLES[(need ?? 'general') as IssueNeed] ?? NEED_STYLES.general;
}

export function categoryStyle(category: IssueCategory | string | null | undefined): PresentationStyle {
  return CATEGORY_STYLES[(category ?? 'other') as IssueCategory] ?? CATEGORY_STYLES.other;
}
