import { Routes } from '@angular/router';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { ReportComponent } from './features/report/report.component';

export const routes: Routes = [
  {
    path: '',
    component: DashboardComponent,
    title: 'Mapa | Acessa Já'
  },
  {
    path: 'report',
    component: ReportComponent,
    title: 'Relatar barreira | Acessa Já'
  },
  {
    path: '**',
    redirectTo: ''
  }
];
