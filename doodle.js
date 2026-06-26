import { getPaintCanvas, getPaintInitialDataUrl, getPaintDataUrl } from './paint.js';
import { askAI, normalizeHex, paintSelectSuggestedColor } from './pallete.js';

let classifier = null;
let doodleTimeout = null; // Substitui o interval por um temporizador dinâmico (Debounce)
let lastLabel = '';  
const DEBOUNCE_DELAY_MS = 300; // 0.3 segundos de espera após largar o pincel
let lastWebcamLabel = '';
let p5WebcamInstance = null;

ml5.imageClassifier('DoodleNet').then(c => {
    classifier = c;
    console.log('DoodleNet ready');

    initP5WebcamLoop();
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

    // document.querySelector('#doodleColorsHex').textContent = colors.join(', ');
}

export function startDoodleSuggestions() {
    clearTimeout(doodleTimeout);
    doodleTimeout = setTimeout(updateDoodleColors, DEBOUNCE_DELAY_MS);
}


function initP5WebcamLoop() {
    const webcamSketch = (p) => {
        let p5Canvas;
        let lastClassifyTime = 0;

        p.setup = () => {
            p5Canvas = p.createCanvas(500/2, 384/2);
            p5Canvas.parent('paintWebcamCon'); 
        };

        p.draw = () => {
            const webcamEl = document.querySelector('#paintWebcam');
            
            if (!webcamEl || !webcamEl.srcObject || webcamEl.style.display === 'none') {
                p.clear();
                return;
            }

            // Remove original webcam 
            if (webcamEl.style.opacity !== '0') {
                webcamEl.style.position = 'absolute';
                webcamEl.style.opacity = '0';
                webcamEl.style.pointerEvents = 'none';
            }

            p.background(255);

            const videoW = webcamEl.videoWidth;
            const videoH = webcamEl.videoHeight;

            // 2. Algoritmo manual de "Object-Fit: Cover" para manter o rácio 1000x768 perfeito sem achatar
            const videoRatio = videoW / videoH;
            const targetRatio = p.width / p.height;
            
            let sx = 0, sy = 0, sw = videoW, sh = videoH;

            if (videoRatio > targetRatio) {
                sw = videoH * targetRatio;
                sx = (videoW - sw) / 2;
            } else {
                sh = videoW / targetRatio;
                sy = (videoH - sh) / 2;
            }

            // 3. Desenha o frame da câmara invertido (efeito espelho igual ao MS Paint)
            p.push();
            p.translate(p.width, 0);
            p.scale(-1, 1);
            p.drawingContext.drawImage(webcamEl, sx, sy, sw, sh, 0, 0, p.width, p.height);
            p.pop();

            // 4. 🔥 Filtro Threshold nativo do p5.js aplicado em tempo real no ecrã e nos dados
            p.filter(p.THRESHOLD, 0.65);

            // 2 sec
            let currentTime = p.millis();
            if (currentTime - lastClassifyTime > 2000) {
                lastClassifyTime = currentTime;
                executarClassificacaoWebcam(p5Canvas.elt);
            }
        };

        // Função interna para rodar a IA do ml5 usando o canvas gerado pelo p5
        async function executarClassificacaoWebcam(canvasElement) {
            if (!classifier) return;

            try {
                const results = await classifier.classify(canvasElement);
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
                console.warn('Falha ao processar frame da webcam no loop do p5:', err);
            }
        }
    };

    p5WebcamInstance = new p5(webcamSketch);
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
        
        input.addEventListener('pointerdown', paintSelectSuggestedColor);
        container.appendChild(input);
    });
}