import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, ViewChild, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Issue, IssueCategory, IssueNeed } from '../../core/models/issue.model';
import { IssueService } from '../../core/services/issue.service';
import { NEEDS, categoryStyle, needStyle, severityLabel as severityText } from '../../core/utils/issue-presentation';
import { RadarMapComponent } from './radar-map/radar-map.component';
import { PickedLocation } from './radar-map/radar-map.component';

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
    RadarMapComponent,
    RouterLink
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  @ViewChild('radarMap') radarMap?: RadarMapComponent;

  private readonly issueService = inject(IssueService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  issues: Issue[] = [];
  isLoading = true;
  hasError = false;
  selectedNeed: IssueNeed | null = null;
  selectedCategory: IssueCategory | null = null;
  deletingIssueId: string | null = null;
  deleteError: string | null = null;
  private pendingFocusId: string | null = null;

  get filteredIssues(): Issue[] {
    return this.issues.filter(issue => {
      const needMatches = this.selectedNeed === null || issue.need === this.selectedNeed;
      const categoryMatches = this.selectedCategory === null || issue.category === this.selectedCategory;
      return needMatches && categoryMatches;
    });
  }

  get highSeverityCount(): number {
    return this.issues.filter(issue => issue.severity === 'high').length;
  }

  get selectedNeedLabel(): string | null {
    return this.selectedNeed ? needStyle(this.selectedNeed).label : null;
  }

  get needCounts(): { need: IssueNeed; label: string; icon: string; color: string; pale: string; description: string; count: number }[] {
    const counts = new Map<string, number>();

    for (const issue of this.issues) {
      const need = issue.need || 'general';
      counts.set(need, (counts.get(need) ?? 0) + 1);
    }

    return NEEDS.map(need => {
      const style = needStyle(need);
      return {
        need,
        label: style.label,
        icon: style.icon,
        color: style.color,
        pale: style.pale,
        description: style.description,
        count: counts.get(need) ?? 0
      };
    });
  }

  get categoryCounts(): { category: IssueCategory; label: string; icon: string; count: number }[] {
    const counts = new Map<string, number>();

    for (const issue of this.issues) {
      const category = issue.category || 'other';
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }

    return (['sidewalk', 'curb_ramp', 'tactile_paving', 'obstruction', 'crossing', 'public_transport', 'other'] as IssueCategory[])
      .map(category => ({
        category,
        label: categoryStyle(category).label,
        icon: categoryStyle(category).icon,
        count: counts.get(category) ?? 0
      }));
  }

  categoryLabel(category: IssueCategory | string): string {
    return categoryStyle(category).label;
  }

  categoryIcon(category: IssueCategory | string): string {
    return categoryStyle(category).icon;
  }

  needLabel(need: IssueNeed | string): string {
    return needStyle(need).label;
  }

  needIcon(need: IssueNeed | string): string {
    return needStyle(need).icon;
  }

  needColor(need: IssueNeed | string): string {
    return needStyle(need).color;
  }

  needPale(need: IssueNeed | string): string {
    return needStyle(need).pale;
  }

  severityLabel(severity: string): string {
    return severityText(severity);
  }

  get latestReportDate(): Date | null {
    return this.issues.length > 0 ? new Date(this.issues[0].createdAt) : null;
  }

  imageUrl(issue: Issue): string {
    return this.issueService.imageUrl(issue);
  }

  focusOnMap(issue: Issue): void {
    this.radarMap?.focusIssue(issue);
  }

  deleteIssue(issue: Issue): void {
    const confirmed = window.confirm(
      `Excluir o relato “${issue.classification}”? Esta ação não pode ser desfeita.`
    );

    if (!confirmed) {
      return;
    }

    this.deletingIssueId = issue.id;
    this.deleteError = null;

    this.issueService.deleteIssue(issue.id).subscribe({
      next: () => {
        this.issues = this.issues.filter(currentIssue => currentIssue.id !== issue.id);
        this.deletingIssueId = null;
        this.changeDetector.markForCheck();
      },
      error: (error: HttpErrorResponse) => {
        this.deletingIssueId = null;
        this.deleteError = this.deleteErrorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }

  private deleteErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 404) {
      return 'A API em uso não encontrou este relato. Atualize a página e tente novamente.';
    }

    if (error.status === 0) {
      return 'Não foi possível conectar à API para excluir o relato. Tente novamente em instantes.';
    }

    return error.error?.detail || 'Não foi possível excluir o relato. Tente novamente.';
  }

  toggleNeed(need: IssueNeed): void {
    this.selectedNeed = this.selectedNeed === need ? null : need;
    this.changeDetector.markForCheck();
  }

  toggleCategory(category: IssueCategory): void {
    this.selectedCategory = this.selectedCategory === category ? null : category;
    this.changeDetector.markForCheck();
  }

  clearFilters(): void {
    this.selectedNeed = null;
    this.selectedCategory = null;
    this.changeDetector.markForCheck();
  }

  onMapPickLocation(location: PickedLocation): void {
    void this.router.navigate(['/report'], {
      queryParams: {
        lat: location.latitude.toFixed(6),
        lng: location.longitude.toFixed(6)
      }
    });
  }

  ngOnInit(): void {
    this.pendingFocusId = this.route.snapshot.queryParamMap.get('focus');
    this.loadIssues();
  }

  loadIssues(): void {
    this.isLoading = true;
    this.hasError = false;
    this.deleteError = null;

    this.issueService.getIssues().subscribe({
      next: issues => {
        this.issues = issues;
        this.isLoading = false;
        this.changeDetector.markForCheck();

        if (this.pendingFocusId) {
          const target = issues.find(issue => issue.id === this.pendingFocusId);
          this.pendingFocusId = null;

          if (target) {
            window.setTimeout(() => this.focusOnMap(target), 350);
          }
        }
      },
      error: () => {
        this.hasError = true;
        this.isLoading = false;
        this.changeDetector.markForCheck();
      }
    });
  }
}
