import { getPaintCanvas, getPaintInitialDataUrl, getPaintDataUrl, setPaintCurrentColor, getPaintCurrentColor, getPaintCurrentTool, getPaintCtx, getPaintBackground, getPaintColors } from './paint.js';

let currentSuggestion = null;
const feedbackLog = JSON.parse(localStorage.getItem('feedbackLog') || '[]');
const preferenceMemory = JSON.parse(localStorage.getItem('preferenceMemory') || '[]');

export async function askAI(number, context) {
    const preferenceHint = buildPreferenceHint(context, number);

    const res = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'llama3.1',
            stream: false,
            options: {
                temperature: 0.9,
                seed: Math.floor(Math.random() * 100000)
            },
            messages: [
                {
                    role: 'system',
                    content: 'You are a color palette assistant. Return only hex colors. Respect all inclusion and exclusion rules similar.'
                },
                {
                    role: 'user',
                    content:
                        `${preferenceHint}` +
                        `Generate similar ${number} distinct hex colors related to this scene: "${context}". ` +
                        `Output only the colors, comma-separated, no spaces.`
                }
            ]
        })
    });

    console.log(`Asked for ${number} colors related to "${context}"`);

    const data = await res.json();
    return data.message.content;
}

export async function askAIForFeatures(number, context) {
    const preferenceHint = buildPreferenceHint(context, number);

    const res = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'llama3.1',
            stream: false,
            options: {
                temperature: 0.9,
                seed: Math.floor(Math.random() * 100000)
            },
            messages: [
                {
                    role: 'system',
                    content: 'You are a drawing assistant. Return only up to 3 words to describe each feature requested of you. Prefer to use the least words possible. Respect all inclusion and exclusion rules similar.'
                },
                {
                    role: 'user',
                    content:
                        `${preferenceHint}` +
                        `Generate ${number} distinct features related to this scene: "${context}". ` +
                        `The features should be parts of an object or a scene, that a painter might need to draw if they were to draw the object or scene.` +
                        `Each individual feature should be wholly different from all other features, and not simply a similar one.` +
                        `Prefer to suggest simple features that could be easily doodled and not complex concepts.` +
                        `Output only the features, comma-separated, no spaces.`
                }
            ]
        })
    });

    console.log(`Asked for ${number} features related to "${context}"`);

    const data = await res.json();
    return data.message.content;
}

async function askForColor(number, context) {
    const prefs = getContextPreferences(context);

    const lockedLikedColor = prefs.liked.length && prefs.likedScores[prefs.liked[0]] > 1
        ? prefs.liked[0]
        : null;

    const aiCount = number;

    let colorsRaw = await askAI(aiCount, context);
    let colors = colorsRaw.split(/[\n,]/)
        .map(c => c.trim())
        .filter(c => c)
        .map(normalizeHex)
        .filter(Boolean);

    if (lockedLikedColor) {
        colors.unshift(lockedLikedColor);
    }

    colors = [...new Set(colors)]
        .filter(color => !prefs.disliked.includes(color))
        .slice(0, number);

    currentSuggestion = {
        context,
        suggested: colors,
        chosen: null,
        source: null,
        feedback: null,
        timestamp: Date.now(),
        feedbackLocked: false
    };

    document.querySelector('#paintColorsHex').textContent = colors.join(', ');

    const paintOutput = document.querySelector('#paintOutput');
    paintOutput.innerHTML = '';

    colors.forEach(color => {
        const input = document.createElement('input');
        input.type = 'color';
        input.value = color;
        input.dataset.color = color;
        input.dataset.source = 'ai';
        input.title = color;

        paintOutput.appendChild(input);
        input.addEventListener('pointerdown', paintSelectSuggestedColor);
    });
}

