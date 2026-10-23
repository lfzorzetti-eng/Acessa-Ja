import { Routes } from '@angular/router';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { ReportComponent } from './features/report/report.component';

export const routes: Routes = [
  {
    path: '',
    component: DashboardComponent,
    title: 'Dashboard | Urban Accessibility Radar'
  },
  {
    path: 'report',
    component: ReportComponent,
    title: 'Report an issue | Urban Accessibility Radar'
  },
  {
    path: '**',
    redirectTo: ''
  }
];
