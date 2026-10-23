export interface Issue {
  id: string;
  classification: string;
  category: IssueCategory;
  need: IssueNeed;
  severity: 'low' | 'medium' | 'high';
  description: string;
  latitude: number;
  longitude: number;
  createdAt: string;
}

export type IssueCategory = 'sidewalk' | 'curb_ramp' | 'tactile_paving' | 'obstruction' | 'crossing' | 'public_transport' | 'other';

export type IssueNeed = 'wheelchair' | 'blind' | 'low_vision' | 'deaf' | 'mobility' | 'elderly' | 'general';

export interface CreateIssueRequest {
  latitude: number;
  longitude: number;
  imageBase64: string;
}
