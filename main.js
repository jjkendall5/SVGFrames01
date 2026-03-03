// ==================== GLOBAL STATE ====================
const svg = document.getElementById('mainSvg');
const layersContainer = document.getElementById('layersContainer');
const onionSkinLayer = document.getElementById('onionSkinLayer');

// New data structure: Each layer has its own frames
const state = {
    layers: [{
        id: 'layer-1',
        name: 'Layer 1',
        visible: true,
        frames: [{ paths: [] }] // Each layer has its own frame array
    }],
    currentLayerId: 'layer-1',
    currentFrameIndex: 0, // Current playhead position
    maxFrames: 1, // Maximum frame count across all layers
    layerIdCounter: 1,
    isDrawing: false,
    currentPath: null,
    currentPoints: [],
    startPoint: null, // Store first point for shift-constrained drawing
    shiftPressed: false, // Track shift key state
    altPressed: false, // Track alt/option key for forcing circle mode
    constraintMode: false, // Toggle for touch devices (replaces shift)
    tool: 'pen',
    strokeSize: 2,
    strokeColor: '#000000',
    smoothing: 3, // Smoothing amount (0.5 = low, 3 = medium, 8 = high)
    taper: 0, // Taper amount (0-100, 0 = uniform stroke, 100 = maximum taper)
    backgroundColor: '#ffffff', // Global background color
    canvasWidth: 600, // Canvas width
    canvasHeight: 600, // Canvas height
    onionSkinEnabled: true,
    onionSkinSettings: {
        framesBefore: 1,
        framesAfter: 1,
        beforeOpacity: 30,
        afterOpacity: 30,
        beforeColor: '#ff6b6b',
        afterColor: '#4dabf7'
    },
    isPlaying: false,
    playInterval: null,
    fps: 12,
    frameClipboard: null,
    undoStack: [],
    redoStack: [],
    selection: {
        indices: [],       // Array of selected path indices in current frame
        bbox: null,        // {x, y, width, height} bounding box
        isDragging: false,
        isResizing: false,
        isRotating: false,
        isMarquee: false,
        dragStart: null,
        resizeHandle: null,
        resizeOrigin: null,
        rotateStart: null,
        rotation: 0,
        marqueeStart: null,
        originalPaths: null, // Snapshot for transform operations
        anchor: null,      // {x, y} pivot point for rotation
        anchorLocked: false, // true if user repositioned anchor
        isDraggingAnchor: false,
        rotateAnchor: null, // Fixed pivot during rotation drag
        _anchorAtDragStart: null
    }
};

// ==================== INITIALIZATION ====================
function init() {
    // Fix iOS Safari viewport height issue
    fixIOSViewportHeight();
    
    // Check what libraries are loaded
    console.log('Libraries loaded:');
    console.log('- gifshot:', typeof gifshot !== 'undefined' ? '✓' : '✗');
    console.log('- JSZip:', typeof JSZip !== 'undefined' ? '✓' : '✗');
    console.log('- FFmpegWASM:', typeof FFmpegWASM !== 'undefined' ? '✓' : '✗');
    
    // Start playback watchdog (checks for stuck states every second)
    startPlaybackWatchdog();
    
    // Start auto-save (every 30 seconds)
    startAutoSave();
    
    setupEventListeners();
    setupKeyboardShortcuts();
    loadFromLocalStorage();
    syncBackgroundUI(); // Sync UI with loaded state
    updateBackground(); // Set initial background
    updateSmoothingLabel(); // Set initial smoothing label
    updateSizeValue(); // Set initial size value
    updateTaperValue(); // Set initial taper value
    updateCanvasSizeSelector(state.canvasWidth, state.canvasHeight); // Set initial canvas size
    
    // Sync onion skin button with state
    const onionToggle = document.getElementById('onionSkinToggle');
    if (onionToggle) {
        onionToggle.classList.toggle('active', state.onionSkinEnabled);
    }
    
    renderFrame();
    updateLayerList();
    updateFrameList();
    updateFrameCounter();
}

// Watchdog timer to detect and fix stuck playback states (iPad Safari bug workaround)
function startPlaybackWatchdog() {
    setInterval(() => {
        const playBtn = document.getElementById('playBtn');
        if (!playBtn) return;
        
        const iconEl = playBtn.querySelector('.icon');
        const iconText = iconEl ? iconEl.textContent : '';
        
        // Detect mismatch: button shows stop but state says not playing
        if (iconText === '⏹' && !state.isPlaying) {
            console.error('WATCHDOG: Detected stuck playback state! Auto-fixing...');
            stopPlayback();
        }
        
        // Detect mismatch: button shows play but state says playing
        if (iconText === '▶' && state.isPlaying) {
            console.error('WATCHDOG: Detected stuck playing state! Auto-fixing...');
            stopPlayback();
        }
    }, 1000); // Check every second
}

// Auto-save functionality
let autoSaveInterval = null;

function startAutoSave() {
    // Auto-save every 30 seconds
    autoSaveInterval = setInterval(() => {
        saveToLocalStorage();
        showAutoSaveIndicator();
    }, 30000); // 30 seconds
    
    console.log('Auto-save enabled (every 30 seconds)');
}

function showAutoSaveIndicator() {
    const indicator = document.getElementById('autoSaveIndicator');
    if (!indicator) return;
    
    // Get current time
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit' 
    });
    
    // Update text and show
    indicator.textContent = `Auto-saved ${timeString}`;
    indicator.classList.add('visible');
    
    // Fade out after 2 seconds
    setTimeout(() => {
        indicator.classList.remove('visible');
    }, 2000);
}

// Fix iOS Safari viewport height (URL bar causes issues with 100vh)
function fixIOSViewportHeight() {
    // Set CSS variable for actual viewport height
    const setViewportHeight = () => {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    
    // Set on load
    setViewportHeight();
    
    // Update on resize (when URL bar shows/hides)
    window.addEventListener('resize', setViewportHeight);
    
    // Update on orientation change
    window.addEventListener('orientationchange', () => {
        setTimeout(setViewportHeight, 100); // Delay for orientation to complete
    });
}

// Update constraint button UI to show current mode
function updateConstraintButtonUI() {
    const btn = document.getElementById('constraintToggle');
    if (!btn) return;
    
    // Remove all states
    btn.classList.remove('active', 'circle-mode');
    
    if (state.altPressed) {
        // Circle mode (Shift+Alt equivalent)
        btn.classList.add('active', 'circle-mode');
        btn.title = 'Circle Mode - Perfect Circles Only (Long Press to Toggle)';
    } else if (state.constraintMode) {
        // Regular constraint mode (lines + auto-circle detection)
        btn.classList.add('active');
        btn.title = 'Constraint Mode - Straight Lines & Circles (Long Press for Circle Mode)';
    } else {
        // Off
        btn.title = 'Constraint Mode - Straight Lines & Circles (Long Press for Circle Mode)';
    }
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    // SVG drawing events - Use Pointer Events for mouse, touch, and pen support
    svg.addEventListener('pointerdown', startDrawing);
    svg.addEventListener('pointermove', draw);
    svg.addEventListener('pointerup', stopDrawing);
    svg.addEventListener('pointercancel', stopDrawing); // Handle when pointer is cancelled
    svg.addEventListener('pointerleave', stopDrawing);
    
    // Prevent context menu on long press (mobile)
    svg.addEventListener('contextmenu', (e) => e.preventDefault());

    // Tool selection
    document.getElementById('penTool').addEventListener('click', () => selectTool('pen'));
    document.getElementById('eraserTool').addEventListener('click', () => selectTool('eraser'));
    document.getElementById('selectTool').addEventListener('click', () => selectTool('select'));
    
    // Clear canvas button
    document.getElementById('clearBtn').addEventListener('click', clearCanvas);
    
    // Constraint mode toggle with long-press for circle mode
    const constraintBtn = document.getElementById('constraintToggle');
    let pressTimer = null;
    
    constraintBtn.addEventListener('click', (e) => {
        // Short click = toggle constraint mode
        if (!pressTimer) { // Only if not a long press
            state.constraintMode = !state.constraintMode;
            state.altPressed = false; // Reset alt mode
            updateConstraintButtonUI();
        }
    });
    
    // Long press detection for circle mode (mobile)
    constraintBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        pressTimer = setTimeout(() => {
            // Long press = toggle circle mode (Shift+Alt equivalent)
            state.altPressed = !state.altPressed;
            state.constraintMode = state.altPressed; // Auto-enable constraint when in circle mode
            updateConstraintButtonUI();
            
            // Haptic feedback if available
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
        }, 500); // 500ms = long press
    });
    
    constraintBtn.addEventListener('pointerup', (e) => {
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
        }
    });
    
    constraintBtn.addEventListener('pointercancel', (e) => {
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
        }
    });

    // Size slider
    document.getElementById('sizeSlider').addEventListener('input', (e) => {
        state.strokeSize = parseInt(e.target.value);
        updateSizeValue();
    });

    // Color picker
    document.getElementById('colorPicker').addEventListener('change', (e) => {
        state.strokeColor = e.target.value;
    });
    
    // Smoothing slider
    document.getElementById('smoothingSlider').addEventListener('input', (e) => {
        state.smoothing = parseFloat(e.target.value);
        updateSmoothingLabel();
    });
    
    // Taper slider
    document.getElementById('taperSlider').addEventListener('input', (e) => {
        state.taper = parseInt(e.target.value);
        updateTaperValue();
    });
    
    // Canvas size selector
    document.getElementById('canvasSizeSelect').addEventListener('change', (e) => {
        const value = e.target.value;
        
        if (value === 'custom') {
            // Show custom size dialog
            showCanvasSizeDialog();
            // Note: Don't reset here - updateCanvasSize will handle it after dialog confirms
        } else {
            // Preset size
            const [width, height] = value.split('x').map(Number);
            updateCanvasSize(width, height);
        }
    });

    // Background color picker
    document.getElementById('backgroundColorPicker').addEventListener('change', (e) => {
        state.backgroundColor = e.target.value;
        updateBackground();
        saveToLocalStorage();
    });

    // Transparent background toggle
    document.getElementById('transparentBgToggle').addEventListener('change', (e) => {
        const colorPicker = document.getElementById('backgroundColorPicker');
        if (e.target.checked) {
            state.backgroundColor = 'transparent';
            colorPicker.disabled = true;
        } else {
            state.backgroundColor = colorPicker.value;
            colorPicker.disabled = false;
        }
        updateBackground();
        saveToLocalStorage();
    });

    // Layer controls
    document.getElementById('addLayerBtn').addEventListener('click', addLayer);
    document.getElementById('duplicateLayerBtn').addEventListener('click', duplicateLayer);

    // Frame controls
    document.getElementById('addFrameBtn').addEventListener('click', addFrame);
    document.getElementById('duplicateFrameBtn').addEventListener('click', duplicateFrame);
    document.getElementById('deleteFrameBtn').addEventListener('click', deleteFrame);
    document.getElementById('copyFrameBtn').addEventListener('click', copyFrame);
    document.getElementById('pasteFrameBtn').addEventListener('click', pasteFrame);

    // Onion skin toggle
    const onionToggleBtn = document.getElementById('onionSkinToggle');
    onionToggleBtn.addEventListener('click', function() {
        // Toggle state
        state.onionSkinEnabled = !state.onionSkinEnabled;
        
        console.log('Toggled onion skin to:', state.onionSkinEnabled);
        
        // Update button appearance
        if (state.onionSkinEnabled) {
            onionToggleBtn.classList.add('active');
        } else {
            onionToggleBtn.classList.remove('active');
        }
        
        // Re-render and save
        renderFrame();
        saveToLocalStorage();
    });
    
    // Onion skin settings panel toggle
    document.getElementById('onionSkinSettings').addEventListener('click', (e) => {
        e.stopPropagation();
        const panel = document.getElementById('onionSkinPanel');
        const isVisible = panel.style.display !== 'none';
        panel.style.display = isVisible ? 'none' : 'block';
        document.getElementById('onionSkinSettings').classList.toggle('active', !isVisible);
    });
    
    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        const panel = document.getElementById('onionSkinPanel');
        const settingsBtn = document.getElementById('onionSkinSettings');
        
        if (panel.style.display === 'block' && 
            !panel.contains(e.target) && 
            !settingsBtn.contains(e.target)) {
            panel.style.display = 'none';
            settingsBtn.classList.remove('active');
        }
    });
    
    // Onion skin settings inputs
    document.getElementById('onionBefore').addEventListener('input', (e) => {
        state.onionSkinSettings.framesBefore = parseInt(e.target.value);
        renderFrame();
    });
    
    document.getElementById('onionAfter').addEventListener('input', (e) => {
        state.onionSkinSettings.framesAfter = parseInt(e.target.value);
        renderFrame();
    });
    
    document.getElementById('onionBeforeOpacity').addEventListener('input', (e) => {
        state.onionSkinSettings.beforeOpacity = parseInt(e.target.value);
        e.target.nextElementSibling.textContent = `${e.target.value}%`;
        renderFrame();
    });
    
    document.getElementById('onionAfterOpacity').addEventListener('input', (e) => {
        state.onionSkinSettings.afterOpacity = parseInt(e.target.value);
        e.target.nextElementSibling.textContent = `${e.target.value}%`;
        renderFrame();
    });
    
    document.getElementById('onionBeforeColor').addEventListener('input', (e) => {
        state.onionSkinSettings.beforeColor = e.target.value;
        renderFrame();
    });
    
    document.getElementById('onionAfterColor').addEventListener('input', (e) => {
        state.onionSkinSettings.afterColor = e.target.value;
        renderFrame();
    });

    // Playback controls - single Play/Stop toggle button
    const playBtn = document.getElementById('playBtn');
    
    let playBtnTouchHandled = false;
    
    // Use touchstart for iPad (more reliable than click)
    playBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        playBtnTouchHandled = true;
        console.log('Play button touched (touchstart)');
        togglePlayback();
    }, { passive: false });
    
    // Fallback to click for desktop
    playBtn.addEventListener('click', (e) => {
        // Prevent if already handled by touch
        if (playBtnTouchHandled) {
            playBtnTouchHandled = false;
            return;
        }
        
        e.preventDefault();
        console.log('Play button clicked (click)');
        togglePlayback();
    }, { passive: false });
    
    // Failsafe: Double-tap anywhere on timeline controls to stop playback
    let lastTimelineTap = 0;
    const timelineControls = document.querySelector('.timeline-controls');
    if (timelineControls) {
        timelineControls.addEventListener('touchstart', (e) => {
            const now = Date.now();
            const timeSinceLastTap = now - lastTimelineTap;
            
            if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
                // Double-tap detected
                if (state.isPlaying) {
                    console.log('Double-tap stop detected');
                    stopPlayback();
                }
            }
            
            lastTimelineTap = now;
        }, { passive: true });
    }
    
    document.getElementById('fpsSelect').addEventListener('change', (e) => {
        state.fps = parseInt(e.target.value) || 12;
        if (state.isPlaying) {
            stopPlayback();
            startPlayback(); // Use startPlayback directly instead of toggle
        }
    });

    // Undo/Redo
    document.getElementById('undoBtn').addEventListener('click', undo);
    document.getElementById('redoBtn').addEventListener('click', redo);

    // Export/Import
    // Export menu toggle
    const exportMenuBtn = document.getElementById('exportMenuBtn');
    const exportMenu = document.getElementById('exportMenu');
    
    exportMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        console.log('Export menu button clicked');
        const isVisible = exportMenu.style.display === 'block';
        
        if (isVisible) {
            exportMenu.style.display = 'none';
            exportMenu.style.visibility = 'hidden';
            exportMenu.style.opacity = '0';
        } else {
            exportMenu.style.display = 'block';
            exportMenu.style.visibility = 'visible';
            exportMenu.style.opacity = '1';
        }
        
        console.log('Menu display set to:', exportMenu.style.display);
        console.log('Menu computed style:', window.getComputedStyle(exportMenu).display);
    });
    
    // Close export menu when clicking outside
    document.addEventListener('click', (e) => {
        if (exportMenu.style.display === 'block' && 
            !exportMenu.contains(e.target) && 
            !exportMenuBtn.contains(e.target)) {
            exportMenu.style.display = 'none';
            exportMenu.style.visibility = 'hidden';
            exportMenu.style.opacity = '0';
        }
    });
    
    // Export options
    document.getElementById('exportGifBtn').addEventListener('click', () => {
        exportMenu.style.display = 'none';
        exportMenu.style.visibility = 'hidden';
        exportMenu.style.opacity = '0';
        exportAsGIF();
    });
    
    document.getElementById('exportPngBtn').addEventListener('click', () => {
        exportMenu.style.display = 'none';
        exportMenu.style.visibility = 'hidden';
        exportMenu.style.opacity = '0';
        exportAsPNGSequence();
    });
    
    document.getElementById('exportMp4Btn').addEventListener('click', () => {
        exportMenu.style.display = 'none';
        exportMenu.style.visibility = 'hidden';
        exportMenu.style.opacity = '0';
        exportAsMP4();
    });
    document.getElementById('exportJsonBtn').addEventListener('click', exportProject);
    document.getElementById('importJsonBtn').addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });
    document.getElementById('fileInput').addEventListener('change', importProject);

    // Auto-save every 10 seconds
    setInterval(saveToLocalStorage, 10000);

    // Keyboard shortcuts help panel
    document.getElementById('shortcutsBtn').addEventListener('click', toggleShortcutsPanel);
    document.getElementById('shortcutsCloseBtn').addEventListener('click', closeShortcutsPanel);
    document.querySelector('.shortcuts-backdrop').addEventListener('click', closeShortcutsPanel);
    
    // Detect Mac and swap modifier labels
    const isMacPlatform = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    if (isMacPlatform) {
        document.querySelectorAll('.shortcut-keys kbd.mod').forEach(kbd => {
            kbd.textContent = '⌘';
        });
    }
}

