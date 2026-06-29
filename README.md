# Human-AI Interaction - FCUL 2025/2026

**Authors:**

- Tiago Pereira - 55854
- Pedro Gomes - 58167
- Benjamim Noronha - 66113

# Installation

In order to run this program you must install and have open in the background during usage the [Ollama Model Suite](https://ollama.com/download).

The following models must also be installed:
- `llama3.1:latest`
- `qwen2.5-coder:3b`

Run the `index.html` as server (install the extension `Live Server` if you use the Visual Studios Code) and enjoy!

# Usage

`Prompt-To-Color Suggestion`: on the left menu below the Clear/Save buttons, select the number of suggestions you want to receive, then write a short description of the object/scene you want color suggestions for, and then press generate. You will be given a list of colors in small squares, select one and draw on the canvas.

`Doodle Detection`: Simply draw something, and in the left menu, below the Prompt-To-Color zone, you will be given the model's prediction of what your doodle is, along with color and feature suggestions.

`AI Autocomplete`: Simply draw something, then press the AI Autocomplete button on the left menu, below the Doddle Detection Zone. A new tab will appear with the model's additions to your drawing, and you can then accept them or generate again; if you want reject them, close the new tab.

`WebCam:` Similar to doodle detection, but instead of reading the canvas the model reads the webcam. Press The "Turn on Webcam" button below the AI Autocomplete button, in the left menu. You can also click it again to turn it off.

`Promt-To-Sketch`: use the text box in the top of the canvas to prompt the model to draw a scene or object. Keep in mind that you must manually clear the screen beforehand, or else the model will simply draw on top of whats already present.

# Feedback
You can see on this [link](https://docs.google.com/forms/d/1oeC41lQcAEMcx0tHfRoOE1yzLY0y3VFb8ESnti0b4Xo/edit#responses), the case study with 11 participants, which is the feedback on the application.

#####
---

Original canvas-web-paint module developed by [Hossein Rajabi](https://github.com/hobert-rj).
