class SVGVectorEditor {
    constructor() {
        this.svg = document.getElementById('svgCanvas');
        this.overlay = document.getElementById('canvasOverlay');
        this.currentTool = 'select';
        this.isDrawing = false;
        this.selectedElement = null;
        this.elements = [];
        this.currentPath = null;
        this.pathPoints = [];
        this.pathSegments = []; // New: stores path segments with anchor and control points
        this.drawingStartPoint = null;
        this.selectionBox = null;
        this.selectionHandles = [];
        this.anchorPoints = [];
        this.repeatPoints = []; // overlay elements for repeat points of selected element
        this.controlPoints = []; // New: stores control points for curves
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.selectedAnchorPoint = null;
        this.isDraggingAnchor = false;
        this.anchorDragOffset = { x: 0, y: 0 };
        this.isDraggingControl = false; // New: for dragging control points
        this.selectedControlPoint = null; // New: selected control point
        this.controlDragOffset = { x: 0, y: 0 }; // New: control point drag offset
        this.controlPreviewLines = []; // New: for curve preview lines
        this.controlHandles = []; // New: for control point handle lines
        
        // Zoom and pan properties
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.isPanning = false;
        this.panStartPoint = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupTools();
        this.setupProperties();
        this.setupLayers();
        this.updateStatus('Ready');
    }