// ==================== KEYBOARD SHORTCUTS ====================
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', handleKeyboardShortcut);
    
    // Track shift key for constrained drawing
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Shift') {
            state.shiftPressed = true;
            
            // Visual feedback on constraint button
            const constraintBtn = document.getElementById('constraintToggle');
            if (constraintBtn && !state.constraintMode) {
                constraintBtn.style.opacity = '0.5';
                constraintBtn.style.transform = 'scale(0.95)';
            }
            
            // Redraw if currently drawing to show constraint
            if (state.isDrawing && state.currentPath) {
                const lastEvent = state.lastPointerEvent;
                if (lastEvent) {
                    draw(lastEvent);
                }
            }
        }
        
        // Track Alt/Option key for forcing circle mode
        if (e.key === 'Alt') {
            state.altPressed = true;
            
            // Redraw if currently drawing
            if (state.isDrawing && state.currentPath) {
                const lastEvent = state.lastPointerEvent;
                if (lastEvent) {
                    draw(lastEvent);
                }
            }
        }
    });
    
    document.addEventListener('keyup', (e) => {
        if (e.key === 'Shift') {
            state.shiftPressed = false;
            
            // Remove visual feedback
            const constraintBtn = document.getElementById('constraintToggle');
            if (constraintBtn && !state.constraintMode) {
                constraintBtn.style.opacity = '';
                constraintBtn.style.transform = '';
            }
            
            // Redraw if currently drawing to remove constraint
            if (state.isDrawing && state.currentPath) {
                const lastEvent = state.lastPointerEvent;
                if (lastEvent) {
                    draw(lastEvent);
                }
            }
        }
        
        // Release Alt key
        if (e.key === 'Alt') {
            state.altPressed = false;
            
            // Redraw if currently drawing
            if (state.isDrawing && state.currentPath) {
                const lastEvent = state.lastPointerEvent;
                if (lastEvent) {
                    draw(lastEvent);
                }
            }
        }
    });
}

function handleKeyboardShortcut(e) {
    // Don't trigger shortcuts when typing in input fields
    const activeElement = document.activeElement;
    if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
        return;
    }
    
    // Escape key - close panels, stop playback, or deselect
    if (e.key === 'Escape') {
        // Close shortcuts panel if open
        const shortcutsPanel = document.getElementById('shortcutsPanel');
        if (shortcutsPanel && shortcutsPanel.style.display !== 'none') {
            e.preventDefault();
            closeShortcutsPanel();
            return;
        }
        if (state.isPlaying) {
            e.preventDefault();
            stopPlayback();
            return;
        }
        if (state.tool === 'select' && state.selection && state.selection.indices.length > 0) {
            e.preventDefault();
            clearSelection();
            return;
        }
    }
    
    // Spacebar - toggle playback
    if (e.key === ' ') {
        e.preventDefault();
        togglePlayback();
        return;
    }
    
    // O key - toggle onion skin
    if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        const onionToggle = document.getElementById('onionSkinToggle');
        if (onionToggle) {
            state.onionSkinEnabled = !state.onionSkinEnabled;
            onionToggle.classList.toggle('active', state.onionSkinEnabled);
            renderFrame();
        }
        return;
    }
    
    // B key - switch to pen/brush tool
    if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        selectTool('pen');
        return;
    }
    
    // E key - switch to eraser tool
    if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        selectTool('eraser');
        return;
    }
    
    // V key - switch to select tool
    if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        selectTool('select');
        return;
    }
    
    // ? key - toggle shortcuts panel
    if (e.key === '?') {
        e.preventDefault();
        toggleShortcutsPanel();
        return;
    }
    
    // Delete/Backspace - delete selected paths
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.tool === 'select' && state.selection && state.selection.indices.length > 0) {
        e.preventDefault();
        deleteSelectedPaths();
        return;
    }
    
    // Detect platform: macOS uses Cmd, Windows/Linux use Ctrl
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifier = isMac ? e.metaKey : e.ctrlKey;
    
    // Undo: Cmd/Ctrl + Z (without Shift)
    if (modifier && e.key === 'z' && !e.shiftKey) {
        e.preventDefault(); // Prevent browser undo
        undo();
        return;
    }
    
    // Select All: Cmd/Ctrl + A (only in select mode)
    if (modifier && (e.key === 'a' || e.key === 'A') && state.tool === 'select') {
        e.preventDefault();
        selectAllPaths();
        return;
    }
    
    // Copy Frame: Cmd/Ctrl + C (not when select tool has active selection)
    if (modifier && (e.key === 'c' || e.key === 'C')) {
        if (!(state.tool === 'select' && state.selection && state.selection.indices.length > 0)) {
            e.preventDefault();
            copyFrame();
            return;
        }
    }
    
    // Paste Frame: Cmd/Ctrl + V
    if (modifier && (e.key === 'v' || e.key === 'V') && !e.shiftKey) {
        e.preventDefault();
        pasteFrame();
        return;
    }
    
    // Redo: Cmd/Ctrl + Shift + Z OR Ctrl + Y (Windows convention)
    if (modifier && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redo();
        return;
    }
    
    // Redo alternative: Ctrl + Y (Windows/Linux only)
    if (!isMac && e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        redo();
        return;
    }
}

// ==================== LAYER MANAGEMENT ====================
function addLayer() {
    state.layerIdCounter++;
    const newLayer = {
        id: `layer-${state.layerIdCounter}`,
        name: `Layer ${state.layerIdCounter}`,
        visible: true,
        opacity: 1,
        frames: [{ paths: [] }] // Start with one empty frame
    };
    
    state.layers.push(newLayer);
    state.currentLayerId = newLayer.id;
    
    updateLayerList();
    updateFrameList();
    renderFrame();
    saveToLocalStorage();
}

function duplicateLayer() {
    const sourceLayer = state.layers.find(l => l.id === state.currentLayerId);
    if (!sourceLayer) return;
    
    state.layerIdCounter++;
    const newLayer = {
        id: 'layer-' + state.layerIdCounter,
        name: sourceLayer.name + ' copy',
        visible: true,
        opacity: sourceLayer.opacity !== undefined ? sourceLayer.opacity : 1,
        isBackground: sourceLayer.isBackground || false,
        frames: JSON.parse(JSON.stringify(sourceLayer.frames))
    };
    
    // Insert directly above the source layer
    const sourceIndex = state.layers.indexOf(sourceLayer);
    state.layers.splice(sourceIndex + 1, 0, newLayer);
    state.currentLayerId = newLayer.id;
    
    updateMaxFrames();
    updateLayerList();
    updateFrameList();
    renderFrame();
    saveToLocalStorage();
}

function moveLayerUp(layerId) {
    const index = state.layers.findIndex(l => l.id === layerId);
    
    // Can't move beyond the end (which renders on top)
    if (index === state.layers.length - 1) return;
    
    // Swap with next layer (moves forward in render order = up in visual list)
    const temp = state.layers[index];
    state.layers[index] = state.layers[index + 1];
    state.layers[index + 1] = temp;
    
    updateLayerList();
    renderFrame();
    saveToLocalStorage();
}

function moveLayerDown(layerId) {
    const index = state.layers.findIndex(l => l.id === layerId);
    
    // Can't move beyond the beginning (which renders on bottom)
    if (index === 0) return;
    
    // Swap with previous layer (moves backward in render order = down in visual list)
    const temp = state.layers[index];
    state.layers[index] = state.layers[index - 1];
    state.layers[index - 1] = temp;
    
    updateLayerList();
    renderFrame();
    saveToLocalStorage();
}

function deleteLayer() {
    if (state.layers.length === 1) {
        showAlert('Cannot delete the only layer!', 'Error');
        return;
    }
    
    showConfirm(
        'Delete this layer and all its frames?',
        'Delete Layer',
        () => {
            const layerIndex = state.layers.findIndex(l => l.id === state.currentLayerId);
            state.layers.splice(layerIndex, 1);
            
            // Select another layer
            state.currentLayerId = state.layers[Math.max(0, layerIndex - 1)].id;
            
            // Recalculate max frames
            updateMaxFrames();
            
            updateLayerList();
            updateFrameList();
            renderFrame();
            saveToLocalStorage();
        }
    );
}

function selectLayer(layerId) {
    state.currentLayerId = layerId;
    updateLayerList();
    updateFrameList();
    renderFrame();
}

function toggleLayerVisibility(layerId) {
    const layer = state.layers.find(l => l.id === layerId);
    if (layer) {
        layer.visible = !layer.visible;
        renderFrame();
        saveToLocalStorage();
    }
}

function toggleBackgroundLayer(layerId, isBackground) {
    const layer = state.layers.find(l => l.id === layerId);
    if (!layer) return;
    
    layer.isBackground = isBackground;
    
    if (isBackground) {
        // Ensure layer has at least one frame
        if (layer.frames.length === 0) {
            layer.frames.push({ paths: [] });
        }
        
        // Don't auto-extend here - will happen in renderFrame
    }
    
    updateMaxFrames();
    updateLayerList();
    renderFrame();
    saveToLocalStorage();
}

function updateLayerList() {
    const layerList = document.getElementById('layerList');
    layerList.innerHTML = '';
    
    // Render layers in reverse order (top layer first in UI)
    const reversedLayers = [...state.layers].reverse();
    reversedLayers.forEach((layer, reversedIndex) => {
        const layerItem = document.createElement('div');
        layerItem.className = 'layer-item';
        if (layer.id === state.currentLayerId) {
            layerItem.classList.add('active');
        }
        
        // Visibility checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = layer.visible;
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLayerVisibility(layer.id);
            updateLayerList();
        });
        
        // Layer reorder buttons (up/down arrows)
        const reorderControls = document.createElement('div');
        reorderControls.className = 'layer-reorder';
        
        // Up arrow (move layer up in visual list = move forward in render order)
        const upBtn = document.createElement('button');
        upBtn.className = 'layer-arrow-btn';
        upBtn.innerHTML = '▲';
        upBtn.title = 'Move layer up';
        upBtn.disabled = reversedIndex === 0; // Can't move top layer up
        upBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            moveLayerUp(layer.id);
        });
        
        // Down arrow (move layer down in visual list = move backward in render order)
        const downBtn = document.createElement('button');
        downBtn.className = 'layer-arrow-btn';
        downBtn.innerHTML = '▼';
        downBtn.title = 'Move layer down';
        downBtn.disabled = reversedIndex === reversedLayers.length - 1; // Can't move bottom layer down
        downBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            moveLayerDown(layer.id);
        });
        
        reorderControls.appendChild(upBtn);
        reorderControls.appendChild(downBtn);
        
        // Layer name
        const nameSpan = document.createElement('span');
        nameSpan.className = 'layer-name';
        nameSpan.textContent = layer.name;
        
        // BG checkbox
        const bgLabel = document.createElement('label');
        bgLabel.className = 'bg-layer-label';
        bgLabel.title = 'Background Layer (extends to full animation length)';
        bgLabel.addEventListener('click', (e) => e.stopPropagation());
        
        const bgText = document.createElement('span');
        bgText.className = 'bg-text';
        bgText.textContent = 'BG';
        
        const bgCheckbox = document.createElement('input');
        bgCheckbox.type = 'checkbox';
        bgCheckbox.className = 'bg-checkbox';
        bgCheckbox.checked = layer.isBackground || false;
        bgCheckbox.addEventListener('change', (e) => {
            e.stopPropagation();
            toggleBackgroundLayer(layer.id, e.target.checked);
        });
        
        bgLabel.appendChild(bgText);
        bgLabel.appendChild(bgCheckbox);
        
        // Frame count (compact) - show "BG" for background layers
        const frameCount = document.createElement('span');
        frameCount.className = 'layer-frame-count';
        if (layer.isBackground) {
            frameCount.textContent = 'BG';
            frameCount.style.color = 'var(--accent)';
            frameCount.style.fontWeight = '700';
        } else {
            frameCount.textContent = layer.frames.length;
        }
        
        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'layer-delete-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.title = 'Delete Layer';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (state.layers.length > 1) {
                deleteLayer(layer.id);
            }
        });
        
        // Opacity control
        const opacityWrap = document.createElement('div');
        opacityWrap.className = 'layer-opacity-wrap';
        opacityWrap.addEventListener('click', (e) => e.stopPropagation());
        
        const opacityVal = document.createElement('span');
        opacityVal.className = 'layer-opacity-value';
        const currentOpacity = layer.opacity !== undefined ? layer.opacity : 1;
        opacityVal.textContent = Math.round(currentOpacity * 100) + '%';
        
        const opacitySlider = document.createElement('input');
        opacitySlider.type = 'range';
        opacitySlider.className = 'layer-opacity-slider';
        opacitySlider.min = '0';
        opacitySlider.max = '100';
        opacitySlider.step = '5';
        opacitySlider.value = Math.round(currentOpacity * 100);
        opacitySlider.title = 'Layer Opacity';
        opacitySlider.addEventListener('input', (e) => {
            e.stopPropagation();
            const val = parseInt(e.target.value) / 100;
            layer.opacity = val;
            opacityVal.textContent = e.target.value + '%';
            renderFrame();
        });
        opacitySlider.addEventListener('change', (e) => {
            e.stopPropagation();
            saveToLocalStorage();
        });
        opacitySlider.addEventListener('pointerdown', (e) => e.stopPropagation());
        
        opacityWrap.appendChild(opacitySlider);
        opacityWrap.appendChild(opacityVal);
        
        // Two-row layout
        const topRow = document.createElement('div');
        topRow.className = 'layer-top-row';
        topRow.appendChild(checkbox);
        topRow.appendChild(reorderControls);
        topRow.appendChild(nameSpan);
        topRow.appendChild(bgLabel);
        topRow.appendChild(frameCount);
        topRow.appendChild(deleteBtn);
        
        layerItem.appendChild(topRow);
        layerItem.appendChild(opacityWrap);
        
        layerItem.addEventListener('click', () => selectLayer(layer.id));
        layerList.appendChild(layerItem);
    });
}

