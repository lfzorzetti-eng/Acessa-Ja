import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { Issue } from '../../core/models/issue.model';
import { IssueService } from '../../core/services/issue.service';

@Component({
  selector: 'uar-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    RouterLink
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  private readonly issueService = inject(IssueService);
  private readonly changeDetector = inject(ChangeDetectorRef);

  issues: Issue[] = [];
  isLoading = true;
  hasError = false;

  get highSeverityCount(): number {
    return this.issues.filter(issue => issue.severity === 'high').length;
  }

  get latestReportDate(): Date | null {
    return this.issues.length > 0 ? new Date(this.issues[0].createdAt) : null;
  }

  imageUrl(issue: Issue): string {
    return this.issueService.imageUrl(issue);
  }

  ngOnInit(): void {
    this.loadIssues();
  }

  loadIssues(): void {
    this.isLoading = true;
    this.hasError = false;

    this.issueService.getIssues().subscribe({
      next: issues => {
        this.issues = issues;
        this.isLoading = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        this.hasError = true;
        this.isLoading = false;
        this.changeDetector.markForCheck();
      }
    });
  }
}
