import { ApiError, createIssue } from './api.js';
import { compressImage } from './compress-image.js';
import { formatCoordinate, showToast } from './ui.js';

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const LOCATION_TIMEOUT_MS = 15_000;

const form = document.getElementById('report-form');
const locationPanel = document.getElementById('location-panel');
const locationSymbolIcon = document.getElementById('location-symbol-icon');
const locationTitle = document.getElementById('location-title');
const locationDetails = document.getElementById('location-details');
const locationButton = document.getElementById('location-button');
const locationSpinner = document.getElementById('location-spinner');
const locationIcon = document.getElementById('location-icon');
const locationButtonLabel = document.getElementById('location-button-label');
const locationError = document.getElementById('location-error');

const imageInput = document.getElementById('image-input');
const uploadZone = document.getElementById('upload-zone');
const imagePreview = document.getElementById('image-preview');
const uploadPlaceholder = document.getElementById('upload-placeholder');
const uploadStrong = document.getElementById('upload-strong');
const chooseImageButton = document.getElementById('choose-image-button');
const chooseImageIcon = document.getElementById('choose-image-icon');
const chooseImageLabel = document.getElementById('choose-image-label');
const selectedFile = document.getElementById('selected-file');
const selectedFileName = document.getElementById('selected-file-name');
const imageError = document.getElementById('image-error');

const submitButton = document.getElementById('submit-button');
const submitSpinner = document.getElementById('submit-spinner');
const submitIcon = document.getElementById('submit-icon');
const submitLabel = document.getElementById('submit-label');
const submitHint = document.getElementById('submit-hint');

const state = {
  latitude: null,
  longitude: null,
  imageDataUrl: null,
  imageName: null,
  isLocating: false,
  isReadingImage: false,
  isSubmitting: false,
};

let locationRequestId = 0;
let locationTimeoutId = null;

function hasLocation() {
  return state.latitude !== null && state.longitude !== null;
}

function canSubmit() {
  return hasLocation() && Boolean(state.imageDataUrl) && !state.isSubmitting;
}

function setLocationError(message) {
  locationError.textContent = message ?? '';
  locationError.hidden = !message;
}

function setImageError(message) {
  imageError.textContent = message ?? '';
  imageError.hidden = !message;
}

function updateUi() {
  const located = hasLocation();

  locationPanel.classList.toggle('location-ready', located);
  locationSymbolIcon.textContent = located ? 'check' : 'location_searching';
  locationTitle.textContent = located ? 'Location captured' : 'No location selected';
  locationDetails.textContent = located
    ? `${formatCoordinate(state.latitude, 5)}, ${formatCoordinate(state.longitude, 5)}`
    : 'Your coordinates stay attached to this report.';

  locationButton.disabled = state.isLocating || state.isSubmitting;
  locationSpinner.hidden = !state.isLocating;
  locationIcon.hidden = state.isLocating;
  locationButtonLabel.textContent = state.isLocating
    ? 'Finding you'
    : located
      ? 'Refresh'
      : 'Use my location';

  const hasImage = Boolean(state.imageDataUrl);

  uploadZone.classList.toggle('has-image', hasImage);
  imagePreview.hidden = !hasImage;
  uploadPlaceholder.hidden = hasImage;

  if (hasImage) {
    if (imagePreview.getAttribute('src') !== state.imageDataUrl) {
      imagePreview.src = state.imageDataUrl;
    }
  } else {
    imagePreview.removeAttribute('src');
  }

  uploadStrong.textContent = state.isReadingImage ? 'Loading photo…' : 'Drop a photo here';
  chooseImageButton.disabled = state.isReadingImage || state.isSubmitting;
  chooseImageIcon.textContent = hasImage ? 'change_circle' : 'photo_library';
  chooseImageLabel.textContent = hasImage ? 'Change photo' : 'Choose photo';
  selectedFile.hidden = !state.imageName;
  selectedFileName.textContent = state.imageName ?? '';

  submitButton.disabled = !canSubmit();
  submitSpinner.hidden = !state.isSubmitting;
  submitIcon.hidden = state.isSubmitting;
  submitLabel.textContent = state.isSubmitting
    ? 'Analyzing and saving'
    : 'Send accessibility report';
  submitHint.hidden = canSubmit() || state.isSubmitting;
}

function clearLocationTimeout() {
  if (locationTimeoutId !== null) {
    window.clearTimeout(locationTimeoutId);
    locationTimeoutId = null;
  }
}

function getLocationErrorMessage(code) {
  if (code === 1) {
    return 'Allow location access in your browser settings, then try again.';
  }

  if (code === 3) {
    return 'Location took too long to load. Try again in a moment.';
  }

  return 'Your location could not be found. Check your device settings and try again.';
}