function updateMaxFrames() {
    state.maxFrames = Math.max(...state.layers.map(l => l.frames.length), 1);
}

// Apply shift-key constraints for straight lines and circles
function applyShiftConstraint(startPoint, currentPoint) {
    const dx = currentPoint.x - startPoint.x;
    const dy = currentPoint.y - startPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    
    // Determine if user wants a circle or a line
    const width = Math.abs(dx);
    const height = Math.abs(dy);
    
    // Calculate aspect ratio (how square-like is the bounding box)
    const aspectRatio = Math.min(width, height) / Math.max(width, height);
    
    // Alt key forces circle mode (Shift+Alt = always circle)
    const forceCircle = state.altPressed;
    
    // Circle detection criteria (stricter than before):
    // 1. Aspect ratio > 0.85 (very square-like) OR Alt key pressed
    // 2. Both dimensions > 50px (substantial size)
    const isVerySquare = aspectRatio > 0.85;
    const isLargeEnough = width > 50 && height > 50;
    
    if ((isVerySquare && isLargeEnough) || forceCircle) {
        // CIRCLE MODE: Make it a perfect square (for drawing circles)
        // Use the larger dimension to create a perfect square bounding box
        const size = Math.max(width, height);
        
        return {
            x: startPoint.x + (dx > 0 ? size : -size),
            y: startPoint.y + (dy > 0 ? size : -size)
        };
    } else {
        // LINE MODE: Snap to nearest 45-degree angle
        // Snap to 8 directions (0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°)
        const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        
        return {
            x: startPoint.x + distance * Math.cos(snapAngle),
            y: startPoint.y + distance * Math.sin(snapAngle)
        };
    }
}

// ==================== DRAWING FUNCTIONS ====================
function startDrawing(e) {
    // Prevent default touch behaviors (scrolling, zooming, etc.)
    e.preventDefault();
    
    if (state.isPlaying) return;
    
    // Select tool handles its own pointer events
    if (state.tool === 'select') {
        handleSelectPointerDown(e);
        return;
    }
    
    const currentLayer = state.layers.find(l => l.id === state.currentLayerId);
    if (!currentLayer || !currentLayer.visible) return;
    
    // Determine which frame to draw on
    const drawFrameIndex = currentLayer.isBackground ? 0 : state.currentFrameIndex;
    
    // Make sure current layer has a frame at the target index
    if (!currentLayer.frames[drawFrameIndex]) {
        // Extend layer's frames to target index
        while (currentLayer.frames.length <= drawFrameIndex) {
            currentLayer.frames.push({ paths: [] });
        }
        updateMaxFrames();
    }
    
    state.isDrawing = true;
    state.currentPoints = [];
    
    // Save state for undo
    saveStateForUndo();
    
    const point = getSvgPoint(e);
    state.currentPoints.push(point);
    state.startPoint = point; // Store starting point for shift-constrained drawing
    state.lastPointerEvent = e; // Store event for shift key updates
    
    // Create new path element
    state.currentPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    
    // ERASER MODE: Draw path that will be used to cut through existing paths
    if (state.tool === 'eraser') {
        state.currentPath.setAttribute('fill', 'none');
        state.currentPath.setAttribute('stroke', state.backgroundColor || '#ffffff');
        state.currentPath.setAttribute('stroke-width', state.strokeSize * 3);
        state.currentPath.setAttribute('stroke-linecap', 'round');
        state.currentPath.setAttribute('stroke-linejoin', 'round');
        state.currentPath.setAttribute('opacity', '0.5'); // Semi-transparent preview
    }
    // Dual-mode brush: tapered (filled) vs uniform (stroked)
    else if (state.taper > 0 && state.tool === 'pen') {
        // TAPERED MODE: Filled outline path
        state.currentPath.setAttribute('fill', state.strokeColor);
        state.currentPath.setAttribute('stroke', 'none');
    } else {
        // UNIFORM MODE: Standard stroked path (existing behavior)
        state.currentPath.setAttribute('fill', 'none');
        state.currentPath.setAttribute('stroke', state.strokeColor);
        
        // Support pressure-sensitive input (Apple Pencil, etc.)
        const pressure = e.pressure || 0.5; // Default to 0.5 if no pressure data
        const strokeWidth = state.strokeSize * (0.5 + pressure); // Scale by pressure
        
        state.currentPath.setAttribute('stroke-width', strokeWidth);
        state.currentPath.setAttribute('stroke-linecap', 'round');
        state.currentPath.setAttribute('stroke-linejoin', 'round');
    }
    
    // Add to the current layer's group
    const layerGroup = document.getElementById(`layer-${state.currentLayerId}-group`);
    if (layerGroup) {
        layerGroup.appendChild(state.currentPath);
    }
}

function draw(e) {
    // Prevent default touch behaviors
    e.preventDefault();
    
    // Select tool handles its own pointer events
    if (state.tool === 'select') {
        handleSelectPointerMove(e);
        return;
    }
    
    if (!state.isDrawing || !state.currentPath) return;
    
    // Store event for shift key updates
    state.lastPointerEvent = e;
    
    let point = getSvgPoint(e);
    
    // Apply shift constraints for straight lines and circles
    // Works with either keyboard Shift OR constraint mode toggle button
    const isConstrained = (state.shiftPressed || state.constraintMode);
    
    if (isConstrained && state.startPoint && state.tool === 'pen') {
        point = applyShiftConstraint(state.startPoint, point);
    }
    
    // Apply smoothing for pen tool only (not eraser)
    if (state.tool === 'pen') {
        // Distance-based point filtering (skip if constrained)
        if (!isConstrained && state.currentPoints.length > 0) {
            const lastPoint = state.currentPoints[state.currentPoints.length - 1];
            const distance = Math.sqrt(
                Math.pow(point.x - lastPoint.x, 2) + 
                Math.pow(point.y - lastPoint.y, 2)
            );
            
            // Only add point if it's far enough from the last point
            const minDistance = state.smoothing;
            if (distance < minDistance) {
                return; // Skip this point
            }
        }
        
        // For shift-constrained drawing, use only start and end points
        let pointsToUse;
        if (isConstrained && state.startPoint) {
            pointsToUse = [state.startPoint, point];
        } else {
            // Add the point
            state.currentPoints.push(point);
            pointsToUse = state.currentPoints;
        }
        
        // Apply averaging for additional smoothing (not for shift-constrained)
        const smoothedPoints = isConstrained ? pointsToUse : applyPointAveraging(pointsToUse, state.smoothing);
        
        // Dual-mode brush: tapered vs uniform
        if (state.taper > 0) {
            // TAPERED MODE: Generate filled outline path
            const pathData = createTaperedPath(
                smoothedPoints,
                state.strokeSize,
                state.taper / 100 // Convert 0-100 to 0-1
            );
            state.currentPath.setAttribute('d', pathData);
        } else {
            // UNIFORM MODE: Generate standard stroke path (existing)
            const pathData = pointsToPath(smoothedPoints);
            state.currentPath.setAttribute('d', pathData);
        }
    } else {
        // Eraser: no smoothing, no taper
        state.currentPoints.push(point);
        const pathData = pointsToPath(state.currentPoints);
        state.currentPath.setAttribute('d', pathData);
    }
}

// Apply simple moving average to smooth points
function applyPointAveraging(points, smoothing) {
    if (points.length < 3 || smoothing < 1) {
        return points; // Not enough points or no smoothing needed
    }
    
    // Adjust averaging based on smoothing level
    // Low smoothing (0.5-1.5): minimal averaging
    // Medium smoothing (3-5): light averaging  
    // High smoothing (8): moderate averaging
    let windowSize = 0;
    if (smoothing <= 1.5) {
        windowSize = 0; // No averaging, just distance filtering
    } else if (smoothing <= 5) {
        windowSize = 1; // Average with 1 neighbor on each side
    } else {
        windowSize = 2; // Average with 2 neighbors on each side
    }
    
    if (windowSize === 0) {
        return points; // No averaging needed
    }
    
    const smoothed = [];
    
    // Keep first point as-is
    smoothed.push(points[0]);
    
    // Average middle points with weighted average (center point has more weight)
    for (let i = 1; i < points.length - 1; i++) {
        let sumX = 0, sumY = 0, totalWeight = 0;
        
        // Weighted average with neighbors
        const start = Math.max(0, i - windowSize);
        const end = Math.min(points.length - 1, i + windowSize);
        
        for (let j = start; j <= end; j++) {
            // Center point gets more weight for better shape preservation
            const weight = (j === i) ? 2.0 : 1.0;
            sumX += points[j].x * weight;
            sumY += points[j].y * weight;
            totalWeight += weight;
        }
        
        smoothed.push({
            x: sumX / totalWeight,
            y: sumY / totalWeight
        });
    }
    
    // Keep last point as-is for accuracy at stroke end
    if (points.length > 1) {
        smoothed.push(points[points.length - 1]);
    }
    
    return smoothed;
}

// ==================== TAPER FUNCTIONS ====================
/**
 * Calculate stroke width at a given position along the stroke
 * Uses sine wave for smooth, natural taper
 * @param {number} progress - Position along stroke (0.0 to 1.0)
 * @param {number} baseWidth - Base stroke width
 * @param {number} taperAmount - Taper intensity (0.0 to 1.0)
 * @returns {number} - Calculated width at this position
 */
function calculateTaperedWidth(progress, baseWidth, taperAmount) {
    if (taperAmount === 0) {
        return baseWidth; // No taper, uniform stroke
    }
    
    // Ease-in-out curve: thin at start/end, thick in middle
    // Using sine wave for smooth, natural taper
    const curve = Math.sin(progress * Math.PI); // 0 → 1 → 0
    
    // Interpolate between minimum width and base width
    // At 100% taper, reduces to 30% at ends
    const minWidth = baseWidth * (1 - taperAmount * 0.7);
    const width = minWidth + (baseWidth - minWidth) * curve;
    
    return Math.max(width, 0.5); // Ensure minimum viable width
}

/**
 * Get normalized tangent vector between two points
 */
function getTangent(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) return { x: 1, y: 0 }; // Fallback for zero-length
    
    return {
        x: dx / length,
        y: dy / length
    };
}

/**
 * Convert a tapered stroke into a filled SVG path
 * Creates outline by offsetting points perpendicular to stroke direction
 * @param {Array} points - Array of {x, y} coordinates
 * @param {number} baseWidth - Base stroke width
 * @param {number} taperAmount - Taper intensity (0-1)
 * @returns {string} - SVG path data for filled outline
 */
function createTaperedPath(points, baseWidth, taperAmount) {
    if (points.length < 2) {
        // Fallback for very short strokes
        return `M ${points[0].x} ${points[0].y}`;
    }
    
    const leftSide = [];
    const rightSide = [];
    
    // Calculate perpendicular offset at each point
    for (let i = 0; i < points.length; i++) {
        const progress = i / (points.length - 1);
        const width = calculateTaperedWidth(progress, baseWidth, taperAmount);
        const halfWidth = width / 2;
        
        // Get tangent direction
        let tangent;
        if (i === 0) {
            // First point: use direction to next point
            tangent = getTangent(points[0], points[1]);
        } else if (i === points.length - 1) {
            // Last point: use direction from previous point
            tangent = getTangent(points[i - 1], points[i]);
        } else {
            // Middle points: average direction
            tangent = getTangent(points[i - 1], points[i + 1]);
        }
        
        // Perpendicular = rotate tangent 90°
        const perpendicular = { x: -tangent.y, y: tangent.x };
        
        // Calculate offset points
        leftSide.push({
            x: points[i].x + perpendicular.x * halfWidth,
            y: points[i].y + perpendicular.y * halfWidth
        });
        
        rightSide.push({
            x: points[i].x - perpendicular.x * halfWidth,
            y: points[i].y - perpendicular.y * halfWidth
        });
    }
    
    // Build closed path: left side → right side reversed → close
    let pathData = `M ${leftSide[0].x} ${leftSide[0].y}`;
    
    // Left side (forward)
    for (let i = 1; i < leftSide.length; i++) {
        pathData += ` L ${leftSide[i].x} ${leftSide[i].y}`;
    }
    
    // Right side (reversed)
    for (let i = rightSide.length - 1; i >= 0; i--) {
        pathData += ` L ${rightSide[i].x} ${rightSide[i].y}`;
    }
    
    pathData += ' Z'; // Close path
    
    return pathData;
}

function stopDrawing(e) {
    // Select tool handles its own pointer events
    if (state.tool === 'select') {
        if (e) e.preventDefault();
        handleSelectPointerUp(e);
        return;
    }
    
    // Prevent default if event exists
    if (e) {
        e.preventDefault();
        
        // Release pointer capture if it was captured
        // This is critical for mobile - ensures buttons remain clickable
        if (e.pointerId !== undefined && svg.hasPointerCapture && svg.hasPointerCapture(e.pointerId)) {
            svg.releasePointerCapture(e.pointerId);
        }
    }
    
    if (!state.isDrawing) return;
    
    state.isDrawing = false;
    
    if (state.currentPath && state.currentPoints.length > 0) {
        const currentLayer = state.layers.find(l => l.id === state.currentLayerId);
        
        // Determine which frame to save to (frame 0 for BG layers, current frame otherwise)
        const saveFrameIndex = currentLayer && currentLayer.isBackground ? 0 : state.currentFrameIndex;
        
        if (currentLayer && currentLayer.frames[saveFrameIndex]) {
            // ERASER MODE: Apply eraser effect to existing paths
            if (state.tool === 'eraser') {
                applyEraserCut(currentLayer.frames[saveFrameIndex], state.currentPath);
                // Remove the eraser path preview
                if (state.currentPath.parentNode) {
                    state.currentPath.parentNode.removeChild(state.currentPath);
                }
            } else {
                // PEN MODE: Store the path data (with fill for tapered strokes)
                const pathData = {
                    d: state.currentPath.getAttribute('d'),
                    stroke: state.currentPath.getAttribute('stroke'),
                    strokeWidth: state.currentPath.getAttribute('stroke-width'),
                    fill: state.currentPath.getAttribute('fill'), // NEW: Store fill for tapered strokes
                    tool: state.tool
                };
                
                currentLayer.frames[saveFrameIndex].paths.push(pathData);
            }
            
            // Clear redo stack on new action
            state.redoStack = [];
            
            updateFrameList();
            saveToLocalStorage();
            showAutoSaveIndicator(); // Show save confirmation
        }
    }
    
    state.currentPath = null;
    state.currentPoints = [];
    state.startPoint = null; // Clear start point
    state.lastPointerEvent = null; // Clear last event
}

