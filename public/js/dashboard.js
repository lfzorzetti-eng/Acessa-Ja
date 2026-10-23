import { getIssues, imageUrl } from './api.js';
import { formatCoordinate, formatDateTime, formatMonthDay } from './ui.js';

const VALID_SEVERITIES = new Set(['low', 'medium', 'high']);

const loadingState = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');
const emptyState = document.getElementById('empty-state');
const issueGrid = document.getElementById('issue-grid');
const retryButton = document.getElementById('retry-button');
const statTotal = document.getElementById('stat-total');
const statHigh = document.getElementById('stat-high');
const statLatest = document.getElementById('stat-latest');
const reportCount = document.getElementById('report-count');
const issueTemplate = document.getElementById('issue-card-template');

let loadRequestId = 0;

function setView(view) {
  loadingState.hidden = view !== 'loading';
  errorState.hidden = view !== 'error';
  emptyState.hidden = view !== 'empty';
  issueGrid.hidden = view !== 'list';
}

function updateStats(issues) {
  const highSeverity = issues.filter((issue) => issue.severity === 'high').length;

  statTotal.textContent = String(issues.length);
  statHigh.textContent = String(highSeverity);
  statLatest.textContent = issues.length > 0 ? formatMonthDay(issues[0].createdAt) : '—';
  reportCount.textContent = `${issues.length} ${issues.length === 1 ? 'report' : 'reports'}`;
}

function createIssueCard(issue) {
  const card = issueTemplate.content.firstElementChild.cloneNode(true);
  const severity = VALID_SEVERITIES.has(issue.severity) ? issue.severity : 'low';
  const image = card.querySelector('img');
  const badge = card.querySelector('.severity-badge');

  badge.classList.add(`severity-${severity}`);
  card.querySelector('.severity-label').textContent = severity;

  image.src = imageUrl(issue.id);
  image.alt = issue.classification || 'Reported accessibility barrier';

  card.querySelector('.issue-date').textContent = formatDateTime(issue.createdAt);
  card.querySelector('.issue-title').textContent = issue.classification || 'Accessibility report';
  card.querySelector('.issue-description').textContent = issue.description || '';
  card.querySelector('.issue-coordinates').textContent =
    `${formatCoordinate(issue.latitude, 4)}, ${formatCoordinate(issue.longitude, 4)}`;

  return card;
}

function renderIssues(issues) {
  updateStats(issues);
  issueGrid.replaceChildren();

  if (issues.length === 0) {
    setView('empty');
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const issue of issues) {
    fragment.appendChild(createIssueCard(issue));
  }

  issueGrid.appendChild(fragment);
  setView('list');
}

async function loadIssues() {
  const requestId = ++loadRequestId;

  setView('loading');

  try {
    const issues = await getIssues();

    if (requestId !== loadRequestId) {
      return;
    }

    renderIssues(Array.isArray(issues) ? issues : []);
  } catch (error) {
    if (requestId !== loadRequestId) {
      return;
    }

    console.error('Could not load reports:', error);
    updateStats([]);
    setView('error');
  }
}

retryButton.addEventListener('click', () => {
  loadIssues();
});

setView('loading');
loadIssues();
