import { getPaintCanvas, getPaintInitialDataUrl, getPaintDataUrl } from './paint.js';
import { askAI, normalizeHex, paintSelectSuggestedColor } from './pallete.js';

let classifier = null;
let doodleInterval = null;
const DOODLE_INTERVAL_MS = 5000;

ml5.imageClassifier('DoodleNet').then(c => {
    classifier = c;
    console.log('DoodleNet ready');
}); 

async function updateDoodleColors() {
    if (!classifier) return;
    if (getPaintInitialDataUrl() === getPaintDataUrl()) return;

    try {
        const results = await classifier.classify(getPaintCanvas());
        const label = results?.[0]?.label;
        if (!label) return;

        console.log('Doodle classified as:', label, `(${Math.floor(results[0].confidence * 100)}%)`);
        document.querySelector('#doodleLabel').textContent = label;

        const raw = await askAI(2, label);
        const colors = raw.split(/[\n,]/)
            .map(c => c.trim())
            .map(normalizeHex)
            .filter(Boolean)
            .slice(0, 2);

        if (colors.length === 0) return;
        renderDoodleColors(colors);
    } catch (err) {
        console.warn('Doodle suggestion failed:', err);
    }
}

function renderDoodleColors(colors) {
    const container = document.querySelector('#doodleOutput');
    if (!container) return;

    container.innerHTML = '';
    colors.forEach(color => {
        const input = document.createElement('input');
        input.type = 'color';
        input.value = color;
        input.dataset.color = color;
        input.title = color;
        input.addEventListener('pointerdown', paintSelectSuggestedColor);
        container.appendChild(input);
    });

    document.querySelector('#doodleColorsHex').textContent = colors.join(', ');
}

export function startDoodleSuggestions() {
    if (doodleInterval) return;
    doodleInterval = setInterval(updateDoodleColors, DOODLE_INTERVAL_MS);
}