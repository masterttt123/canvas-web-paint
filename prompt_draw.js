import { getPaintCtx, getPaintCanvas } from './paint.js';
import { updateDoodleColors } from './doodle.js';

const INTENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    subject: { type: 'string' },
    secondarySubject: {
      anyOf: [{ type: 'string' }, { type: 'null' }]
    },
    sceneType: {
      type: 'string',
      enum: ['single_object', 'simple_scene']
    },
    composition: {
      type: 'string',
      enum: ['centered', 'left_right', 'top_bottom']
    },
    category: {
      type: 'string',
      enum: [
        'celestial',
        'plant',
        'building',
        'animal_face',
        'vehicle',
        'container',
        'landscape',
        'symbol',
        'weather',
        'food',
        'sea_animal',
        'flying_animal',
        'object'
      ]
    },
    parts: {
      type: 'array',
      items: { type: 'string' }
    },
    features: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: [
    'subject',
    'secondarySubject',
    'sceneType',
    'composition',
    'category',
    'parts',
    'features'
  ]
};

const INTENT_SYSTEM_PROMPT = `
Return only valid JSON matching the schema.

You classify a user's drawing prompt into a simple sketch plan for a child's drawing canvas.

Goals:
- Identify the main subject.
- Identify one optional second subject only if clearly needed.
- Choose a broad visual category.
- Choose a simple composition.
- List the main visible parts.
- List high-level visual features.

Allowed sceneType:
- single_object
- simple_scene

Allowed composition:
- centered
- left_right
- top_bottom

Allowed category:
- celestial
- plant
- building
- animal_face
- vehicle
- container
- landscape
- symbol
- weather
- food
- sea_animal
- flying_animal
- object

Allowed feature ideas:
- round
- radial
- crescent
- smiling
- petals
- stem
- leaves
- trunk
- crown
- roof
- window
- door
- water
- wheels
- sail
- wings
- tail
- mountain_peaks
- cloud_puffs
- handle
- base
- floating
- face_like
- symmetrical
- rainbow
- fruit
- cone
- fins
- beak
- feathers
- sun_cloud
- waves

Examples:
"sun" ->
{
  "subject": "sun",
  "secondarySubject": null,
  "sceneType": "single_object",
  "composition": "centered",
  "category": "celestial",
  "parts": ["core", "rays"],
  "features": ["round", "radial"]
}

"moon" ->
{
  "subject": "moon",
  "secondarySubject": null,
  "sceneType": "single_object",
  "composition": "centered",
  "category": "celestial",
  "parts": ["moon body"],
  "features": ["crescent"]
}

"flower in a vase" ->
{
  "subject": "flower",
  "secondarySubject": "vase",
  "sceneType": "single_object",
  "composition": "top_bottom",
  "category": "plant",
  "parts": ["flower center", "petals", "stem", "vase"],
  "features": ["petals", "stem", "base"]
}

"house with a tree" ->
{
  "subject": "house",
  "secondarySubject": "tree",
  "sceneType": "simple_scene",
  "composition": "left_right",
  "category": "building",
  "parts": ["body", "roof", "door", "window", "trunk", "crown"],
  "features": ["roof", "window", "door", "trunk", "crown"]
}

"rainbow" ->
{
  "subject": "rainbow",
  "secondarySubject": null,
  "sceneType": "single_object",
  "composition": "centered",
  "category": "weather",
  "parts": ["rainbow arcs"],
  "features": ["rainbow", "symmetrical"]
}

"apple" ->
{
  "subject": "apple",
  "secondarySubject": null,
  "sceneType": "single_object",
  "composition": "centered",
  "category": "food",
  "parts": ["body", "stem", "leaf"],
  "features": ["fruit", "round"]
}

"fish" ->
{
  "subject": "fish",
  "secondarySubject": null,
  "sceneType": "single_object",
  "composition": "centered",
  "category": "sea_animal",
  "parts": ["body", "tail", "eye", "fins"],
  "features": ["tail", "fins", "symmetrical"]
}

"bird" ->
{
  "subject": "bird",
  "secondarySubject": null,
  "sceneType": "single_object",
  "composition": "centered",
  "category": "flying_animal",
  "parts": ["body", "wing", "beak", "eye"],
  "features": ["wings", "beak", "feathers"]
}

Return JSON only.
`.trim();

const AUTO_SKETCH_STROKE_MIN = 72;
const AUTO_SKETCH_STROKE_MAX = 72;
const AUTO_SKETCH_STROKE_SCALE = 6;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normCoord(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(clamp(num, 0, 1000));
}

function normWidth(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 4;
  return clamp(Math.round(num), 1, 40);
}

function boostElementStroke(el) {
  if (!el || typeof el !== 'object') return el;
  return {
    ...el,
    strokeWidth: clamp(
      Math.round((Number(el.strokeWidth) || 4) * AUTO_SKETCH_STROKE_SCALE),
      AUTO_SKETCH_STROKE_MIN,
      AUTO_SKETCH_STROKE_MAX
    )
  };
}

function boostPlanStroke(plan) {
  if (!plan || !Array.isArray(plan.elements)) return plan;
  return {
    ...plan,
    elements: plan.elements.map(boostElementStroke)
  };
}

function toCanvasX(x, canvas) {
  return Math.round((normCoord(x) / 1000) * canvas.width);
}

function toCanvasY(y, canvas) {
  return Math.round((normCoord(y) / 1000) * canvas.height);
}

function toCanvasRadius(r, canvas) {
  const base = Math.min(canvas.width, canvas.height);
  return Math.max(1, Math.round((normCoord(r) / 1000) * base));
}