// Apply eraser cut - save eraser stroke as a background-colored path
function applyEraserCut(frame, eraserPath) {
    if (!frame || !frame.paths || !eraserPath) return;
    
    const eraserPathD = eraserPath.getAttribute('d');
    if (!eraserPathD) return;
    
    // Instead of deleting paths, save the eraser stroke as a background-colored path
    // This creates a "pencil eraser" effect - it covers what's underneath
    const eraserData = {
        d: eraserPathD,
        stroke: state.backgroundColor || '#ffffff',
        strokeWidth: state.strokeSize * 3,
        fill: 'none',
        tool: 'eraser'
    };
    
    // Add eraser stroke to paths (it will be rendered on top, covering what's below)
    frame.paths.push(eraserData);
    
    // Re-render the frame
    renderFrame();
}

function getSvgPoint(e) {
    const rect = svg.getBoundingClientRect();
    
    // Get the SVG's viewBox dimensions
    const viewBox = svg.viewBox.baseVal;
    const viewBoxWidth = viewBox.width;
    const viewBoxHeight = viewBox.height;
    
    // Calculate the scale between screen size and viewBox size
    const scaleX = viewBoxWidth / rect.width;
    const scaleY = viewBoxHeight / rect.height;
    
    // Map screen coordinates to viewBox coordinates
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    return { x, y };
}

// Convert points array to SVG path data with smooth cubic Bezier curves
function pointsToPath(points) {
    if (points.length < 2) {
        return `M ${points[0].x} ${points[0].y}`;
    }
    
    if (points.length === 2) {
        return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    }
    
    // Use cubic Bezier curves for smooth drawing with Apple Pencil
    let path = `M ${points[0].x} ${points[0].y}`;
    
    // Generate smooth curve through all points using cubic Bezier
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];
        
        // Calculate control points for smooth cubic Bezier (Catmull-Rom spline)
        // Adjust tension based on angle change to prevent overshooting on sharp turns
        let tension = 0.25; // Base tension (lower = smoother)
        
        // Detect sharp turns and reduce tension
        if (i > 0 && i < points.length - 2) {
            const angle1 = Math.atan2(p1.y - p0.y, p1.x - p0.x);
            const angle2 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            const angleDiff = Math.abs(angle2 - angle1);
            
            // If sharp turn (>45°), reduce tension to prevent corners
            if (angleDiff > Math.PI / 4) {
                tension *= 0.5;
            }
        }
        
        const cp1x = p1.x + (p2.x - p0.x) * tension;
        const cp1y = p1.y + (p2.y - p0.y) * tension;
        const cp2x = p2.x - (p3.x - p1.x) * tension;
        const cp2y = p2.y - (p3.y - p1.y) * tension;
        
        path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    
    return path;
}

// Update smoothing indicator labels based on current value
function updateSmoothingLabel() {
    const indicator = document.getElementById('smoothingIndicator');
    if (!indicator) return;
    
    const labels = indicator.querySelectorAll('.level-label');
    const value = state.smoothing;
    
    // Remove all active states
    labels.forEach(label => label.classList.remove('active'));
    
    // Set active label based on value
    if (value <= 1.5) {
        // Low smoothing - bottom label
        labels[2].classList.add('active');
    } else if (value <= 5) {
        // Medium smoothing - middle label
        labels[1].classList.add('active');
    } else {
        // High smoothing - top label
        labels[0].classList.add('active');
    }
}

// Update size value display
function updateSizeValue() {
    const sizeValue = document.getElementById('sizeValue');
    if (!sizeValue) return;
    
    sizeValue.textContent = state.strokeSize;
}

// Update taper value display
function updateTaperValue() {
    const taperValue = document.getElementById('taperValue');
    if (!taperValue) return;
    
    taperValue.textContent = `${state.taper}%`;
}

// ==================== MODAL DIALOG ====================
function openModal(title, bodyHTML, onConfirm) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const modalConfirmBtn = document.getElementById('modalConfirmBtn');
    const modalCancelBtn = document.getElementById('modalCancelBtn');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    
    // Set content
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHTML;
    
    // Show modal
    modal.style.display = 'flex';
    
    // Focus first input if exists
    setTimeout(() => {
        const firstInput = modalBody.querySelector('input');
        if (firstInput) firstInput.focus();
    }, 100);
    
    // Handle confirm
    modalConfirmBtn.onclick = () => {
        if (onConfirm) {
            onConfirm();
        } else {
            closeModal();
        }
    };
    
    // Handle cancel/close
    modalCancelBtn.onclick = closeModal;
    modalCloseBtn.onclick = closeModal;
    
    // Close on backdrop click
    modal.querySelector('.modal-backdrop').onclick = closeModal;
    
    // Close on Escape key
    const escapeHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

function showAlert(message, title = 'Notice') {
    openModal(title, `<p class="modal-message">${message}</p>`, () => {
        closeModal();
    });
    
    // Hide cancel button for alerts
    document.getElementById('modalCancelBtn').style.display = 'none';
    document.getElementById('modalConfirmBtn').textContent = 'OK';
}

function showConfirm(message, title, onConfirm) {
    openModal(title, `<p class="modal-message">${message}</p>`, () => {
        closeModal();
        if (onConfirm) onConfirm();
    });
    
    // Show both buttons
    document.getElementById('modalCancelBtn').style.display = 'block';
    document.getElementById('modalConfirmBtn').textContent = 'Confirm';
}

function showCanvasSizeDialog() {
    const bodyHTML = `
        <div class="modal-input-group">
            <label>Width (px)</label>
            <input type="number" id="modalCanvasWidth" value="${state.canvasWidth}" min="1" max="4000">
        </div>
        <div class="modal-input-group">
            <label>Height (px)</label>
            <input type="number" id="modalCanvasHeight" value="${state.canvasHeight}" min="1" max="4000">
        </div>
    `;
    
    openModal('Custom Canvas Size', bodyHTML, () => {
        const width = parseInt(document.getElementById('modalCanvasWidth').value);
        const height = parseInt(document.getElementById('modalCanvasHeight').value);
        
        if (width > 0 && height > 0 && width <= 4000 && height <= 4000) {
            updateCanvasSize(width, height);
            closeModal();
        } else {
            showAlert('Invalid dimensions. Width and height must be between 1 and 4000.', 'Invalid Input');
        }
    });
    
    // Show both buttons
    document.getElementById('modalCancelBtn').style.display = 'block';
    document.getElementById('modalConfirmBtn').textContent = 'Apply';
    
    // Override cancel button to reset selector
    document.getElementById('modalCancelBtn').onclick = () => {
        closeModal();
        // Reset selector to current size
        updateCanvasSizeSelector(state.canvasWidth, state.canvasHeight);
    };
}

// Update canvas size
function updateCanvasSize(width, height) {
    state.canvasWidth = width;
    state.canvasHeight = height;
    
    // Update SVG dimensions
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    
    // Update background rect
    const bgRect = document.getElementById('backgroundRect');
    if (bgRect) {
        bgRect.setAttribute('width', '100%');
        bgRect.setAttribute('height', '100%');
    }
    
    // Update selector to show current size
    updateCanvasSizeSelector(width, height);
    
    // Re-render current frame
    renderFrame();
    
    // Save to localStorage
    saveToLocalStorage();
}

function updateCanvasSizeSelector(width, height) {
    const selector = document.getElementById('canvasSizeSelect');
    if (!selector) return;
    
    const sizeValue = `${width}x${height}`;
    
    // Check if this size already exists as an option
    let optionExists = false;
    for (let option of selector.options) {
        if (option.value === sizeValue) {
            optionExists = true;
            break;
        }
    }
    
    // If custom size, add it to the dropdown
    if (!optionExists) {
        // Remove any existing custom size option (not the preset ones)
        const existingCustom = selector.querySelector('option[data-custom="true"]');
        if (existingCustom) {
            existingCustom.remove();
        }
        
        // Create new custom option
        const customOption = document.createElement('option');
        customOption.value = sizeValue;
        customOption.textContent = `${width}×${height}`;
        customOption.setAttribute('data-custom', 'true');
        
        // Insert before the "Custom..." option
        const customMenuItem = selector.querySelector('option[value="custom"]');
        selector.insertBefore(customOption, customMenuItem);
    }
    
    // Select the current size
    selector.value = sizeValue;
}

// ==================== RENDERING ====================
function syncBackgroundUI() {
    const colorPicker = document.getElementById('backgroundColorPicker');
    const transparentToggle = document.getElementById('transparentBgToggle');
    
    if (state.backgroundColor === 'transparent') {
        transparentToggle.checked = true;
        colorPicker.disabled = true;
    } else {
        transparentToggle.checked = false;
        colorPicker.disabled = false;
        colorPicker.value = state.backgroundColor;
    }
}

function updateBackground() {
    const bgRect = document.getElementById('backgroundRect');
    if (bgRect) {
        if (state.backgroundColor === 'transparent') {
            bgRect.setAttribute('fill', 'none');
        } else {
            bgRect.setAttribute('fill', state.backgroundColor);
        }
    }
}

function renderFrame() {
    console.log('Rendering frame:', state.currentFrameIndex);
    
    // Clear layers container
    layersContainer.innerHTML = '';
    
    // Clear onion skin layer
    onionSkinLayer.innerHTML = '';
    
    // Draw onion skin (multi-frame support with customizable settings)
    if (state.onionSkinEnabled) {
        console.log('✓ ONION SKIN IS ON - Drawing ghost frames');
        const settings = state.onionSkinSettings;
        
        // Draw previous frames (multiple)
        for (let i = 1; i <= settings.framesBefore; i++) {
            const frameIndex = state.currentFrameIndex - i;
            if (frameIndex < 0) break; // Stop if we go before frame 0
            
            // Calculate opacity fade (further frames are more transparent)
            const opacityMultiplier = 1 - ((i - 1) / settings.framesBefore) * 0.5;
            const opacity = (settings.beforeOpacity / 100) * opacityMultiplier;
            
            const prevGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            prevGroup.setAttribute('opacity', opacity.toString());
            prevGroup.setAttribute('class', `onion-prev onion-prev-${i}`);
            
            state.layers.forEach(layer => {
                // Skip background layers in onion skin
                if (layer.isBackground) return;
                
                if (layer.visible && layer.frames[frameIndex]) {
                    layer.frames[frameIndex].paths.forEach(pathData => {
                        const path = createPathElement(pathData);
                        // Apply color tint
                        if (pathData.fill && pathData.fill !== 'none') {
                            path.setAttribute('fill', settings.beforeColor);
                        } else {
                            path.setAttribute('stroke', settings.beforeColor);
                        }
                        prevGroup.appendChild(path);
                    });
                }
            });
            
            onionSkinLayer.appendChild(prevGroup);
        }
        
        // Draw next frames (multiple)
        for (let i = 1; i <= settings.framesAfter; i++) {
            const frameIndex = state.currentFrameIndex + i;
            if (frameIndex >= state.maxFrames) break; // Stop if we go beyond last frame
            
            // Calculate opacity fade (further frames are more transparent)
            const opacityMultiplier = 1 - ((i - 1) / settings.framesAfter) * 0.5;
            const opacity = (settings.afterOpacity / 100) * opacityMultiplier;
            
            const nextGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            nextGroup.setAttribute('opacity', opacity.toString());
            nextGroup.setAttribute('class', `onion-next onion-next-${i}`);
            
            state.layers.forEach(layer => {
                // Skip background layers in onion skin
                if (layer.isBackground) return;
                
                if (layer.visible && layer.frames[frameIndex]) {
                    layer.frames[frameIndex].paths.forEach(pathData => {
                        const path = createPathElement(pathData);
                        // Apply color tint
                        if (pathData.fill && pathData.fill !== 'none') {
                            path.setAttribute('fill', settings.afterColor);
                        } else {
                            path.setAttribute('stroke', settings.afterColor);
                        }
                        nextGroup.appendChild(path);
                    });
                }
            });
            
            onionSkinLayer.appendChild(nextGroup);
        }
    } else {
        console.log('✗ ONION SKIN IS OFF - No ghost frames');
    }
    
    // Draw current frame - composite all layers at current frame index
    state.layers.forEach(layer => {
        const layerGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        layerGroup.setAttribute('id', `layer-${layer.id}-group`);
        
        if (!layer.visible) {
            layerGroup.setAttribute('opacity', '0');
        } else {
            const layerOpacity = layer.opacity !== undefined ? layer.opacity : 1;
            if (layerOpacity < 1) {
                layerGroup.setAttribute('opacity', layerOpacity.toString());
            }
        }
        
        // Get the frame to render
        let frameToRender = null;
        
        // Background layers always show their first frame
        if (layer.isBackground) {
            frameToRender = layer.frames[0];
        } else {
            // Normal layers: handle held frames and current frame
            frameToRender = layer.frames[state.currentFrameIndex];
            
            // If this frame is a hold reference, get the original frame
            if (frameToRender && frameToRender.holdReference !== undefined) {
                const originalFrameIndex = frameToRender.holdReference;
                frameToRender = layer.frames[originalFrameIndex];
            }
        }
        
        // Draw frame
        if (frameToRender && frameToRender.paths) {
            console.log(`Layer ${layer.id} at frame ${state.currentFrameIndex}: ${frameToRender.paths.length} paths`);
            frameToRender.paths.forEach(pathData => {
                const path = createPathElement(pathData);
                layerGroup.appendChild(path);
            });
        }
        
        layersContainer.appendChild(layerGroup);
    });
}

function createPathElement(pathData) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData.d);
    
    // Dual-mode rendering: tapered (filled) vs uniform (stroked)
    if (pathData.fill && pathData.fill !== 'none') {
        // TAPERED MODE: Filled outline path
        path.setAttribute('fill', pathData.fill);
        path.setAttribute('stroke', pathData.stroke || 'none');
    } else {
        // UNIFORM MODE: Standard stroked path (existing and legacy)
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', pathData.stroke);
        path.setAttribute('stroke-width', pathData.strokeWidth);
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
    }
    
    // Eraser blending
    if (pathData.tool === 'eraser') {
        path.style.mixBlendMode = 'destination-out';
    }
    
    return path;
}

// ==================== TOOL SELECTION ====================
function selectTool(tool) {
    // If leaving select mode, clear selection
    if (state.tool === 'select' && tool !== 'select') {
        clearSelection();
        svg.classList.remove('select-mode');
    }
    
    state.tool = tool;
    
    // Update UI
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    if (tool === 'pen') {
        document.getElementById('penTool').classList.add('active');
    } else if (tool === 'eraser') {
        document.getElementById('eraserTool').classList.add('active');
    } else if (tool === 'select') {
        document.getElementById('selectTool').classList.add('active');
        svg.classList.add('select-mode');
    }
}

