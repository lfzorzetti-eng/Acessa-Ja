import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CreateIssueRequest, Issue } from '../models/issue.model';

@Injectable({
  providedIn: 'root'
})
export class IssueService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl.replace(/\/$/, '');

  getIssues(): Observable<Issue[]> {
    return this.http
      .get<Issue[]>(`${this.apiUrl}/issues?limit=50`)
      .pipe(timeout({ first: 15000 }));
  }

  createIssue(request: CreateIssueRequest): Observable<Issue> {
    return this.http.post<Issue>(`${this.apiUrl}/issues`, request);
  }

  deleteIssue(id: string): Observable<void> {
    return this.http
      .delete<void>(`${this.apiUrl}/issues/${encodeURIComponent(id)}`)
      .pipe(timeout({ first: 15000 }));
  }

  imageUrl(issue: Issue): string {
    const baseUrl = this.apiUrl.startsWith('http')
      ? new URL(this.apiUrl).origin
      : '';

    return `${baseUrl}${this.apiUrl}/issues/${issue.id}/image`;
  }
}