function cleanModelJson(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Resposta vazia do modelo.');
  }

  const withoutCodeFences = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const firstBrace = withoutCodeFences.indexOf('{');
  const lastBrace = withoutCodeFences.lastIndexOf('}');

  if (firstBrace === -1) {
    throw new Error('O modelo não devolveu um objeto JSON.');
  }

  if (lastBrace === -1 || lastBrace < firstBrace) {
    console.error('RAW INCOMPLETE MODEL RESPONSE:', withoutCodeFences);
    throw new Error('O modelo devolveu JSON incompleto/truncado.');
  }

  const jsonOnly = withoutCodeFences.slice(firstBrace, lastBrace + 1);

  try {
    return JSON.parse(jsonOnly);
  } catch (err) {
    console.error('JSON PARSE FAILED. RAW JSON SLICE:', jsonOnly);
    throw new Error(`JSON inválido devolvido pelo modelo: ${err.message}`);
  }
}

function isValidHexColor(color) {
  return typeof color === 'string' && /^#([0-9A-Fa-f]{6})$/.test(color);
}

function normalizePoint(point) {
  if (!Array.isArray(point) || point.length < 2) return null;
  return [normCoord(point[0]), normCoord(point[1])];
}

function normalizeElement(element) {
  const allowedTypes = new Set(['line', 'polyline', 'polygon', 'circle', 'ellipse', 'rect', 'arc']);
  const safeType = allowedTypes.has(element?.type) ? element.type : 'line';

  const safe = {
    type: safeType,
    stroke:
      element?.stroke === 'black'
        ? '#000000'
        : isValidHexColor(element?.stroke)
          ? element.stroke
          : '#000000',
    fill:
      element?.fill === null
        ? null
        : element?.fill === 'black'
          ? '#000000'
          : element?.fill === 'white'
            ? '#FFFFFF'
            : isValidHexColor(element?.fill)
              ? element.fill
              : null,
    strokeWidth: normWidth(element?.strokeWidth)
  };

  if (safe.type === 'line') {
    safe.x1 = normCoord(element?.x1);
    safe.y1 = normCoord(element?.y1);
    safe.x2 = normCoord(element?.x2);
    safe.y2 = normCoord(element?.y2);
  }

  if (safe.type === 'polyline' || safe.type === 'polygon') {
    const pts = Array.isArray(element?.points)
      ? element.points.slice(0, 20).map(normalizePoint).filter(Boolean)
      : [];
    if (pts.length < 2) return null;
    if (safe.type === 'polygon' && pts.length < 3) return null;
    safe.points = pts;
  }

  if (safe.type === 'circle') {
    safe.cx = normCoord(element?.cx);
    safe.cy = normCoord(element?.cy);
    safe.r = normCoord(element?.r);
  }

  if (safe.type === 'ellipse') {
    safe.cx = normCoord(element?.cx);
    safe.cy = normCoord(element?.cy);
    safe.rx = normCoord(element?.rx);
    safe.ry = normCoord(element?.ry);
  }

  if (safe.type === 'rect') {
    const hasXYWH =
      Number.isFinite(Number(element?.x)) &&
      Number.isFinite(Number(element?.y)) &&
      Number.isFinite(Number(element?.w)) &&
      Number.isFinite(Number(element?.h));

    const hasCorners =
      Number.isFinite(Number(element?.x1)) &&
      Number.isFinite(Number(element?.y1)) &&
      Number.isFinite(Number(element?.x2)) &&
      Number.isFinite(Number(element?.y2));

    if (hasXYWH) {
      safe.x = normCoord(element.x);
      safe.y = normCoord(element.y);
      safe.w = normCoord(element.w);
      safe.h = normCoord(element.h);
    } else if (hasCorners) {
      const x1 = normCoord(element.x1);
      const y1 = normCoord(element.y1);
      const x2 = normCoord(element.x2);
      const y2 = normCoord(element.y2);

      safe.x = Math.min(x1, x2);
      safe.y = Math.min(y1, y2);
      safe.w = Math.abs(x2 - x1);
      safe.h = Math.abs(y2 - y1);
    } else {
      return null;
    }
  }

  if (safe.type === 'arc') {
    safe.cx = normCoord(element?.cx);
    safe.cy = normCoord(element?.cy);
    safe.r = normCoord(element?.r);
    safe.startAngle = Number.isFinite(Number(element?.startAngle)) ? Number(element.startAngle) : 0;
    safe.endAngle = Number.isFinite(Number(element?.endAngle)) ? Number(element.endAngle) : Math.PI * 2;
  }

  return safe;
}

function areLinesVerySimilar(a, b) {
  if (a.type !== 'line' || b.type !== 'line') return false;
  return (
    Math.abs(a.x1 - b.x1) <= 10 &&
    Math.abs(a.y1 - b.y1) <= 10 &&
    Math.abs(a.x2 - b.x2) <= 10 &&
    Math.abs(a.y2 - b.y2) <= 10
  );
}

function areRectsVerySimilar(a, b) {
  if (a.type !== 'rect' || b.type !== 'rect') return false;
  return (
    Math.abs(a.x - b.x) <= 12 &&
    Math.abs(a.y - b.y) <= 12 &&
    Math.abs(a.w - b.w) <= 20 &&
    Math.abs(a.h - b.h) <= 20
  );
}

function dedupeElements(elements) {
  const out = [];
  for (const el of elements) {
    const dup = out.some((other) => {
      if (el.type === 'line' && other.type === 'line') return areLinesVerySimilar(el, other);
      if (el.type === 'rect' && other.type === 'rect') return areRectsVerySimilar(el, other);
      return false;
    });
    if (!dup) out.push(el);
  }
  return out;
}