export function normalizeHex(color) {
    if (!color) return null;

    let c = String(color).trim();

    if (c.startsWith('#')) {
        c = c.slice(1).toUpperCase();

        if (/^[0-9A-F]{3}$/.test(c)) {
            c = c.split('').map(x => x + x).join('');
        }

        if (/^[0-9A-F]{6}$/.test(c)) {
            return '#' + c;
        }
    }

    const temp = document.createElement('div');
    temp.style.color = c;
    document.body.appendChild(temp);

    const computed = getComputedStyle(temp).color;
    document.body.removeChild(temp);

    const match = computed.match(/\d+/g);
    if (!match || match.length < 3) {
        console.warn('Invalid color:', color);
        return null;
    }

    const [r, g, b] = match.map(Number);
    return '#' + [r, g, b]
        .map(v => v.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
}

export function paintSelectSuggestedColor(e) {
    const pickedColor = normalizeHex(e.currentTarget.value || e.currentTarget.dataset.color);
    if (!pickedColor) return;

    setPaintCurrentColor(pickedColor);
    getPaintCtx().strokeStyle = getPaintCurrentTool() !== 'eraser' ? getPaintCurrentColor() : getPaintBackground();

    getPaintColors().forEach((color) => color.classList.remove('active-color'));

    registerFeedback(pickedColor, 'ai');
}

export function registerFeedback(pickedColor, source) {
    if (!currentSuggestion) return;
    // if (currentSuggestion.feedbackLocked) return;

    const feedbackType =
        source === 'ai' && currentSuggestion.suggested.includes(pickedColor)
            ? 'positive'
            : 'negative';

    const feedbackEntry = {
        context: currentSuggestion.context,
        suggested: [...currentSuggestion.suggested],
        chosen: pickedColor,
        source,
        feedback: feedbackType,
        timestamp: Date.now()
    };

    currentSuggestion.chosen = pickedColor;
    currentSuggestion.source = source;
    currentSuggestion.feedback = feedbackType;
    // currentSuggestion.feedbackLocked = true;

    feedbackLog.push(feedbackEntry);
    localStorage.setItem('feedbackLog', JSON.stringify(feedbackLog));

    updatePreferenceMemory(feedbackEntry);

    console.log('Feedback saved:', feedbackEntry);
}

function updatePreferenceMemory(entry) {
    let existing = preferenceMemory.find(item => item.context === entry.context);

    if (!existing) {
        existing = { context: entry.context, liked: {}, disliked: {} };
        preferenceMemory.push(existing);
    }

    if (entry.feedback === 'positive') {
        existing.liked[entry.chosen] = (existing.liked[entry.chosen] || 0) + 1;
    } else if (entry.feedback === 'negative') {
        existing.disliked[entry.chosen] = (existing.disliked[entry.chosen] || 0) + 1;
    }
    localStorage.setItem('preferenceMemory', JSON.stringify(preferenceMemory));
}

function buildPreferenceHint(context, number) {
    const memory = preferenceMemory.find(item => item.context === context);
    if (!memory) return '';

    const likedColors = Object.entries(memory.liked)
        .sort((a, b) => b[1] - a[1])
        .map(([color]) => color);

    const dislikedColors = Object.entries(memory.disliked)
        .sort((a, b) => b[1] - a[1])
        .map(([color]) => color);

    let hint = '';

    if (likedColors.length > 0) {
        const mustInclude = likedColors.slice(0, Math.min(1, number));
        hint += `For this context, include at least one of these previously liked colors: ${mustInclude.join(', ')}. `;
    }

    if (dislikedColors.length > 0) {
        hint += `Do not include any of these previously disliked colors: ${dislikedColors.join(', ')}. `;
    }

    hint += `Return similar ${number} distinct hex colors. `;

    return hint;
}

function getContextPreferences(context) {
    const memory = preferenceMemory.find(item => item.context === context);
    if (!memory) return { liked: [], disliked: [], likedScores: {} };

    return {
        liked: Object.entries(memory.liked).sort((a, b) => b[1] - a[1]).map(([color]) => color),
        disliked: Object.entries(memory.disliked).sort((a, b) => b[1] - a[1]).map(([color]) => color),
        likedScores: memory.liked
    };
}

const paintForm = document.querySelector('#paintForm');

paintForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const number = parseInt(paintForm.elements['size'].value, 10);
    const context = paintForm.elements['prompt'].value.trim();

    if (!number || !context) return;

    await askForColor(number, context);
});

