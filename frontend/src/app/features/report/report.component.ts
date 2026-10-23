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
      this.locationError = 'Location services are not available in this browser.';
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
      this.locationError = 'Location request timed out. Check browser permission and try again.';
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
      this.imageError = 'Choose a JPEG, PNG, WEBP, or GIF image.';
      if (input) {
        input.value = '';
      }
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      this.imageError = 'Choose an image smaller than 20 MB.';
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
        this.imageError = 'The image could not be processed. Choose another one.';
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
        this.snackBar.open('Report added to the radar.', 'View on map', {
          duration: 5500,
          panelClass: ['success-snackbar']
        }).onAction().subscribe(() => {
          void this.router.navigate(['/'], { queryParams: { focus: issue.id } });
        });
      },
      error: (error: unknown) => {
        this.isSubmitting = false;
        this.changeDetector.markForCheck();
        this.snackBar.open(this.getSubmissionError(error), 'Close', {
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
      return 'Allow location access in your browser settings, then try again.';
    }

    if (code === 3) {
      return 'Location took too long to load. Try again in a moment.';
    }

    return 'Your location could not be found. Check your device settings and try again.';
  }

  private getSubmissionError(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 413) {
      return 'The image is too large for the server. Try another photo.';
    }

    if (error instanceof HttpErrorResponse && error.status === 503) {
      return 'Image analysis is not configured. Set OPENAI_API_KEY in the API environment and try again.';
    }

    if (error instanceof HttpErrorResponse && error.status === 502) {
      return 'Image analysis failed. Check the AI provider connection and try again.';
    }

    if (error instanceof HttpErrorResponse && error.status === 504) {
      return 'Image analysis timed out. Try again in a moment.';
    }

    if (error instanceof HttpErrorResponse && error.status === 400) {
      return 'The report data was rejected. Check the location and photo, then try again.';
    }

    if (error instanceof HttpErrorResponse && error.status === 0) {
      return 'The API could not be reached. Check that the backend is running.';
    }

    return 'The report could not be saved. Check the connection and try again.';
  }
}