function getElementBounds(el) {
  if (el.type === 'line') {
    return {
      minX: Math.min(el.x1, el.x2),
      minY: Math.min(el.y1, el.y2),
      maxX: Math.max(el.x1, el.x2),
      maxY: Math.max(el.y1, el.y2)
    };
  }

  if ((el.type === 'polyline' || el.type === 'polygon') && Array.isArray(el.points) && el.points.length) {
    const xs = el.points.map((p) => p[0]);
    const ys = el.points.map((p) => p[1]);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys)
    };
  }

  if (el.type === 'circle') {
    return {
      minX: el.cx - el.r,
      minY: el.cy - el.r,
      maxX: el.cx + el.r,
      maxY: el.cy + el.r
    };
  }

  if (el.type === 'ellipse') {
    return {
      minX: el.cx - el.rx,
      minY: el.cy - el.ry,
      maxX: el.cx + el.rx,
      maxY: el.cy + el.ry
    };
  }

  if (el.type === 'rect') {
    return {
      minX: el.x,
      minY: el.y,
      maxX: el.x + el.w,
      maxY: el.y + el.h
    };
  }

  if (el.type === 'arc') {
    return {
      minX: el.cx - el.r,
      minY: el.cy - el.r,
      maxX: el.cx + el.r,
      maxY: el.cy + el.r
    };
  }

  return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
}

function shiftElement(el, dx, dy) {
  const out = { ...el };

  if (out.type === 'line') {
    out.x1 = normCoord(out.x1 + dx);
    out.y1 = normCoord(out.y1 + dy);
    out.x2 = normCoord(out.x2 + dx);
    out.y2 = normCoord(out.y2 + dy);
  }

  if (out.type === 'polyline' || out.type === 'polygon') {
    out.points = (out.points || []).map(([x, y]) => [normCoord(x + dx), normCoord(y + dy)]);
  }

  if (out.type === 'circle' || out.type === 'ellipse' || out.type === 'arc') {
    out.cx = normCoord(out.cx + dx);
    out.cy = normCoord(out.cy + dy);
  }

  if (out.type === 'rect') {
    out.x = normCoord(out.x + dx);
    out.y = normCoord(out.y + dy);
  }

  return out;
}

function getVisualBounds(el) {
  const b = getElementBounds(el);
  const pad = Math.max(4, Number(el?.strokeWidth) || 4);
  return {
    minX: b.minX - pad,
    minY: b.minY - pad,
    maxX: b.maxX + pad,
    maxY: b.maxY + pad
  };
}

function fitAndCenterPlanElements(elements) {
  if (!Array.isArray(elements) || !elements.length) return elements || [];

  const bounds = elements.map(getVisualBounds);
  const minX = Math.min(...bounds.map((b) => b.minX));
  const minY = Math.min(...bounds.map((b) => b.minY));
  const maxX = Math.max(...bounds.map((b) => b.maxX));
  const maxY = Math.max(...bounds.map((b) => b.maxY));

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  const targetBox = {
    minX: 220,
    minY: 180,
    maxX: 780,
    maxY: 760
  };

  const targetWidth = targetBox.maxX - targetBox.minX;
  const targetHeight = targetBox.maxY - targetBox.minY;

  const scale = Math.min(targetWidth / width, targetHeight / height, 1.35);

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const scaled = elements.map((el) => scaleElement(el, scale, scale, centerX, centerY));

  const scaledBounds = scaled.map(getVisualBounds);
  const sMinX = Math.min(...scaledBounds.map((b) => b.minX));
  const sMinY = Math.min(...scaledBounds.map((b) => b.minY));
  const sMaxX = Math.max(...scaledBounds.map((b) => b.maxX));
  const sMaxY = Math.max(...scaledBounds.map((b) => b.maxY));

  const currentCenterX = (sMinX + sMaxX) / 2;
  const currentCenterY = (sMinY + sMaxY) / 2;

  const targetCenterX = (targetBox.minX + targetBox.maxX) / 2;
  const targetCenterY = (targetBox.minY + targetBox.maxY) / 2;

  const dx = targetCenterX - currentCenterX;
  const dy = targetCenterY - currentCenterY;

  return scaled.map((el) => shiftElement(el, dx, dy));
}

function scaleElement(el, sx, sy, originX = 500, originY = 500) {
  const out = { ...el };

  const scaleX = (x) => normCoord(originX + (x - originX) * sx);
  const scaleY = (y) => normCoord(originY + (y - originY) * sy);

  if (out.type === 'line') {
    out.x1 = scaleX(out.x1);
    out.y1 = scaleY(out.y1);
    out.x2 = scaleX(out.x2);
    out.y2 = scaleY(out.y2);
  }

  if (out.type === 'polyline' || out.type === 'polygon') {
    out.points = (out.points || []).map(([x, y]) => [scaleX(x), scaleY(y)]);
  }

  if (out.type === 'circle') {
    out.cx = scaleX(out.cx);
    out.cy = scaleY(out.cy);
    out.r = normCoord(out.r * Math.min(sx, sy));
  }

  if (out.type === 'ellipse') {
    out.cx = scaleX(out.cx);
    out.cy = scaleY(out.cy);
    out.rx = normCoord(out.rx * sx);
    out.ry = normCoord(out.ry * sy);
  }

  if (out.type === 'rect') {
    out.x = scaleX(out.x);
    out.y = scaleY(out.y);
    out.w = normCoord(out.w * sx);
    out.h = normCoord(out.h * sy);
  }

  if (out.type === 'arc') {
    out.cx = scaleX(out.cx);
    out.cy = scaleY(out.cy);
    out.r = normCoord(out.r * Math.min(sx, sy));
  }

  return out;
}