function clearCurrentFrame() {
    const currentLayer = state.layers.find(l => l.id === state.currentLayerId);
    
    if (!currentLayer || !currentLayer.frames[state.currentFrameIndex]) {
        return;
    }
    
    if (confirm('Clear all strokes on current layer at this frame?')) {
        saveStateForUndo();
        currentLayer.frames[state.currentFrameIndex].paths = [];
        state.redoStack = [];
        renderFrame();
        updateFrameList();
        saveToLocalStorage();
    }
}

// ==================== FRAME MANAGEMENT ====================
// These now work on the CURRENT LAYER's timeline
function addFrame() {
    const currentLayer = state.layers.find(l => l.id === state.currentLayerId);
    if (!currentLayer) return;
    
    // Insert new frame after current frame position
    // If current frame doesn't exist in this layer, add to end
    const insertIndex = state.currentFrameIndex + 1;
    
    if (insertIndex <= currentLayer.frames.length) {
        // Insert after current frame
        currentLayer.frames.splice(insertIndex, 0, { paths: [] });
        state.currentFrameIndex = insertIndex;
    } else {
        // Add to end if current index is beyond layer's frames
        currentLayer.frames.push({ paths: [] });
        state.currentFrameIndex = currentLayer.frames.length - 1;
    }
    
    // Update max frames
    updateMaxFrames();
    
    updateFrameList();
    updateFrameCounter();
    renderFrame();
    saveToLocalStorage();
}

function duplicateFrame() {
    const currentLayer = state.layers.find(l => l.id === state.currentLayerId);
    if (!currentLayer || !currentLayer.frames[state.currentFrameIndex]) return;
    
    const currentFrame = currentLayer.frames[state.currentFrameIndex];
    const duplicatedFrame = {
        paths: JSON.parse(JSON.stringify(currentFrame.paths))
    };
    
    currentLayer.frames.splice(state.currentFrameIndex + 1, 0, duplicatedFrame);
    state.currentFrameIndex++;
    
    updateMaxFrames();
    updateFrameList();
    updateLayerList();
    updateFrameCounter();
    renderFrame();
    saveToLocalStorage();
}

function addHoldFrame(frameIndex) {
    const currentLayer = state.layers.find(l => l.id === state.currentLayerId);
    if (!currentLayer || !currentLayer.frames[frameIndex]) return;
    
    const frame = currentLayer.frames[frameIndex];
    
    // Don't add hold to a frame that's already a held reference
    if (frame.holdReference !== undefined) return;
    
    // Initialize hold count if not set
    if (!frame.hold) {
        frame.hold = 0;
    }
    
    // Increment hold count
    frame.hold++;
    
    // Insert a new held frame after this frame
    const insertIndex = frameIndex + frame.hold;
    currentLayer.frames.splice(insertIndex, 0, { 
        paths: [], 
        holdReference: frameIndex
    });
    
    updateMaxFrames();
    updateFrameList();
    updateLayerList();
    updateFrameCounter();
    saveToLocalStorage();
}

function removeHoldFrame(frameIndex) {
    const currentLayer = state.layers.find(l => l.id === state.currentLayerId);
    if (!currentLayer || !currentLayer.frames[frameIndex]) return;
    
    const frame = currentLayer.frames[frameIndex];
    
    // Can only remove hold from frames that have holds
    if (!frame.hold || frame.hold <= 0) return;
    
    // Find and remove the last held frame
    let removedCount = 0;
    for (let i = currentLayer.frames.length - 1; i > frameIndex; i--) {
        const checkFrame = currentLayer.frames[i];
        if (checkFrame.holdReference === frameIndex) {
            currentLayer.frames.splice(i, 1);
            removedCount++;
            break; // Remove only one
        }
    }
    
    // Decrement hold count
    if (removedCount > 0) {
        frame.hold--;
        
        // Remove hold property if zero
        if (frame.hold === 0) {
            delete frame.hold;
        }
        
        updateMaxFrames();
        updateFrameList();
        updateLayerList();
        updateFrameCounter();
        saveToLocalStorage();
    }
}

// Clear current frame/layer
function clearCanvas() {
    const currentLayer = state.layers.find(l => l.id === state.currentLayerId);
    if (!currentLayer) return;
    
    const frameIndex = currentLayer.isBackground ? 0 : state.currentFrameIndex;
    const frame = currentLayer.frames[frameIndex];
    
    if (!frame || !frame.paths || frame.paths.length === 0) {
        showAlert('Canvas is already empty!', 'Nothing to Clear');
        return;
    }
    
    showConfirm(
        `Clear all content from current ${currentLayer.isBackground ? 'background layer' : 'frame'}?`,
        'Clear Canvas',
        () => {
            // Save state for undo
            saveStateForUndo();
            
            // Clear all paths
            frame.paths = [];
            
            // Re-render
            renderFrame();
            updateFrameList();
            saveToLocalStorage();
            showAutoSaveIndicator();
        }
    );
}

function deleteFrame() {
    const currentLayer = state.layers.find(l => l.id === state.currentLayerId);
    
    if (!currentLayer || currentLayer.frames.length === 1) {
        showAlert('Cannot delete the only frame on this layer!', 'Error');
        return;
    }
    
    if (!currentLayer.frames[state.currentFrameIndex]) {
        showAlert('No frame at this position on current layer!', 'Error');
        return;
    }
    
    showConfirm(
        'Delete this frame from current layer?',
        'Delete Frame',
        () => {
            currentLayer.frames.splice(state.currentFrameIndex, 1);
            
            if (state.currentFrameIndex >= currentLayer.frames.length) {
                state.currentFrameIndex = currentLayer.frames.length - 1;
            }
            
            updateMaxFrames();
            updateFrameList();
            updateLayerList();
            updateFrameCounter();
            renderFrame();
            saveToLocalStorage();
        }
    );
}

function selectFrame(index) {
    if (state.isPlaying) return;
    
    state.currentFrameIndex = index;
    updateFrameList();
    updateFrameCounter();
    renderFrame();
}

function updateFrameList() {
    const frameList = document.getElementById('frameList');
    frameList.innerHTML = '';
    
    const currentLayer = state.layers.find(l => l.id === state.currentLayerId);
    if (!currentLayer) return;
    
    // Show frames for current layer only
    currentLayer.frames.forEach((frame, index) => {
        const frameItem = document.createElement('div');
        frameItem.className = 'frame-item';
        if (index === state.currentFrameIndex) {
            frameItem.classList.add('active');
        }
        
        // Mark held frames visually
        const isHeldFrame = frame.holdReference !== undefined;
        if (isHeldFrame) {
            frameItem.classList.add('held-frame');
        }
        
        // Create thumbnail SVG
        const thumbSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        thumbSvg.setAttribute('width', '80');
        thumbSvg.setAttribute('height', '60');
        thumbSvg.setAttribute('viewBox', '0 0 800 600');
        thumbSvg.style.background = 'white';
        
        // Get the frame to display (handle held frames)
        let frameToDisplay = frame;
        if (frame.holdReference !== undefined) {
            frameToDisplay = currentLayer.frames[frame.holdReference] || frame;
        }
        
        // Show composite of all visible layers at this frame
        state.layers.forEach(layer => {
            if (layer.visible && layer.frames[index]) {
                let layerFrame = layer.frames[index];
                
                // Handle held frames for this layer too
                if (layerFrame.holdReference !== undefined) {
                    layerFrame = layer.frames[layerFrame.holdReference] || layerFrame;
                }
                
                if (layerFrame.paths) {
                    layerFrame.paths.forEach(pathData => {
                        const path = createPathElement(pathData);
                        thumbSvg.appendChild(path);
                    });
                }
            }
        });
        
        frameItem.appendChild(thumbSvg);
        
        // Add touch-friendly tap area overlay (doesn't block other elements)
        const tapArea = document.createElement('div');
        tapArea.className = 'frame-tap-area';
        tapArea.addEventListener('click', (e) => {
            // Only trigger if not clicking on buttons
            if (!e.target.classList.contains('hold-btn')) {
                selectFrame(index);
            }
        });
        frameItem.appendChild(tapArea);
        
        // Add frame number
        const frameNumber = document.createElement('div');
        frameNumber.className = 'frame-number';
        frameNumber.textContent = index + 1;
        frameItem.appendChild(frameNumber);
        
        // Add hold controls (only for non-held frames)
        if (!isHeldFrame) {
            const holdControls = document.createElement('div');
            holdControls.className = 'hold-controls';
            
            // Add hold button (+)
            const addBtn = document.createElement('button');
            addBtn.className = 'hold-btn hold-add';
            addBtn.textContent = '+';
            addBtn.title = 'Extend frame';
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                addHoldFrame(index);
            });
            
            // Remove hold button (-) - only show if frame has holds
            if (frame.hold && frame.hold > 0) {
                const removeBtn = document.createElement('button');
                removeBtn.className = 'hold-btn hold-remove';
                removeBtn.textContent = '−';
                removeBtn.title = 'Remove extension';
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeHoldFrame(index);
                });
                holdControls.appendChild(removeBtn);
            }
            
            holdControls.appendChild(addBtn);
            frameItem.appendChild(holdControls);
        }
        
        // Add hold count indicator if this frame has holds
        if (frame.hold && frame.hold > 0) {
            const holdBadge = document.createElement('div');
            holdBadge.className = 'hold-badge';
            holdBadge.textContent = `×${frame.hold}`;
            holdBadge.title = `Extended for ${frame.hold} frame(s)`;
            frameItem.appendChild(holdBadge);
        }
        
        frameList.appendChild(frameItem);
    });
}

function updateFrameCounter() {
    const currentLayer = state.layers.find(l => l.id === state.currentLayerId);
    const frameCount = currentLayer ? currentLayer.frames.length : 0;
    
    document.getElementById('frameCounter').textContent = 
        `${state.currentFrameIndex + 1}/${frameCount}`;
}

// ==================== PLAYBACK ====================
function togglePlayback() {
    if (state.isPlaying) {
        stopPlayback();
    } else {
        startPlayback();
    }
}

function startPlayback() {
    console.log('startPlayback called'); // Debug log
    
    // Clear any selection when playing
    if (state.tool === 'select' && typeof clearSelection === 'function') clearSelection();
    
    // Safety: Stop any existing playback first
    stopPlayback();
    
    // Check if we have frames to play
    if (state.maxFrames <= 1) {
        console.log('Not enough frames to play');
        return;
    }
    
    // Update state immediately
    state.isPlaying = true;
    
    // Update Play button to Stop icon
    const playBtn = document.getElementById('playBtn');
    if (playBtn) {
        const iconEl = playBtn.querySelector('.icon');
        if (iconEl) iconEl.textContent = '⏹'; // Stop icon
        playBtn.title = 'Stop';
        playBtn.classList.add('playing');
    }
    
    const frameDelay = Math.max(1000 / state.fps, 16); // Minimum 16ms (60fps cap)
    
    // Use requestAnimationFrame for smoother playback on mobile
    let lastFrameTime = Date.now();
    let iterationCount = 0; // Safety counter
    const MAX_ITERATIONS = 10000; // Prevent infinite loops
    
    const playbackLoop = () => {
        // CRITICAL: Multiple stop checks
        if (!state.isPlaying) {
            console.log('Playback stopped in loop (state check)');
            if (state.playInterval) {
                cancelAnimationFrame(state.playInterval);
                state.playInterval = null;
            }
            return;
        }
        
        // Safety: iteration limit
        iterationCount++;
        if (iterationCount > MAX_ITERATIONS) {
            console.error('Playback exceeded max iterations! Force stop.');
            stopPlayback();
            return;
        }
        
        // UI validation: check button icon
        const iconEl = playBtn ? playBtn.querySelector('.icon') : null;
        if (iconEl && iconEl.textContent !== '⏹') {
            console.warn('Button icon mismatch detected! Force stop.');
            stopPlayback();
            return;
        }
        
        const now = Date.now();
        const elapsed = now - lastFrameTime;
        
        // Only advance frame if enough time has passed
        if (elapsed >= frameDelay) {
            lastFrameTime = now;
            
            // Advance frame
            state.currentFrameIndex = (state.currentFrameIndex + 1) % state.maxFrames;
            
            // Update display
            try {
                renderFrame();
                updateFrameList();
                updateFrameCounter();
            } catch (err) {
                console.error('Playback render error:', err);
                stopPlayback();
                return;
            }
        }
        
        // Continue loop ONLY if still playing
        if (state.isPlaying) {
            state.playInterval = requestAnimationFrame(playbackLoop);
        } else {
            console.log('State changed, not scheduling next frame');
        }
    };
    
    // Start the loop
    state.playInterval = requestAnimationFrame(playbackLoop);
    console.log('Playback loop started');
}

function stopPlayback() {
    console.log('stopPlayback called'); // Debug log
    
    // CRITICAL: Set state FIRST before anything else
    const wasPlaying = state.isPlaying;
    state.isPlaying = false;
    
    // Force clear interval/animation frame with multiple attempts
    if (state.playInterval) {
        try {
            cancelAnimationFrame(state.playInterval);
        } catch (err) {
            console.error('Error canceling animation frame:', err);
        }
        state.playInterval = null;
    }
    
    // Additional cleanup: clear any lingering intervals (belt and suspenders)
    if (wasPlaying) {
        // Force stop any possible interval that might be running
        for (let i = 1; i < 9999; i++) {
            window.clearInterval(i);
        }
    }
    
    // Update button to Play icon
    const playBtn = document.getElementById('playBtn');
    if (playBtn) {
        const iconEl = playBtn.querySelector('.icon');
        if (iconEl) iconEl.textContent = '▶'; // Play icon
        playBtn.title = 'Play';
        playBtn.classList.remove('playing');
        
        // Force button to be re-enabled (critical for iPad)
        playBtn.disabled = false;
        playBtn.style.pointerEvents = 'auto';
    }
    
    // Force a final render to ensure UI is in sync
    try {
        renderFrame();
        updateFrameList();
        updateFrameCounter();
    } catch (err) {
        console.error('Stop playback render error:', err);
    }
    
    console.log('stopPlayback complete, isPlaying:', state.isPlaying);
}

// ==================== UNDO/REDO ====================
function saveStateForUndo() {
    const currentLayer = state.layers.find(l => l.id === state.currentLayerId);
    if (!currentLayer || !currentLayer.frames[state.currentFrameIndex]) return;
    
    const frameState = JSON.parse(JSON.stringify(currentLayer.frames[state.currentFrameIndex]));
    state.undoStack.push({
        layerId: state.currentLayerId,
        frameIndex: state.currentFrameIndex,
        frameState: frameState
    });
    
    if (state.undoStack.length > 50) {
        state.undoStack.shift();
    }
}

function undo() {
    if (state.undoStack.length === 0) return;
    
    const previousState = state.undoStack.pop();
    const layer = state.layers.find(l => l.id === previousState.layerId);
    
    if (!layer || !layer.frames[previousState.frameIndex]) return;
    
    // Save current state to redo
    const currentState = JSON.parse(JSON.stringify(layer.frames[previousState.frameIndex]));
    state.redoStack.push({
        layerId: previousState.layerId,
        frameIndex: previousState.frameIndex,
        frameState: currentState
    });
    
    // Restore previous state
    layer.frames[previousState.frameIndex] = previousState.frameState;
    state.currentLayerId = previousState.layerId;
    state.currentFrameIndex = previousState.frameIndex;
    
    renderFrame();
    updateFrameList();
    updateLayerList();
    saveToLocalStorage();
}

