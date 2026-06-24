import { getPaintCanvas, getPaintInitialDataUrl, getPaintDataUrl } from './paint.js';
import { askAI, normalizeHex, paintSelectSuggestedColor } from './pallete.js';

let classifier = null;
let doodleTimeout = null; // Substitui o interval por um temporizador dinâmico (Debounce)
let lastLabel = '';  
const DEBOUNCE_DELAY_MS = 300; // 0.3 segundos de espera após largar o pincel
let lastWebcamLabel = '';

ml5.imageClassifier('DoodleNet').then(c => {
    classifier = c;
    console.log('DoodleNet ready');

    startWebcamDoodleLoop();
});

export async function updateDoodleColors() {
    if (!classifier) return;
    if (getPaintInitialDataUrl() === getPaintDataUrl()) return;

    try {
        const results = await classifier.classify(getPaintCanvas());
        const label = results?.[0]?.label;
        if (!label) return;

        const confidence = Math.floor(results[0].confidence * 100);
        console.log('Doodle classified as:', label, `(${confidence}%)`);
        
        document.querySelector('#doodleLabel').textContent = `${label} (${confidence}%)`;

        if (label === lastLabel) {
            console.log(`Log: The label "${label}" did not change. askAI call skipped.`);
            return;
        }

        lastLabel = label;

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
    clearTimeout(doodleTimeout);
    doodleTimeout = setTimeout(updateDoodleColors, DEBOUNCE_DELAY_MS);
}

function startWebcamDoodleLoop() {
    setInterval(async () => {
        if (!classifier) return;

        const webcamEl = document.querySelector('#paintWebcam');
        
        // Se a webcam não estiver ativa
        if (!webcamEl || !webcamEl.srcObject || webcamEl.style.display === 'none') {
            return;
        }

        try {
            const results = await classifier.classify(webcamEl);
            const label = results?.[0]?.label;
            if (!label) return;

            const confidence = Math.floor(results[0].confidence * 100);
            
            const labelEl = document.querySelector('#doodleLabel2');
            labelEl.textContent = `${label} (${confidence}%)`;

            if (label === lastWebcamLabel) {
                console.log(`Log: The label webcam "${label}" did not change. askAI call skipped.`);
                return;
            }

            lastWebcamLabel = label;

            const raw = await askAI(2, label);
            const colors = raw.split(/[\n,]/)
                .map(c => c.trim())
                .map(normalizeHex)
                .filter(Boolean)
                .slice(0, 2);

            if (colors.length === 0) return;
            renderWebcamColors(colors);

        } catch (err) {
            console.warn('Falha ao processar frame da webcam:', err);
        }
    }, 2000); // 2 sec
}

function renderWebcamColors(colors) {
    let container = document.querySelector('#webcamDoodleOutput');
    if (!container) {
        container = document.createElement('div');
        container.id = 'webcamDoodleOutput';
        container.style.marginTop = '8px';
        
        const labelCon = document.querySelector('#paintWebcamCon');
        if (labelCon) {
            labelCon.appendChild(container);
        }
    }

    container.innerHTML = '';
    colors.forEach(color => {
        const input = document.createElement('input');
        input.type = 'color';
        input.value = color;
        input.dataset.color = color;
        input.title = color;
        input.style.margin = '0 4px';
        input.style.cursor = 'pointer';
        
        // Reutiliza a tua função para pintar com a cor sugerida ao clicar!
        input.addEventListener('pointerdown', paintSelectSuggestedColor);
        container.appendChild(input);
    });
}