function normalizeIntent(intent) {
  const subject = typeof intent?.subject === 'string'
    ? intent.subject.trim().toLowerCase()
    : 'object';

  const secondarySubject =
    typeof intent?.secondarySubject === 'string' && intent.secondarySubject.trim()
      ? intent.secondarySubject.trim().toLowerCase()
      : null;

  const allowedCategories = new Set([
    'celestial',
    'plant',
    'building',
    'animal_face',
    'vehicle',
    'container',
    'landscape',
    'symbol',
    'weather',
    'food',
    'sea_animal',
    'flying_animal',
    'object'
  ]);

  const safeParts = Array.isArray(intent?.parts)
    ? intent.parts.map((p) => String(p).trim().toLowerCase()).filter(Boolean).slice(0, 8)
    : [];

  const safeFeatures = Array.isArray(intent?.features)
    ? intent.features.map((f) => String(f).trim().toLowerCase()).filter(Boolean).slice(0, 8)
    : [];

  return {
    subject: subject || 'object',
    secondarySubject,
    sceneType: intent?.sceneType === 'simple_scene' ? 'simple_scene' : 'single_object',
    composition: ['centered', 'left_right', 'top_bottom'].includes(intent?.composition)
      ? intent.composition
      : 'centered',
    category: allowedCategories.has(intent?.category) ? intent.category : 'object',
    parts: safeParts,
    features: safeFeatures
  };
}

function line(x1, y1, x2, y2, strokeWidth = 4) {
  return normalizeElement({
    type: 'line',
    stroke: '#000000',
    fill: null,
    strokeWidth,
    x1, y1, x2, y2
  });
}

function rect(x, y, w, h, strokeWidth = 4) {
  return normalizeElement({
    type: 'rect',
    stroke: '#000000',
    fill: null,
    strokeWidth,
    x, y, w, h
  });
}

function circle(cx, cy, r, strokeWidth = 4) {
  return normalizeElement({
    type: 'circle',
    stroke: '#000000',
    fill: null,
    strokeWidth,
    cx, cy, r
  });
}

function ellipse(cx, cy, rx, ry, strokeWidth = 4) {
  return normalizeElement({
    type: 'ellipse',
    stroke: '#000000',
    fill: null,
    strokeWidth,
    cx, cy, rx, ry
  });
}

function polygon(points, strokeWidth = 4) {
  return normalizeElement({
    type: 'polygon',
    stroke: '#000000',
    fill: null,
    strokeWidth,
    points
  });
}

function arc(cx, cy, r, startAngle, endAngle, strokeWidth = 4) {
  return normalizeElement({
    type: 'arc',
    stroke: '#000000',
    fill: null,
    strokeWidth,
    cx, cy, r, startAngle, endAngle
  });
}

function polyline(points, strokeWidth = 4) {
  return normalizeElement({
    type: 'polyline',
    stroke: '#000000',
    fill: null,
    strokeWidth,
    points
  });
}

function makeCrescent(cx, cy, rOuter = 90, rInner = 75, offsetX = 35) {
  return [
    arc(cx, cy, rOuter, 0.7, 5.58, 4),
    arc(cx + offsetX, cy, rInner, 1.05, 5.2, 4)
  ].filter(Boolean);
}