function redo() {
    if (state.redoStack.length === 0) return;
    
    const nextState = state.redoStack.pop();
    const layer = state.layers.find(l => l.id === nextState.layerId);
    
    if (!layer || !layer.frames[nextState.frameIndex]) return;
    
    // Save current to undo
    saveStateForUndo();
    
    // Restore next state
    layer.frames[nextState.frameIndex] = nextState.frameState;
    state.currentLayerId = nextState.layerId;
    state.currentFrameIndex = nextState.frameIndex;
    
    renderFrame();
    updateFrameList();
    updateLayerList();
    saveToLocalStorage();
}

// ==================== LOCAL STORAGE ====================
function saveToLocalStorage() {
    try {
        const saveData = {
            layers: state.layers,
            currentLayerId: state.currentLayerId,
            currentFrameIndex: state.currentFrameIndex,
            maxFrames: state.maxFrames,
            layerIdCounter: state.layerIdCounter,
            fps: state.fps,
            backgroundColor: state.backgroundColor,
            onionSkinEnabled: state.onionSkinEnabled,
            onionSkinSettings: state.onionSkinSettings,
            version: '4.2' // Updated version with onion skin settings
        };
        localStorage.setItem('vectorAnimationToolData', JSON.stringify(saveData));
    } catch (e) {
        console.error('Failed to save to localStorage:', e);
    }
}

function loadFromLocalStorage() {
    try {
        const savedData = localStorage.getItem('vectorAnimationToolData');
        if (savedData) {
            const data = JSON.parse(savedData);
            
            // Check if data has layer-centric structure
            if ((data.version === '4.0' || data.version === '4.1' || data.version === '4.2') && data.layers && data.layers[0] && data.layers[0].frames) {
                state.layers = data.layers;
                // Ensure opacity exists on all layers (data migration)
                state.layers.forEach(l => { if (l.opacity === undefined) l.opacity = 1; });
                state.currentLayerId = data.currentLayerId || state.layers[0].id;
                state.currentFrameIndex = data.currentFrameIndex || 0;
                state.maxFrames = data.maxFrames || 1;
                state.layerIdCounter = data.layerIdCounter || 1;
                state.fps = data.fps || 12;
                state.backgroundColor = data.backgroundColor || '#ffffff';
                
                // Load onion skin settings (default to enabled if not present)
                state.onionSkinEnabled = data.onionSkinEnabled !== undefined ? data.onionSkinEnabled : true;
                if (data.onionSkinSettings) {
                    state.onionSkinSettings = data.onionSkinSettings;
                }
            } else {
                // Old format - reset
                console.log('Old data format detected, resetting...');
                resetToDefault();
            }
            
            document.getElementById('fpsSelect').value = state.fps;
            // Background UI will be synced in init() via syncBackgroundUI()
        }
    } catch (e) {
        console.error('Failed to load from localStorage:', e);
        resetToDefault();
    }
}

function resetToDefault() {
    state.layers = [{
        id: 'layer-1',
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        frames: [{ paths: [] }]
    }];
    state.currentLayerId = 'layer-1';
    state.currentFrameIndex = 0;
    state.maxFrames = 1;
    state.layerIdCounter = 1;
    state.fps = 12;
}

// ==================== EXPORT/IMPORT ====================
function exportProject() {
    const projectData = {
        layers: state.layers,
        fps: state.fps,
        backgroundColor: state.backgroundColor,
        version: '4.1',
        format: 'vector-svg-layer-timelines'
    };
    
    const dataStr = JSON.stringify(projectData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'vector-animation-project.json';
    link.click();
    
    URL.revokeObjectURL(url);
}

function importProject(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const projectData = JSON.parse(event.target.result);
            
            if ((projectData.version === '4.0' || projectData.version === '4.1') && projectData.layers) {
                state.layers = projectData.layers;
                state.fps = projectData.fps || 12;
                state.backgroundColor = projectData.backgroundColor || '#ffffff';
                state.currentFrameIndex = 0;
                state.currentLayerId = state.layers[0].id;
                updateMaxFrames();
            } else {
                showAlert('Unsupported project format!', 'Import Error');
                return;
            }
            
            document.getElementById('fpsSelect').value = state.fps;
            syncBackgroundUI();
            
            updateBackground();
            renderFrame();
            updateLayerList();
            updateFrameList();
            updateFrameCounter();
            saveToLocalStorage();
            
            showAlert('Project imported successfully!', 'Success');
        } catch (err) {
            showAlert('Failed to import project: ' + err.message, 'Import Error');
        }
    };
    reader.readAsText(file);
    
    e.target.value = '';
}

// ==================== GIF EXPORT ====================
async function exportAsGIF() {
    // Check if gifshot is available
    if (typeof gifshot === 'undefined') {
        showAlert('GIF library not loaded. Please refresh the page and try again.', 'Error');
        return;
    }
    
    // Disable export button
    const exportBtn = document.getElementById('exportGifBtn');
    const originalText = exportBtn.textContent;
    exportBtn.disabled = true;
    exportBtn.textContent = 'Exporting…';
    
    // Show loading indicator
    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.textContent = 'Rendering frames...';
    document.body.appendChild(loading);
    
    try {
        console.log(`Starting GIF export: ${state.maxFrames} frames at ${state.fps} FPS`);
        
        // Create temporary canvas for rendering (use current canvas size)
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = state.canvasWidth;
        tempCanvas.height = state.canvasHeight;
        const tempCtx = tempCanvas.getContext('2d');
        
        const images = [];
        
        // Render each frame to base64 image
        for (let i = 0; i < state.maxFrames; i++) {
            loading.textContent = `Rendering frame ${i + 1}/${state.maxFrames}...`;
            console.log(`Rendering frame ${i + 1}/${state.maxFrames}`);
            
            // Allow UI to update
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Clear canvas
            tempCtx.clearRect(0, 0, state.canvasWidth, state.canvasHeight);
            
            // Draw background
            if (state.backgroundColor !== 'transparent') {
                tempCtx.fillStyle = state.backgroundColor;
                tempCtx.fillRect(0, 0, state.canvasWidth, state.canvasHeight);
            }
            
            // Render all visible layers at this frame index
            await renderFrameToCanvas(tempCtx, i);
            
            // Convert canvas to base64 image
            images.push(tempCanvas.toDataURL('image/png'));
        }
        
        console.log('All frames rendered, starting GIF encoding...');
        loading.textContent = 'Encoding GIF...';
        
        // Create GIF using gifshot
        gifshot.createGIF({
            images: images,
            gifWidth: state.canvasWidth,
            gifHeight: state.canvasHeight,
            interval: 1 / state.fps, // Interval in seconds
            numFrames: state.maxFrames,
            frameDuration: 1, // Frame duration multiplier
            sampleInterval: 10, // Quality setting (lower = better quality)
        }, function(obj) {
            if (!obj.error) {
                console.log('GIF encoding complete');
                loading.textContent = 'Download starting...';
                
                // Create download link
                const link = document.createElement('a');
                link.href = obj.image; // base64 data URL
                link.download = `animation-${Date.now()}.gif`;
                
                // Trigger download
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                // Cleanup
                setTimeout(() => {
                    if (document.body.contains(loading)) {
                        document.body.removeChild(loading);
                    }
                    exportBtn.disabled = false;
                    exportBtn.textContent = originalText;
                }, 100);
            } else {
                console.error('GIF encoding error:', obj.error);
                showAlert('Failed to encode GIF: ' + obj.error, 'Export Error');
                if (document.body.contains(loading)) {
                    document.body.removeChild(loading);
                }
                exportBtn.disabled = false;
                exportBtn.textContent = originalText;
            }
        });
        
    } catch (err) {
        console.error('GIF export error:', err);
        showAlert('Failed to export GIF: ' + err.message, 'Export Error');
        if (document.body.contains(loading)) {
            document.body.removeChild(loading);
        }
        exportBtn.disabled = false;
        exportBtn.textContent = originalText;
    }
}

// Export as PNG sequence (ZIP file)
async function exportAsPNGSequence() {
    // Check if JSZip is available
    if (typeof JSZip === 'undefined') {
        showAlert('Please include JSZip library:\n<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>', 'Library Missing');
        return;
    }
    
    const exportBtn = document.getElementById('exportPngBtn');
    const originalText = exportBtn.innerHTML;
    exportBtn.disabled = true;
    exportBtn.innerHTML = '<span class="export-icon">⏳</span><span class="export-label">Exporting…</span>';
    
    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.textContent = 'Rendering frames...';
    document.body.appendChild(loading);
    
    try {
        const zip = new JSZip();
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = state.canvasWidth;
        tempCanvas.height = state.canvasHeight;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Render each frame as PNG
        for (let i = 0; i < state.maxFrames; i++) {
            loading.textContent = `Rendering frame ${i + 1}/${state.maxFrames}...`;
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Clear and draw background
            tempCtx.clearRect(0, 0, state.canvasWidth, state.canvasHeight);
            if (state.backgroundColor !== 'transparent') {
                tempCtx.fillStyle = state.backgroundColor;
                tempCtx.fillRect(0, 0, state.canvasWidth, state.canvasHeight);
            }
            
            // Render frame
            await renderFrameToCanvas(tempCtx, i);
            
            // Convert to blob and add to zip
            const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png'));
            const frameNumber = String(i + 1).padStart(4, '0');
            zip.file(`frame_${frameNumber}.png`, blob);
        }
        
        loading.textContent = 'Creating ZIP file...';
        
        // Generate ZIP
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        
        // Download ZIP
        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipBlob);
        link.download = `animation-${Date.now()}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        
        if (document.body.contains(loading)) {
            document.body.removeChild(loading);
        }
        exportBtn.disabled = false;
        exportBtn.innerHTML = originalText;
        
    } catch (err) {
        console.error('PNG sequence export error:', err);
        showAlert('Failed to export PNG sequence: ' + err.message, 'Export Error');
        if (document.body.contains(loading)) {
            document.body.removeChild(loading);
        }
        exportBtn.disabled = false;
        exportBtn.innerHTML = originalText;
    }
}

// Export as MP4 video (using WebCodecs + mp4-muxer for TRUE MP4 files)
async function exportAsMP4() {
    // Check for WebCodecs support (Chrome 94+, Edge 94+)
    if (!window.VideoEncoder || !window.VideoFrame) {
        showAlert(
            'MP4 export requires Chrome 94+ or Edge 94+.\n\n' +
            'Your browser doesn\'t support WebCodecs.\n\n' +
            'Alternative: Use PNG Sequence export.',
            'Not Supported'
        );
        return;
    }
    
    const exportBtn = document.getElementById('exportMp4Btn');
    const originalText = exportBtn.innerHTML;
    exportBtn.disabled = true;
    exportBtn.innerHTML = '<span class="export-icon">⏳</span><span class="export-label">Loading…</span>';
    
    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.textContent = 'Loading MP4 encoder...';
    document.body.appendChild(loading);
    
    try {
        // Import mp4-muxer from esm.sh (the CDN that actually works!)
        console.log('Importing mp4-muxer from esm.sh...');
        const { Muxer, ArrayBufferTarget } = await import('https://esm.sh/mp4-muxer@5.1.1');
        console.log('✅ mp4-muxer loaded successfully');
        
        loading.textContent = 'Preparing MP4 encoder...';
        
        // Create canvas for rendering
        const canvas = document.createElement('canvas');
        canvas.width = state.canvasWidth;
        canvas.height = state.canvasHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        // Create MP4 muxer
        console.log('Creating MP4 muxer...');
        const muxer = new Muxer({
            target: new ArrayBufferTarget(),
            video: {
                codec: 'avc',
                width: state.canvasWidth,
                height: state.canvasHeight
            },
            fastStart: 'in-memory'
        });
        
        // Configure video encoder
        const videoEncoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
            error: (e) => {
                console.error('Encoder error:', e);
                throw e;
            }
        });
        
        videoEncoder.configure({
            codec: 'avc1.42001f', // H.264 Baseline Level 3.1
            width: state.canvasWidth,
            height: state.canvasHeight,
            bitrate: 5_000_000, // 5 Mbps
            framerate: state.fps,
            latencyMode: 'quality'
        });
        
        console.log('Encoder configured, starting encoding...');
        
        // Calculate frame timing
        const frameDuration = 1_000_000 / state.fps; // microseconds
        
        // Encode each frame
        for (let i = 0; i < state.maxFrames; i++) {
            loading.textContent = `Encoding frame ${i + 1}/${state.maxFrames}...`;
            
            // Clear and fill background
            ctx.fillStyle = state.backgroundColor || '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Render the frame
            await renderFrameToCanvas(ctx, i);
            
            // Create video frame from canvas
            const videoFrame = new VideoFrame(canvas, {
                timestamp: i * frameDuration,
                duration: frameDuration
            });
            
            // Encode (keyframe every 30 frames for seeking)
            const isKeyFrame = i % 30 === 0;
            videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
            videoFrame.close();
            
            // Allow UI to update every 5 frames
            if (i % 5 === 0) {
                await new Promise(resolve => setTimeout(resolve, 1));
            }
        }
        
        // Flush encoder
        console.log('Flushing encoder...');
        loading.textContent = 'Finalizing MP4...';
        await videoEncoder.flush();
        videoEncoder.close();
        
        console.log('Finalizing muxer...');
        
        // Finalize muxer
        muxer.finalize();
        
        // Get the MP4 file data
        const mp4Buffer = muxer.target.buffer;
        
        console.log('✅ MP4 created:', mp4Buffer.byteLength, 'bytes');
        
        // Verify it's actually MP4 (should start with 'ftyp')
        const header = new Uint8Array(mp4Buffer.slice(4, 8));
        const headerType = String.fromCharCode(...header);
        console.log('File type:', headerType, '(should be "ftyp")');
        
        // Create download
        const blob = new Blob([mp4Buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `animation-${Date.now()}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        if (document.body.contains(loading)) {
            document.body.removeChild(loading);
        }
        exportBtn.disabled = false;
        exportBtn.innerHTML = originalText;
        
        console.log('✅ MP4 export complete!');
        
        showAlert('MP4 video exported successfully!\n\nTrue .mp4 file with H.264 codec.', 'Export Complete');
        
    } catch (err) {
        console.error('MP4 export error:', err);
        console.error('Stack:', err.stack);
        
        let errorMsg = 'Failed to export MP4: ' + err.message;
        
        if (err.message.includes('import') || err.message.includes('module')) {
            errorMsg += '\n\nModule loading error.\n\nTry: PNG Sequence export instead.';
        } else if (err.message.includes('codec') || err.message.includes('not supported')) {
            errorMsg += '\n\nH.264 encoding not supported.\n\nTry: Chrome or Edge (latest version)';
        }
        
        showAlert(errorMsg, 'Export Error');
        
        if (document.body.contains(loading)) {
            document.body.removeChild(loading);
        }
        exportBtn.disabled = false;
        exportBtn.innerHTML = originalText;
    }
}

