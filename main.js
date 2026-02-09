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
    tool: 'pen',
    strokeSize: 2,
    strokeColor: '#000000',
    backgroundColor: '#ffffff', // Global background color
    onionSkinEnabled: true,
    isPlaying: false,
    playInterval: null,
    fps: 12,
    undoStack: [],
    redoStack: []
};

// ==================== INITIALIZATION ====================
function init() {
    setupEventListeners();
    setupKeyboardShortcuts();
    loadFromLocalStorage();
    syncBackgroundUI(); // Sync UI with loaded state
    updateBackground(); // Set initial background
    renderFrame();
    updateLayerList();
    updateFrameList();
    updateFrameCounter();
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

    // Stroke size buttons
    document.querySelectorAll('.size-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
            e.target.closest('.size-btn').classList.add('active');
            state.strokeSize = parseInt(e.target.closest('.size-btn').dataset.size);
        });
    });

    // Color picker
    document.getElementById('colorPicker').addEventListener('change', (e) => {
        state.strokeColor = e.target.value;
    });

    // Onion skin toggle
    const onionToggle = document.getElementById('onionSkinToggle');
    onionToggle.addEventListener('click', () => {
        state.onionSkinEnabled = !state.onionSkinEnabled;
        onionToggle.classList.toggle('active', state.onionSkinEnabled);
        renderFrame();
    });
    if (state.onionSkinEnabled) {
        onionToggle.classList.add('active');
    }

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
    document.getElementById('deleteLayerBtn').addEventListener('click', deleteLayer);

    // Clear frame
    document.getElementById('clearFrameBtn').addEventListener('click', clearCurrentFrame);

    // Frame controls
    document.getElementById('addFrameBtn').addEventListener('click', addFrame);
    document.getElementById('duplicateFrameBtn').addEventListener('click', duplicateFrame);
    document.getElementById('deleteFrameBtn').addEventListener('click', deleteFrame);

    // Playback controls - use both click and pointerup for reliability
    const playBtn = document.getElementById('playBtn');
    const stopBtn = document.getElementById('stopBtn');
    
    // Ensure buttons work on all devices by handling both click and pointer events
    playBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent event from bubbling
        togglePlayback();
    });
    
    playBtn.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); // Prevent canvas from capturing
    });
    
    stopBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        stopPlayback();
    });
    
    stopBtn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
    });
    
    document.getElementById('fpsInput').addEventListener('change', (e) => {
        state.fps = parseInt(e.target.value) || 12;
        if (state.isPlaying) {
            stopPlayback();
            togglePlayback();
        }
    });

    // Undo/Redo
    document.getElementById('undoBtn').addEventListener('click', undo);
    document.getElementById('redoBtn').addEventListener('click', redo);

    // Export/Import
    document.getElementById('exportGifBtn').addEventListener('click', exportAsGIF);
    document.getElementById('exportJsonBtn').addEventListener('click', exportProject);
    document.getElementById('importJsonBtn').addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });
    document.getElementById('fileInput').addEventListener('change', importProject);

    // Auto-save every 10 seconds
    setInterval(saveToLocalStorage, 10000);
}

// ==================== KEYBOARD SHORTCUTS ====================
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', handleKeyboardShortcut);
}

function handleKeyboardShortcut(e) {
    // Don't trigger shortcuts when typing in input fields
    const activeElement = document.activeElement;
    if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
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
        frames: [{ paths: [] }] // Start with one empty frame
    };
    
    state.layers.push(newLayer);
    state.currentLayerId = newLayer.id;
    
    updateLayerList();
    updateFrameList();
    renderFrame();
    saveToLocalStorage();
}

