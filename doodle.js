import { getPaintCanvas, getPaintInitialDataUrl, getPaintDataUrl } from './paint.js';
import { askAI, normalizeHex, paintSelectSuggestedColor } from './pallete.js';

let classifier = null;
let doodleTimeout = null; // Substitui o interval por um temporizador dinâmico (Debounce)
let lastLabel = '';       // Guarda a última categoria para evitar chamadas duplicadas à IA
const DEBOUNCE_DELAY_MS = 300; // 0.3 segundos de espera após largar o pincel

ml5.imageClassifier('DoodleNet').then(c => {
    classifier = c;
    console.log('DoodleNet ready');
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
        
        // Atualiza o texto visual do HTML para o utilizador ver a certeza da IA
        document.querySelector('#doodleLabel').textContent = `${label} (${confidence}%)`;

        // 🛑 CRITÉRIO DE GUARDAR RECURSOS: Se a label for idêntica à anterior, ignora o askAI
        if (label === lastLabel) {
            console.log(`Log: The label "${label}" did not change. askAI call skipped.`);
            return;
        }

        // Se for uma categoria nova, atualiza o histórico
        lastLabel = label;

        // Executa a chamada à tua IA local
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

// Esta função agora serve como o gatilho inteligente acionado pelo Paint
export function startDoodleSuggestions() {
    // Cancela o temporizador anterior se o utilizador voltou a clicar antes dos 0.3s passarem
    clearTimeout(doodleTimeout);
    
    // Inicia uma nova contagem decrescente de 300 milissegundos
    doodleTimeout = setTimeout(updateDoodleColors, DEBOUNCE_DELAY_MS);
}