// Render a specific frame index to a canvas context
async function renderFrameToCanvas(ctx, frameIndex) {
    // Iterate through layers in order
    for (const layer of state.layers) {
        if (!layer.visible || !layer.frames[frameIndex]) {
            continue;
        }
        
        // Apply layer opacity for export
        const layerOpacity = layer.opacity !== undefined ? layer.opacity : 1;
        ctx.globalAlpha = layerOpacity;
        
        // Render each path in the frame
        for (const pathData of layer.frames[frameIndex].paths) {
            ctx.strokeStyle = pathData.stroke;
            ctx.lineWidth = parseFloat(pathData.strokeWidth);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            // Handle eraser tool (draws white, but we need to use composite operation)
            if (pathData.tool === 'eraser') {
                ctx.globalCompositeOperation = 'destination-out';
            } else {
                ctx.globalCompositeOperation = 'source-over';
            }
            
            // Draw the path
            const path2D = new Path2D(pathData.d);
            ctx.stroke(path2D);
        }
    }
    
    // Reset composite operation
    ctx.globalCompositeOperation = 'source-over';
}

// Legacy SVG export (keep for backup/alternative export)
function exportAsSVGSequence() {
    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.textContent = 'Generating SVG files...';
    document.body.appendChild(loading);
    
    setTimeout(() => {
        try {
            const svgFiles = [];
            
            // Export based on max frames across all layers
            for (let i = 0; i < state.maxFrames; i++) {
                const svgContent = createCompositeSVG(i);
                const blob = new Blob([svgContent], { type: 'image/svg+xml' });
                const url = URL.createObjectURL(blob);
                
                svgFiles.push({
                    url: url,
                    filename: `frame-${String(i + 1).padStart(3, '0')}.svg`,
                    index: i + 1
                });
            }
            
            showDownloadModal(svgFiles);
            
        } catch (err) {
            showAlert('Failed to export: ' + err.message, 'Export Error');
        } finally {
            document.body.removeChild(loading);
        }
    }, 100);
}


function createCompositeSVG(frameIndex) {
    const bgFill = state.backgroundColor === 'transparent' ? 'none' : state.backgroundColor;
    
    console.log('Exporting frame', frameIndex, 'with background:', bgFill);
    
    let svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg" version="1.1">
    <rect id="background" width="100%" height="100%" fill="${bgFill}"/>
`;
    
    // Composite all layers at this frame index
    state.layers.forEach(layer => {
        if (layer.visible && layer.frames[frameIndex]) {
            const layerOpacity = layer.opacity !== undefined ? layer.opacity : 1;
            svgContent += `    <!-- ${layer.name} -->\n`;
            svgContent += `    <g id="${layer.id}"${layerOpacity < 1 ? ` opacity="${layerOpacity}"` : ''}>\n`;
            layer.frames[frameIndex].paths.forEach(pathData => {
                svgContent += `        <path d="${pathData.d}" fill="none" stroke="${pathData.stroke}" stroke-width="${pathData.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>\n`;
            });
            svgContent += `    </g>\n`;
        }
    });
    
    svgContent += `</svg>`;
    
    console.log('Generated SVG preview:', svgContent.substring(0, 300));
    
    return svgContent;
}

function showDownloadModal(files) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 30px;
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        z-index: 1001;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
    `;
    
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 1000;
    `;
    
    modal.innerHTML = `
        <h3 style="margin-bottom: 10px; font-size: 24px; color: #1a1a2e;">Export Composite Frames</h3>
        <p style="margin-bottom: 20px; color: #666;">Download each frame with all layers composited:</p>
        <div id="frameLinks" style="display: flex; flex-direction: column; gap: 10px; margin-top: 20px;"></div>
        <button id="closeModal" class="btn" style="margin-top: 20px; width: 100%;">Close</button>
    `;
    
    document.body.appendChild(overlay);
    document.body.appendChild(modal);
    
    const frameLinks = modal.querySelector('#frameLinks');
    
    files.forEach(file => {
        const link = document.createElement('a');
        link.href = file.url;
        link.download = file.filename;
        link.textContent = `Download Frame ${file.index} (SVG)`;
        link.className = 'btn';
        link.style.textDecoration = 'none';
        link.style.textAlign = 'center';
        frameLinks.appendChild(link);
    });
    
    const closeBtn = modal.querySelector('#closeModal');
    closeBtn.addEventListener('click', () => {
        files.forEach(file => URL.revokeObjectURL(file.url));
        document.body.removeChild(modal);
        document.body.removeChild(overlay);
    });
    
    overlay.addEventListener('click', () => {
        files.forEach(file => URL.revokeObjectURL(file.url));
        document.body.removeChild(modal);
        document.body.removeChild(overlay);
    });
}


// ==================== FRAME COPY/PASTE ====================
function copyFrame() {
    const currentLayer = state.layers.find(l => l.id === state.currentLayerId);
    if (!currentLayer) return;
    
    const frameIndex = currentLayer.isBackground ? 0 : state.currentFrameIndex;
    const frame = currentLayer.frames[frameIndex];
    if (!frame) return;
    
    state.frameClipboard = JSON.parse(JSON.stringify(frame));
    
    const indicator = document.getElementById('autoSaveIndicator');
    if (indicator) {
        indicator.textContent = 'Frame copied';
        indicator.classList.add('visible');
        setTimeout(function() { indicator.classList.remove('visible'); }, 1500);
    }
}

function pasteFrame() {
    if (!state.frameClipboard) {
        const indicator = document.getElementById('autoSaveIndicator');
        if (indicator) {
            indicator.textContent = 'Nothing to paste';
            indicator.classList.add('visible');
            setTimeout(function() { indicator.classList.remove('visible'); }, 1500);
        }
        return;
    }
    
    const currentLayer = state.layers.find(l => l.id === state.currentLayerId);
    if (!currentLayer) return;
    
    saveStateForUndo();
    
    const frameIndex = currentLayer.isBackground ? 0 : state.currentFrameIndex;
    const pastedFrame = JSON.parse(JSON.stringify(state.frameClipboard));
    
    if (currentLayer.frames[frameIndex] && currentLayer.frames[frameIndex].paths && currentLayer.frames[frameIndex].paths.length === 0) {
        currentLayer.frames[frameIndex] = pastedFrame;
    } else {
        currentLayer.frames.splice(frameIndex + 1, 0, pastedFrame);
        state.currentFrameIndex = frameIndex + 1;
    }
    
    updateMaxFrames();
    state.redoStack = [];
    renderFrame();
    updateFrameList();
    updateFrameCounter();
    saveToLocalStorage();
    
    const indicator = document.getElementById('autoSaveIndicator');
    if (indicator) {
        indicator.textContent = 'Frame pasted';
        indicator.classList.add('visible');
        setTimeout(function() { indicator.classList.remove('visible'); }, 1500);
    }
}

// ==================== SELECTION TOOL ====================
const selectionOverlay = document.getElementById('selectionOverlay');

function getSelectionFrame() {
    const currentLayer = state.layers.find(l => l.id === state.currentLayerId);
    if (!currentLayer) return null;
    const frameIndex = currentLayer.isBackground ? 0 : state.currentFrameIndex;
    return currentLayer.frames[frameIndex] || null;
}

function getPathBBox(pathD) {
    const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tempPath.setAttribute('d', pathD);
    svg.appendChild(tempPath);
    const bbox = tempPath.getBBox();
    svg.removeChild(tempPath);
    return bbox;
}

function getPathDataBBox(pathData) {
    const bbox = getPathBBox(pathData.d);
    const sw = parseFloat(pathData.strokeWidth) || 0;
    const half = sw / 2;
    return {
        x: bbox.x - half,
        y: bbox.y - half,
        width: bbox.width + sw,
        height: bbox.height + sw
    };
}

function getCombinedBBox(frame, indices) {
    if (!frame || indices.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const idx of indices) {
        if (idx >= frame.paths.length) continue;
        const bbox = getPathDataBBox(frame.paths[idx]);
        minX = Math.min(minX, bbox.x);
        minY = Math.min(minY, bbox.y);
        maxX = Math.max(maxX, bbox.x + bbox.width);
        maxY = Math.max(maxY, bbox.y + bbox.height);
    }
    if (minX === Infinity) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function hitTestPath(pathData, point, tolerance) {
    const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tempPath.setAttribute('d', pathData.d);
    svg.appendChild(tempPath);
    const totalLen = tempPath.getTotalLength();
    const sw = parseFloat(pathData.strokeWidth) || 2;
    const hitDist = Math.max(tolerance, sw * 1.5);
    const steps = Math.max(20, Math.ceil(totalLen / 4));
    let hit = false;
    for (let i = 0; i <= steps; i++) {
        const pt = tempPath.getPointAtLength((i / steps) * totalLen);
        const dx = pt.x - point.x;
        const dy = pt.y - point.y;
        if (dx * dx + dy * dy < hitDist * hitDist) {
            hit = true;
            break;
        }
    }
    svg.removeChild(tempPath);
    return hit;
}

function findPathAtPoint(frame, point) {
    if (!frame) return -1;
    for (let i = frame.paths.length - 1; i >= 0; i--) {
        const pathData = frame.paths[i];
        if (!pathData.d) continue;
        if (pathData.fill && pathData.fill !== 'none') {
            const bbox = getPathBBox(pathData.d);
            if (point.x >= bbox.x && point.x <= bbox.x + bbox.width &&
                point.y >= bbox.y && point.y <= bbox.y + bbox.height) {
                return i;
            }
        }
        if (hitTestPath(pathData, point, 8)) return i;
    }
    return -1;
}

function clearSelection() {
    state.selection.indices = [];
    state.selection.bbox = null;
    state.selection.isDragging = false;
    state.selection.isResizing = false;
    state.selection.isRotating = false;
    state.selection.isMarquee = false;
    state.selection.rotation = 0;
    state.selection.originalPaths = null;
    state.selection.marqueeStart = null;
    state.selection.anchor = null;
    state.selection.anchorLocked = false;
    state.selection.isDraggingAnchor = false;
    state.selection.rotateAnchor = null;
    state.selection._anchorAtDragStart = null;
    drawSelectionOverlay();
}

function getSelectionAnchor() {
    const sel = state.selection;
    if (sel.anchor) return sel.anchor;
    // Default: bbox center
    if (sel.bbox) {
        return {
            x: sel.bbox.x + sel.bbox.width / 2,
            y: sel.bbox.y + sel.bbox.height / 2
        };
    }
    // Fallback: compute from indices
    const frame = getSelectionFrame();
    if (frame) {
        const bbox = getCombinedBBox(frame, sel.indices);
        if (bbox) return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
    }
    return { x: 0, y: 0 };
}

function drawSelectionOverlay() {
    selectionOverlay.innerHTML = '';
    const sel = state.selection;
    if (sel.indices.length === 0 && !sel.isMarquee) return;

    // Marquee rectangle
    if (sel.isMarquee && sel.marqueeStart && sel.dragStart) {
        const x = Math.min(sel.marqueeStart.x, sel.dragStart.x);
        const y = Math.min(sel.marqueeStart.y, sel.dragStart.y);
        const w = Math.abs(sel.dragStart.x - sel.marqueeStart.x);
        const h = Math.abs(sel.dragStart.y - sel.marqueeStart.y);
        const marquee = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        marquee.setAttribute('x', x);
        marquee.setAttribute('y', y);
        marquee.setAttribute('width', w);
        marquee.setAttribute('height', h);
        marquee.setAttribute('class', 'selection-bbox');
        marquee.setAttribute('fill', 'rgba(37, 99, 235, 0.08)');
        selectionOverlay.appendChild(marquee);
        return;
    }

    if (sel.indices.length === 0) return;
    const frame = getSelectionFrame();
    if (!frame) return;

    // Highlight selected paths
    for (const idx of sel.indices) {
        if (idx >= frame.paths.length) continue;
        const pathData = frame.paths[idx];
        const highlight = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        highlight.setAttribute('d', pathData.d);
        highlight.setAttribute('class', 'selection-highlight');
        const sw = parseFloat(pathData.strokeWidth) || 0;
        highlight.setAttribute('stroke-width', sw + 4);
        selectionOverlay.appendChild(highlight);
    }

    // Bounding box
    sel.bbox = getCombinedBBox(frame, sel.indices);
    if (!sel.bbox) return;
    const b = sel.bbox;
    const pad = 6;
    const bx = b.x - pad, by = b.y - pad;
    const bw = b.width + pad * 2, bh = b.height + pad * 2;

    // Move area
    const moveArea = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    moveArea.setAttribute('x', bx);
    moveArea.setAttribute('y', by);
    moveArea.setAttribute('width', bw);
    moveArea.setAttribute('height', bh);
    moveArea.setAttribute('class', 'selection-move-area');
    moveArea.setAttribute('data-action', 'move');
    selectionOverlay.appendChild(moveArea);

    // Bbox outline
    const bboxRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bboxRect.setAttribute('x', bx);
    bboxRect.setAttribute('y', by);
    bboxRect.setAttribute('width', bw);
    bboxRect.setAttribute('height', bh);
    bboxRect.setAttribute('class', 'selection-bbox');
    selectionOverlay.appendChild(bboxRect);

    // 8 resize handles
    const hs = 7;
    const handles = [
        { cls: 'nw', cx: bx, cy: by },
        { cls: 'n',  cx: bx + bw / 2, cy: by },
        { cls: 'ne', cx: bx + bw, cy: by },
        { cls: 'e',  cx: bx + bw, cy: by + bh / 2 },
        { cls: 'se', cx: bx + bw, cy: by + bh },
        { cls: 's',  cx: bx + bw / 2, cy: by + bh },
        { cls: 'sw', cx: bx, cy: by + bh },
        { cls: 'w',  cx: bx, cy: by + bh / 2 }
    ];
    for (const h of handles) {
        const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        handle.setAttribute('x', h.cx - hs / 2);
        handle.setAttribute('y', h.cy - hs / 2);
        handle.setAttribute('width', hs);
        handle.setAttribute('height', hs);
        handle.setAttribute('class', 'selection-handle ' + h.cls);
        handle.setAttribute('data-action', 'resize');
        handle.setAttribute('data-handle', h.cls);
        selectionOverlay.appendChild(handle);
    }

    // Anchor point (pivot for rotation)
    const anchor = getSelectionAnchor();

    // Anchor crosshair
    const anchorSize = 8;
    const anchorGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    anchorGroup.setAttribute('data-action', 'anchor');
    anchorGroup.style.cursor = 'move';

    // Outer circle
    const anchorCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    anchorCircle.setAttribute('cx', anchor.x);
    anchorCircle.setAttribute('cy', anchor.y);
    anchorCircle.setAttribute('r', anchorSize);
    anchorCircle.setAttribute('fill', 'rgba(37, 99, 235, 0.1)');
    anchorCircle.setAttribute('stroke', 'var(--accent)');
    anchorCircle.setAttribute('stroke-width', '1.5');
    anchorCircle.setAttribute('vector-effect', 'non-scaling-stroke');
    anchorCircle.setAttribute('data-action', 'anchor');
    anchorGroup.appendChild(anchorCircle);

    // Crosshair horizontal
    const anchorH = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    anchorH.setAttribute('x1', anchor.x - anchorSize);
    anchorH.setAttribute('y1', anchor.y);
    anchorH.setAttribute('x2', anchor.x + anchorSize);
    anchorH.setAttribute('y2', anchor.y);
    anchorH.setAttribute('stroke', 'var(--accent)');
    anchorH.setAttribute('stroke-width', '1');
    anchorH.setAttribute('vector-effect', 'non-scaling-stroke');
    anchorH.setAttribute('pointer-events', 'none');
    anchorGroup.appendChild(anchorH);

    // Crosshair vertical
    const anchorV = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    anchorV.setAttribute('x1', anchor.x);
    anchorV.setAttribute('y1', anchor.y - anchorSize);
    anchorV.setAttribute('x2', anchor.x);
    anchorV.setAttribute('y2', anchor.y + anchorSize);
    anchorV.setAttribute('stroke', 'var(--accent)');
    anchorV.setAttribute('stroke-width', '1');
    anchorV.setAttribute('vector-effect', 'non-scaling-stroke');
    anchorV.setAttribute('pointer-events', 'none');
    anchorGroup.appendChild(anchorV);

    // Small center dot
    const anchorDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    anchorDot.setAttribute('cx', anchor.x);
    anchorDot.setAttribute('cy', anchor.y);
    anchorDot.setAttribute('r', 2);
    anchorDot.setAttribute('fill', 'var(--accent)');
    anchorDot.setAttribute('pointer-events', 'none');
    anchorGroup.appendChild(anchorDot);

    selectionOverlay.appendChild(anchorGroup);

    // Rotate handle (connected to anchor by line, positioned above bbox)
    const rotOff = 25;
    const rotLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    rotLine.setAttribute('x1', bx + bw / 2);
    rotLine.setAttribute('y1', by);
    rotLine.setAttribute('x2', bx + bw / 2);
    rotLine.setAttribute('y2', by - rotOff);
    rotLine.setAttribute('class', 'selection-rotate-line');
    selectionOverlay.appendChild(rotLine);

    const rotHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    rotHandle.setAttribute('cx', bx + bw / 2);
    rotHandle.setAttribute('cy', by - rotOff);
    rotHandle.setAttribute('r', 5);
    rotHandle.setAttribute('class', 'selection-rotate-handle');
    rotHandle.setAttribute('data-action', 'rotate');
    selectionOverlay.appendChild(rotHandle);
}

function transformPathD(d, transform) {
    const { translateX = 0, translateY = 0, scaleX = 1, scaleY = 1,
            originX = 0, originY = 0, rotation = 0 } = transform;
    const segments = d.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g);
    if (!segments) return d;
    const numRe = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
    let result = '';
    for (const seg of segments) {
        const cmd = seg[0];
        const nums = seg.slice(1).match(numRe);
        if (!nums || cmd === 'Z' || cmd === 'z') { result += seg; continue; }
        const values = nums.map(Number);
        const transformed = [];
        if ('MLTSQC'.includes(cmd)) {
            for (let i = 0; i < values.length; i += 2) {
                if (i + 1 < values.length) {
                    let [x, y] = applyTransformToPoint(values[i], values[i+1], transform);
                    transformed.push(x, y);
                } else { transformed.push(values[i]); }
            }
        } else if (cmd === 'H') {
            for (const v of values) {
                let [x] = applyTransformToPoint(v, originY, transform);
                transformed.push(x);
            }
        } else if (cmd === 'V') {
            for (const v of values) {
                let [, y] = applyTransformToPoint(originX, v, transform);
                transformed.push(y);
            }
        } else if (cmd === 'A') {
            for (let i = 0; i < values.length; i += 7) {
                transformed.push(values[i] * Math.abs(scaleX));
                transformed.push(values[i+1] * Math.abs(scaleY));
                transformed.push(values[i+2] + (rotation || 0));
                transformed.push(values[i+3]);
                transformed.push(values[i+4]);
                let [x, y] = applyTransformToPoint(values[i+5], values[i+6], transform);
                transformed.push(x, y);
            }
        } else if (cmd === 'h') {
            for (const v of values) transformed.push(v * scaleX);
        } else if (cmd === 'v') {
            for (const v of values) transformed.push(v * scaleY);
        } else {
            for (let i = 0; i < values.length; i += 2) {
                if (i + 1 < values.length) {
                    transformed.push(values[i] * scaleX, values[i+1] * scaleY);
                } else { transformed.push(values[i]); }
            }
        }
        result += cmd + ' ' + transformed.map(n => Math.round(n * 100) / 100).join(' ') + ' ';
    }
    return result.trim();
}