function captureLocation() {
  setLocationError(null);

  if (!('geolocation' in navigator)) {
    setLocationError('Location services are not available in this browser.');
    return;
  }

  clearLocationTimeout();

  const requestId = ++locationRequestId;
  state.isLocating = true;
  updateUi();

  locationTimeoutId = window.setTimeout(() => {
    if (requestId !== locationRequestId) {
      return;
    }

    locationRequestId += 1;
    locationTimeoutId = null;
    state.isLocating = false;
    setLocationError('Location request timed out. Check browser permission and try again.');
    updateUi();
  }, LOCATION_TIMEOUT_MS);

  navigator.geolocation.getCurrentPosition(
    (position) => {
      if (requestId !== locationRequestId) {
        return;
      }

      clearLocationTimeout();
      state.latitude = position.coords.latitude;
      state.longitude = position.coords.longitude;
      state.isLocating = false;
      setLocationError(null);
      updateUi();
    },
    (error) => {
      if (requestId !== locationRequestId) {
        return;
      }

      clearLocationTimeout();
      state.isLocating = false;
      setLocationError(getLocationErrorMessage(error.code));
      updateUi();
    },
    {
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 60_000,
    },
  );
}

async function handleImageFile(file) {
  setImageError(null);

  if (!file || state.isReadingImage || state.isSubmitting) {
    return;
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    setImageError('Choose a JPEG, PNG, WEBP, or GIF image.');
    imageInput.value = '';
    return;
  }

  if (file.size > MAX_SOURCE_BYTES) {
    setImageError('Choose an image smaller than 20 MB.');
    imageInput.value = '';
    return;
  }

  state.isReadingImage = true;
  updateUi();

  try {
    const { dataUrl } = await compressImage(file);
    state.imageDataUrl = dataUrl;
    state.imageName = file.name;
  } catch {
    setImageError('The image could not be processed. Choose another one.');
    imageInput.value = '';
  } finally {
    state.isReadingImage = false;
    updateUi();
  }
}

function getSubmissionErrorMessage(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return 'The analysis took too long. Try again in a moment.';
  }

  if (error instanceof ApiError) {
    if (error.status === 413) {
      return 'The image is too large for the server. Try another photo.';
    }

    if (error.status === 503) {
      return 'Image analysis is not configured. Set OPENAI_API_KEY in the API environment and try again.';
    }

    if (error.status === 502) {
      return 'Image analysis failed. Check the AI provider connection and try again.';
    }

    if (error.status === 504) {
      return 'Image analysis timed out. Try again in a moment.';
    }

    if (error.status === 400) {
      return 'The report data was rejected. Check the location and photo, then try again.';
    }
  }

  if (error instanceof TypeError) {
    return 'The API could not be reached. Check that the backend is running.';
  }

  return 'The report could not be saved. Check the connection and try again.';
}

async function submitReport(event) {
  event.preventDefault();

  if (!canSubmit() || state.latitude === null || state.longitude === null) {
    return;
  }

  state.isSubmitting = true;
  updateUi();

  try {
    await createIssue({
      latitude: state.latitude,
      longitude: state.longitude,
      imageBase64: state.imageDataUrl,
    });

    state.imageDataUrl = null;
    state.imageName = null;
    imageInput.value = '';
    setImageError(null);
    showToast('Report added to the radar.', 'success');
  } catch (error) {
    console.error('Could not submit report:', error);
    showToast(getSubmissionErrorMessage(error), 'error');
  } finally {
    state.isSubmitting = false;
    updateUi();
  }
}

function isFileDrag(event) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

let dragDepth = 0;

locationButton.addEventListener('click', captureLocation);
chooseImageButton.addEventListener('click', () => {
  imageInput.click();
});
imageInput.addEventListener('change', (event) => {
  const file = event.target.files?.[0];

  if (file) {
    handleImageFile(file);
  } else {
    setImageError(null);
  }
});

uploadZone.addEventListener('dragenter', (event) => {
  if (!isFileDrag(event)) {
    return;
  }

  event.preventDefault();
  dragDepth += 1;
  uploadZone.classList.add('is-dragging');
});
uploadZone.addEventListener('dragover', (event) => {
  if (!isFileDrag(event)) {
    return;
  }

  event.preventDefault();

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy';
  }
});
uploadZone.addEventListener('dragleave', (event) => {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);

  if (dragDepth === 0) {
    uploadZone.classList.remove('is-dragging');
  }
});
uploadZone.addEventListener('drop', (event) => {
  event.preventDefault();
  dragDepth = 0;
  uploadZone.classList.remove('is-dragging');

  const file = event.dataTransfer?.files?.[0];

  if (file) {
    handleImageFile(file);
  }
});

form.addEventListener('submit', submitReport);

updateUi();
