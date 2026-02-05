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
    loadFromLocalStorage();
    renderFrame();
    updateLayerList();
    updateFrameList();
    updateFrameCounter();
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    // SVG drawing events
    svg.addEventListener('mousedown', startDrawing);
    svg.addEventListener('mousemove', draw);
    svg.addEventListener('mouseup', stopDrawing);
    svg.addEventListener('mouseleave', stopDrawing);

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

    // Layer controls
    document.getElementById('addLayerBtn').addEventListener('click', addLayer);
    document.getElementById('deleteLayerBtn').addEventListener('click', deleteLayer);

    // Clear frame
    document.getElementById('clearFrameBtn').addEventListener('click', clearCurrentFrame);

    // Frame controls
    document.getElementById('addFrameBtn').addEventListener('click', addFrame);
    document.getElementById('duplicateFrameBtn').addEventListener('click', duplicateFrame);
    document.getElementById('deleteFrameBtn').addEventListener('click', deleteFrame);

    // Playback controls
    document.getElementById('playBtn').addEventListener('click', togglePlayback);
    document.getElementById('stopBtn').addEventListener('click', stopPlayback);
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
    document.getElementById('exportGifBtn').addEventListener('click', exportAsSVGSequence);
    document.getElementById('exportJsonBtn').addEventListener('click', exportProject);
    document.getElementById('importJsonBtn').addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });
    document.getElementById('fileInput').addEventListener('change', importProject);

    // Auto-save every 10 seconds
    setInterval(saveToLocalStorage, 10000);
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
    state.currentPath.setAttribute('stroke-width', state.strokeSize);
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
    if (!state.isDrawing || !state.currentPath) return;
    
    const point = getSvgPoint(e);
    state.currentPoints.push(point);
    
    // Update path with smooth curve
    const pathData = pointsToPath(state.currentPoints);
    state.currentPath.setAttribute('d', pathData);
}

function stopDrawing() {
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
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
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
    state.isPlaying = true;
    const playBtn = document.getElementById('playBtn');
    playBtn.querySelector('.btn-icon').textContent = '⏸';
    playBtn.querySelector('.btn-label').textContent = 'Pause';
    
    const frameDelay = 1000 / state.fps;
    
    state.playInterval = setInterval(() => {
        // Play through max frames across all layers
        state.currentFrameIndex = (state.currentFrameIndex + 1) % state.maxFrames;
        
        renderFrame();
        updateFrameList();
        updateFrameCounter();
    }, frameDelay);
}

function stopPlayback() {
    state.isPlaying = false;
    const playBtn = document.getElementById('playBtn');
    playBtn.querySelector('.btn-icon').textContent = '▶';
    playBtn.querySelector('.btn-label').textContent = 'Play';
    
    if (state.playInterval) {
        clearInterval(state.playInterval);
        state.playInterval = null;
    }
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
            version: '4.0' // New version with layer-centric model
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
            
            // Check if data has new layer-centric structure
            if (data.version === '4.0' && data.layers && data.layers[0] && data.layers[0].frames) {
                state.layers = data.layers;
                state.currentLayerId = data.currentLayerId || state.layers[0].id;
                state.currentFrameIndex = data.currentFrameIndex || 0;
                state.maxFrames = data.maxFrames || 1;
                state.layerIdCounter = data.layerIdCounter || 1;
                state.fps = data.fps || 12;
            } else {
                // Old format - reset
                console.log('Old data format detected, resetting...');
                resetToDefault();
            }
            
            document.getElementById('fpsInput').value = state.fps;
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
        version: '4.0',
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
            
            if (projectData.version === '4.0' && projectData.layers) {
                state.layers = projectData.layers;
                state.fps = projectData.fps || 12;
                state.currentFrameIndex = 0;
                state.currentLayerId = state.layers[0].id;
                updateMaxFrames();
            } else {
                alert('Unsupported project format!');
                return;
            }
            
            document.getElementById('fpsInput').value = state.fps;
            
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
    let svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg" version="1.1">
    <rect width="100%" height="100%" fill="white"/>
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
