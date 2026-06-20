import { getPaintCanvas, getPaintInitialDataUrl, getPaintDataUrl } from './paint.js';
import { askAI, normalizeHex, paintSelectSuggestedColor } from './pallete.js';

// --- Doodle color suggestion com ml5 QuickDraw ---

let classifier = null;
let doodleInterval = null;
const DOODLE_INTERVAL_MS = 5000;

ml5.imageClassifier('DoodleNet').then(c => { // Change to 'DoodleNet' if u want to choose another model
    classifier = c;
    console.log('DoodleNet ready');
});


/* async function updateDoodleColors() {
    if (!classifier) return;
    if (getPaintInitialDataUrl() === getPaintDataUrl()) return;

    try {
        const results = await classifier.classify(getPaintCanvas());
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
        const originalCanvas = getPaintCanvas();

        // 1. Cria uma "janela" quadrada temporária com tamanho fixo e previsível
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 280;
        thumbCanvas.height = 280;
        const thumbCtx = thumbCanvas.getContext('2d');

        // 2. Garante o fundo branco limpo para a IA
        thumbCtx.fillStyle = 'white';
        thumbCtx.fillRect(0, 0, 280, 280);

        // 3. Desenha o canvas original compactado dentro da janela estável
        thumbCtx.drawImage(originalCanvas, 0, 0, 280, 280);

        // 4. Passa o canvas estável diretamente (síncrono, sem lógicas de onload)
        const results = await classifier.classify(thumbCanvas);
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
        console.log('Doodle classified as:', label, `(${Math.floor(results[0].confidence * 100)}%)`);
        renderDoodleColors(colors);
    } catch (err) {
        console.warn('Doodle suggestion failed:', err);
    }
}

/*     
async function updateDoodleColors() {
    if (!classifier) return;
    if (getPaintInitialDataUrl() === getPaintDataUrl()) return;

    try {
        const originalCanvas = getPaintCanvas();
        const w = originalCanvas.width;
        const h = originalCanvas.height;

        // 1. Encontra os limites do desenho (Bounding Box) para focar na flor
        const ctx = originalCanvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, w, h).data;
        
        let minX = w, minY = h, maxX = 0, maxY = 0;
        let hasDrawing = false;

        for (let y = 0; y < h; y += 4) {
            for (let x = 0; x < w; x += 4) {
                const i = (y * w + x) * 4;
                if (imgData[i] < 250 || imgData[i+1] < 250 || imgData[i+2] < 250) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                    hasDrawing = true;
                }
            }
        }

        if (!hasDrawing) return;

        const pad = 20;
        const cropX = Math.max(0, minX - pad);
        const cropY = Math.max(0, minY - pad);
        const cropW = Math.min(w, maxX + pad) - cropX;
        const cropH = Math.min(h, maxY + pad) - cropY;

        // 2. Prepara o canvas da IA
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 280;
        thumbCanvas.height = 280;
        const thumbCtx = thumbCanvas.getContext('2d');

        thumbCtx.fillStyle = 'white';
        thumbCtx.fillRect(0, 0, 280, 280);

        // Filtro agressivo de contraste para funder os traços sobrepostos em preto puro
        thumbCtx.filter = 'grayscale(100%) contrast(1500%)';

        const ratio = Math.min(280 / cropW, 280 / cropH);
        const dWidth = cropW * ratio;
        const dHeight = cropH * ratio;
        const dx = (280 - dWidth) / 2;
        const dy = (280 - dHeight) / 2;

        // --- TRUQUE DA DILATAÇÃO (ENGROSSAR O PINCEL SE VALER 12) ---
        // Desenha a imagem deslocada em espiral para alargar as linhas finas
        const thickness = 4; // Quanto maior este número, mais grosso fica o traço para a IA
        for (let xOffset = -thickness; xOffset <= thickness; xOffset += 2) {
            for (let yOffset = -thickness; yOffset <= thickness; yOffset += 2) {
                thumbCtx.drawImage(
                    originalCanvas, 
                    cropX, cropY, cropW, cropH, 
                    dx + xOffset, dy + yOffset, dWidth, dHeight
                );
            }
        }

        // 3. Converte para imagem limpa (limpa o bug dos 16 canais)
        const tempImg = new Image();
        tempImg.src = thumbCanvas.toDataURL('image/png');
        await new Promise(res => tempImg.onload = res);

        // 4. Classifica o desenho perfeitamente visível
        const results = await classifier.classify(tempImg);
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
} */

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