function deleteLayer() {
    if (state.layers.length === 1) {
        alert('Cannot delete the only layer!');
        return;
    }
    
    if (confirm('Delete this layer and all its frames?')) {
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

function updateLayerList() {
    const layerList = document.getElementById('layerList');
    layerList.innerHTML = '';
    
    // Render layers in reverse order (top layer first in UI)
    [...state.layers].reverse().forEach(layer => {
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
        
        // Layer name with frame count
        const nameSpan = document.createElement('span');
        nameSpan.className = 'layer-name';
        nameSpan.textContent = `${layer.name} (${layer.frames.length})`;
        
        layerItem.appendChild(checkbox);
        layerItem.appendChild(nameSpan);
        
        layerItem.addEventListener('click', () => selectLayer(layer.id));
        layerList.appendChild(layerItem);
    });
}

function updateMaxFrames() {
    state.maxFrames = Math.max(...state.layers.map(l => l.frames.length), 1);
}

// ==================== DRAWING FUNCTIONS ====================
function startDrawing(e) {
    // Prevent default touch behaviors (scrolling, zooming, etc.)
    e.preventDefault();
    
    if (state.isPlaying) return;
    
    const currentLayer = state.layers.find(l => l.id === state.currentLayerId);
    if (!currentLayer || !currentLayer.visible) return;
    
    // Make sure current layer has a frame at current index
    if (!currentLayer.frames[state.currentFrameIndex]) {
        // Extend layer's frames to current index
        while (currentLayer.frames.length <= state.currentFrameIndex) {
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
    
    // Create new path element
    state.currentPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    state.currentPath.setAttribute('fill', 'none');
    state.currentPath.setAttribute('stroke', state.strokeColor);
    
    // Support pressure-sensitive input (Apple Pencil, etc.)
    const pressure = e.pressure || 0.5; // Default to 0.5 if no pressure data
    const strokeWidth = state.strokeSize * (0.5 + pressure); // Scale by pressure
    
    state.currentPath.setAttribute('stroke-width', strokeWidth);
    state.currentPath.setAttribute('stroke-linecap', 'round');
    state.currentPath.setAttribute('stroke-linejoin', 'round');
    
    if (state.tool === 'eraser') {
        state.currentPath.setAttribute('stroke', 'white');
        state.currentPath.setAttribute('stroke-width', state.strokeSize * 3);
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
    
    if (!state.isDrawing || !state.currentPath) return;
    
    const point = getSvgPoint(e);
    state.currentPoints.push(point);
    
    // Update path with smooth curve
    const pathData = pointsToPath(state.currentPoints);
    state.currentPath.setAttribute('d', pathData);
}

function stopDrawing(e) {
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
        
        if (currentLayer && currentLayer.frames[state.currentFrameIndex]) {
            // Store the path data
            const pathData = {
                d: state.currentPath.getAttribute('d'),
                stroke: state.currentPath.getAttribute('stroke'),
                strokeWidth: state.currentPath.getAttribute('stroke-width'),
                tool: state.tool
            };
            
            currentLayer.frames[state.currentFrameIndex].paths.push(pathData);
            
            // Clear redo stack on new action
            state.redoStack = [];
            
            updateFrameList();
            saveToLocalStorage();
        }
    }
    
    state.currentPath = null;
    state.currentPoints = [];
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

// Convert points array to SVG path data with smoothing
function pointsToPath(points) {
    if (points.length < 2) {
        return `M ${points[0].x} ${points[0].y}`;
    }
    
    let path = `M ${points[0].x} ${points[0].y}`;
    
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const midX = (prev.x + curr.x) / 2;
        const midY = (prev.y + curr.y) / 2;
        
        if (i === 1) {
            path += ` L ${midX} ${midY}`;
        } else {
            path += ` Q ${prev.x} ${prev.y} ${midX} ${midY}`;
        }
    }
    
    const lastPoint = points[points.length - 1];
    path += ` L ${lastPoint.x} ${lastPoint.y}`;
    
    return path;
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
    
    // Draw onion skin (previous frame)
    if (state.onionSkinEnabled && state.currentFrameIndex > 0) {
        state.layers.forEach(layer => {
            if (layer.visible && layer.frames[state.currentFrameIndex - 1]) {
                layer.frames[state.currentFrameIndex - 1].paths.forEach(pathData => {
                    const path = createPathElement(pathData);
                    onionSkinLayer.appendChild(path);
                });
            }
        });
    }
    
    // Draw current frame - composite all layers at current frame index
    state.layers.forEach(layer => {
        const layerGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        layerGroup.setAttribute('id', `layer-${layer.id}-group`);
        
        if (!layer.visible) {
            layerGroup.setAttribute('opacity', '0');
        }
        
        // Draw frame at current index if it exists
        if (layer.frames[state.currentFrameIndex]) {
            console.log(`Layer ${layer.id} at frame ${state.currentFrameIndex}: ${layer.frames[state.currentFrameIndex].paths.length} paths`);
            layer.frames[state.currentFrameIndex].paths.forEach(pathData => {
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
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', pathData.stroke);
    path.setAttribute('stroke-width', pathData.strokeWidth);
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    return path;
}

// ==================== TOOL SELECTION ====================
function selectTool(tool) {
    state.tool = tool;
    
    // Update UI
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    if (tool === 'pen') {
        document.getElementById('penTool').classList.add('active');
    } else if (tool === 'eraser') {
        document.getElementById('eraserTool').classList.add('active');
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
    
    // Add frame to current layer only
    currentLayer.frames.push({ paths: [] });
    
    // Update max frames and move to new frame
    updateMaxFrames();
    state.currentFrameIndex = currentLayer.frames.length - 1;
    
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

function deleteFrame() {
    const currentLayer = state.layers.find(l => l.id === state.currentLayerId);
    
    if (!currentLayer || currentLayer.frames.length === 1) {
        alert('Cannot delete the only frame on this layer!');
        return;
    }
    
    if (!currentLayer.frames[state.currentFrameIndex]) {
        alert('No frame at this position on current layer!');
        return;
    }
    
    if (confirm('Delete this frame from current layer?')) {
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
        
        // Create thumbnail SVG
        const thumbSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        thumbSvg.setAttribute('width', '80');
        thumbSvg.setAttribute('height', '60');
        thumbSvg.setAttribute('viewBox', '0 0 800 600');
        thumbSvg.style.background = 'white';
        
        // Show composite of all visible layers at this frame
        state.layers.forEach(layer => {
            if (layer.visible && layer.frames[index]) {
                layer.frames[index].paths.forEach(pathData => {
                    const path = createPathElement(pathData);
                    thumbSvg.appendChild(path);
                });
            }
        });
        
        frameItem.appendChild(thumbSvg);
        
        // Add frame number
        const frameNumber = document.createElement('div');
        frameNumber.className = 'frame-number';
        frameNumber.textContent = index + 1;
        frameItem.appendChild(frameNumber);
        
        frameItem.addEventListener('click', () => selectFrame(index));
        frameList.appendChild(frameItem);
    });
}

function updateFrameCounter() {
    const currentLayer = state.layers.find(l => l.id === state.currentLayerId);
    const frameCount = currentLayer ? currentLayer.frames.length : 0;
    
    document.getElementById('frameCounter').textContent = 
        `Frame: ${state.currentFrameIndex + 1} / ${frameCount} (Layer: ${currentLayer ? currentLayer.name : 'None'})`;
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
    // Stop any existing playback first
    if (state.playInterval) {
        clearInterval(state.playInterval);
        state.playInterval = null;
    }
    
    // Update state immediately
    state.isPlaying = true;
    
    // Update UI
    const playBtn = document.getElementById('playBtn');
    if (playBtn) {
        const iconEl = playBtn.querySelector('.icon');
        const labelEl = playBtn.querySelector('.label');
        if (iconEl) iconEl.textContent = '⏸';
        if (labelEl) labelEl.textContent = 'Pause';
        playBtn.title = 'Pause';
    }
    
    const frameDelay = 1000 / state.fps;
    
    state.playInterval = setInterval(() => {
        // Double-check we're still supposed to be playing
        if (!state.isPlaying) {
            clearInterval(state.playInterval);
            state.playInterval = null;
            return;
        }
        
        // Play through max frames across all layers
        state.currentFrameIndex = (state.currentFrameIndex + 1) % state.maxFrames;
        
        renderFrame();
        updateFrameList();
        updateFrameCounter();
    }, frameDelay);
}

function stopPlayback() {
    // Update state immediately - this is critical for button responsiveness
    state.isPlaying = false;
    
    // Clear interval if it exists
    if (state.playInterval) {
        clearInterval(state.playInterval);
        state.playInterval = null;
    }
    
    // Update UI
    const playBtn = document.getElementById('playBtn');
    if (playBtn) {
        const iconEl = playBtn.querySelector('.icon');
        const labelEl = playBtn.querySelector('.label');
        if (iconEl) iconEl.textContent = '▶';
        if (labelEl) labelEl.textContent = 'Play';
        playBtn.title = 'Play';
    }
    
    // Force a final render to ensure UI is in sync
    renderFrame();
    updateFrameList();
    updateFrameCounter();
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
            version: '4.1' // Updated version with background color
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
            if ((data.version === '4.0' || data.version === '4.1') && data.layers && data.layers[0] && data.layers[0].frames) {
                state.layers = data.layers;
                state.currentLayerId = data.currentLayerId || state.layers[0].id;
                state.currentFrameIndex = data.currentFrameIndex || 0;
                state.maxFrames = data.maxFrames || 1;
                state.layerIdCounter = data.layerIdCounter || 1;
                state.fps = data.fps || 12;
                state.backgroundColor = data.backgroundColor || '#ffffff';
            } else {
                // Old format - reset
                console.log('Old data format detected, resetting...');
                resetToDefault();
            }
            
            document.getElementById('fpsInput').value = state.fps;
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
                alert('Unsupported project format!');
                return;
            }
            
            document.getElementById('fpsInput').value = state.fps;
            syncBackgroundUI();
            
            updateBackground();
            renderFrame();
            updateLayerList();
            updateFrameList();
            updateFrameCounter();
            saveToLocalStorage();
            
            alert('Project imported successfully!');
        } catch (err) {
            alert('Failed to import project: ' + err.message);
        }
    };
    reader.readAsText(file);
    
    e.target.value = '';
}

// ==================== GIF EXPORT ====================
async function exportAsGIF() {
    // Check if gifshot is available
    if (typeof gifshot === 'undefined') {
        alert('GIF library not loaded. Please refresh the page and try again.');
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
        
        // Create temporary canvas for rendering
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 800;
        tempCanvas.height = 600;
        const tempCtx = tempCanvas.getContext('2d');
        
        const images = [];
        
        // Render each frame to base64 image
        for (let i = 0; i < state.maxFrames; i++) {
            loading.textContent = `Rendering frame ${i + 1}/${state.maxFrames}...`;
            console.log(`Rendering frame ${i + 1}/${state.maxFrames}`);
            
            // Allow UI to update
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Clear canvas
            tempCtx.clearRect(0, 0, 800, 600);
            
            // Draw background
            if (state.backgroundColor !== 'transparent') {
                tempCtx.fillStyle = state.backgroundColor;
                tempCtx.fillRect(0, 0, 800, 600);
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
            gifWidth: 800,
            gifHeight: 600,
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
                alert('Failed to encode GIF: ' + obj.error);
                if (document.body.contains(loading)) {
                    document.body.removeChild(loading);
                }
                exportBtn.disabled = false;
                exportBtn.textContent = originalText;
            }
        });
        
    } catch (err) {
        console.error('GIF export error:', err);
        alert('Failed to export GIF: ' + err.message);
        if (document.body.contains(loading)) {
            document.body.removeChild(loading);
        }
        exportBtn.disabled = false;
        exportBtn.textContent = originalText;
    }
}

// Render a specific frame index to a canvas context
async function renderFrameToCanvas(ctx, frameIndex) {
    // Iterate through layers in order
    for (const layer of state.layers) {
        if (!layer.visible || !layer.frames[frameIndex]) {
            continue;
        }
        
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
            alert('Failed to export: ' + err.message);
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
            svgContent += `    <!-- ${layer.name} -->\n`;
            svgContent += `    <g id="${layer.id}">\n`;
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
