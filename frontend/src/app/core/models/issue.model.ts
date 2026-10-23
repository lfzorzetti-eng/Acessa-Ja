export interface Issue {
  id: string;
  classification: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  latitude: number;
  longitude: number;
  createdAt: string;
}

export interface CreateIssueRequest {
  latitude: number;
  longitude: number;
  imageBase64: string;
}
