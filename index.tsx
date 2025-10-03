/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {GoogleGenAI} from '@google/genai';

// --- History Feature ---
const HISTORY_KEY = 'imageGenerationHistory';
const MAX_HISTORY_ITEMS = 30; // Limit history size

interface HistoryItem {
  id: string;
  prompt: string;
  imageUrl: string;
  timestamp: number;
}

// Fix: Define and use AIStudio interface for window.aistudio to resolve type conflict.
// Define the aistudio property on the window object for TypeScript
declare global {
  interface AIStudio {
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

async function openApiKeyDialog() {
  if (window.aistudio?.openSelectKey) {
    await window.aistudio.openSelectKey();
  } else {
    // This provides a fallback for environments where the dialog isn't available
    showStatusError(
      'API key selection is not available. Please configure the API_KEY environment variable.',
    );
  }
}

const statusEl = document.querySelector('#status') as HTMLDivElement;

async function generateImage(
  prompt: string,
  apiKey: string,
  aspectRatio: string,
) {
  const ai = new GoogleGenAI({apiKey});

  const config: {aspectRatio?: string} = {};
  if (aspectRatio) {
    config.aspectRatio = aspectRatio;
  }

  const response = await ai.models.generateImages({
    model: 'imagen-4.0-generate-001',
    prompt,
    config,
  });

  const images = response.generatedImages;
  if (images === undefined || images.length === 0) {
    throw new Error(
      'No images were generated. The prompt may have been blocked.',
    );
  }

  const base64ImageBytes = images[0].image.imageBytes;
  const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
  outputImage.src = imageUrl;
  outputImage.style.display = 'block';
}

// --- DOM Element Selection ---
const promptEl = document.querySelector('#prompt-input') as HTMLTextAreaElement;
const negativePromptEl = document.querySelector(
  '#negative-prompt-input',
) as HTMLTextAreaElement;
const generateButton = document.querySelector(
  '#generate-button',
) as HTMLButtonElement;
const downloadButton = document.querySelector(
  '#download-button',
) as HTMLButtonElement;
const outputImage = document.querySelector('#output-image') as HTMLImageElement;
const aspectRatioSelect = document.querySelector(
  '#aspect-ratio-select',
) as HTMLSelectElement;
const qualityPresetSelect = document.querySelector(
  '#quality-preset-select',
) as HTMLSelectElement;
const cameraViewSelect = document.querySelector(
  '#camera-view-select',
) as HTMLSelectElement;
const historyContainer = document.querySelector(
  '#history-container',
) as HTMLDivElement;
const historyGrid = document.querySelector('#history-grid') as HTMLDivElement;
const clearHistoryButton = document.querySelector(
  '#clear-history-button',
) as HTMLButtonElement;

// --- State Variables ---
let prompt = '';
let negativePrompt = '';
let aspectRatio = '16:9';
let qualityPreset = 'ultra';
let cameraView = 'default';

// --- Event Listeners ---
promptEl.addEventListener('input', () => {
  prompt = promptEl.value;
});

negativePromptEl.addEventListener('input', () => {
  negativePrompt = negativePromptEl.value;
});

aspectRatioSelect.addEventListener('change', () => {
  aspectRatio = aspectRatioSelect.value;
});

qualityPresetSelect.addEventListener('change', () => {
  qualityPreset = qualityPresetSelect.value;
});

cameraViewSelect.addEventListener('change', () => {
  cameraView = cameraViewSelect.value;
});

generateButton.addEventListener('click', () => {
  if (!prompt.trim()) {
    showStatusError('Please enter a prompt to generate an image.');
    return;
  }
  generate();
});

downloadButton.addEventListener('click', () => {
  if (!outputImage.src || outputImage.style.display === 'none') {
    return;
  }
  const link = document.createElement('a');
  link.href = outputImage.src;
  // Sanitize prompt for a safe filename
  const safePrompt =
    promptEl.value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-') || 'generated-image';
  const filename = `${safePrompt.slice(0, 50)}.jpeg`;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

clearHistoryButton.addEventListener('click', () => {
  // Use a confirmation dialog before clearing
  if (
    window.confirm('Are you sure you want to clear your generation history?')
  ) {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  }
});

// --- Functions ---
function showStatusError(message: string) {
  statusEl.innerHTML = `<span class="text-red-400">${message}</span>`;
}

function setControlsDisabled(disabled: boolean) {
  generateButton.disabled = disabled;
  promptEl.disabled = disabled;
  negativePromptEl.disabled = disabled;
  aspectRatioSelect.disabled = disabled;
  qualityPresetSelect.disabled = disabled;
  cameraViewSelect.disabled = disabled;
}

async function generate() {
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    showStatusError('API key is not configured. Please add your API key.');
    await openApiKeyDialog();
    return;
  }

  statusEl.innerText = 'Generating image...';
  outputImage.style.display = 'none';
  downloadButton.disabled = true;
  setControlsDisabled(true);

  try {
    const commonKeywords = [
      'photorealistic',
      'film still',
      'movie scene',
      'fit prompt',
      'no distortion',
      'no deformations',
      'no text overlays',
    ].join(', ');

    let qualityKeywords = '';
    switch (qualityPreset) {
      case 'sd':
        qualityKeywords =
          '720p resolution, standard quality, sharp focus, basic detail';
        break;
      case 'hd':
        qualityKeywords =
          '1080p, Full HD resolution, high quality, high detail, realistic look';
        break;
      case 'ultra':
        qualityKeywords =
          '4K+, ultra realistic, shot on ARRI ALEXA LF, Anamorphic Lenses, High Contrast, Gritty Film Grain, Shallow Depth of Field, extreme atmospheric realism, deep blacks (Chiaroscuro)';
        break;
    }

    let cameraViewPrompt = '';
    if (cameraView !== 'default') {
      cameraViewPrompt = `, Shot from a ${cameraView.replace(/-/g, ' ')} perspective`;
    }

    let finalPrompt = `${prompt}${cameraViewPrompt}, ${qualityKeywords}, ${commonKeywords}`;
    if (negativePrompt.trim()) {
      finalPrompt += `. Negative prompt: ${negativePrompt.trim()}`;
    }

    await generateImage(finalPrompt, apiKey, aspectRatio);
    statusEl.innerText = 'Image generated successfully.';
    downloadButton.disabled = false;

    // Add to history
    const newHistoryItem: HistoryItem = {
      id: self.crypto.randomUUID(),
      prompt: finalPrompt,
      imageUrl: outputImage.src,
      timestamp: Date.now(),
    };
    addToHistory(newHistoryItem);
    renderHistory();
  } catch (e) {
    console.error('Image generation/editing failed:', e);
    const errorMessage =
      e instanceof Error ? e.message : 'An unknown error occurred.';

    let userFriendlyMessage = `Error: ${errorMessage}`;
    let shouldOpenDialog = false;

    if (typeof errorMessage === 'string') {
      if (errorMessage.includes('Requested entity was not found.')) {
        userFriendlyMessage =
          'Model not found. This can be caused by an invalid API key or permission issues. Please check your API key.';
        shouldOpenDialog = true;
      } else if (
        errorMessage.includes('API_KEY_INVALID') ||
        errorMessage.includes('API key not valid') ||
        errorMessage.toLowerCase().includes('permission denied')
      ) {
        userFriendlyMessage =
          'Your API key is invalid. Please add a valid API key.';
        shouldOpenDialog = true;
      }
    }

    showStatusError(userFriendlyMessage);

    if (shouldOpenDialog) {
      await openApiKeyDialog();
    }
  } finally {
    setControlsDisabled(false);
  }
}

// --- History Functions ---
function getHistory(): HistoryItem[] {
  const historyJson = localStorage.getItem(HISTORY_KEY);
  if (!historyJson) {
    return [];
  }
  try {
    return JSON.parse(historyJson);
  } catch (e) {
    console.error('Failed to parse history from localStorage', e);
    return [];
  }
}

function saveHistory(history: HistoryItem[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function addToHistory(item: HistoryItem) {
  let history = getHistory();
  // Prepend new item to show it first
  history.unshift(item);
  // Enforce max history size
  if (history.length > MAX_HISTORY_ITEMS) {
    history = history.slice(0, MAX_HISTORY_ITEMS);
  }
  saveHistory(history);
}

function renderHistory() {
  const history = getHistory();

  if (history.length === 0) {
    historyContainer.classList.add('hidden');
    return;
  }

  historyContainer.classList.remove('hidden');
  historyGrid.innerHTML = ''; // Clear previous items to prevent duplication

  history.forEach(item => {
    const historyItemEl = document.createElement('div');
    historyItemEl.className = 'history-item';
    historyItemEl.setAttribute('aria-label', 'View generated image and prompt');
    historyItemEl.setAttribute('role', 'button');
    historyItemEl.tabIndex = 0;

    const imgEl = document.createElement('img');
    imgEl.src = item.imageUrl;
    imgEl.alt = item.prompt;
    imgEl.className = 'history-thumbnail';
    imgEl.loading = 'lazy';

    const overlayEl = document.createElement('div');
    overlayEl.className = 'history-overlay';

    const copyButton = document.createElement('button');
    copyButton.className = 'copy-prompt-button';
    copyButton.textContent = 'Copy';
    copyButton.setAttribute('aria-label', 'Copy prompt to clipboard');

    copyButton.addEventListener('click', e => {
      e.stopPropagation(); // Prevent triggering the image view
      navigator.clipboard
        .writeText(item.prompt)
        .then(() => {
          copyButton.textContent = 'Copied!';
          setTimeout(() => {
            copyButton.textContent = 'Copy';
          }, 1500);
        })
        .catch(err => {
          console.error('Failed to copy prompt:', err);
        });
    });

    overlayEl.appendChild(copyButton);
    historyItemEl.appendChild(imgEl);
    historyItemEl.appendChild(overlayEl);

    // Event listener for the whole item
    historyItemEl.addEventListener('click', () => {
      outputImage.src = item.imageUrl;
      outputImage.style.display = 'block';
      downloadButton.disabled = false;
      // To re-create the original inputs is complex, so we'll just restore the main prompt
      const mainPrompt = item.prompt.split(', photorealistic')[0];
      promptEl.value = mainPrompt;
      prompt = mainPrompt;
      // Scroll to the top to see the restored image
      window.scrollTo({top: 0, behavior: 'smooth'});
    });

    // Add keyboard accessibility
    historyItemEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        historyItemEl.click();
      }
    });

    historyGrid.appendChild(historyItemEl);
  });
}

// --- Initial Load ---
renderHistory();
downloadButton.disabled = true;