function inferIntentFromPrompt(prompt) {
  const text = String(prompt || '').toLowerCase();

  if (text.includes('house') && text.includes('tree')) {
    return {
      subject: 'house',
      secondarySubject: 'tree',
      sceneType: 'simple_scene',
      composition: 'left_right',
      category: 'building',
      parts: ['body', 'roof', 'door', 'window', 'trunk', 'crown'],
      features: ['roof', 'window', 'door', 'trunk', 'crown']
    };
  }

  if (text.includes('flower') && (text.includes('vase') || text.includes('pot'))) {
    return {
      subject: 'flower',
      secondarySubject: 'vase',
      sceneType: 'single_object',
      composition: 'top_bottom',
      category: 'plant',
      parts: ['flower center', 'petals', 'stem', 'vase'],
      features: ['petals', 'stem', 'base']
    };
  }

  if (text.includes('sun')) {
    return {
      subject: 'sun',
      secondarySubject: null,
      sceneType: 'single_object',
      composition: 'centered',
      category: 'celestial',
      parts: ['core', 'rays'],
      features: ['round', 'radial']
    };
  }

  if (text.includes('moon')) {
    return {
      subject: 'moon',
      secondarySubject: null,
      sceneType: 'single_object',
      composition: 'centered',
      category: 'celestial',
      parts: ['moon body'],
      features: ['crescent']
    };
  }

  if (text.includes('star')) {
    return {
      subject: 'star',
      secondarySubject: null,
      sceneType: 'single_object',
      composition: 'centered',
      category: 'symbol',
      parts: ['star body'],
      features: ['symmetrical']
    };
  }

  if (text.includes('flower')) {
    return {
      subject: 'flower',
      secondarySubject: null,
      sceneType: 'single_object',
      composition: 'centered',
      category: 'plant',
      parts: ['flower center', 'petals', 'stem', 'leaves'],
      features: ['petals', 'stem', 'leaves']
    };
  }

  if (text.includes('tree')) {
    return {
      subject: 'tree',
      secondarySubject: null,
      sceneType: 'single_object',
      composition: 'centered',
      category: 'plant',
      parts: ['trunk', 'crown'],
      features: ['trunk', 'crown']
    };
  }

  if (text.includes('house')) {
    return {
      subject: 'house',
      secondarySubject: null,
      sceneType: 'single_object',
      composition: 'centered',
      category: 'building',
      parts: ['body', 'roof', 'door', 'window'],
      features: ['roof', 'window', 'door']
    };
  }

  if (text.includes('boat')) {
    return {
      subject: 'boat',
      secondarySubject: null,
      sceneType: 'single_object',
      composition: 'centered',
      category: 'vehicle',
      parts: ['hull', 'mast', 'sail', 'water'],
      features: ['sail', 'water']
    };
  }

  if (text.includes('car')) {
    return {
      subject: 'car',
      secondarySubject: null,
      sceneType: 'single_object',
      composition: 'centered',
      category: 'vehicle',
      parts: ['body', 'wheels'],
      features: ['wheels']
    };
  }

  if (text.includes('cloud')) {
    return {
      subject: 'cloud',
      secondarySubject: null,
      sceneType: 'single_object',
      composition: 'centered',
      category: 'landscape',
      parts: ['cloud body'],
      features: ['cloud_puffs', 'round']
    };
  }

  if (text.includes('mountain')) {
    return {
      subject: 'mountain',
      secondarySubject: null,
      sceneType: 'single_object',
      composition: 'centered',
      category: 'landscape',
      parts: ['mountain body'],
      features: ['mountain_peaks']
    };
  }

  if (text.includes('cup') || text.includes('mug')) {
    return {
      subject: 'cup',
      secondarySubject: null,
      sceneType: 'single_object',
      composition: 'centered',
      category: 'container',
      parts: ['body', 'handle', 'base'],
      features: ['handle', 'base']
    };
  }

  if (text.includes('balloon')) {
    return {
      subject: 'balloon',
      secondarySubject: null,
      sceneType: 'single_object',
      composition: 'centered',
      category: 'object',
      parts: ['balloon body', 'string'],
      features: ['round', 'floating']
    };
  }

  if (text.includes('cat') || text.includes('face')) {
    return {
      subject: text.includes('cat') ? 'cat' : 'face',
      secondarySubject: null,
      sceneType: 'single_object',
      composition: 'centered',
      category: 'animal_face',
      parts: ['head', 'eyes', 'mouth'],
      features: text.includes('cat') ? ['face_like', 'symmetrical'] : ['face_like']
    };
  }

  if (text.includes('rainbow')) {
    return {
      subject: 'rainbow',
      secondarySubject: null,
      sceneType: 'single_object',
      composition: 'centered',
      category: 'weather',
      parts: ['rainbow arcs'],
      features: ['rainbow', 'symmetrical']
    };
  }

  if (text.includes('apple')) {
    return {
      subject: 'apple',
      secondarySubject: null,
      sceneType: 'single_object',
      composition: 'centered',
      category: 'food',
      parts: ['body', 'stem', 'leaf'],
      features: ['fruit', 'round']
    };
  }

  if (text.includes('ice cream') || text.includes('icecream')) {
    return {
      subject: 'ice cream',
      secondarySubject: null,
      sceneType: 'single_object',
      composition: 'top_bottom',
      category: 'food',
      parts: ['scoop', 'cone'],
      features: ['round', 'cone']
    };
  }

  if (text.includes('fish')) {
    return {
      subject: 'fish',
      secondarySubject: null,
      sceneType: 'single_object',
      composition: 'centered',
      category: 'sea_animal',
      parts: ['body', 'tail', 'eye', 'fins'],
      features: ['tail', 'fins', 'symmetrical']
    };
  }

  if (text.includes('bird')) {
    return {
      subject: 'bird',
      secondarySubject: null,
      sceneType: 'single_object',
      composition: 'centered',
      category: 'flying_animal',
      parts: ['body', 'wing', 'beak', 'eye'],
      features: ['wings', 'beak', 'feathers']
    };
  }

  if (text.includes('butterfly')) {
    return {
      subject: 'butterfly',
      secondarySubject: null,
      sceneType: 'single_object',
      composition: 'centered',
      category: 'flying_animal',
      parts: ['body', 'wings'],
      features: ['wings', 'symmetrical']
    };
  }

  return {
    subject: 'object',
    secondarySubject: null,
    sceneType: 'single_object',
    composition: 'centered',
    category: 'object',
    parts: ['body'],
    features: ['symmetrical']
  };
}

export async function askDrawingIntent(prompt) {
  const res = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen2.5-coder:3b',
      stream: false,
      format: INTENT_SCHEMA,
      options: {
        temperature: 0,
        seed: 42,
        num_predict: 120
      },
      messages: [
        {
          role: 'system',
          content: `
${INTENT_SYSTEM_PROMPT}

Schema:
${JSON.stringify(INTENT_SCHEMA)}
          `.trim()
        },
        {
          role: 'user',
          content: `Classify this drawing prompt: "${prompt}". Return only JSON.`
        }
      ]
    })
  });

  if (!res.ok) {
    throw new Error(`Erro no Ollama: ${res.status}`);
  }

  const data = await res.json();
  const raw = data?.message?.content;

  console.log('RAW MODEL INTENT:', raw);

  const parsed = cleanModelJson(raw);
  return normalizeIntent(parsed);
}

function validatePlan(plan) {
  if (!plan || !Array.isArray(plan.elements) || !plan.elements.length) {
    throw new Error('Não foi possível construir um sketch válido.');
  }
  return plan;
}

function renderPlant(intent) {
  const hasVase = intent.secondarySubject === 'vase' || intent.parts.includes('vase');
  const hasLeaves = intent.features.includes('leaves') || intent.parts.includes('leaves');

  const elements = [
    line(500, 340, 500, hasVase ? 540 : 620, 4),
    circle(500, 300, 28, 4),
    circle(500, 245, 24, 4),
    circle(555, 300, 24, 4),
    circle(500, 355, 24, 4),
    circle(445, 300, 24, 4)
  ];

  if (hasLeaves) {
    elements.push(line(500, 450, 455, 420, 4));
    elements.push(line(500, 470, 545, 440, 4));
  }

  if (hasVase) {
    elements.push(
      polygon([[430, 540], [570, 540], [540, 680], [460, 680]], 4)
    );
  }

  return {
    background: '#FFFFFF',
    sceneType: intent.sceneType,
    primarySubject: intent.subject,
    secondarySubject: intent.secondarySubject,
    composition: intent.composition,
    mainParts: intent.parts,
    elements: fitAndCenterPlanElements(dedupeElements(elements.filter(Boolean)))
  };
}

