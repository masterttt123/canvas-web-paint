import { paintInit, getPaintDataUrl, setPaintImageFromDataUrl, getCurrentDrawingPoints } from './paint.js';
import { startDoodleSuggestions } from './doodle.js';

paintInit(startDoodleSuggestions);

const autocompleteBtn = document.querySelector('#autocompleteBtn');
if (autocompleteBtn) {
    autocompleteBtn.addEventListener('click', () => {
        const fullLabel = document.querySelector('#doodleLabel').textContent;
        const currentLabel = fullLabel.split('(')[0].trim();

        if (!currentLabel || currentLabel === '—') {
            alert('Desenha algo no ecrã primeiro para o Magenta reconhecer!');
            return;
        }

        const points = getCurrentDrawingPoints();

        localStorage.setItem('magenta_input_label', currentLabel);
        localStorage.setItem('magenta_input_canvas', getPaintDataUrl());
        localStorage.setItem('magenta_input_points', JSON.stringify(points));
        localStorage.removeItem('magenta_output_canvas');

        window.open('complete.html', '_blank');
    });
}

// Escuta por quando o utilizador volta a esta aba, para aplicar o resultado automaticamente
window.addEventListener('focus', checkForMagentaResult);
checkForMagentaResult();

async function checkForMagentaResult() {
    const result = localStorage.getItem('magenta_output_canvas');
    if (!result) return;

    await setPaintImageFromDataUrl(result);
    localStorage.removeItem('magenta_output_canvas');

    const label = document.querySelector('#doodleLabel');
    if (label) {
        const original = label.textContent;
        label.textContent = 'AI autocomplet done!';
        setTimeout(() => { label.textContent = original; }, 2000);
    }
}