    setupEventListeners() {
        // Canvas events
        this.svg.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.svg.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.svg.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.svg.addEventListener('click', this.handleClick.bind(this));
        // Mirror events on overlay so overlay elements (repeat points, selection) are interactive
        this.overlay.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.overlay.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.overlay.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.overlay.addEventListener('click', this.handleClick.bind(this));
        
        // Prevent context menu
        this.svg.addEventListener('contextmenu', e => e.preventDefault());
        
        // Keyboard events
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        
        // Header buttons
        document.getElementById('clearCanvas').addEventListener('click', this.clearCanvas.bind(this));
        document.getElementById('downloadSVG').addEventListener('click', this.downloadSVG.bind(this));
        
        // Zoom controls
        document.getElementById('zoomIn').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoomOut').addEventListener('click', () => this.zoomOut());
        document.getElementById('resetZoom').addEventListener('click', () => this.resetZoom());
        
        // Mouse wheel zoom
        this.svg.addEventListener('wheel', this.handleWheel.bind(this));
        
        // Coordinate display
        this.svg.addEventListener('mousemove', (e) => {
            const pos = this.getMousePosition(e);
            document.getElementById('coordinates').textContent = `X: ${Math.round(pos.x)}, Y: ${Math.round(pos.y)}`;
        });

        // Repeat points controls
        const createRepeatBtn = document.getElementById('createRepeatPoints');
        const repeatCountInput = document.getElementById('repeatCount');
        if (createRepeatBtn && repeatCountInput) {
            createRepeatBtn.addEventListener('click', () => this.handleCreateRepeatPoints());
            repeatCountInput.addEventListener('change', () => {
                if (this.selectedElement && this.getRepeatMeta(this.selectedElement)) {
                    this.createOrUpdateRepeatPoints(this.selectedElement, parseInt(repeatCountInput.value, 10));
                    this.renderRepeatPoints(this.selectedElement);
                }
            });
            // Prevent backspace from triggering delete operation
            repeatCountInput.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' || e.key === 'Delete') {
                    e.stopPropagation();
                }
            });
        }
    }

    setupTools() {
        const toolButtons = document.querySelectorAll('.tool-btn');
        toolButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.setTool(btn.dataset.tool);
                toolButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    setupProperties() {
        // Stroke width
        const strokeWidthInput = document.getElementById('strokeWidth');
        const strokeWidthValue = document.getElementById('strokeWidthValue');
        strokeWidthInput.addEventListener('input', (e) => {
            strokeWidthValue.textContent = e.target.value;
            this.updateSelectedElementProperty('stroke-width', e.target.value);
        });

        // Opacity
        const opacityInput = document.getElementById('opacity');
        const opacityValue = document.getElementById('opacityValue');
        opacityInput.addEventListener('input', (e) => {
            opacityValue.textContent = e.target.value + '%';
            this.updateSelectedElementProperty('opacity', e.target.value / 100);
        });

        // Colors
        document.getElementById('strokeColor').addEventListener('change', (e) => {
            this.updateSelectedElementProperty('stroke', e.target.value);
        });

        document.getElementById('fillColor').addEventListener('change', (e) => {
            this.updateSelectedElementProperty('fill', e.target.value);
        });

        // No color buttons
        document.getElementById('noStrokeColor').addEventListener('click', () => {
            document.getElementById('strokeColor').value = '#ffffff';
            this.updateSelectedElementProperty('stroke', '#ffffff');
        });

        document.getElementById('noFillColor').addEventListener('click', () => {
            document.getElementById('fillColor').value = '#ffffff';
            this.updateSelectedElementProperty('fill', '#ffffff');
        });
    }

    setupLayers() {
        this.updateLayersList();
    }

    setTool(tool) {
        // Auto-finalize any current path before switching tools
        if (this.currentTool === 'path' && this.currentPath) {
            console.log('Auto-finalizing path due to tool switch');
            this.finishPath();
        }
        
        this.currentTool = tool;
        this.clearSelection();
        this.updateStatus(`${tool.charAt(0).toUpperCase() + tool.slice(1)} Tool Active`);
        
        // Update cursor
        const cursors = {
            select: 'default',
            anchor: 'crosshair',
            hand: 'grab',
            line: 'crosshair',
            rectangle: 'crosshair',
            circle: 'crosshair',
            path: 'crosshair'
        };
        this.svg.style.cursor = cursors[tool] || 'default';
        
        // Show anchor points for all elements when anchor tool is active
        if (tool === 'anchor') {
            this.showAllAnchorPoints();
            this.overlay.style.pointerEvents = 'auto';
            // Add global mouse event listeners for anchor dragging
            this.addAnchorDragListeners();
        } else {
            this.hideAllAnchorPoints();
            this.overlay.style.pointerEvents = 'none';
            // Remove global mouse event listeners
            this.removeAnchorDragListeners();
        }
    }

    getMousePosition(event) {
        const rect = this.svg.getBoundingClientRect();
        const rawX = event.clientX - rect.left;
        const rawY = event.clientY - rect.top;
        
        // Transform coordinates to account for zoom and pan
        const transformedX = (rawX - this.panX) / this.zoom;
        const transformedY = (rawY - this.panY) / this.zoom;
        
        return {
            x: transformedX,
            y: transformedY
        };
    }

    handleMouseDown(event) {
        const pos = this.getMousePosition(event);
        this.drawingStartPoint = pos;
        this.isDrawing = true;

        // Handle dragging for selected elements
        if (this.currentTool === 'select' && this.selectedElement && 
            (event.target === this.selectedElement || event.target.classList.contains('selection-handle') || event.target.classList.contains('path-point'))) {
            this.startDragging(pos);
            return;
        }

        // Handle anchor point dragging
        if (this.currentTool === 'anchor' && this.selectedAnchorPoint && 
            (event.target.classList.contains('path-point') || this.isDraggingAnchor)) {
            if (!this.isDraggingAnchor) {
                this.startAnchorPointDragging(pos);
            }
            return;
        }

        // Handle control point dragging
        if (this.currentTool === 'anchor' && this.selectedControlPoint && 
            (event.target.classList.contains('control-point') || this.isDraggingControl)) {
            if (!this.isDraggingControl) {
                this.startControlPointDragging(pos);
            }
            return;
        }

        switch (this.currentTool) {
            case 'select':
                // Don't start selection if we clicked on an element
                if (event.target === this.svg) {
                    this.startSelection(pos);
                }
                break;
            case 'anchor':
                this.handleAnchorToolClick(event);
                break;
            case 'hand':
                this.startPanning(pos);
                break;
            case 'line':
                this.startDrawingLine(pos);
                break;
            case 'rectangle':
                this.startDrawingRectangle(pos);
                break;
            case 'circle':
                this.startDrawingCircle(pos);
                break;
            case 'path':
                console.log('Path tool triggered, starting path interaction at:', pos);
                this.startPathInteraction(pos);
                break;
        }
    }

    handleMouseMove(event) {
        const pos = this.getMousePosition(event);
        
        // Debug anchor point dragging
        if (this.isDraggingAnchor) {
            console.log('Mouse move during anchor drag:', { pos, selectedAnchor: this.selectedAnchorPoint });
        }
        
        // Handle dragging
        if (this.isDragging && this.selectedElement) {
            this.updateDragging(pos);
            return;
        }

        // Handle anchor point dragging
        if (this.isDraggingAnchor && this.selectedAnchorPoint) {
            console.log('Calling updateAnchorPointDragging');
            this.updateAnchorPointDragging(pos);
            return;
        }

        // Handle control point dragging
        if (this.isDraggingControl && this.selectedControlPoint) {
            this.updateControlPointDragging(pos);
            return;
        }

        // Handle panning
        if (this.isPanning) {
            this.updatePanning(pos);
            return;
        }
        
        if (!this.isDrawing) return;

        switch (this.currentTool) {
            case 'select':
                this.updateSelection(pos);
                break;
            case 'line':
                this.updateDrawingLine(pos);
                break;
            case 'rectangle':
                this.updateDrawingRectangle(pos);
                break;
            case 'circle':
                this.updateDrawingCircle(pos);
                break;
            case 'path':
                this.updatePathInteraction(pos);
                break;
        }
    }

    handleMouseUp(event) {
        const pos = this.getMousePosition(event);
        
        // Handle dragging
        if (this.isDragging) {
            this.finishDragging(pos);
            return;
        }

        // Handle anchor point dragging
        if (this.isDraggingAnchor) {
            this.finishAnchorPointDragging(pos);
            return;
        }

        // Handle control point dragging
        if (this.isDraggingControl) {
            this.finishControlPointDragging(pos);
            return;
        }

        // Handle panning
        if (this.isPanning) {
            this.finishPanning(pos);
            return;
        }
        
        if (!this.isDrawing) return;
        
        this.isDrawing = false;

        switch (this.currentTool) {
            case 'select':
                this.finishSelection(pos);
                break;
            case 'line':
                this.finishDrawingLine(pos);
                break;
            case 'rectangle':
                this.finishDrawingRectangle(pos);
                break;
            case 'circle':
                this.finishDrawingCircle(pos);
                break;
            case 'path':
                this.finishPathInteraction(pos);
                break;
        }
    }

    handleClick(event) {
        if (this.currentTool === 'select') {
            this.handleSelectClick(event);
        } else if (this.currentTool === 'path') {
            // Handle double-click to finish path
            if (event.detail === 2) {
                this.finishPath();
            }
        }
    }

    handleKeyDown(event) {
        if (event.key === 'Delete' || event.key === 'Backspace') {
            this.deleteSelectedElement();
        } else if (event.key === 'Escape') {
            this.cancelCurrentOperation();
        } else if (event.key === 'Enter' && this.currentTool === 'path') {
            this.finishPath();
        }
    }

    // Selection Tool
    startSelection(pos) {
        this.selectionBox = document.createElement('div');
        this.selectionBox.className = 'selection-box';
        this.selectionBox.style.left = pos.x + 'px';
        this.selectionBox.style.top = pos.y + 'px';
        this.overlay.appendChild(this.selectionBox);
    }

    updateSelection(pos) {
        if (!this.selectionBox || !this.drawingStartPoint) return;
        
        const start = this.drawingStartPoint;
        const left = Math.min(start.x, pos.x);
        const top = Math.min(start.y, pos.y);
        const width = Math.abs(pos.x - start.x);
        const height = Math.abs(pos.y - start.y);
        
        this.selectionBox.style.left = left + 'px';
        this.selectionBox.style.top = top + 'px';
        this.selectionBox.style.width = width + 'px';
        this.selectionBox.style.height = height + 'px';
    }

    finishSelection(pos) {
        if (this.selectionBox) {
            this.selectionBox.remove();
            this.selectionBox = null;
        }
    }

    handleSelectClick(event) {
        const target = event.target;
        // Ignore clicks on repeat point markers in SVG
        if (target && target.classList && target.classList.contains('repeat-point')) {
            // Selection handled via mousedown listener on the marker
            return;
        }
        if (target === this.svg) {
            this.clearSelection();
            return;
        }
        
        // Only select if it's a valid SVG element
        if (target.tagName && ['line', 'rect', 'circle', 'path'].includes(target.tagName.toLowerCase())) {
            this.selectElement(target);
        }
    }

    selectElement(element) {
        this.clearSelection();
        this.selectedElement = element;
        element.style.outline = '2px dashed #3498db';
        this.showSelectionHandles(element);
        this.showAnchorPoints(element);
        this.renderRepeatPoints(element);
        this.updatePropertiesPanel(element);
        console.log('Element selected:', element.tagName, element);
    }

    clearSelection() {
        if (this.selectedElement) {
            this.selectedElement.style.outline = '';
            this.selectedElement = null;
        }
        this.clearSelectionHandles();
        this.clearAnchorPoints();
        this.clearRepeatPoints();
        
        // Clear anchor point selection
        if (this.selectedAnchorPoint) {
            this.selectedAnchorPoint = null;
        }
    }

    showSelectionHandles(element) {
        const rect = element.getBoundingClientRect();
        const svgRect = this.svg.getBoundingClientRect();
        
        const handles = [
            { x: rect.left - svgRect.left, y: rect.top - svgRect.top, cursor: 'nw-resize' },
            { x: rect.right - svgRect.left, y: rect.top - svgRect.top, cursor: 'ne-resize' },
            { x: rect.right - svgRect.left, y: rect.bottom - svgRect.top, cursor: 'se-resize' },
            { x: rect.left - svgRect.left, y: rect.bottom - svgRect.top, cursor: 'sw-resize' }
        ];

        handles.forEach((handle, index) => {
            const handleElement = document.createElement('div');
            handleElement.className = 'selection-handle';
            handleElement.style.left = handle.x + 'px';
            handleElement.style.top = handle.y + 'px';
            handleElement.style.cursor = handle.cursor;
            handleElement.dataset.handleIndex = index;
            
            handleElement.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                this.startResize(index, e);
            });
            this.overlay.appendChild(handleElement);
            this.selectionHandles.push(handleElement);
        });
    }

    clearSelectionHandles() {
        this.selectionHandles.forEach(handle => handle.remove());
        this.selectionHandles = [];
    }

    clearAnchorPoints() {
        this.anchorPoints.forEach(point => point.remove());
        this.anchorPoints = [];
        
        this.controlPoints.forEach(point => point.remove());
        this.controlPoints = [];
        
        // Clear anchor point selection
        if (this.selectedAnchorPoint) {
            this.selectedAnchorPoint = null;
        }
        
        // Clear control point selection
        if (this.selectedControlPoint) {
            this.selectedControlPoint = null;
        }
    }

    // Repeat points overlay helpers
    clearRepeatPoints() {
        this.repeatPoints.forEach(p => p.remove());
        this.repeatPoints = [];
    }

    showAnchorPoints(element) {
        const tagName = element.tagName.toLowerCase();
        
        if (tagName === 'path') {
            this.showPathAnchorPoints(element);
        } else if (tagName === 'line') {
            this.showLineAnchorPoints(element);
        } else if (tagName === 'rect') {
            this.showRectAnchorPoints(element);
        } else if (tagName === 'circle') {
            this.showCircleAnchorPoints(element);
        }
    }

    showPathAnchorPoints(path) {
        const d = path.getAttribute('d');
        const commands = d.match(/[MLC]\s*([^MLC]+)/g) || [];
        
        let anchorIndex = 0;
        
        commands.forEach((cmd, index) => {
            if (cmd.startsWith('M') || cmd.startsWith('L')) {
                const match = cmd.match(/[ML]\s*([-\d.]+)\s+([-\d.]+)/);
                if (match) {
                    const x = parseFloat(match[1]);
                    const y = parseFloat(match[2]);
                    this.createAnchorPoint(x, y, anchorIndex, 'path');
                    anchorIndex++;
                }
            } else if (cmd.startsWith('C')) {
                const match = cmd.match(/C\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
                if (match) {
                    // Create anchor point for the end point of the curve
                    const x = parseFloat(match[5]);
                    const y = parseFloat(match[6]);
                    this.createAnchorPoint(x, y, anchorIndex, 'path');
                    anchorIndex++;
                }
            }
        });
    }

    showLineAnchorPoints(line) {
        const x1 = parseFloat(line.getAttribute('x1'));
        const y1 = parseFloat(line.getAttribute('y1'));
        const x2 = parseFloat(line.getAttribute('x2'));
        const y2 = parseFloat(line.getAttribute('y2'));
        
        this.createAnchorPoint(x1, y1, 0, 'line');
        this.createAnchorPoint(x2, y2, 1, 'line');
    }

    showRectAnchorPoints(rect) {
        const x = parseFloat(rect.getAttribute('x'));
        const y = parseFloat(rect.getAttribute('y'));
        const width = parseFloat(rect.getAttribute('width'));
        const height = parseFloat(rect.getAttribute('height'));
        
        // Corner points
        this.createAnchorPoint(x, y, 0, 'rect');
        this.createAnchorPoint(x + width, y, 1, 'rect');
        this.createAnchorPoint(x + width, y + height, 2, 'rect');
        this.createAnchorPoint(x, y + height, 3, 'rect');
    }

    showCircleAnchorPoints(circle) {
        const cx = parseFloat(circle.getAttribute('cx'));
        const cy = parseFloat(circle.getAttribute('cy'));
        const r = parseFloat(circle.getAttribute('r'));
        
        // Center point and radius point
        this.createAnchorPoint(cx, cy, 0, 'circle');
        this.createAnchorPoint(cx + r, cy, 1, 'circle');
    }

    createAnchorPoint(x, y, index, type) {
        const point = document.createElement('div');
        point.className = 'path-point';
        point.style.left = x + 'px';
        point.style.top = y + 'px';
        point.dataset.index = index;
        point.dataset.type = type;
        
        point.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.startAnchorPointDrag(point, x, y, index, type);
        });
        
        this.overlay.appendChild(point);
        this.anchorPoints.push(point);
    }

    // Anchor Tool Methods
    showAllAnchorPoints() {
        console.log('Showing anchor points for', this.elements.length, 'elements');
        this.elements.forEach((element, index) => {
            console.log(`Element ${index}:`, element.tagName, element);
            this.showAnchorPointsForElement(element);
        });
        console.log('Total anchor points created:', this.anchorPoints.length);
    }

    hideAllAnchorPoints() {
        this.clearAnchorPoints();
        this.clearSelection();
    }

    showAnchorPointsForElement(element) {
        const tagName = element.tagName.toLowerCase();
        
        switch (tagName) {
            case 'line':
                this.showLineAnchorPointsForEditing(element);
                break;
            case 'rect':
                this.showRectAnchorPointsForEditing(element);
                break;
            case 'circle':
                this.showCircleAnchorPointsForEditing(element);
                break;
            case 'path':
                this.showPathAnchorPointsForEditing(element);
                break;
        }
    }

    showLineAnchorPointsForEditing(line) {
        const x1 = parseFloat(line.getAttribute('x1'));
        const y1 = parseFloat(line.getAttribute('y1'));
        const x2 = parseFloat(line.getAttribute('x2'));
        const y2 = parseFloat(line.getAttribute('y2'));
        
        this.createSelectableAnchorPoint(x1, y1, 0, 'line', line);
        this.createSelectableAnchorPoint(x2, y2, 1, 'line', line);
    }

    showRectAnchorPointsForEditing(rect) {
        const x = parseFloat(rect.getAttribute('x'));
        const y = parseFloat(rect.getAttribute('y'));
        const width = parseFloat(rect.getAttribute('width'));
        const height = parseFloat(rect.getAttribute('height'));
        
        // Corner points
        this.createSelectableAnchorPoint(x, y, 0, 'rect', rect);
        this.createSelectableAnchorPoint(x + width, y, 1, 'rect', rect);
        this.createSelectableAnchorPoint(x + width, y + height, 2, 'rect', rect);
        this.createSelectableAnchorPoint(x, y + height, 3, 'rect', rect);
    }

    showCircleAnchorPointsForEditing(circle) {
        const cx = parseFloat(circle.getAttribute('cx'));
        const cy = parseFloat(circle.getAttribute('cy'));
        const r = parseFloat(circle.getAttribute('r'));
        
        // Center point and radius point
        this.createSelectableAnchorPoint(cx, cy, 0, 'circle', circle);
        this.createSelectableAnchorPoint(cx + r, cy, 1, 'circle', circle);
    }

    showPathAnchorPointsForEditing(path) {
        const d = path.getAttribute('d');
        console.log('Path data:', d);
        const commands = d.match(/[MLC]\s*([^MLC]+)/g) || [];
        console.log('Path commands:', commands);
        
        let anchorIndex = 0;
        let curveSegmentIndex = 0;
        
        commands.forEach((cmd, index) => {
            if (cmd.startsWith('M') || cmd.startsWith('L')) {
                const match = cmd.match(/[ML]\s*([-\d.]+)\s+([-\d.]+)/);
                if (match) {
                    const x = parseFloat(match[1]);
                    const y = parseFloat(match[2]);
                    console.log('Creating path anchor point:', { x, y, anchorIndex });
                    this.createSelectableAnchorPoint(x, y, anchorIndex, 'path', path);
                    anchorIndex++;
                }
            } else if (cmd.startsWith('C')) {
                const match = cmd.match(/C\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
                if (match) {
                    // Create anchor point for the end point of the curve
                    const endX = parseFloat(match[5]);
                    const endY = parseFloat(match[6]);
                    console.log('Creating curve end anchor point:', { x: endX, y: endY, anchorIndex });
                    this.createSelectableAnchorPoint(endX, endY, anchorIndex, 'path', path);
                    anchorIndex++;
                    
                    // Create control points
                    const control1X = parseFloat(match[1]);
                    const control1Y = parseFloat(match[2]);
                    const control2X = parseFloat(match[3]);
                    const control2Y = parseFloat(match[4]);
                    
                    console.log('Creating control points for curve segment:', curveSegmentIndex);
                    this.createSelectableControlPoint(control1X, control1Y, curveSegmentIndex, 1, path);
                    this.createSelectableControlPoint(control2X, control2Y, curveSegmentIndex, 2, path);
                    
                    curveSegmentIndex++;
                }
            }
        });
    }

    createSelectableAnchorPoint(x, y, index, type, element) {
        const point = document.createElement('div');
        point.className = 'path-point selectable';
        point.style.left = x + 'px';
        point.style.top = y + 'px';
        point.style.position = 'absolute';
        point.style.pointerEvents = 'auto';
        point.style.zIndex = '1000';
        point.dataset.index = index;
        point.dataset.type = type;
        point.dataset.elementId = this.elements.indexOf(element);
        
        point.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            console.log('Anchor point clicked:', { x, y, index, type });
            this.selectAnchorPoint(point, x, y, index, type, element);
            // Start dragging immediately when anchor point is clicked
            if (this.currentTool === 'anchor') {
                this.startAnchorPointDragging(this.getMousePosition(e));
            }
        });
        
        this.overlay.appendChild(point);
        this.anchorPoints.push(point);
        console.log('Created anchor point:', { x, y, index, type });
    }

    createSelectableControlPoint(x, y, segmentIndex, controlIndex, element) {
        const point = document.createElement('div');
        point.className = 'control-point selectable';
        point.style.left = x + 'px';
        point.style.top = y + 'px';
        point.style.position = 'absolute';
        point.style.pointerEvents = 'auto';
        point.style.zIndex = '1000';
        point.dataset.segmentIndex = segmentIndex;
        point.dataset.controlIndex = controlIndex;
        point.dataset.elementId = this.elements.indexOf(element);
        
        point.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            console.log('Control point clicked:', { x, y, segmentIndex, controlIndex });
            this.selectControlPoint(point, x, y, segmentIndex, controlIndex, element);
            // Start dragging immediately when control point is clicked
            if (this.currentTool === 'anchor') {
                this.startControlPointDragging(this.getMousePosition(e));
            }
        });
        
        this.overlay.appendChild(point);
        this.controlPoints.push(point);
        console.log('Created control point:', { x, y, segmentIndex, controlIndex });
    }

    selectAnchorPoint(point, x, y, index, type, element) {
        // Clear previous selection
        this.anchorPoints.forEach(p => p.classList.remove('selected'));
        this.controlPoints.forEach(p => p.classList.remove('selected'));
        
        // Get the current position of the anchor point element
        const currentX = parseFloat(point.style.left);
        const currentY = parseFloat(point.style.top);
        
        // Select this point
        point.classList.add('selected');
        this.selectedAnchorPoint = { point, x: currentX, y: currentY, index, type, element };
        this.selectedControlPoint = null;
        
        console.log('Anchor point selected:', { index, type, element: element.tagName, currentX, currentY });
    }

    selectControlPoint(point, x, y, segmentIndex, controlIndex, element) {
        // Clear previous selection
        this.anchorPoints.forEach(p => p.classList.remove('selected'));
        this.controlPoints.forEach(p => p.classList.remove('selected'));
        
        // Get the current position of the control point element
        const currentX = parseFloat(point.style.left);
        const currentY = parseFloat(point.style.top);
        
        // Select this point
        point.classList.add('selected');
        this.selectedControlPoint = { point, x: currentX, y: currentY, segmentIndex, controlIndex, element };
        this.selectedAnchorPoint = null;
        
        console.log('Control point selected:', { segmentIndex, controlIndex, element: element.tagName, currentX, currentY });
    }

    startAnchorPointDragging(pos) {
        this.isDraggingAnchor = true;
        
        const anchor = this.selectedAnchorPoint;
        this.anchorDragOffset = {
            x: pos.x - anchor.x,
            y: pos.y - anchor.y
        };
        
        console.log('Starting anchor point drag:', anchor);
    }

    updateAnchorPointDragging(pos) {
        if (!this.selectedAnchorPoint) {
            console.log('No selected anchor point');
            return;
        }
        
        const newX = pos.x - this.anchorDragOffset.x;
        const newY = pos.y - this.anchorDragOffset.y;
        
        console.log('Updating anchor point drag:', { pos, newX, newY, offset: this.anchorDragOffset });
        
        // Update the anchor point position
        this.selectedAnchorPoint.point.style.left = newX + 'px';
        this.selectedAnchorPoint.point.style.top = newY + 'px';
        this.selectedAnchorPoint.x = newX;
        this.selectedAnchorPoint.y = newY;
        
        // Update the element geometry
        this.updateElementGeometry(newX, newY);
        
        // Update all anchor points for this element to reflect the new geometry
        this.updateAnchorPointsForElement(this.selectedAnchorPoint.element);
    }

    finishAnchorPointDragging(pos) {
        this.isDraggingAnchor = false;
        this.anchorDragOffset = { x: 0, y: 0 };
        console.log('Finished anchor point drag');
    }

    updateElementGeometry(newX, newY) {
        const anchor = this.selectedAnchorPoint;
        const element = anchor.element;
        const index = anchor.index;
        const type = anchor.type;
        
        console.log('Updating element geometry:', { type, index, newX, newY, element: element.tagName });
        
        switch (type) {
            case 'line':
                this.updateLineGeometry(element, index, newX, newY);
                break;
            case 'rect':
                this.updateRectGeometry(element, index, newX, newY);
                break;
            case 'circle':
                this.updateCircleGeometry(element, index, newX, newY);
                break;
            case 'path':
                this.updatePathGeometry(element, index, newX, newY);
                break;
        }
    }

    updateLineGeometry(line, pointIndex, newX, newY) {
        console.log('Updating line geometry:', { pointIndex, newX, newY });
        if (pointIndex === 0) {
            line.setAttribute('x1', newX);
            line.setAttribute('y1', newY);
        } else {
            line.setAttribute('x2', newX);
            line.setAttribute('y2', newY);
        }
        console.log('Line updated:', { x1: line.getAttribute('x1'), y1: line.getAttribute('y1'), x2: line.getAttribute('x2'), y2: line.getAttribute('y2') });
    }

    updateRectGeometry(rect, pointIndex, newX, newY) {
        const x = parseFloat(rect.getAttribute('x'));
        const y = parseFloat(rect.getAttribute('y'));
        const width = parseFloat(rect.getAttribute('width'));
        const height = parseFloat(rect.getAttribute('height'));
        
        let newX1 = x, newY1 = y, newWidth = width, newHeight = height;
        
        switch (pointIndex) {
            case 0: // Top-left
                newWidth = width + (x - newX);
                newHeight = height + (y - newY);
                newX1 = newX;
                newY1 = newY;
                break;
            case 1: // Top-right
                newWidth = newX - x;
                newHeight = height + (y - newY);
                newY1 = newY;
                break;
            case 2: // Bottom-right
                newWidth = newX - x;
                newHeight = newY - y;
                break;
            case 3: // Bottom-left
                newWidth = width + (x - newX);
                newHeight = newY - y;
                newX1 = newX;
                break;
        }
        
        rect.setAttribute('x', newX1);
        rect.setAttribute('y', newY1);
        rect.setAttribute('width', Math.max(0, newWidth));
        rect.setAttribute('height', Math.max(0, newHeight));
    }

    updateCircleGeometry(circle, pointIndex, newX, newY) {
        if (pointIndex === 0) {
            // Moving center point
            circle.setAttribute('cx', newX);
            circle.setAttribute('cy', newY);
        } else {
            // Moving radius point
            const cx = parseFloat(circle.getAttribute('cx'));
            const cy = parseFloat(circle.getAttribute('cy'));
            const radius = Math.sqrt(Math.pow(newX - cx, 2) + Math.pow(newY - cy, 2));
            circle.setAttribute('r', radius);
        }
    }

    updatePathGeometry(path, pointIndex, newX, newY) {
        const d = path.getAttribute('d');
        const commands = d.match(/[MLC]\s*([^MLC]+)/g) || [];
        
        // Find the command that corresponds to this anchor point
        let commandIndex = -1;
        let currentAnchorIndex = 0;
        let curveSegmentIndex = -1;
        
        for (let i = 0; i < commands.length; i++) {
            if (commands[i].startsWith('M') || commands[i].startsWith('L')) {
                if (currentAnchorIndex === pointIndex) {
                    commandIndex = i;
                    break;
                }
                currentAnchorIndex++;
            } else if (commands[i].startsWith('C')) {
                // For curves, the end point is the anchor point
                if (currentAnchorIndex === pointIndex) {
                    commandIndex = i;
                    curveSegmentIndex = i;
                    break;
                }
                currentAnchorIndex++;
            }
        }
        
        if (commandIndex !== -1) {
            const command = commands[commandIndex];
            if (command.startsWith('M') || command.startsWith('L')) {
                const newCommand = command.replace(/[ML]\s*[-\d.]+[,\s]+[-\d.]+/, `${command[0]} ${newX} ${newY}`);
                commands[commandIndex] = newCommand;
            } else if (command.startsWith('C')) {
                // For curves, update the end point (last two coordinates)
                const parts = command.match(/C\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
                if (parts) {
                    // Calculate the offset from old position to new position
                    const oldEndX = parseFloat(parts[5]);
                    const oldEndY = parseFloat(parts[6]);
                    const offsetX = newX - oldEndX;
                    const offsetY = newY - oldEndY;
                    
                    // Update control points proportionally
                    const newControl1X = parseFloat(parts[1]) + offsetX;
                    const newControl1Y = parseFloat(parts[2]) + offsetY;
                    const newControl2X = parseFloat(parts[3]) + offsetX;
                    const newControl2Y = parseFloat(parts[4]) + offsetY;
                    
                    const newCommand = `C ${newControl1X} ${newControl1Y} ${newControl2X} ${newControl2Y} ${newX} ${newY}`;
                    commands[commandIndex] = newCommand;
                }
            }
            path.setAttribute('d', commands.join(' '));
            
            // Update control point positions if this was a curve
            if (curveSegmentIndex !== -1) {
                this.updateControlPointsForPath(path);
            }
        }

        // Recompute repeat points for this path as geometry changed
        if (this.selectedElement === path && path.__repeatMeta && path.__repeatMeta.count > 0) {
            this.createOrUpdateRepeatPoints(path, path.__repeatMeta.count);
            this.renderRepeatPoints(path);
        }
    }

    handleAnchorToolClick(event) {
        // Handle clicking on anchor points (already handled in mousedown)
        // This method can be used for additional anchor tool functionality
    }

    updateControlPointsForPath(path) {
        // Update the positions of control points for this path based on current geometry
        const elementId = this.elements.indexOf(path);
        
        this.controlPoints.forEach(point => {
            if (point.dataset.elementId == elementId) {
                const segmentIndex = parseInt(point.dataset.segmentIndex);
                const controlIndex = parseInt(point.dataset.controlIndex);
                
                // Get the current control point position from the path data
                const d = path.getAttribute('d');
                const commands = d.match(/[MLC]\s*([^MLC]+)/g) || [];
                
                let curveCommandIndex = -1;
                let currentSegment = 0;
                
                for (let i = 0; i < commands.length; i++) {
                    if (commands[i].startsWith('C')) {
                        if (currentSegment === segmentIndex) {
                            curveCommandIndex = i;
                            break;
                        }
                        currentSegment++;
                    }
                }
                
                if (curveCommandIndex !== -1) {
                    const curveCommand = commands[curveCommandIndex];
                    const parts = curveCommand.match(/C\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
                    
                    if (parts) {
                        let newX, newY;
                        if (controlIndex === 1) {
                            newX = parseFloat(parts[1]);
                            newY = parseFloat(parts[2]);
                        } else {
                            newX = parseFloat(parts[3]);
                            newY = parseFloat(parts[4]);
                        }
                        
                        point.style.left = newX + 'px';
                        point.style.top = newY + 'px';
                    }
                }
            }
        });
    }

    addAnchorDragListeners() {
        // Add global mouse event listeners for anchor and control point dragging
        this.anchorMouseMoveHandler = (e) => {
            if (this.isDraggingAnchor && this.selectedAnchorPoint) {
                const pos = this.getMousePosition(e);
                console.log('Global anchor mousemove:', pos);
                this.updateAnchorPointDragging(pos);
            }
            if (this.isDraggingControl && this.selectedControlPoint) {
                const pos = this.getMousePosition(e);
                console.log('Global control mousemove:', pos);
                this.updateControlPointDragging(pos);
            }
        };

        this.anchorMouseUpHandler = (e) => {
            if (this.isDraggingAnchor) {
                const pos = this.getMousePosition(e);
                console.log('Global anchor mouseup:', pos);
                this.finishAnchorPointDragging(pos);
            }
            if (this.isDraggingControl) {
                const pos = this.getMousePosition(e);
                console.log('Global control mouseup:', pos);
                this.finishControlPointDragging(pos);
            }
        };

        document.addEventListener('mousemove', this.anchorMouseMoveHandler);
        document.addEventListener('mouseup', this.anchorMouseUpHandler);
    }

    removeAnchorDragListeners() {
        // Remove global mouse event listeners
        if (this.anchorMouseMoveHandler) {
            document.removeEventListener('mousemove', this.anchorMouseMoveHandler);
            this.anchorMouseMoveHandler = null;
        }
        if (this.anchorMouseUpHandler) {
            document.removeEventListener('mouseup', this.anchorMouseUpHandler);
            this.anchorMouseUpHandler = null;
        }
        
        // Remove any control point handles
        this.removeControlPointHandles();
    }

    // Zoom and Pan Methods
    handleWheel(event) {
        event.preventDefault();
        
        const delta = event.deltaY > 0 ? 0.9 : 1.1;
        const rect = this.svg.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        
        this.zoomAtPoint(delta, mouseX, mouseY);
    }

    zoomIn() {
        this.zoomAtPoint(1.2, this.svg.clientWidth / 2, this.svg.clientHeight / 2);
    }

    zoomOut() {
        this.zoomAtPoint(0.8, this.svg.clientWidth / 2, this.svg.clientHeight / 2);
    }

    resetZoom() {
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.updateTransform();
        this.updateZoomLevel();
    }

    zoomAtPoint(factor, centerX, centerY) {
        const newZoom = Math.max(0.1, Math.min(10, this.zoom * factor));
        
        // Calculate the zoom center in transformed coordinates
        const transformedX = (centerX - this.panX) / this.zoom;
        const transformedY = (centerY - this.panY) / this.zoom;
        
        // Update pan to keep the zoom center point fixed
        this.panX = centerX - transformedX * newZoom;
        this.panY = centerY - transformedY * newZoom;
        
        this.zoom = newZoom;
        this.updateTransform();
        this.updateZoomLevel();
    }

    updateTransform() {
        const transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
        this.svg.style.transform = transform;
        this.svg.style.transformOrigin = '0 0';
    }

    updateZoomLevel() {
        document.getElementById('zoomLevel').textContent = Math.round(this.zoom * 100) + '%';
    }

    startPanning(pos) {
        this.isPanning = true;
        this.panStartPoint = pos;
        this.svg.style.cursor = 'grabbing';
        console.log('Starting pan at:', pos);
    }

    updatePanning(pos) {
        if (!this.panStartPoint) return;
        
        const deltaX = pos.x - this.panStartPoint.x;
        const deltaY = pos.y - this.panStartPoint.y;
        
        this.panX += deltaX;
        this.panY += deltaY;
        
        this.panStartPoint = pos;
        this.updateTransform();
    }

    finishPanning(pos) {
        this.isPanning = false;
        this.panStartPoint = null;
        this.svg.style.cursor = 'grab';
        console.log('Finished panning');
    }

    updateAnchorPointsForElement(element) {
        // Update the positions of anchor points for this element based on current geometry
        const elementId = this.elements.indexOf(element);
        const tagName = element.tagName.toLowerCase();
        
        this.anchorPoints.forEach(point => {
            if (point.dataset.elementId == elementId) {
                const index = parseInt(point.dataset.index);
                const type = point.dataset.type;
                
                let newX, newY;
                
                switch (type) {
                    case 'line':
                        if (index === 0) {
                            newX = parseFloat(element.getAttribute('x1'));
                            newY = parseFloat(element.getAttribute('y1'));
                        } else {
                            newX = parseFloat(element.getAttribute('x2'));
                            newY = parseFloat(element.getAttribute('y2'));
                        }
                        break;
                    case 'rect':
                        const x = parseFloat(element.getAttribute('x'));
                        const y = parseFloat(element.getAttribute('y'));
                        const width = parseFloat(element.getAttribute('width'));
                        const height = parseFloat(element.getAttribute('height'));
                        
                        switch (index) {
                            case 0: newX = x; newY = y; break;
                            case 1: newX = x + width; newY = y; break;
                            case 2: newX = x + width; newY = y + height; break;
                            case 3: newX = x; newY = y + height; break;
                        }
                        break;
                    case 'circle':
                        if (index === 0) {
                            newX = parseFloat(element.getAttribute('cx'));
                            newY = parseFloat(element.getAttribute('cy'));
                        } else {
                            const cx = parseFloat(element.getAttribute('cx'));
                            const cy = parseFloat(element.getAttribute('cy'));
                            const r = parseFloat(element.getAttribute('r'));
                            newX = cx + r;
                            newY = cy;
                        }
                        break;
                    case 'path':
                        // For paths, we need to parse the path data
                        const d = element.getAttribute('d');
                        const commands = d.match(/[MLC]\s*([^MLC]+)/g) || [];
                        
                        // Find the command that corresponds to this anchor point
                        let commandIndex = -1;
                        let currentAnchorIndex = 0;
                        
                        for (let i = 0; i < commands.length; i++) {
                            if (commands[i].startsWith('M') || commands[i].startsWith('L')) {
                                if (currentAnchorIndex === index) {
                                    commandIndex = i;
                                    break;
                                }
                                currentAnchorIndex++;
                            } else if (commands[i].startsWith('C')) {
                                // For curves, the end point is the anchor point
                                if (currentAnchorIndex === index) {
                                    commandIndex = i;
                                    break;
                                }
                                currentAnchorIndex++;
                            }
                        }
                        
                        if (commandIndex !== -1) {
                            const command = commands[commandIndex];
                            if (command.startsWith('M') || command.startsWith('L')) {
                                const match = command.match(/[ML]\s*([-\d.]+)\s+([-\d.]+)/);
                                if (match) {
                                    newX = parseFloat(match[1]);
                                    newY = parseFloat(match[2]);
                                }
                            } else if (command.startsWith('C')) {
                                // For curves, get the end point (last two coordinates)
                                const parts = command.match(/C\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
                                if (parts) {
                                    newX = parseFloat(parts[5]);
                                    newY = parseFloat(parts[6]);
                                }
                            }
                        }
                        break;
                }
                
                if (newX !== undefined && newY !== undefined) {
                    point.style.left = newX + 'px';
                    point.style.top = newY + 'px';
                }
            }
        });
        
        // Also update control points for paths
        if (tagName === 'path') {
            this.updateControlPointsForPath(element);
        }
    }

    startResize(handleIndex, event) {
        event.stopPropagation();
        // Resize functionality would go here
    }

    // Dragging functionality
    startDragging(pos) {
        this.isDragging = true;
        console.log('Starting drag for element:', this.selectedElement.tagName);
        
        // Calculate offset from mouse to element position
        const tagName = this.selectedElement.tagName.toLowerCase();
        let elementX, elementY;
        
        switch (tagName) {
            case 'line':
                elementX = parseFloat(this.selectedElement.getAttribute('x1'));
                elementY = parseFloat(this.selectedElement.getAttribute('y1'));
                break;
            case 'rect':
                elementX = parseFloat(this.selectedElement.getAttribute('x'));
                elementY = parseFloat(this.selectedElement.getAttribute('y'));
                break;
            case 'circle':
                elementX = parseFloat(this.selectedElement.getAttribute('cx'));
                elementY = parseFloat(this.selectedElement.getAttribute('cy'));
                break;
            case 'path':
                // For paths, use the first point
                const d = this.selectedElement.getAttribute('d');
                const firstPoint = d.match(/M\s*([-\d.]+)\s+([-\d.]+)/);
                if (firstPoint) {
                    elementX = parseFloat(firstPoint[1]);
                    elementY = parseFloat(firstPoint[2]);
                } else {
                    elementX = pos.x;
                    elementY = pos.y;
                }
                break;
            default:
                elementX = pos.x;
                elementY = pos.y;
        }
        
        this.dragOffset = {
            x: pos.x - elementX,
            y: pos.y - elementY
        };
        console.log('Drag offset:', this.dragOffset);
    }

    updateDragging(pos) {
        if (!this.selectedElement) return;
        
        const newX = pos.x - this.dragOffset.x;
        const newY = pos.y - this.dragOffset.y;
        
        this.moveElement(this.selectedElement, newX, newY);
        
        // Recompute repeat points for moved element
        if (this.selectedElement.__repeatMeta && this.selectedElement.__repeatMeta.count > 0) {
            this.createOrUpdateRepeatPoints(this.selectedElement, this.selectedElement.__repeatMeta.count);
            this.renderRepeatPoints(this.selectedElement);
        }
    }

    finishDragging(pos) {
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
    }

    moveElement(element, x, y) {
        const tagName = element.tagName.toLowerCase();
        
        switch (tagName) {
            case 'line':
                const x1 = parseFloat(element.getAttribute('x1'));
                const y1 = parseFloat(element.getAttribute('y1'));
                const x2 = parseFloat(element.getAttribute('x2'));
                const y2 = parseFloat(element.getAttribute('y2'));
                const width = x2 - x1;
                const height = y2 - y1;
                
                element.setAttribute('x1', x);
                element.setAttribute('y1', y);
                element.setAttribute('x2', x + width);
                element.setAttribute('y2', y + height);
                break;
                
            case 'rect':
                element.setAttribute('x', x);
                element.setAttribute('y', y);
                break;
                
            case 'circle':
                element.setAttribute('cx', x);
                element.setAttribute('cy', y);
                break;
                
            case 'path':
                // For paths, we need to move all points
                this.movePath(element, x, y);
                break;
        }
        
        // Update selection handles and anchor points
        this.updateSelectionVisuals();
        if (this.selectedElement === element && element.__repeatMeta && element.__repeatMeta.count > 0) {
            this.createOrUpdateRepeatPoints(element, element.__repeatMeta.count);
            this.renderRepeatPoints(element);
        }
    }

    movePath(path, newX, newY) {
        const d = path.getAttribute('d');
        const commands = d.match(/[MLC]\s*([^MLC]+)/g) || [];
        
        if (commands.length === 0) return;
        
        // Get the first point to calculate offset
        let firstPoint = null;
        if (commands[0].startsWith('M')) {
            firstPoint = commands[0].match(/M\s*([-\d.]+)\s+([-\d.]+)/);
        }
        if (!firstPoint) return;
        
        const offsetX = newX - parseFloat(firstPoint[1]);
        const offsetY = newY - parseFloat(firstPoint[2]);
        
        // Move all points by the offset
        const newCommands = commands.map(cmd => {
            if (cmd.startsWith('M') || cmd.startsWith('L')) {
                const match = cmd.match(/[ML]\s*([-\d.]+)\s+([-\d.]+)/);
                if (match) {
                    const x = parseFloat(match[1]) + offsetX;
                    const y = parseFloat(match[2]) + offsetY;
                    return cmd.replace(/[ML]\s*[-\d.]+[,\s]+[-\d.]+/, `${cmd[0]} ${x} ${y}`);
                }
            } else if (cmd.startsWith('C')) {
                const parts = cmd.match(/C\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
                if (parts) {
                    const x1 = parseFloat(parts[1]) + offsetX;
                    const y1 = parseFloat(parts[2]) + offsetY;
                    const x2 = parseFloat(parts[3]) + offsetX;
                    const y2 = parseFloat(parts[4]) + offsetY;
                    const x3 = parseFloat(parts[5]) + offsetX;
                    const y3 = parseFloat(parts[6]) + offsetY;
                    return `C ${x1} ${y1} ${x2} ${y2} ${x3} ${y3}`;
                }
            }
            return cmd;
        });
        
        path.setAttribute('d', newCommands.join(' '));
    }

    updateSelectionVisuals() {
        if (this.selectedElement) {
            this.clearSelectionHandles();
            this.clearAnchorPoints();
            this.showSelectionHandles(this.selectedElement);
            this.showAnchorPoints(this.selectedElement);
            this.renderRepeatPoints(this.selectedElement);
        }
    }

    // Line Tool
    startDrawingLine(pos) {
        this.currentElement = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        this.currentElement.setAttribute('x1', pos.x);
        this.currentElement.setAttribute('y1', pos.y);
        this.currentElement.setAttribute('x2', pos.x);
        this.currentElement.setAttribute('y2', pos.y);
        this.applyCurrentProperties(this.currentElement);
        this.svg.appendChild(this.currentElement);
    }

    updateDrawingLine(pos) {
        if (this.currentElement) {
            this.currentElement.setAttribute('x2', pos.x);
            this.currentElement.setAttribute('y2', pos.y);
        }
    }

    finishDrawingLine(pos) {
        if (this.currentElement) {
            this.elements.push(this.currentElement);
            this.currentElement = null;
            this.updateLayersList();
            this.handleDrawRepeatForNewElement(this.elements[this.elements.length - 1]);
        }
    }

    // Rectangle Tool
    startDrawingRectangle(pos) {
        this.currentElement = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        this.currentElement.setAttribute('x', pos.x);
        this.currentElement.setAttribute('y', pos.y);
        this.currentElement.setAttribute('width', 0);
        this.currentElement.setAttribute('height', 0);
        this.applyCurrentProperties(this.currentElement);
        this.svg.appendChild(this.currentElement);
    }

    updateDrawingRectangle(pos) {
        if (this.currentElement && this.drawingStartPoint) {
            const start = this.drawingStartPoint;
            const x = Math.min(start.x, pos.x);
            const y = Math.min(start.y, pos.y);
            const width = Math.abs(pos.x - start.x);
            const height = Math.abs(pos.y - start.y);
            
            this.currentElement.setAttribute('x', x);
            this.currentElement.setAttribute('y', y);
            this.currentElement.setAttribute('width', width);
            this.currentElement.setAttribute('height', height);
        }
    }

    finishDrawingRectangle(pos) {
        if (this.currentElement) {
            this.elements.push(this.currentElement);
            this.currentElement = null;
            this.updateLayersList();
            this.handleDrawRepeatForNewElement(this.elements[this.elements.length - 1]);
        }
    }

    // Circle Tool
    startDrawingCircle(pos) {
        this.currentElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        this.currentElement.setAttribute('cx', pos.x);
        this.currentElement.setAttribute('cy', pos.y);
        this.currentElement.setAttribute('r', 0);
        this.applyCurrentProperties(this.currentElement);
        this.svg.appendChild(this.currentElement);
    }

    updateDrawingCircle(pos) {
        if (this.currentElement && this.drawingStartPoint) {
            const start = this.drawingStartPoint;
            const radius = Math.sqrt(
                Math.pow(pos.x - start.x, 2) + Math.pow(pos.y - start.y, 2)
            );
            this.currentElement.setAttribute('r', radius);
        }
    }

    finishDrawingCircle(pos) {
        if (this.currentElement) {
            this.elements.push(this.currentElement);
            this.currentElement = null;
            this.updateLayersList();
            this.handleDrawRepeatForNewElement(this.elements[this.elements.length - 1]);
        }
    }

    // Path Tool
    addPathPoint(pos) {
        console.log('Adding path point:', pos);
        if (!this.currentPath) {
            this.startNewPath(pos);
            this.updateStatus('Path started. Click to add points, double-click or press Enter to finish.');
        } else {
            this.addPointToPath(pos);
            this.updateStatus(`Path: ${this.pathPoints.length} points. Double-click or press Enter to finish.`);
        }
    }

    startNewPath(pos) {
        this.currentPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.pathPoints = [pos];
        this.pathSegments = [];
        
        // Create initial segment
        const initialSegment = {
            type: 'line',
            startPoint: pos,
            endPoint: pos,
            control1: null,
            control2: null
        };
        this.pathSegments.push(initialSegment);
        
        this.currentPath.setAttribute('d', `M ${pos.x} ${pos.y}`);
        this.applyCurrentProperties(this.currentPath);
        this.svg.appendChild(this.currentPath);
        console.log('New path started:', this.currentPath);
    }

    addPointToPath(pos) {
        this.pathPoints.push(pos);
        
        // Create a straight line segment
        const startPoint = this.pathSegments.length > 0 ? 
            this.pathSegments[this.pathSegments.length - 1].endPoint : 
            this.pathSegments[0].startPoint;
        
        const segment = {
            type: 'line',
            startPoint: startPoint,
            endPoint: pos,
            control1: null,
            control2: null
        };
        
        this.pathSegments.push(segment);
        this.updatePathFromSegments();
    }

    updatePathPreview(pos) {
        if (this.currentPath && this.pathSegments.length > 0) {
            let pathData = this.buildPathDataFromSegments();
            pathData += ` L ${pos.x} ${pos.y}`;
            this.currentPath.setAttribute('d', pathData);
        }
    }

    finishPath() {
        console.log('finishPath called, currentPath:', this.currentPath);
        if (this.currentPath) {
            // Remove any preview lines
            this.removeControlPointPreview();
            
            // Ensure the path is properly added to elements array
            this.elements.push(this.currentPath);
            console.log('Path added to elements. Total elements:', this.elements.length);
            console.log('Path element:', this.currentPath);
            console.log('Path data:', this.currentPath.getAttribute('d'));
            const finalized = this.currentPath;
            this.currentPath = null;
            this.pathPoints = [];
            this.pathSegments = [];
            this.updateLayersList();
            this.updateStatus('Path completed');
            // Handle draw-repeat cloning for newly created path
            this.handleDrawRepeatForNewElement(finalized);
        } else {
            console.log('No currentPath to finish!');
        }
    }

    // ===== Repeat Points core logic =====
    handleCreateRepeatPoints() {
        if (!this.selectedElement) {
            this.showMessage('Select a line or path to create repeat points', 'error');
            return;
        }
        const tag = this.selectedElement.tagName.toLowerCase();
        if (!(tag === 'line' || tag === 'path')) {
            this.showMessage('Repeat points currently supported for line and path', 'error');
            return;
        }
        const count = Math.max(1, Math.min(500, parseInt(document.getElementById('repeatCount').value, 10) || 10));
        this.createOrUpdateRepeatPoints(this.selectedElement, count);
        this.renderRepeatPoints(this.selectedElement);
        this.updateStatus(`Created ${count} repeat points`);
    }

    getRepeatMeta(element) {
        if (!element.__repeatMeta) {
            element.__repeatMeta = { count: 0, points: [], activeIndex: null };
        }
        return element.__repeatMeta;
    }

    createOrUpdateRepeatPoints(element, count) {
        const meta = this.getRepeatMeta(element);
        meta.count = count;
        meta.points = this.computeRepeatPointsForElement(element, count);
        if (meta.activeIndex != null && (meta.activeIndex < 0 || meta.activeIndex >= meta.points.length)) {
            meta.activeIndex = null;
        }
    }

    computeRepeatPointsForElement(element, count) {
        const tag = element.tagName.toLowerCase();
        const points = [];
        if (count <= 0) return points;
        if (tag === 'line') {
            const x1 = parseFloat(element.getAttribute('x1'));
            const y1 = parseFloat(element.getAttribute('y1'));
            const x2 = parseFloat(element.getAttribute('x2'));
            const y2 = parseFloat(element.getAttribute('y2'));
            for (let i = 0; i < count; i++) {
                const t = count === 1 ? 0.5 : i / (count - 1);
                points.push({ t, x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
            }
        } else if (tag === 'path') {
            try {
                const total = element.getTotalLength();
                for (let i = 0; i < count; i++) {
                    const t = count === 1 ? 0.5 : i / (count - 1);
                    const pt = element.getPointAtLength(total * t);
                    points.push({ t, x: pt.x, y: pt.y });
                }
            } catch (e) {
                console.warn('Path length API error, fallback disabled', e);
            }
        }
        return points;
    }

    renderRepeatPoints(element) {
        this.clearRepeatPoints();
        if (!element || !element.__repeatMeta || element.__repeatMeta.points.length === 0) return;
        const meta = element.__repeatMeta;
        const elementId = this.elements.indexOf(element);
        meta.points.forEach((p, index) => {
            const rp = document.createElement('div');
            rp.className = 'repeat-point' + (meta.activeIndex === index ? ' selected' : '');
            rp.style.left = p.x + 'px';
            rp.style.top = p.y + 'px';
            rp.dataset.elementId = elementId;
            rp.dataset.index = index;
            rp.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                this.setActiveRepeatPoint(element, index);
            });
            this.overlay.appendChild(rp);
            this.repeatPoints.push(rp);
        });
    }

    clearRepeatPoints() {
        this.repeatPoints.forEach(p => p.remove());
        this.repeatPoints = [];
    }

    setActiveRepeatPoint(element, index) {
        const meta = this.getRepeatMeta(element);
        // Toggle selection: if clicking the same point, deselect it
        if (meta.activeIndex === index) {
            meta.activeIndex = null;
            this.selectedRepeatPoint = null;
            this.renderRepeatPoints(element);
            this.updateStatus('No repeat point active');
        } else {
            meta.activeIndex = index;
            this.renderRepeatPoints(element);
            this.updateStatus(`Active repeat point: ${index + 1}/${meta.points.length}`);
            this.selectedRepeatPoint = { element, index };
        }
    }

    // Clone newly drawn element relative to repeat points
    handleDrawRepeatForNewElement(newElement) {
        if (!this.selectedRepeatPoint) return;
        const { element: sourceElement, index } = this.selectedRepeatPoint;
        if (!sourceElement || !sourceElement.__repeatMeta || sourceElement.__repeatMeta.points.length === 0) return;
        const points = sourceElement.__repeatMeta.points;
        const active = points[index];
        if (!active) return;

        const ref = this.getElementReferencePoint(newElement);
        if (!ref) return;

        const clones = [];
        for (let i = 0; i < points.length; i++) {
            if (i === index) continue; // Skip the active point - original element stays where user drew it
            const p = points[i];
            // Calculate the offset from this repeat point to where the clone should be positioned
            // The clone should be at the same distance from this repeat point as the original is from the active repeat point
            const cloneDeltaX = ref.x - active.x;
            const cloneDeltaY = ref.y - active.y;
            const clone = this.cloneElementWithTranslation(newElement, p.x + cloneDeltaX - ref.x, p.y + cloneDeltaY - ref.y);
            if (clone) clones.push(clone);
        }
        clones.forEach(node => this.svg.appendChild(node));
        clones.forEach(node => this.elements.push(node));
        if (clones.length > 0) this.updateLayersList();
    }

    getElementReferencePoint(element) {
        const tag = element.tagName.toLowerCase();
        switch (tag) {
            case 'line':
                return { x: parseFloat(element.getAttribute('x1')), y: parseFloat(element.getAttribute('y1')) };
            case 'rect':
                return { x: parseFloat(element.getAttribute('x')), y: parseFloat(element.getAttribute('y')) };
            case 'circle':
                return { x: parseFloat(element.getAttribute('cx')), y: parseFloat(element.getAttribute('cy')) };
            case 'path':
                const d = element.getAttribute('d');
                const m = d && d.match(/M\s*([-\d.]+)\s+([-\d.]+)/);
                if (m) return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
                return null;
            default:
                return null;
        }
    }

    cloneElementWithTranslation(element, dx, dy) {
        const tag = element.tagName.toLowerCase();
        let clone = null;
        if (tag === 'line') {
            clone = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            ['stroke', 'fill', 'stroke-width', 'opacity'].forEach(a => clone.setAttribute(a, element.getAttribute(a)));
            const x1 = parseFloat(element.getAttribute('x1')) + dx;
            const y1 = parseFloat(element.getAttribute('y1')) + dy;
            const x2 = parseFloat(element.getAttribute('x2')) + dx;
            const y2 = parseFloat(element.getAttribute('y2')) + dy;
            clone.setAttribute('x1', x1);
            clone.setAttribute('y1', y1);
            clone.setAttribute('x2', x2);
            clone.setAttribute('y2', y2);
        } else if (tag === 'rect') {
            clone = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            ['stroke', 'fill', 'stroke-width', 'opacity', 'width', 'height'].forEach(a => element.getAttribute(a) != null && clone.setAttribute(a, element.getAttribute(a)));
            const x = parseFloat(element.getAttribute('x')) + dx;
            const y = parseFloat(element.getAttribute('y')) + dy;
            clone.setAttribute('x', x);
            clone.setAttribute('y', y);
        } else if (tag === 'circle') {
            clone = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            ['stroke', 'fill', 'stroke-width', 'opacity', 'r'].forEach(a => element.getAttribute(a) != null && clone.setAttribute(a, element.getAttribute(a)));
            const cx = parseFloat(element.getAttribute('cx')) + dx;
            const cy = parseFloat(element.getAttribute('cy')) + dy;
            clone.setAttribute('cx', cx);
            clone.setAttribute('cy', cy);
        } else if (tag === 'path') {
            clone = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            ['stroke', 'fill', 'stroke-width', 'opacity'].forEach(a => clone.setAttribute(a, element.getAttribute(a)));
            const d = element.getAttribute('d');
            const translated = (d || '').replace(/([MLC])\s*([\-\d.]+)\s+([\-\d.]+)(?:\s+([\-\d.]+)\s+([\-\d.]+)\s+([\-\d.]+)\s+([\-\d.]+))?/g, (m, cmd, a1, a2, a3, a4, a5, a6) => {
                if (cmd === 'M' || cmd === 'L') {
                    const x = parseFloat(a1) + dx;
                    const y = parseFloat(a2) + dy;
                    return `${cmd} ${x} ${y}`;
                } else if (cmd === 'C') {
                    const x1 = parseFloat(a1) + dx;
                    const y1 = parseFloat(a2) + dy;
                    const x2 = parseFloat(a3) + dx;
                    const y2 = parseFloat(a4) + dy;
                    const x3 = parseFloat(a5) + dx;
                    const y3 = parseFloat(a6) + dy;
                    return `${cmd} ${x1} ${y1} ${x2} ${y2} ${x3} ${y3}`;
                }
                return m;
            });
            clone.setAttribute('d', translated);
        }
        return clone;
    }

    // Enhanced Path Tool Methods for Curved Paths
    startPathInteraction(pos) {
        console.log('Starting path interaction at:', pos);
        if (!this.currentPath) {
            this.startNewPath(pos);
            this.updateStatus('Path started. Click to add points, drag to create curves. Double-click or press Enter to finish.');
        } else {
            // Start a potential curve creation
            this.startPotentialCurve(pos);
        }
    }

    startPotentialCurve(pos) {
        // Store the position where we started dragging
        this.curveStartPoint = pos;
        this.isCreatingCurve = true;
        this.updateStatus('Drag to create curve, release to finish');
        console.log('Starting potential curve at:', pos);
    }

    updatePathInteraction(pos) {
        if (this.isCreatingCurve && this.curveStartPoint) {
            // Show preview of the curve being created
            this.updateCurvePreview(pos);
        } else if (this.currentPath && this.pathSegments.length > 0) {
            // Show preview of next segment
            this.updatePathPreview(pos);
        }
        
        // Update cursor to indicate curve creation
        if (this.isCreatingCurve) {
            this.svg.style.cursor = 'crosshair';
        }
    }

    updateCurvePreview(pos) {
        if (!this.currentPath || !this.curveStartPoint) return;
        
        // Calculate control points for the curve
        const startPoint = this.pathSegments.length > 0 ? 
            this.pathSegments[this.pathSegments.length - 1].endPoint : 
            this.pathSegments[0].startPoint;
        
        // Create temporary control points
        const control1 = {
            x: startPoint.x + (this.curveStartPoint.x - startPoint.x) * 0.3,
            y: startPoint.y + (this.curveStartPoint.y - startPoint.y) * 0.3
        };
        const control2 = {
            x: this.curveStartPoint.x + (pos.x - this.curveStartPoint.x) * 0.7,
            y: this.curveStartPoint.y + (pos.y - this.curveStartPoint.y) * 0.7
        };
        
        // Build path data with the curve preview
        let pathData = this.buildPathDataFromSegments();
        pathData += ` C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${pos.x} ${pos.y}`;
        
        this.currentPath.setAttribute('d', pathData);
        
        // Show control point preview lines
        this.showControlPointPreview(startPoint, control1, control2, pos);
    }

    showControlPointPreview(startPoint, control1, control2, endPoint) {
        // Remove existing preview lines
        this.removeControlPointPreview();
        
        // Create preview lines for control points
        this.controlPreviewLines = [];
        
        // Line from start to control1
        const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line1.setAttribute('x1', startPoint.x);
        line1.setAttribute('y1', startPoint.y);
        line1.setAttribute('x2', control1.x);
        line1.setAttribute('y2', control1.y);
        line1.setAttribute('stroke', '#f39c12');
        line1.setAttribute('stroke-width', '1');
        line1.setAttribute('stroke-dasharray', '5,5');
        line1.setAttribute('opacity', '0.6');
        this.svg.appendChild(line1);
        this.controlPreviewLines.push(line1);
        
        // Line from control2 to end
        const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line2.setAttribute('x1', control2.x);
        line2.setAttribute('y1', control2.y);
        line2.setAttribute('x2', endPoint.x);
        line2.setAttribute('y2', endPoint.y);
        line2.setAttribute('stroke', '#f39c12');
        line2.setAttribute('stroke-width', '1');
        line2.setAttribute('stroke-dasharray', '5,5');
        line2.setAttribute('opacity', '0.6');
        this.svg.appendChild(line2);
        this.controlPreviewLines.push(line2);
    }

    removeControlPointPreview() {
        if (this.controlPreviewLines) {
            this.controlPreviewLines.forEach(line => line.remove());
            this.controlPreviewLines = [];
        }
    }

    finishPathInteraction(pos) {
        // Remove control point preview
        this.removeControlPointPreview();
        
        if (this.isCreatingCurve && this.curveStartPoint) {
            // Create a curved segment
            this.createCurvedSegment(pos);
            this.isCreatingCurve = false;
            this.curveStartPoint = null;
        } else {
            // Create a straight segment
            this.createStraightSegment(pos);
        }
        
        this.updateStatus(`Path: ${this.pathSegments.length} segments. Double-click or press Enter to finish.`);
    }

    createStraightSegment(endPoint) {
        const startPoint = this.pathSegments.length > 0 ? 
            this.pathSegments[this.pathSegments.length - 1].endPoint : 
            this.pathSegments[0].startPoint;
        
        const segment = {
            type: 'line',
            startPoint: startPoint,
            endPoint: endPoint,
            control1: null,
            control2: null
        };
        
        this.pathSegments.push(segment);
        this.updatePathFromSegments();
    }

    createCurvedSegment(endPoint) {
        const startPoint = this.pathSegments.length > 0 ? 
            this.pathSegments[this.pathSegments.length - 1].endPoint : 
            this.pathSegments[0].startPoint;
        
        // Calculate control points based on drag distance and direction
        const dragVector = {
            x: endPoint.x - this.curveStartPoint.x,
            y: endPoint.y - this.curveStartPoint.y
        };
        
        const control1 = {
            x: startPoint.x + (this.curveStartPoint.x - startPoint.x) * 0.3,
            y: startPoint.y + (this.curveStartPoint.y - startPoint.y) * 0.3
        };
        
        const control2 = {
            x: this.curveStartPoint.x + dragVector.x * 0.7,
            y: this.curveStartPoint.y + dragVector.y * 0.7
        };
        
        const segment = {
            type: 'curve',
            startPoint: startPoint,
            endPoint: endPoint,
            control1: control1,
            control2: control2
        };
        
        this.pathSegments.push(segment);
        this.updatePathFromSegments();
    }

    updatePathFromSegments() {
        if (!this.currentPath) return;
        
        const pathData = this.buildPathDataFromSegments();
        this.currentPath.setAttribute('d', pathData);
        console.log('Updated path data:', pathData);
    }

    buildPathDataFromSegments() {
        if (this.pathSegments.length === 0) return '';
        
        let pathData = '';
        
        this.pathSegments.forEach((segment, index) => {
            if (index === 0) {
                // First segment - start with move command
                pathData += `M ${segment.startPoint.x} ${segment.startPoint.y}`;
            }
            
            if (segment.type === 'line') {
                pathData += ` L ${segment.endPoint.x} ${segment.endPoint.y}`;
            } else if (segment.type === 'curve') {
                pathData += ` C ${segment.control1.x} ${segment.control1.y} ${segment.control2.x} ${segment.control2.y} ${segment.endPoint.x} ${segment.endPoint.y}`;
            }
        });
        
        return pathData;
    }

    // Control Point Methods
    startControlPointDragging(pos) {
        this.isDraggingControl = true;
        
        const control = this.selectedControlPoint;
        this.controlDragOffset = {
            x: pos.x - control.x,
            y: pos.y - control.y
        };
        
        console.log('Starting control point drag:', control);
    }

    updateControlPointDragging(pos) {
        if (!this.selectedControlPoint) return;
        
        const newX = pos.x - this.controlDragOffset.x;
        const newY = pos.y - this.controlDragOffset.y;
        
        // Update the control point position
        this.selectedControlPoint.point.style.left = newX + 'px';
        this.selectedControlPoint.point.style.top = newY + 'px';
        this.selectedControlPoint.x = newX;
        this.selectedControlPoint.y = newY;
        
        // Update the path geometry
        this.updatePathGeometryForControlPoint(newX, newY);
        
        // Show visual feedback
        this.showControlPointHandles();
    }

    finishControlPointDragging(pos) {
        this.isDraggingControl = false;
        this.controlDragOffset = { x: 0, y: 0 };
        this.removeControlPointHandles();
        console.log('Finished control point drag');
    }

    updatePathGeometryForControlPoint(newX, newY) {
        const control = this.selectedControlPoint;
        const element = control.element;
        const segmentIndex = control.segmentIndex;
        const controlIndex = control.controlIndex; // 1 or 2
        
        // Update the path segment
        if (element && element.tagName.toLowerCase() === 'path') {
            // Parse the path data and update the specific control point
            this.updatePathControlPoint(element, segmentIndex, controlIndex, newX, newY);
        }
    }

    updatePathControlPoint(path, segmentIndex, controlIndex, newX, newY) {
        const d = path.getAttribute('d');
        const commands = d.match(/[MLC]\s*([^MLC]+)/g) || [];
        
        // Find the curve command for this segment
        let curveCommandIndex = -1;
        let currentSegment = 0;
        
        for (let i = 0; i < commands.length; i++) {
            if (commands[i].startsWith('C')) {
                if (currentSegment === segmentIndex) {
                    curveCommandIndex = i;
                    break;
                }
                currentSegment++;
            }
        }
        
        if (curveCommandIndex !== -1) {
            const curveCommand = commands[curveCommandIndex];
            const parts = curveCommand.match(/C\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
            
            if (parts) {
                let newCommand = 'C';
                if (controlIndex === 1) {
                    // Update first control point
                    newCommand += ` ${newX} ${newY} ${parts[3]} ${parts[4]} ${parts[5]} ${parts[6]}`;
                } else {
                    // Update second control point
                    newCommand += ` ${parts[1]} ${parts[2]} ${newX} ${newY} ${parts[5]} ${parts[6]}`;
                }
                
                commands[curveCommandIndex] = newCommand;
                path.setAttribute('d', commands.join(' '));
            }
        }
    }

    showControlPointHandles() {
        // Remove existing control point handles
        this.removeControlPointHandles();
        
        if (!this.selectedControlPoint) return;
        
        const control = this.selectedControlPoint;
        const element = control.element;
        
        if (element && element.tagName.toLowerCase() === 'path') {
            const d = element.getAttribute('d');
            const commands = d.match(/[MLC]\s*([^MLC]+)/g) || [];
            
            // Find the curve command for this segment
            let curveCommandIndex = -1;
            let currentSegment = 0;
            
            for (let i = 0; i < commands.length; i++) {
                if (commands[i].startsWith('C')) {
                    if (currentSegment === control.segmentIndex) {
                        curveCommandIndex = i;
                        break;
                    }
                    currentSegment++;
                }
            }
            
            if (curveCommandIndex !== -1) {
                const curveCommand = commands[curveCommandIndex];
                const parts = curveCommand.match(/C\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
                
                if (parts) {
                    // Get the anchor points for this curve
                    const startX = parseFloat(parts[5]) - (parseFloat(parts[3]) - parseFloat(parts[1]));
                    const startY = parseFloat(parts[6]) - (parseFloat(parts[4]) - parseFloat(parts[2]));
                    const endX = parseFloat(parts[5]);
                    const endY = parseFloat(parts[6]);
                    
                    // Create handle lines from anchor points to control points
                    this.controlHandles = [];
                    
                    // Line from start anchor to control1
                    const handle1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    handle1.setAttribute('x1', startX);
                    handle1.setAttribute('y1', startY);
                    handle1.setAttribute('x2', parseFloat(parts[1]));
                    handle1.setAttribute('y2', parseFloat(parts[2]));
                    handle1.setAttribute('stroke', '#f39c12');
                    handle1.setAttribute('stroke-width', '1');
                    handle1.setAttribute('stroke-dasharray', '3,3');
                    handle1.setAttribute('opacity', '0.8');
                    this.svg.appendChild(handle1);
                    this.controlHandles.push(handle1);
                    
                    // Line from control2 to end anchor
                    const handle2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    handle2.setAttribute('x1', parseFloat(parts[3]));
                    handle2.setAttribute('y1', parseFloat(parts[4]));
                    handle2.setAttribute('x2', endX);
                    handle2.setAttribute('y2', endY);
                    handle2.setAttribute('stroke', '#f39c12');
                    handle2.setAttribute('stroke-width', '1');
                    handle2.setAttribute('stroke-dasharray', '3,3');
                    handle2.setAttribute('opacity', '0.8');
                    this.svg.appendChild(handle2);
                    this.controlHandles.push(handle2);
                }
            }
        }
    }

    removeControlPointHandles() {
        if (this.controlHandles) {
            this.controlHandles.forEach(handle => handle.remove());
            this.controlHandles = [];
        }
    }

    // Utility Methods
    applyCurrentProperties(element) {
        const strokeColor = document.getElementById('strokeColor').value;
        const fillColor = document.getElementById('fillColor').value;
        const strokeWidth = document.getElementById('strokeWidth').value;
        const opacity = document.getElementById('opacity').value / 100;

        // Handle "none" color values
        element.setAttribute('stroke', strokeColor === '#ffffff' ? 'none' : strokeColor);
        element.setAttribute('fill', fillColor === '#ffffff' ? 'none' : fillColor);
        element.setAttribute('stroke-width', strokeWidth);
        element.setAttribute('opacity', opacity);
    }

    updateSelectedElementProperty(property, value) {
        if (this.selectedElement) {
            // Handle "none" color values
            if (property === 'stroke' || property === 'fill') {
                const colorValue = value === '#ffffff' ? 'none' : value;
                this.selectedElement.setAttribute(property, colorValue);
            } else {
                this.selectedElement.setAttribute(property, value);
            }
        }
    }

    updatePropertiesPanel(element) {
        if (!element) return;
        
        // Handle "none" color values when displaying in color pickers
        const strokeColor = element.getAttribute('stroke');
        const fillColor = element.getAttribute('fill');
        
        document.getElementById('strokeColor').value = strokeColor === 'none' ? '#ffffff' : (strokeColor || '#000000');
        document.getElementById('fillColor').value = fillColor === 'none' ? '#ffffff' : (fillColor || '#ffffff');
        document.getElementById('strokeWidth').value = element.getAttribute('stroke-width') || '2';
        document.getElementById('opacity').value = (element.getAttribute('opacity') || 1) * 100;
        
        document.getElementById('strokeWidthValue').textContent = element.getAttribute('stroke-width') || '2';
        document.getElementById('opacityValue').textContent = Math.round((element.getAttribute('opacity') || 1) * 100) + '%';
    }

    updateLayersList() {
        const layersList = document.getElementById('layersList');
        layersList.innerHTML = '';
        
        // Ensure all elements are still in the DOM
        this.elements = this.elements.filter(element => element.parentNode);
        
        this.elements.forEach((element, index) => {
            const layerItem = document.createElement('div');
            layerItem.className = 'layer-item';
            layerItem.innerHTML = `
                <span class="layer-visibility">👁</span>
                <span class="layer-name">${this.getElementType(element)} ${index + 1}</span>
                <span class="layer-delete">🗑</span>
            `;
            
            layerItem.addEventListener('click', () => this.selectElement(element));
            layerItem.querySelector('.layer-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteElement(element);
            });
            
            layersList.appendChild(layerItem);
        });
    }

    getElementType(element) {
        const tagName = element.tagName.toLowerCase();
        const types = {
            'line': 'Line',
            'rect': 'Rectangle',
            'circle': 'Circle',
            'path': 'Path'
        };
        return types[tagName] || 'Element';
    }

    deleteSelectedElement() {
        if (this.selectedElement) {
            this.deleteElement(this.selectedElement);
        }
    }

    deleteElement(element) {
        const index = this.elements.indexOf(element);
        if (index > -1) {
            this.elements.splice(index, 1);
            element.remove();
            this.clearSelection();
            this.updateLayersList();
            if (this.selectedRepeatPoint && this.selectedRepeatPoint.element === element) {
                this.selectedRepeatPoint = null;
            }
        }
    }

    cancelCurrentOperation() {
        if (this.currentElement) {
            this.currentElement.remove();
            this.currentElement = null;
        }
        if (this.currentPath) {
            // Auto-finalize the path instead of just removing it
            console.log('Auto-finalizing path due to cancel operation');
            this.finishPath();
        }
        // Remove any preview lines
        this.removeControlPointPreview();
        this.isDrawing = false;
        this.clearSelection();
    }

    clearCanvas() {
        // Clear all elements from the SVG
        this.elements.forEach(element => element.remove());
        this.elements = [];
        
        // Clear any current drawing elements
        if (this.currentElement) {
            this.currentElement.remove();
            this.currentElement = null;
        }
        if (this.currentPath) {
            this.currentPath.remove();
            this.currentPath = null;
            this.pathPoints = [];
        }
        
        this.clearSelection();
        // Clear any active repeat point when canvas is cleared
        this.selectedRepeatPoint = null;
        this.updateLayersList();
        this.showMessage('Canvas cleared', 'success');
    }

    downloadSVG() {
        const svgData = this.svg.outerHTML;
        const blob = new Blob([svgData], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'vector-art.svg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showMessage('SVG downloaded successfully', 'success');
    }

    updateStatus(message) {
        document.getElementById('statusText').textContent = message;
    }

    showMessage(message, type = 'success') {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${type}`;
        messageElement.textContent = message;
        document.body.appendChild(messageElement);
        
        setTimeout(() => {
            messageElement.remove();
        }, 3000);
    }
}

// Initialize the editor when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new SVGVectorEditor();
});