function renderCelestial(intent) {
  const elements = [];

  if (intent.features.includes('crescent') || intent.subject === 'moon') {
    elements.push(...makeCrescent(500, 360, 110, 90, 42));
  } else {
    elements.push(circle(500, 360, 90, 4));

    if (intent.features.includes('radial') || intent.subject === 'sun') {
      elements.push(
        line(500, 220, 500, 150, 4),
        line(500, 500, 500, 570, 4),
        line(360, 360, 290, 360, 4),
        line(640, 360, 710, 360, 4),
        line(400, 260, 345, 205, 4),
        line(600, 260, 655, 205, 4),
        line(400, 460, 345, 515, 4),
        line(600, 460, 655, 515, 4)
      );
    }
  }

  return {
    background: '#FFFFFF',
    sceneType: intent.sceneType,
    primarySubject: intent.subject,
    secondarySubject: intent.secondarySubject,
    composition: intent.composition,
    mainParts: intent.parts,
    elements: fitAndCenterPlanElements(dedupeElements(elements.filter(Boolean)))
  };
}

function renderBuilding(intent) {
  const houseElements = [
    rect(360, 390, 280, 220, 4),
    polygon([[330, 390], [500, 250], [670, 390]], 4),
    rect(470, 510, 60, 100, 4),
    rect(390, 450, 55, 55, 4),
    rect(555, 450, 55, 55, 4)
  ];

  if (intent.sceneType === 'simple_scene' && intent.secondarySubject === 'tree') {
    houseElements.push(
      rect(690, 450, 70, 140, 5),
      circle(725, 365, 95, 5),
      line(250, 610, 800, 610, 3)
    );
  }

  return {
    background: '#FFFFFF',
    sceneType: intent.sceneType,
    primarySubject: intent.subject,
    secondarySubject: intent.secondarySubject,
    composition: intent.composition,
    mainParts: intent.parts,
    elements: fitAndCenterPlanElements(dedupeElements(houseElements.filter(Boolean)))
  };
}

function renderAnimalFace(intent) {
  const isCat = intent.subject === 'cat';
  const elements = [
    circle(500, 390, 120, 4),
    circle(455, 375, 12, 4),
    circle(545, 375, 12, 4),
    arc(500, 445, 35, 0.15, Math.PI - 0.15, 3)
  ];

  if (isCat) {
    elements.push(
      polygon([[420, 305], [455, 225], [490, 310]], 4),
      polygon([[510, 310], [545, 225], [580, 305]], 4),
      polygon([[500, 405], [485, 430], [515, 430]], 4),
      line(470, 430, 410, 415, 3),
      line(470, 442, 400, 445, 3),
      line(530, 430, 590, 415, 3),
      line(530, 442, 600, 445, 3)
    );
  }

  return {
    background: '#FFFFFF',
    sceneType: intent.sceneType,
    primarySubject: intent.subject,
    secondarySubject: intent.secondarySubject,
    composition: intent.composition,
    mainParts: intent.parts,
    elements: fitAndCenterPlanElements(dedupeElements(elements.filter(Boolean)))
  };
}

function renderVehicle(intent) {
  if (intent.subject === 'boat' || intent.features.includes('sail')) {
    return {
      background: '#FFFFFF',
      sceneType: intent.sceneType,
      primarySubject: intent.subject,
      secondarySubject: intent.secondarySubject,
      composition: intent.composition,
      mainParts: intent.parts,
      elements: fitAndCenterPlanElements(dedupeElements([
        polygon([[360, 500], [640, 500], [590, 560], [410, 560]], 4),
        line(500, 300, 500, 500, 4),
        polygon([[500, 320], [500, 470], [610, 430]], 4),
        line(300, 585, 700, 585, 3)
      ].filter(Boolean)))
    };
  }

  return {
    background: '#FFFFFF',
    sceneType: intent.sceneType,
    primarySubject: intent.subject,
    secondarySubject: intent.secondarySubject,
    composition: intent.composition,
    mainParts: intent.parts,
    elements: fitAndCenterPlanElements(dedupeElements([
      rect(350, 430, 300, 110, 4),
      polygon([[400, 430], [470, 370], [580, 370], [640, 430]], 4),
      circle(430, 560, 38, 4),
      circle(570, 560, 38, 4)
    ].filter(Boolean)))
  };
}

function renderContainer(intent) {
  return {
    background: '#FFFFFF',
    sceneType: intent.sceneType,
    primarySubject: intent.subject,
    secondarySubject: intent.secondarySubject,
    composition: intent.composition,
    mainParts: intent.parts,
    elements: fitAndCenterPlanElements(dedupeElements([
      rect(410, 320, 180, 240, 4),
      arc(590, 440, 45, 1.57, 4.71, 4),
      line(410, 320, 590, 320, 4),
      line(410, 560, 590, 560, 4)
    ].filter(Boolean)))
  };
}

function renderLandscape(intent) {
  if (intent.subject === 'cloud' || intent.features.includes('cloud_puffs')) {
    return {
      background: '#FFFFFF',
      sceneType: intent.sceneType,
      primarySubject: intent.subject,
      secondarySubject: intent.secondarySubject,
      composition: intent.composition,
      mainParts: intent.parts,
      elements: fitAndCenterPlanElements(dedupeElements([
        circle(420, 390, 55, 4),
        circle(500, 350, 75, 4),
        circle(585, 390, 55, 4),
        line(365, 435, 640, 435, 4)
      ].filter(Boolean)))
    };
  }

  return {
    background: '#FFFFFF',
    sceneType: intent.sceneType,
    primarySubject: intent.subject,
    secondarySubject: intent.secondarySubject,
    composition: intent.composition,
    mainParts: intent.parts,
    elements: fitAndCenterPlanElements(dedupeElements([
      polygon([[250, 620], [430, 360], [610, 620]], 4),
      polygon([[470, 620], [660, 330], [850, 620]], 4)
    ].filter(Boolean)))
  };
}

