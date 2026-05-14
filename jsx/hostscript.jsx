/**
 * Simple Halation - ExtendScript Host Script
 * Runs inside Premiere Pro's scripting engine (ES3/ES5).
 * Loaded automatically via ScriptPath in manifest.xml.
 *
 * Effect chain architecture:
 *   HALATION_BLUR  (lower adj layer): Gaussian Blur + Levels (isolates highlights)
 *   HALATION_COLOR (upper adj layer): Tint (warm colorization) + Screen blend + opacity
 */

// ─── Constants ───────────────────────────────────────────────────────────────

var LAYER_BLUR_NAME  = "HALATION_BLUR";
var LAYER_COLOR_NAME = "HALATION_COLOR";

// Blend mode integer constants (Premiere Pro scripting DOM)
var BLEND_NORMAL   = 0;
var BLEND_SCREEN   = 6;

// Effect matchNames
var FX_GAUSSIAN_BLUR = "AE.ADBE Gaussian Blur 2";
var FX_LEVELS        = "AE.ADBE Levels2";
var FX_TINT          = "AE.ADBE Tint";

// ─── Public API (called via cs.evalScript) ───────────────────────────────────

function initHalation() {
    try {
        if (!app || !app.project) {
            return JSON.stringify({ ready: false, message: "No project open" });
        }
        return JSON.stringify({ ready: true, version: app.version });
    } catch (e) {
        return JSON.stringify({ ready: false, message: e.toString() });
    }
}

function applyHalationEffect(settingsJSON) {
    try {
        var s = JSON.parse(settingsJSON);

        if (!app.project) {
            return JSON.stringify({ success: false, message: "No project open" });
        }
        var seq = app.project.activeSequence;
        if (!seq) {
            return JSON.stringify({ success: false, message: "No active sequence. Open a sequence first." });
        }

        app.enableQE();

        var blurClip  = findOrCreateHalationLayer(seq, LAYER_BLUR_NAME,  0);
        var colorClip = findOrCreateHalationLayer(seq, LAYER_COLOR_NAME, 1);

        if (!blurClip) {
            return JSON.stringify({ success: false, message: "Could not create blur adjustment layer." });
        }
        if (!colorClip) {
            return JSON.stringify({ success: false, message: "Could not create color adjustment layer." });
        }

        configureBlurLayer(blurClip,  s.threshold, s.blurRadius, s.highlightBias);
        configureColorLayer(colorClip, s.colorTemp, s.intensity);

        return JSON.stringify({ success: true });
    } catch (e) {
        return JSON.stringify({ success: false, message: e.toString() });
    }
}

function removeHalationEffect() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) {
            return JSON.stringify({ success: false, message: "No active sequence." });
        }
        var tracks = seq.videoTracks;
        var removed = 0;
        for (var ti = tracks.numTracks - 1; ti >= 0; ti--) {
            var track = tracks[ti];
            for (var ci = track.clips.numItems - 1; ci >= 0; ci--) {
                var clip = track.clips[ci];
                if (clip.name === LAYER_BLUR_NAME || clip.name === LAYER_COLOR_NAME) {
                    clip.remove(false, false);
                    removed++;
                }
            }
        }
        return JSON.stringify({ success: true, removed: removed });
    } catch (e) {
        return JSON.stringify({ success: false, message: e.toString() });
    }
}

function exportSettingsFile(jsonString) {
    try {
        var f = File.saveDialog("Export Halation Settings", "JSON:*.json");
        if (!f) {
            return JSON.stringify({ success: false, message: "Cancelled" });
        }
        f.open("w");
        f.write(jsonString);
        f.close();
        return JSON.stringify({ success: true, path: f.fsName });
    } catch (e) {
        return JSON.stringify({ success: false, message: e.toString() });
    }
}

function importSettingsFile() {
    try {
        var f = File.openDialog("Import Halation Settings", "JSON:*.json");
        if (!f || !f.exists) {
            return JSON.stringify({ success: false, message: "Cancelled" });
        }
        f.open("r");
        var content = f.read();
        f.close();
        return JSON.stringify({ success: true, json: content });
    } catch (e) {
        return JSON.stringify({ success: false, message: e.toString() });
    }
}

// ─── Layer management ─────────────────────────────────────────────────────────

