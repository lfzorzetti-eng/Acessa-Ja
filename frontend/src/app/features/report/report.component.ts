import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IssueService } from '../../core/services/issue.service';
import { compressImage } from '../../core/utils/image-compression';
import { LocationMapComponent, MapLocation } from './location-map/location-map.component';

@Component({
  selector: 'uar-report',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    LocationMapComponent,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    RouterLink
  ],
  templateUrl: './report.component.html',
  styleUrl: './report.component.scss'
})
export class ReportComponent implements OnInit {
  private readonly issueService = inject(IssueService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private locationRequestId = 0;
  private locationTimeoutId: number | null = null;

  latitude: number | null = null;
  longitude: number | null = null;
  locationError: string | null = null;
  imageDataUrl: string | null = null;
  imageName: string | null = null;
  imageError: string | null = null;
  isLocating = false;
  isReadingImage = false;
  isSubmitting = false;
  isDragging = false;
  prefilledFromMap = false;

  get canSubmit(): boolean {
    return this.latitude !== null &&
      this.longitude !== null &&
      this.imageDataUrl !== null &&
      !this.isSubmitting;
  }

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const lat = Number(params.get('lat'));
    const lng = Number(params.get('lng'));

    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      this.latitude = lat;
      this.longitude = lng;
      this.prefilledFromMap = true;
      this.changeDetector.markForCheck();
    }
  }

  captureLocation(): void {
    this.locationError = null;

    if (!navigator.geolocation) {
      this.locationError = 'Os serviços de localização não estão disponíveis neste navegador.';
      return;
    }

    this.clearLocationTimeout();
    const requestId = ++this.locationRequestId;
    this.isLocating = true;
    this.locationTimeoutId = window.setTimeout(() => {
      if (requestId !== this.locationRequestId) {
        return;
      }

      this.locationRequestId += 1;
      this.locationTimeoutId = null;
      this.isLocating = false;
      this.locationError = 'A solicitação de localização expirou. Verifique a permissão do navegador e tente novamente.';
      this.changeDetector.markForCheck();
    }, 15000);

    navigator.geolocation.getCurrentPosition(
      position => {
        if (requestId !== this.locationRequestId) {
          return;
        }

        this.clearLocationTimeout();
        this.latitude = position.coords.latitude;
        this.longitude = position.coords.longitude;
        this.prefilledFromMap = false;
        this.locationError = null;
        this.isLocating = false;
        this.changeDetector.markForCheck();
      },
      error => {
        if (requestId !== this.locationRequestId) {
          return;
        }

        this.clearLocationTimeout();
        this.locationError = this.getLocationError(error.code);
        this.isLocating = false;
        this.changeDetector.markForCheck();
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000
      }
    );
  }

  onMapLocationChange(location: MapLocation): void {
    this.latitude = location.latitude;
    this.longitude = location.longitude;
    this.prefilledFromMap = false;
    this.locationError = null;
    this.changeDetector.markForCheck();
  }

  selectImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (file) {
      this.readImage(file, input);
    } else {
      this.imageError = null;
    }
  }

  onDragOver(event: DragEvent): void {
    if (!event.dataTransfer || !Array.from(event.dataTransfer.types).includes('Files')) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    this.isDragging = true;
    this.changeDetector.markForCheck();
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    this.changeDetector.markForCheck();
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;

    const file = event.dataTransfer?.files?.[0];

    if (file) {
      this.readImage(file);
    } else {
      this.changeDetector.markForCheck();
    }
  }

  private readImage(file: File, input?: HTMLInputElement): void {
    this.imageError = null;

    if (this.isReadingImage || this.isSubmitting) {
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    if (!allowedTypes.includes(file.type)) {
      this.imageError = 'Escolha uma imagem JPEG, PNG, WEBP ou GIF.';
      if (input) {
        input.value = '';
      }
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      this.imageError = 'Escolha uma imagem menor que 20 MB.';
      if (input) {
        input.value = '';
      }
      return;
    }

    this.isReadingImage = true;

    compressImage(file)
      .then(({ dataUrl }) => {
        this.imageDataUrl = dataUrl;
        this.imageName = file.name;
        this.isReadingImage = false;
        this.changeDetector.markForCheck();
      })
      .catch(() => {
        this.imageError = 'Não foi possível processar a imagem. Escolha outra.';
        this.isReadingImage = false;
        this.changeDetector.markForCheck();
        if (input) {
          input.value = '';
        }
      });
  }

  submitReport(): void {
    if (!this.canSubmit || this.latitude === null || this.longitude === null || !this.imageDataUrl) {
      return;
    }

    this.isSubmitting = true;
    this.issueService.createIssue({
      latitude: this.latitude,
      longitude: this.longitude,
      imageBase64: this.imageDataUrl
    }).subscribe({
      next: issue => {
        this.isSubmitting = false;
        this.imageDataUrl = null;
        this.imageName = null;
        this.changeDetector.markForCheck();
        this.snackBar.open('Relato adicionado ao radar.', 'Ver no mapa', {
          duration: 5500,
          panelClass: ['success-snackbar']
        }).onAction().subscribe(() => {
          void this.router.navigate(['/'], { queryParams: { focus: issue.id } });
        });
      },
      error: (error: unknown) => {
        this.isSubmitting = false;
        this.changeDetector.markForCheck();
        this.snackBar.open(this.getSubmissionError(error), 'Fechar', {
          duration: 6000,
          panelClass: ['error-snackbar']
        });
      }
    });
  }

  private clearLocationTimeout(): void {
    if (this.locationTimeoutId !== null) {
      window.clearTimeout(this.locationTimeoutId);
      this.locationTimeoutId = null;
    }
  }

  private getLocationError(code: number): string {
    if (code === 1) {
      return 'Permita o acesso à localização nas configurações do navegador e tente novamente.';
    }

    if (code === 3) {
      return 'A localização demorou muito para carregar. Tente novamente em alguns instantes.';
    }

    return 'Não foi possível encontrar sua localização. Verifique as configurações do dispositivo e tente novamente.';
  }

  private getSubmissionError(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 413) {
      return 'A imagem é grande demais para o servidor. Tente outra foto.';
    }

    if (error instanceof HttpErrorResponse && error.status === 503) {
      return 'A análise de imagem não está configurada. Defina OPENAI_API_KEY no ambiente da API e tente novamente.';
    }

    if (error instanceof HttpErrorResponse && error.status === 502) {
      return 'A análise de imagem falhou. Verifique a conexão com o provedor de IA e tente novamente.';
    }

    if (error instanceof HttpErrorResponse && error.status === 504) {
      return 'A análise de imagem demorou demais. Tente novamente em alguns instantes.';
    }

    if (error instanceof HttpErrorResponse && error.status === 400) {
      return 'Os dados do relato foram recusados. Verifique o local e a foto e tente novamente.';
    }

    if (error instanceof HttpErrorResponse && error.status === 0) {
      return 'Não foi possível acessar a API. Verifique se o servidor está no ar.';
    }

    return 'Não foi possível salvar o relato. Verifique a conexão e tente novamente.';
  }
}
