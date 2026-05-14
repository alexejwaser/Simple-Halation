# Simple Halation

A professional film halation effect plugin for Adobe Premiere Pro, built as a CEP panel extension (CSXS/CEP 11). Applies a non-destructive halation effect to your edit using two stacked adjustment layers controlled by a clean dark-themed panel.

## What it does

Simulates optical film halation by:

1. Isolating highlight luminance above a user-defined threshold
2. Blurring those highlights with a Gaussian blur
3. Colorizing the blurred result warm red-orange (like film halation)
4. Compositing it back over the original using Screen blend mode

The effect is fully non-destructive — all processing happens on two dedicated adjustment layers (`HALATION_BLUR` and `HALATION_COLOR`) that are added to your sequence.

## Controls

| Parameter | Range | Description |
|---|---|---|
| **Threshold** | 0–255 | Luminance threshold above which highlights trigger halation |
| **Blur Radius** | 0–50 | Gaussian blur spread of the glow (pixels) |
| **Color Temperature** | 0–100 | Neutral white (0) → deep red-orange (100) |
| **Intensity** | 0–100% | Overall opacity of the halation layer |
| **Highlight Bias** | 0–100 | Falloff curve — how quickly halation fades from peak highlights |

### Presets
- **Subtle** — Gentle halation on very bright highlights
- **Medium** — Classic film look (default)
- **Strong** — Dramatic warm bloom

### Actions
- **Reset** — Restore all sliders to defaults
- **Remove** — Delete both halation adjustment layers from the sequence
- **Export JSON** — Save current settings to a `.json` file
- **Import JSON** — Load settings from a previously exported `.json` file

## Requirements

- Adobe Premiere Pro 2022 or later (tested on Premiere Pro 2024–2026)
- macOS or Windows

## Installation

### Step 1 — Enable unsigned extension loading

**macOS** — open Terminal and run:

```bash
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
```

**Windows** — open Registry Editor (`regedit`) and create these String values:

```
HKEY_CURRENT_USER\Software\Adobe\CSXS.11
  PlayerDebugMode = "1"

HKEY_CURRENT_USER\Software\Adobe\CSXS.12
  PlayerDebugMode = "1"
```

### Step 2 — Copy the extension

**macOS:**

```bash
# Option A: Symlink (recommended for development — edits take effect on panel refresh)
ln -s /path/to/Simple-Halation \
  "$HOME/Library/Application Support/Adobe/CEP/extensions/Simple-Halation"

# Option B: Copy
cp -r /path/to/Simple-Halation \
  "$HOME/Library/Application Support/Adobe/CEP/extensions/Simple-Halation"
```

**Windows:**

Copy the `Simple-Halation` folder to:

```
C:\Users\[YourUsername]\AppData\Roaming\Adobe\CEP\extensions\Simple-Halation\
```

### Step 3 — Open the panel in Premiere Pro

1. Restart Premiere Pro
2. Go to **Window → Extensions → Simple Halation**
3. Open a project and make sure a sequence is active
4. Drag a slider or click a preset to apply the effect

## Developer notes

### Debugging

The manifest enables Chrome remote debugging on port 7777. With the panel open, navigate to `http://localhost:7777` in Chrome to get DevTools for the panel's Chromium process.

To reload JSX changes without restarting Premiere, use the panel's fly-out menu → **Refresh panel**, or call:

```javascript
cs.evalScript('$.evalFile("' + extensionRoot + 'jsx/hostscript.jsx")')
```

### How the effect works (technical)

The JSX host script (`jsx/hostscript.jsx`) uses the Premiere Pro ExtendScript DOM API plus the QE API:

- `app.enableQE()` + `qe.project.newAdjustmentLayer()` — creates adjustment layer project items
- `seq.videoTracks.addTrack()` + `track.insertClip()` — places them on dedicated tracks
- `clip.components.addComponent(matchName)` — applies built-in effects by match name:
  - `"AE.ADBE Gaussian Blur 2"` — blur layer
  - `"AE.ADBE Levels2"` — highlight isolation
  - `"AE.ADBE Tint"` — warm colorization
- `clip.blendMode = 6` — Screen blend mode
- `clip.opacity.setValue(v, true)` — overall intensity

Parameter updates are debounced at 150 ms so dragging a slider doesn't flood Premiere with calls.

## File structure

```
Simple-Halation/
├── CSXS/
│   └── manifest.xml        Extension registration (CEP 11, PPRO 14–99)
├── index.html              Panel UI
├── css/
│   └── style.css           Premiere dark-theme styling
├── js/
│   ├── CSInterface.js      Adobe CEP bridge library
│   └── main.js             Panel logic, slider bridge, presets, import/export
└── jsx/
    └── hostscript.jsx      ExtendScript: effect creation and parameter control
```

## License

MIT — see [LICENSE](LICENSE)
