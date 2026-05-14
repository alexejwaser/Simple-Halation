/**
 * Simple Halation — Panel JavaScript
 * Runs in CEP's embedded Chromium. Bridges the UI to Premiere Pro via CSInterface.
 */

(function () {
    'use strict';

    // ── CSInterface ────────────────────────────────────────────────────────────
    var cs = new CSInterface();

    // ── Settings model ─────────────────────────────────────────────────────────
    var DEFAULTS = {
        threshold:     200,
        blurRadius:    15,
        colorTemp:     60,
        intensity:     40,
        highlightBias: 50
    };

    var settings = copyObj(DEFAULTS);

    // ── Presets ────────────────────────────────────────────────────────────────
    var PRESETS = {
        subtle: { threshold: 220, blurRadius:  8, colorTemp: 45, intensity: 25, highlightBias: 35 },
        medium: { threshold: 200, blurRadius: 15, colorTemp: 60, intensity: 40, highlightBias: 50 },
        strong: { threshold: 170, blurRadius: 28, colorTemp: 80, intensity: 65, highlightBias: 70 }
    };

    // ── Slider metadata ────────────────────────────────────────────────────────
    var PARAM_META = {
        threshold:     { suffix: '',  decimals: 0 },
        blurRadius:    { suffix: '',  decimals: 1 },
        colorTemp:     { suffix: '',  decimals: 0 },
        intensity:     { suffix: '%', decimals: 0 },
        highlightBias: { suffix: '',  decimals: 0 }
    };

    // ── Debounce timer ─────────────────────────────────────────────────────────
    var applyTimer = null;

    // ── DOM refs ───────────────────────────────────────────────────────────────
    var sliders = {};
    var valueDomEls = {};
    var statusEl;

    // ── Init ───────────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        statusEl = document.getElementById('status');

        // Cache slider and value-display elements
        var paramNames = Object.keys(DEFAULTS);
        for (var i = 0; i < paramNames.length; i++) {
            var p = paramNames[i];
            sliders[p]      = document.getElementById('slider-' + p);
            valueDomEls[p]  = document.getElementById('val-' + p);
        }

        // Bind slider events
        for (var j = 0; j < paramNames.length; j++) {
            bindSlider(paramNames[j]);
        }

        // Preset buttons
        document.getElementById('btn-subtle').addEventListener('click', function () { applyPreset('subtle'); });
        document.getElementById('btn-medium').addEventListener('click', function () { applyPreset('medium'); });
        document.getElementById('btn-strong').addEventListener('click', function () { applyPreset('strong'); });

        // Action buttons
        document.getElementById('btn-reset').addEventListener('click',  resetDefaults);
        document.getElementById('btn-remove').addEventListener('click', removeEffect);
        document.getElementById('btn-export').addEventListener('click', exportSettings);
        document.getElementById('btn-import').addEventListener('click', importSettings);

        // Premiere theme sync
        cs.addEventListener(CSInterface.THEME_COLOR_CHANGED_EVENT, syncTheme);
        syncTheme();

        // Startup JSX handshake
        cs.evalScript('initHalation()', function (result) {
            try {
                var r = JSON.parse(result);
                if (r.ready) {
                    showStatus('Ready (Premiere ' + r.version + ')', 'ok');
                } else {
                    showStatus(r.message || 'Open a project to begin.', '');
                }
            } catch (e) {
                showStatus('Panel loaded.', '');
            }
        });
    });

    // ── Slider binding ─────────────────────────────────────────────────────────
    function bindSlider(param) {
        var slider = sliders[param];
        if (!slider) { return; }
        slider.addEventListener('input', function () {
            var raw = parseFloat(this.value);
            settings[param] = raw;
            updateValueDisplay(param, raw);
            scheduleApply();
        });
    }

    function updateValueDisplay(param, value) {
        var el   = valueDomEls[param];
        var meta = PARAM_META[param];
        if (!el || !meta) { return; }
        var display = (meta.decimals > 0)
            ? value.toFixed(meta.decimals)
            : Math.round(value).toString();
        el.textContent = display + meta.suffix;
    }

    function updateAllSliderUI() {
        var paramNames = Object.keys(settings);
        for (var i = 0; i < paramNames.length; i++) {
            var p = paramNames[i];
            if (sliders[p]) {
                sliders[p].value = settings[p];
            }
            updateValueDisplay(p, settings[p]);
        }
    }

    // ── Apply (debounced) ──────────────────────────────────────────────────────
    function scheduleApply() {
        if (applyTimer) { clearTimeout(applyTimer); }
        applyTimer = setTimeout(applyHalation, 150);
    }

    function applyHalation() {
        var cmd = 'applyHalationEffect(' + JSON.stringify(JSON.stringify(settings)) + ')';
        cs.evalScript(cmd, function (result) {
            try {
                var r = JSON.parse(result);
                showStatus(r.success ? 'Applied.' : ('Error: ' + r.message), r.success ? 'ok' : 'error');
            } catch (e) {
                showStatus('Unexpected response.', 'error');
            }
        });
    }

    // ── Presets ────────────────────────────────────────────────────────────────
    function applyPreset(name) {
        var preset = PRESETS[name];
        if (!preset) { return; }
        var keys = Object.keys(preset);
        for (var i = 0; i < keys.length; i++) {
            settings[keys[i]] = preset[keys[i]];
        }
        updateAllSliderUI();
        applyHalation();
    }

    // ── Reset ──────────────────────────────────────────────────────────────────
    function resetDefaults() {
        settings = copyObj(DEFAULTS);
        updateAllSliderUI();
        applyHalation();
    }

    // ── Remove effect ──────────────────────────────────────────────────────────
    function removeEffect() {
        cs.evalScript('removeHalationEffect()', function (result) {
            try {
                var r = JSON.parse(result);
                if (r.success) {
                    showStatus('Removed ' + (r.removed || 0) + ' layer(s).', 'ok');
                } else {
                    showStatus('Error: ' + r.message, 'error');
                }
            } catch (e) {
                showStatus('Remove failed.', 'error');
            }
        });
    }

    // ── Export ─────────────────────────────────────────────────────────────────
    function exportSettings() {
        var json = JSON.stringify(settings, null, 2);
        var cmd  = 'exportSettingsFile(' + JSON.stringify(json) + ')';
        cs.evalScript(cmd, function (result) {
            try {
                var r = JSON.parse(result);
                showStatus(r.success ? 'Exported to ' + r.path : 'Export cancelled.', r.success ? 'ok' : '');
            } catch (e) {
                showStatus('Export error.', 'error');
            }
        });
    }

    // ── Import ─────────────────────────────────────────────────────────────────
    function importSettings() {
        cs.evalScript('importSettingsFile()', function (result) {
            try {
                var r = JSON.parse(result);
                if (!r.success) {
                    showStatus(r.message === 'Cancelled' ? 'Import cancelled.' : 'Import error: ' + r.message, '');
                    return;
                }
                var imported = JSON.parse(r.json);
                if (!validateSettings(imported)) {
                    showStatus('Invalid settings file.', 'error');
                    return;
                }
                settings = clampSettings(imported);
                updateAllSliderUI();
                applyHalation();
                showStatus('Settings imported.', 'ok');
            } catch (e) {
                showStatus('Parse error: ' + e.message, 'error');
            }
        });
    }

    function validateSettings(obj) {
        var required = ['threshold', 'blurRadius', 'colorTemp', 'intensity', 'highlightBias'];
        for (var i = 0; i < required.length; i++) {
            if (typeof obj[required[i]] !== 'number') { return false; }
        }
        return true;
    }

    function clampSettings(obj) {
        return {
            threshold:     clamp(obj.threshold,     0,   255),
            blurRadius:    clamp(obj.blurRadius,     0,   50),
            colorTemp:     clamp(obj.colorTemp,      0,   100),
            intensity:     clamp(obj.intensity,      0,   100),
            highlightBias: clamp(obj.highlightBias,  0,   100)
        };
    }

    // ── Theme sync ─────────────────────────────────────────────────────────────
    function syncTheme() {
        try {
            var env = cs.getHostEnvironment();
            var bg  = env.appSkinInfo.panelBackgroundColor.color;
            var luma = 0.299 * bg.red + 0.587 * bg.green + 0.114 * bg.blue;
            if (luma > 128) {
                // Light theme — adjust CSS variables
                document.documentElement.style.setProperty('--ppro-bg',    'rgb(' + bg.red + ',' + bg.green + ',' + bg.blue + ')');
                document.documentElement.style.setProperty('--ppro-text',  '#111111');
                document.documentElement.style.setProperty('--ppro-muted', '#555555');
            }
        } catch (e) { /* best effort */ }
    }

    // ── Utilities ──────────────────────────────────────────────────────────────
    function showStatus(msg, type) {
        statusEl.textContent = msg;
        statusEl.className   = type ? ('status-' + type) : '';
        if (type === 'ok') {
            // Fade back to muted after 3 s
            clearTimeout(statusEl._fadeTimer);
            statusEl._fadeTimer = setTimeout(function () {
                statusEl.className = '';
            }, 3000);
        }
    }

    function copyObj(src) {
        var out = {};
        var keys = Object.keys(src);
        for (var i = 0; i < keys.length; i++) { out[keys[i]] = src[keys[i]]; }
        return out;
    }

    function clamp(v, min, max) {
        return v < min ? min : v > max ? max : v;
    }

}());
