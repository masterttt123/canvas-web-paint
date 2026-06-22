import { paintInit } from './paint.js';
import { startDoodleSuggestions } from './doodle.js';
import { initPromptDraw } from './prompt_draw.js';

paintInit(startDoodleSuggestions);
initPromptDraw();