function renderSymbol(intent) {
  return {
    background: '#FFFFFF',
    sceneType: intent.sceneType,
    primarySubject: intent.subject,
    secondarySubject: intent.secondarySubject,
    composition: intent.composition,
    mainParts: intent.parts,
    elements: fitAndCenterPlanElements(dedupeElements([
      polygon([
        [500, 250],
        [545, 355],
        [660, 365],
        [570, 440],
        [600, 555],
        [500, 495],
        [400, 555],
        [430, 440],
        [340, 365],
        [455, 355]
      ], 4)
    ].filter(Boolean)))
  };
}

function renderWeather(intent) {
  if (intent.subject === 'rainbow' || intent.features.includes('rainbow')) {
    return {
      background: '#FFFFFF',
      sceneType: intent.sceneType,
      primarySubject: intent.subject,
      secondarySubject: intent.secondarySubject,
      composition: intent.composition,
      mainParts: intent.parts,
      elements: fitAndCenterPlanElements(dedupeElements([
        arc(500, 620, 240, Math.PI, Math.PI * 2, 4),
        arc(500, 620, 190, Math.PI, Math.PI * 2, 4),
        arc(500, 620, 140, Math.PI, Math.PI * 2, 4)
      ].filter(Boolean)))
    };
  }

  return {
    background: '#FFFFFF',
    sceneType: intent.sceneType,
    primarySubject: intent.subject,
    secondarySubject: intent.secondarySubject,
    composition: intent.composition,
    mainParts: intent.parts,
    elements: fitAndCenterPlanElements(dedupeElements([
      circle(420, 390, 55, 4),
      circle(500, 350, 75, 4),
      circle(585, 390, 55, 4),
      line(365, 435, 640, 435, 4),
      circle(650, 260, 45, 4),
      line(650, 195, 650, 155, 4),
      line(650, 325, 650, 365, 4)
    ].filter(Boolean)))
  };
}

function renderFood(intent) {
  if (intent.subject === 'ice cream') {
    return {
      background: '#FFFFFF',
      sceneType: intent.sceneType,
      primarySubject: intent.subject,
      secondarySubject: intent.secondarySubject,
      composition: intent.composition,
      mainParts: intent.parts,
      elements: fitAndCenterPlanElements(dedupeElements([
        circle(500, 300, 90, 4),
        polygon([[440, 390], [560, 390], [500, 620]], 4)
      ].filter(Boolean)))
    };
  }

  return {
    background: '#FFFFFF',
    sceneType: intent.sceneType,
    primarySubject: intent.subject,
    secondarySubject: intent.secondarySubject,
    composition: intent.composition,
    mainParts: intent.parts,
    elements: fitAndCenterPlanElements(dedupeElements([
      circle(500, 390, 110, 4),
      line(500, 280, 500, 225, 4),
      line(500, 250, 545, 220, 4)
    ].filter(Boolean)))
  };
}

function renderSeaAnimal(intent) {
  return {
    background: '#FFFFFF',
    sceneType: intent.sceneType,
    primarySubject: intent.subject,
    secondarySubject: intent.secondarySubject,
    composition: intent.composition,
    mainParts: intent.parts,
    elements: fitAndCenterPlanElements(dedupeElements([
      ellipse(500, 390, 150, 90, 4),
      polygon([[650, 390], [760, 320], [760, 460]], 4),
      circle(430, 375, 10, 4),
      polyline([[520, 350], [580, 320], [620, 350]], 4),
      polyline([[520, 430], [580, 460], [620, 430]], 4)
    ].filter(Boolean)))
  };
}

function renderFlyingAnimal(intent) {
  if (intent.subject === 'butterfly') {
    return {
      background: '#FFFFFF',
      sceneType: intent.sceneType,
      primarySubject: intent.subject,
      secondarySubject: intent.secondarySubject,
      composition: intent.composition,
      mainParts: intent.parts,
      elements: fitAndCenterPlanElements(dedupeElements([
        line(500, 280, 500, 560, 4),
        ellipse(435, 370, 80, 110, 4),
        ellipse(565, 370, 80, 110, 4),
        ellipse(445, 490, 65, 90, 4),
        ellipse(555, 490, 65, 90, 4)
      ].filter(Boolean)))
    };
  }

  return {
    background: '#FFFFFF',
    sceneType: intent.sceneType,
    primarySubject: intent.subject,
    secondarySubject: intent.secondarySubject,
    composition: intent.composition,
    mainParts: intent.parts,
    elements: fitAndCenterPlanElements(dedupeElements([
      ellipse(500, 420, 110, 75, 4),
      polyline([[430, 420], [350, 350], [390, 450]], 4),
      polyline([[570, 420], [650, 350], [610, 450]], 4),
      polygon([[610, 410], [660, 430], [610, 455]], 4),
      circle(450, 405, 8, 4)
    ].filter(Boolean)))
  };
}

function renderGenericObject(intent) {
  if (intent.subject === 'balloon' || intent.features.includes('floating')) {
    return {
      background: '#FFFFFF',
      sceneType: intent.sceneType,
      primarySubject: intent.subject,
      secondarySubject: intent.secondarySubject,
      composition: intent.composition,
      mainParts: intent.parts,
      elements: fitAndCenterPlanElements(dedupeElements([
        ellipse(500, 340, 90, 120, 4),
        line(500, 460, 500, 650, 3),
        line(500, 650, 470, 700, 3)
      ].filter(Boolean)))
    };
  }

  return {
    background: '#FFFFFF',
    sceneType: intent.sceneType,
    primarySubject: intent.subject,
    secondarySubject: intent.secondarySubject,
    composition: intent.composition,
    mainParts: intent.parts,
    elements: fitAndCenterPlanElements(dedupeElements([
      circle(500, 380, 110, 4),
      line(430, 500, 570, 500, 4)
    ].filter(Boolean)))
  };
}

