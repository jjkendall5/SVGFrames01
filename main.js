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
    smoothing: 3, // Smoothing amount (0.5 = low, 3 = medium, 8 = high)
    taper: 0, // Taper amount (0-100, 0 = uniform stroke, 100 = maximum taper)
    backgroundColor: '#ffffff', // Global background color
    canvasWidth: 600, // Canvas width
    canvasHeight: 600, // Canvas height
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
    updateSmoothingLabel(); // Set initial smoothing label
    updateSizeValue(); // Set initial size value
    updateTaperValue(); // Set initial taper value
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
            // Reset selector to current size
            e.target.value = `${state.canvasWidth}x${state.canvasHeight}`;
        } else {
            // Preset size
            const [width, height] = value.split('x').map(Number);
            updateCanvasSize(width, height);
        }
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
    
    document.getElementById('fpsSelect').addEventListener('change', (e) => {
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
        
        // Layer name
        const nameSpan = document.createElement('span');
        nameSpan.className = 'layer-name';
        nameSpan.textContent = layer.name;
        
        // Frame count (compact)
        const frameCount = document.createElement('span');
        frameCount.className = 'layer-frame-count';
        frameCount.textContent = layer.frames.length;
        
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
        
        layerItem.appendChild(checkbox);
        layerItem.appendChild(nameSpan);
        layerItem.appendChild(frameCount);
        layerItem.appendChild(deleteBtn);
        
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
    
    // Dual-mode brush: tapered (filled) vs uniform (stroked)
    if (state.taper > 0 && state.tool === 'pen') {
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
    
    // Apply smoothing for pen tool only (not eraser)
    if (state.tool === 'pen') {
        // Distance-based point filtering
        if (state.currentPoints.length > 0) {
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
        
        // Add the point
        state.currentPoints.push(point);
        
        // Apply averaging for additional smoothing
        const smoothedPoints = applyPointAveraging(state.currentPoints, state.smoothing);
        
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
    
    // Higher smoothing = more averaging
    // Convert smoothing value to window size (1-3 points)
    const windowSize = Math.min(3, Math.max(1, Math.floor(smoothing / 3)));
    
    if (windowSize < 2) {
        return points; // No averaging needed
    }
    
    const smoothed = [];
    
    // Keep first point as-is
    smoothed.push(points[0]);
    
    // Average middle points
    for (let i = 1; i < points.length - 1; i++) {
        let sumX = 0, sumY = 0, count = 0;
        
        // Average with neighbors based on window size
        const start = Math.max(0, i - windowSize);
        const end = Math.min(points.length - 1, i + windowSize);
        
        for (let j = start; j <= end; j++) {
            sumX += points[j].x;
            sumY += points[j].y;
            count++;
        }
        
        smoothed.push({
            x: sumX / count,
            y: sumY / count
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
            // Store the path data (with fill for tapered strokes)
            const pathData = {
                d: state.currentPath.getAttribute('d'),
                stroke: state.currentPath.getAttribute('stroke'),
                strokeWidth: state.currentPath.getAttribute('stroke-width'),
                fill: state.currentPath.getAttribute('fill'), // NEW: Store fill for tapered strokes
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
    
    // Re-render current frame
    renderFrame();
    
    // Save to localStorage
    saveToLocalStorage();
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
    // Stop any existing playback first
    if (state.playInterval) {
        clearInterval(state.playInterval);
        state.playInterval = null;
    }
    
    // Update state immediately
    state.isPlaying = true;
    
    // Update UI - icon only
    const playBtn = document.getElementById('playBtn');
    if (playBtn) {
        const iconEl = playBtn.querySelector('.icon');
        if (iconEl) iconEl.textContent = '⏸';
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
    
    // Update UI - icon only
    const playBtn = document.getElementById('playBtn');
    if (playBtn) {
        const iconEl = playBtn.querySelector('.icon');
        if (iconEl) iconEl.textContent = '▶';
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