function findOrCreateHalationLayer(seq, layerName, offset) {
    // Search existing tracks for a clip with our marker name
    var tracks = seq.videoTracks;
    var ti, ci, track, clip;
    for (ti = 0; ti < tracks.numTracks; ti++) {
        track = tracks[ti];
        for (ci = 0; ci < track.clips.numItems; ci++) {
            clip = track.clips[ci];
            if (clip.name === layerName) {
                return clip;
            }
        }
    }

    // Not found — create a new adjustment layer project item
    app.enableQE();
    if (!qe || !qe.project) {
        return null;
    }
    qe.project.newAdjustmentLayer();

    // The new item lands last in rootItem.children
    var children = app.project.rootItem.children;
    var adjItem = children[children.numItems - 1];
    if (!adjItem) {
        return null;
    }
    adjItem.name = layerName;

    // Determine the target track: find topmost occupied track, then +1 or +2
    var topOccupied = getHighestOccupiedTrackIndex(seq);
    var targetTrackIndex = topOccupied + 1 + offset;

    // Ensure enough video tracks exist
    while (seq.videoTracks.numTracks <= targetTrackIndex) {
        seq.videoTracks.addTrack();
    }

    track = seq.videoTracks[targetTrackIndex];

    // Insert the adjustment layer at timecode 0
    track.insertClip(adjItem, "0");

    // Find the new clip and extend it to the full sequence duration
    var newClip = null;
    for (ci = 0; ci < track.clips.numItems; ci++) {
        if (track.clips[ci].projectItem && track.clips[ci].projectItem.name === layerName) {
            newClip = track.clips[ci];
            break;
        }
    }
    // Fallback: grab the clip at time 0
    if (!newClip && track.clips.numItems > 0) {
        newClip = track.clips[0];
    }

    if (newClip) {
        try {
            newClip.end = seq.end;
        } catch (e) {
            // seq.end may not be assignable directly in all versions; use ticks
            try {
                newClip.end = new Time();
                newClip.end.ticks = seq.end.ticks;
            } catch (e2) { /* best effort */ }
        }
        newClip.name = layerName;
    }

    return newClip;
}

function getHighestOccupiedTrackIndex(seq) {
    var tracks = seq.videoTracks;
    var highest = -1;
    for (var ti = 0; ti < tracks.numTracks; ti++) {
        if (tracks[ti].clips.numItems > 0) {
            highest = ti;
        }
    }
    return highest;
}

// ─── Effect configuration ─────────────────────────────────────────────────────

function clearCustomComponents(clip) {
    // Component index 0 is always "Intrinsic Effects" (Motion/Opacity) — never remove it.
    // Remove all others from the top down to avoid index-shift bugs.
    var comps = clip.components;
    var i;
    for (i = comps.numItems - 1; i >= 1; i--) {
        try {
            comps.removeComponent(comps[i]);
        } catch (e) { /* ignore if un-removable */ }
    }
}

function configureBlurLayer(clip, threshold, blurRadius, highlightBias) {
    clearCustomComponents(clip);

    var comps = clip.components;

    // 1. Gaussian Blur — blurs the entire layer (highlights will be isolated by Levels below)
    var blur = comps.addComponent(FX_GAUSSIAN_BLUR);
    if (blur) {
        blur.properties[0].setValue(blurRadius, true);  // Blurriness (pixels)
        blur.properties[1].setValue(0, true);            // Blur Dimensions: H+V
        blur.properties[2].setValue(true, true);          // Repeat Edge Pixels
    }

    // 2. Levels — pushes input black up to threshold so only highlights survive
    //    input black = threshold/255, gamma = falloff curve from highlightBias
    var levels = comps.addComponent(FX_LEVELS);
    if (levels) {
        var inputBlack = threshold / 255.0;
        var gamma      = 1.0 - (highlightBias / 100.0) * 0.6;  // 1.0 → 0.4
        levels.properties[0].setValue(0, true);             // Channel: RGB
        levels.properties[1].setValue(inputBlack, true);    // Input Black
        levels.properties[2].setValue(1.0, true);            // Input White
        levels.properties[3].setValue(gamma, true);          // Gamma
        levels.properties[4].setValue(0.0, true);            // Output Black
        levels.properties[5].setValue(1.0, true);            // Output White
    }

    // Blur layer stays at Normal blend / 100% opacity
    try { clip.blendMode = BLEND_NORMAL; } catch (e) {}
    try { clip.opacity.setValue(1.0, true); } catch (e) {}
}

function configureColorLayer(clip, colorTemp, intensity) {
    clearCustomComponents(clip);

    var comps = clip.components;

    // 1. Tint — colorizes towards warm red-orange
    //    colorTemp 0 = neutral white, 100 = deep red-orange
    var tint = comps.addComponent(FX_TINT);
    if (tint) {
        var t   = colorTemp / 100.0;
        var warmR = 1.0;
        var warmG = clamp(0.6 - t * 0.52, 0.0, 1.0);  // 0.60 → 0.08
        var warmB = clamp(0.4 - t * 0.38, 0.0, 1.0);  // 0.40 → 0.02

        tint.properties[0].setValue([0.0, 0.0, 0.0], true);          // Map Black To: black
        tint.properties[1].setValue([warmR, warmG, warmB], true);     // Map White To: warm
        tint.properties[2].setValue(1.0, true);                        // Amount: 100%
    }

    // 2. Screen blend mode + opacity
    try { clip.blendMode = BLEND_SCREEN; } catch (e) {}
    try { clip.opacity.setValue(intensity / 100.0, true); } catch (e) {}
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function clamp(value, min, max) {
    if (value < min) { return min; }
    if (value > max) { return max; }
    return value;
}
