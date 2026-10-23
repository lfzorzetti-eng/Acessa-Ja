let toastTimer = null;

export function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');

  if (!toast) {
    return;
  }

  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('toast-error', type === 'error');
  toast.classList.add('is-visible');

  toastTimer = window.setTimeout(
    () => {
      toast.classList.remove('is-visible');
    },
    type === 'error' ? 6000 : 4500,
  );
}

const dateFormatter = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('en', {
  hour: 'numeric',
  minute: '2-digit',
});

const monthDayFormatter = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
});

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value) {
  const date = toDate(value);

  if (!date) {
    return '—';
  }

  return `${dateFormatter.format(date)} · ${timeFormatter.format(date)}`;
}

export function formatMonthDay(value) {
  const date = toDate(value);
  return date ? monthDayFormatter.format(date) : '—';
}

export function formatCoordinate(value, digits = 4) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : '—';
}