function applyTransformToPoint(x, y, transform) {
    const { translateX = 0, translateY = 0, scaleX = 1, scaleY = 1,
            originX = 0, originY = 0, rotation = 0 } = transform;
    let px = x - originX;
    let py = y - originY;
    px *= scaleX;
    py *= scaleY;
    if (rotation !== 0) {
        const rad = rotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const rx = px * cos - py * sin;
        const ry = px * sin + py * cos;
        px = rx; py = ry;
    }
    px += originX + translateX;
    py += originY + translateY;
    return [px, py];
}

function handleSelectPointerDown(e) {
    if (state.isPlaying) return;
    const point = getSvgPoint(e);
    const frame = getSelectionFrame();
    if (!frame) return;
    const sel = state.selection;
    const target = e.target;
    const action = target.getAttribute('data-action');

    if (action === 'anchor') {
        sel.isDraggingAnchor = true;
        sel.dragStart = point;
        return;
    }
    if (action === 'rotate') {
        sel.isRotating = true;
        sel.dragStart = point;
        sel.originalPaths = JSON.parse(JSON.stringify(sel.indices.map(i => frame.paths[i])));
        // Snapshot anchor as fixed pivot for this entire rotation drag
        const pivot = getSelectionAnchor();
        sel.rotateAnchor = { x: pivot.x, y: pivot.y };
        sel.rotateStart = Math.atan2(
            point.y - pivot.y,
            point.x - pivot.x
        );
        saveStateForUndo();
        return;
    }
    if (action === 'resize') {
        sel.isResizing = true;
        sel.resizeHandle = target.getAttribute('data-handle');
        sel.dragStart = point;
        sel.resizeOrigin = { ...sel.bbox };
        sel.originalPaths = JSON.parse(JSON.stringify(sel.indices.map(i => frame.paths[i])));
        saveStateForUndo();
        return;
    }
    if (action === 'move') {
        sel.isDragging = true;
        sel.dragStart = point;
        sel.originalPaths = JSON.parse(JSON.stringify(sel.indices.map(i => frame.paths[i])));
        if (sel.anchorLocked && sel.anchor) {
            sel._anchorAtDragStart = { x: sel.anchor.x, y: sel.anchor.y };
        }
        saveStateForUndo();
        return;
    }

    const hitIndex = findPathAtPoint(frame, point);
    if (hitIndex >= 0) {
        const shiftHeld = e.shiftKey || state.shiftPressed;
        if (shiftHeld) {
            const existingIdx = sel.indices.indexOf(hitIndex);
            if (existingIdx >= 0) { sel.indices.splice(existingIdx, 1); }
            else { sel.indices.push(hitIndex); }
        } else {
            if (sel.indices.includes(hitIndex)) {
                sel.isDragging = true;
                sel.dragStart = point;
                sel.originalPaths = JSON.parse(JSON.stringify(sel.indices.map(i => frame.paths[i])));
                if (sel.anchorLocked && sel.anchor) {
                    sel._anchorAtDragStart = { x: sel.anchor.x, y: sel.anchor.y };
                }
                saveStateForUndo();
                drawSelectionOverlay();
                return;
            }
            sel.indices = [hitIndex];
            // Reset anchor for new selection
            sel.anchor = null;
            sel.anchorLocked = false;
        }
        drawSelectionOverlay();
    } else {
        if (!e.shiftKey && !state.shiftPressed) { sel.indices = []; }
        sel.isMarquee = true;
        sel.marqueeStart = point;
        sel.dragStart = point;
        drawSelectionOverlay();
    }
}

function handleSelectPointerMove(e) {
    const point = getSvgPoint(e);
    const frame = getSelectionFrame();
    const sel = state.selection;

    if (sel.isMarquee) {
        sel.dragStart = point;
        drawSelectionOverlay();
        return;
    }
    if (!frame) return;

    if (sel.isDragging && sel.dragStart && sel.originalPaths) {
        const dx = point.x - sel.dragStart.x;
        const dy = point.y - sel.dragStart.y;
        for (let i = 0; i < sel.indices.length; i++) {
            const idx = sel.indices[i];
            const original = sel.originalPaths[i];
            frame.paths[idx].d = transformPathD(original.d, { translateX: dx, translateY: dy });
        }
        // Move anchor along with selection
        if (sel.anchorLocked && sel._anchorAtDragStart) {
            sel.anchor = {
                x: sel._anchorAtDragStart.x + dx,
                y: sel._anchorAtDragStart.y + dy
            };
        }
        renderFrame();
        drawSelectionOverlay();
        return;
    }

    if (sel.isResizing && sel.dragStart && sel.originalPaths && sel.resizeOrigin) {
        const handle = sel.resizeHandle;
        const orig = sel.resizeOrigin;
        const dx = point.x - sel.dragStart.x;
        const dy = point.y - sel.dragStart.y;
        let scaleX = 1, scaleY = 1;
        let originX = orig.x, originY = orig.y;
        if (handle.includes('e')) { scaleX = (orig.width + dx) / orig.width; originX = orig.x; }
        if (handle.includes('w')) { scaleX = (orig.width - dx) / orig.width; originX = orig.x + orig.width; }
        if (handle.includes('s')) { scaleY = (orig.height + dy) / orig.height; originY = orig.y; }
        if (handle.includes('n')) { scaleY = (orig.height - dy) / orig.height; originY = orig.y + orig.height; }
        if (('nw ne sw se'.includes(handle)) && (e.shiftKey || state.shiftPressed)) {
            const us = Math.max(Math.abs(scaleX), Math.abs(scaleY));
            scaleX = scaleX < 0 ? -us : us;
            scaleY = scaleY < 0 ? -us : us;
        }
        if (handle === 'n' || handle === 's') scaleX = 1;
        if (handle === 'e' || handle === 'w') scaleY = 1;
        if (Math.abs(scaleX) < 0.01) scaleX = 0.01;
        if (Math.abs(scaleY) < 0.01) scaleY = 0.01;
        for (let i = 0; i < sel.indices.length; i++) {
            const idx = sel.indices[i];
            const original = sel.originalPaths[i];
            frame.paths[idx].d = transformPathD(original.d, { scaleX, scaleY, originX, originY });
            if (original.strokeWidth && !('n s e w'.split(' ').includes(handle))) {
                const avgScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
                frame.paths[idx].strokeWidth = parseFloat(original.strokeWidth) * avgScale;
            }
        }
        renderFrame();
        drawSelectionOverlay();
        return;
    }

    if (sel.isDraggingAnchor) {
        sel.anchor = { x: point.x, y: point.y };
        sel.anchorLocked = true;
        drawSelectionOverlay();
        return;
    }

    if (sel.isRotating && sel.dragStart && sel.originalPaths && sel.rotateAnchor) {
        // Use the FIXED pivot snapshot, not the live bbox center
        const cx = sel.rotateAnchor.x;
        const cy = sel.rotateAnchor.y;
        const angle = Math.atan2(point.y - cy, point.x - cx);
        let delta = (angle - sel.rotateStart) * 180 / Math.PI;
        if (e.shiftKey || state.shiftPressed) delta = Math.round(delta / 15) * 15;
        for (let i = 0; i < sel.indices.length; i++) {
            const idx = sel.indices[i];
            const original = sel.originalPaths[i];
            frame.paths[idx].d = transformPathD(original.d, { rotation: delta, originX: cx, originY: cy });
        }
        renderFrame();
        drawSelectionOverlay();
        return;
    }
}

function handleSelectPointerUp(e) {
    const sel = state.selection;
    if (sel.isMarquee && sel.marqueeStart) {
        const frame = getSelectionFrame();
        if (frame && sel.dragStart) {
            const mx1 = Math.min(sel.marqueeStart.x, sel.dragStart.x);
            const my1 = Math.min(sel.marqueeStart.y, sel.dragStart.y);
            const mx2 = Math.max(sel.marqueeStart.x, sel.dragStart.x);
            const my2 = Math.max(sel.marqueeStart.y, sel.dragStart.y);
            if (mx2 - mx1 > 3 || my2 - my1 > 3) {
                for (let i = 0; i < frame.paths.length; i++) {
                    const pathData = frame.paths[i];
                    if (!pathData.d) continue;
                    const bbox = getPathBBox(pathData.d);
                    if (bbox.x + bbox.width >= mx1 && bbox.x <= mx2 &&
                        bbox.y + bbox.height >= my1 && bbox.y <= my2) {
                        if (!sel.indices.includes(i)) sel.indices.push(i);
                    }
                }
            }
        }
    }
    sel.isMarquee = false;
    sel.marqueeStart = null;
    sel.isDragging = false;
    sel.isDraggingAnchor = false;
    sel.isResizing = false;
    sel.isRotating = false;
    sel.dragStart = null;
    sel.resizeHandle = null;
    sel.resizeOrigin = null;
    sel.rotateAnchor = null;
    sel.rotateStart = null;
    sel.originalPaths = null;
    sel._anchorAtDragStart = null;
    if (sel.indices.length > 0) saveToLocalStorage();
    drawSelectionOverlay();
}

function deleteSelectedPaths() {
    const frame = getSelectionFrame();
    if (!frame || state.selection.indices.length === 0) return;
    saveStateForUndo();
    const sorted = [...state.selection.indices].sort((a, b) => b - a);
    for (const idx of sorted) {
        if (idx < frame.paths.length) frame.paths.splice(idx, 1);
    }
    clearSelection();
    state.redoStack = [];
    renderFrame();
    updateFrameList();
    saveToLocalStorage();
}

function selectAllPaths() {
    if (state.tool !== 'select') return;
    const frame = getSelectionFrame();
    if (!frame) return;
    state.selection.indices = frame.paths.map((_, i) => i);
    drawSelectionOverlay();
}

// Override frame/layer selection to clear selection state
const _origSelectFrame = selectFrame;
selectFrame = function(index) {
    if (state.tool === 'select') clearSelection();
    _origSelectFrame(index);
};

const _origSelectLayer = selectLayer;
selectLayer = function(layerId) {
    if (state.tool === 'select') clearSelection();
    _origSelectLayer(layerId);
};


// ==================== SHORTCUTS PANEL ====================
function toggleShortcutsPanel() {
    const panel = document.getElementById('shortcutsPanel');
    if (panel.style.display === 'none') {
        panel.style.display = 'flex';
    } else {
        closeShortcutsPanel();
    }
}

function closeShortcutsPanel() {
    document.getElementById('shortcutsPanel').style.display = 'none';
}

// ==================== START APPLICATION ====================
init();

// Debug helpers
window.clearAnimationData = function() {
    localStorage.removeItem('vectorAnimationToolData');
    console.log('Animation data cleared. Refresh the page.');
};

window.debugState = function() {
    console.log('Current state:', state);
    console.log('Layers:', state.layers);
    console.log('Current layer:', state.layers.find(l => l.id === state.currentLayerId));
};