function buildSketchFromIntent(intent, prompt) {
  const safeIntent = normalizeIntent(intent || inferIntentFromPrompt(prompt));

  if (safeIntent.category === 'plant') return renderPlant(safeIntent);
  if (safeIntent.category === 'celestial') return renderCelestial(safeIntent);
  if (safeIntent.category === 'building') return renderBuilding(safeIntent);
  if (safeIntent.category === 'animal_face') return renderAnimalFace(safeIntent);
  if (safeIntent.category === 'vehicle') return renderVehicle(safeIntent);
  if (safeIntent.category === 'container') return renderContainer(safeIntent);
  if (safeIntent.category === 'landscape') return renderLandscape(safeIntent);
  if (safeIntent.category === 'symbol') return renderSymbol(safeIntent);
  if (safeIntent.category === 'weather') return renderWeather(safeIntent);
  if (safeIntent.category === 'food') return renderFood(safeIntent);
  if (safeIntent.category === 'sea_animal') return renderSeaAnimal(safeIntent);
  if (safeIntent.category === 'flying_animal') return renderFlyingAnimal(safeIntent);

  return renderGenericObject(safeIntent);
}

function drawElement(ctx, canvas, el) {
  ctx.beginPath();
  ctx.strokeStyle = el.stroke;
  ctx.fillStyle = el.fill || 'transparent';
  ctx.lineWidth = el.strokeWidth;

  if (el.type === 'line') {
    ctx.moveTo(toCanvasX(el.x1, canvas), toCanvasY(el.y1, canvas));
    ctx.lineTo(toCanvasX(el.x2, canvas), toCanvasY(el.y2, canvas));
  }

  if (
    el.type === 'polyline' &&
    Array.isArray(el.points) &&
    el.points.length >= 2 &&
    el.points.every((p) => Array.isArray(p) && p.length >= 2)
  ) {
    ctx.moveTo(toCanvasX(el.points, canvas), toCanvasY(el.points, canvas));
    for (let i = 1; i < el.points.length; i++) {
      ctx.lineTo(toCanvasX(el.points[i], canvas), toCanvasY(el.points[i], canvas));
    }
  }

  if (
    el.type === 'polygon' &&
    Array.isArray(el.points) &&
    el.points.length >= 3 &&
    el.points.every((p) => Array.isArray(p) && p.length >= 2)
  ) {
    ctx.moveTo(toCanvasX(el.points[0][0], canvas), toCanvasY(el.points[0][1], canvas));
    for (let i = 1; i < el.points.length; i++) {
      ctx.lineTo(toCanvasX(el.points[i][0], canvas), toCanvasY(el.points[i][1], canvas));
    }
    ctx.closePath();
  }

  if (el.type === 'circle') {
    ctx.arc(
      toCanvasX(el.cx, canvas),
      toCanvasY(el.cy, canvas),
      toCanvasRadius(el.r, canvas),
      0,
      Math.PI * 2
    );
  }

  if (el.type === 'ellipse') {
    ctx.ellipse(
      toCanvasX(el.cx, canvas),
      toCanvasY(el.cy, canvas),
      toCanvasRadius(el.rx, canvas),
      toCanvasRadius(el.ry, canvas),
      0,
      0,
      Math.PI * 2
    );
  }

  if (el.type === 'rect') {
    ctx.rect(
      toCanvasX(el.x, canvas),
      toCanvasY(el.y, canvas),
      Math.round((normCoord(el.w) / 1000) * canvas.width),
      Math.round((normCoord(el.h) / 1000) * canvas.height)
    );
  }

  if (el.type === 'arc') {
    ctx.arc(
      toCanvasX(el.cx, canvas),
      toCanvasY(el.cy, canvas),
      toCanvasRadius(el.r, canvas),
      el.startAngle,
      el.endAngle
    );
  }

  if (el.fill) ctx.fill();
  ctx.stroke();
}

export function drawPlanOnCanvas(plan) {
  const ctx = getPaintCtx();
  const canvas = getPaintCanvas();

  if (!ctx || !canvas) {
    throw new Error('Canvas not Available.');
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const el of plan.elements) {
    drawElement(ctx, canvas, el);
  }
}

export async function generateDrawingFromPrompt(prompt) {
  const trimmed = String(prompt || '').trim();
  if (!trimmed) {
    throw new Error('Prompt vazia.');
  }

  let intent;

  try {
    intent = await askDrawingIntent(trimmed);
  } catch (err) {
    console.warn('Intent model failed, using local inference:', err);
    intent = inferIntentFromPrompt(trimmed);
  }

  const rawPlan = validatePlan(buildSketchFromIntent(intent, trimmed));
  const boostedPlan = boostPlanStroke(rawPlan);
  const plan = {
    ...boostedPlan,
    elements: fitAndCenterPlanElements(boostedPlan.elements)
  };

  console.log('Generated intent:', intent);
  console.log('Generated heuristic drawing plan:', plan);

  drawPlanOnCanvas(plan);
  updateDoodleColors();

  return plan;
}

function clearPromptSketch() {
  const ctx = getPaintCtx();
  const canvas = getPaintCanvas();

  if (!ctx || !canvas) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

export function initPromptDraw() {
  const form = document.querySelector('#promptDrawForm');
  const input = document.querySelector('#promptDrawInput');
  const status = document.querySelector('#promptDrawStatus');
  const clearBtn = document.querySelector('#promptDrawClear');

  if (!form || !input || !status) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const prompt = input.value.trim();
    if (!prompt) {
      status.textContent = 'Write prompt first.';
      return;
    }

    status.textContent = 'Generating Sketch...';

    try {
      const plan = await generateDrawingFromPrompt(prompt);
      console.log('Generated drawing plan:', plan);
      status.textContent = 'Sketch Generated. You can edit it on Canvas.';
    } catch (err) {
      console.error('Prompt draw error:', err);
      status.textContent = 'Error Generating Sketch. See console for details.';
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearPromptSketch();
      status.textContent = 'Canvas Clear.';
    });
  }
}