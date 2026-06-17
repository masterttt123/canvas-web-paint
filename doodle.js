import { getPaintCanvas, getPaintInitialDataUrl, getPaintDataUrl } from './paint.js';
import { askAI, normalizeHex, paintSelectSuggestedColor } from './pallete.js';

// --- Doodle color suggestion com ml5 QuickDraw ---

let classifier = null;
let doodleInterval = null;
const DOODLE_INTERVAL_MS = 5000;

ml5.imageClassifier('MobileNet').then(c => { // Change to 'DoodleNet' if u want to choose another model
    classifier = c;
    console.log('DoodleNet ready');
});

function getGrayscaleCanvas() {
    const offscreen = document.createElement('canvas');
    offscreen.width = 28;
    offscreen.height = 28;
    const ctx = offscreen.getContext('2d', { willReadFrequently: true });

    // fundo preto (como o QuickDraw foi treinado)
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, 28, 28);

    // inverte as cores ao desenhar: traço branco sobre fundo preto
    ctx.globalCompositeOperation = 'difference';
    ctx.drawImage(getPaintCanvas(), 0, 0, 28, 28);
    ctx.globalCompositeOperation = 'source-over';

    // converte para grayscale de 1 canal via imageData
    const imageData = ctx.getImageData(0, 0, 28, 28);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        const avg = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = data[i + 1] = data[i + 2] = avg;
        data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);

    return offscreen;
}


/* 
// version for doodlenet, not the mobilenet
async function updateDoodleColors() {
    if (!classifier) return;
    if (getPaintInitialDataUrl() === getPaintDataUrl()) return;

    try {
        const grayscaleCanvas = getGrayscaleCanvas();
        const results = await classifier.classify(grayscaleCanvas);
        const label = results?.[0]?.label;
        if (!label) return;

        console.log('Doodle classified as:', label);
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
} */

async function updateDoodleColors() {

    if (!classifier) return;
    if (getPaintInitialDataUrl() === getPaintDataUrl()) return;

    try {
        const results = await classifier.classify(getPaintCanvas());
        if (!results || !results.length) return;
        const label = results[0].label;
        console.log('Detected:', label);
        document.querySelector('#doodleLabel').textContent = label;

        // 2 cores fixas para o doodle
        const raw = await askAI(2, label);

        const colors = raw
            .split(/[\n,]/)
            .map(c => c.trim())
            .map(normalizeHex)
            .filter(Boolean)
            .slice(0, 2);

        if (!colors.length) return;
        renderDoodleColors(colors);

    } catch (err) {
        console.warn('Classification failed:', err);
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
