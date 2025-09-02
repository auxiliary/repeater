import { DrawingTool, LineTool, RectangleTool, CircleTool, PathTool } from './drawing-tools.js';
import {Shape, LineShape, RectangleShape, CircleShape, PathShape} from './shapes.js';


class EventBus {
    constructor() {
        this.events = {};
    }
    
    on(event, callback) {
        if (!this.events[event]) this.events[event] = [];
        this.events[event].push(callback);
    }
    
    emit(event, data) {
        if (this.events[event]) {
            this.events[event].forEach(callback => callback(data));
        }
    }
    
    off(event, callback) {
        if (this.events[event]) {
            this.events[event] = this.events[event].filter(cb => cb !== callback);
        }
    }
}

class ZoomPanManager {
    constructor(svgElement) {
        this.svg = svgElement;
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.isPanning = false;
        this.panStartPoint = null;
    }

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
}

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
        
        // Initialize event bus
        this.eventBus = new EventBus();
        
        // Initialize zoom and pan manager
        this.zoomPanManager = new ZoomPanManager(this.svg);
        
        // Initialize drawing tools
        this.drawingTools = {
            line: new LineTool(this),
            rectangle: new RectangleTool(this),
            circle: new CircleTool(this),
            path: new PathTool(this)
        };
        
        this.init();
    }

    init() {
        this.setupEventBusListeners();
        this.setupEventListeners();
        this.setupTools();
        this.setupProperties();
        this.setupLayers();
        this.eventBus.emit('statusUpdate', 'Ready');
    }

    setupEventBusListeners() {
        // Listen for element selection events
        this.eventBus.on('elementSelected', (element) => {
            this.updatePropertiesPanel(element);
            this.showSelectionHandles(element);
            this.showAnchorPoints(element);
            this.renderRepeatPoints(element);
        });

        // Listen for selection cleared events
        this.eventBus.on('selectionCleared', () => {
            this.clearSelectionHandles();
            this.clearAnchorPoints();
            this.clearRepeatPoints();
        });

        // Listen for status updates
        this.eventBus.on('statusUpdate', (message) => {
            this.updateStatus(message);
        });

        // Listen for layer updates
        this.eventBus.on('layersChanged', () => {
            this.updateLayersList();
        });

        // Listen for tool changes
        this.eventBus.on('toolChanged', (tool) => {
            this.eventBus.emit('selectionCleared');
            this.eventBus.emit('statusUpdate', `${tool.charAt(0).toUpperCase() + tool.slice(1)} Tool Active`);
        });

        // Listen for property changes
        this.eventBus.on('propertyChanged', ({ property, value }) => {
            if (this.selectedElement) {
                // Handle "none" color values
                if (property === 'stroke' || property === 'fill') {
                    const colorValue = value === '#ffffff' ? 'none' : value;
                    this.selectedElement.setAttribute(property, colorValue);
                } else {
                    this.selectedElement.setAttribute(property, value);
                }
            }
        });
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
        document.getElementById('zoomIn').addEventListener('click', () => this.zoomPanManager.zoomIn());
        document.getElementById('zoomOut').addEventListener('click', () => this.zoomPanManager.zoomOut());
        document.getElementById('resetZoom').addEventListener('click', () => this.zoomPanManager.resetZoom());
        
        // Mouse wheel zoom
        this.svg.addEventListener('wheel', this.zoomPanManager.handleWheel.bind(this.zoomPanManager));
        
        // Coordinate display
        this.svg.addEventListener('mousemove', (e) => {
            const pos = this.zoomPanManager.getMousePosition(e);
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
            this.eventBus.emit('propertyChanged', { property: 'stroke-width', value: e.target.value });
        });

        // Opacity
        const opacityInput = document.getElementById('opacity');
        const opacityValue = document.getElementById('opacityValue');
        opacityInput.addEventListener('input', (e) => {
            opacityValue.textContent = e.target.value + '%';
            this.eventBus.emit('propertyChanged', { property: 'opacity', value: e.target.value / 100 });
        });

        // Colors
        document.getElementById('strokeColor').addEventListener('change', (e) => {
            this.eventBus.emit('propertyChanged', { property: 'stroke', value: e.target.value });
        });

        document.getElementById('fillColor').addEventListener('change', (e) => {
            this.eventBus.emit('propertyChanged', { property: 'fill', value: e.target.value });
        });

        // No color buttons
        document.getElementById('noStrokeColor').addEventListener('click', () => {
            document.getElementById('strokeColor').value = '#ffffff';
            this.eventBus.emit('propertyChanged', { property: 'stroke', value: '#ffffff' });
        });

        document.getElementById('noFillColor').addEventListener('click', () => {
            document.getElementById('fillColor').value = '#ffffff';
            this.eventBus.emit('propertyChanged', { property: 'fill', value: '#ffffff' });
        });
    }

    setupLayers() {
        this.eventBus.emit('layersChanged');
    }

    setTool(tool) {
        // Auto-finalize any current path before switching tools
        if (this.currentTool === 'path' && this.drawingTools.path.currentPath) {
            console.log('Auto-finalizing path due to tool switch');
            this.drawingTools.path.finishPath();
        }
        
        this.currentTool = tool;
        
        // Emit event instead of direct method calls
        this.eventBus.emit('toolChanged', tool);
        
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
        return this.zoomPanManager.getMousePosition(event);
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
                this.zoomPanManager.startPanning(pos);
                break;
            case 'line':
                this.drawingTools.line.startDrawing(pos);
                break;
            case 'rectangle':
                this.drawingTools.rectangle.startDrawing(pos);
                break;
            case 'circle':
                this.drawingTools.circle.startDrawing(pos);
                break;
            case 'path':
                console.log('Path tool triggered, starting path interaction at:', pos);
                this.drawingTools.path.startPathInteraction(pos);
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
        if (this.zoomPanManager.isPanning) {
            this.zoomPanManager.updatePanning(pos);
            return;
        }
        
        if (!this.isDrawing) return;

        switch (this.currentTool) {
            case 'select':
                this.updateSelection(pos);
                break;
            case 'line':
                this.drawingTools.line.updateDrawing(pos);
                break;
            case 'rectangle':
                this.drawingTools.rectangle.updateDrawing(pos);
                break;
            case 'circle':
                this.drawingTools.circle.updateDrawing(pos);
                break;
            case 'path':
                this.drawingTools.path.updateDrawing(pos);
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
        if (this.zoomPanManager.isPanning) {
            this.zoomPanManager.finishPanning(pos);
            return;
        }
        
        if (!this.isDrawing) return;
        
        this.isDrawing = false;

        switch (this.currentTool) {
            case 'select':
                this.finishSelection(pos);
                break;
            case 'line':
                this.drawingTools.line.finishDrawing(pos);
                break;
            case 'rectangle':
                this.drawingTools.rectangle.finishDrawing(pos);
                break;
            case 'circle':
                this.drawingTools.circle.finishDrawing(pos);
                break;
            case 'path':
                this.drawingTools.path.finishDrawing(pos);
                break;
        }
    }

    handleClick(event) {
        if (this.currentTool === 'select') {
            this.handleSelectClick(event);
        } else if (this.currentTool === 'path') {
            // Handle double-click to finish path
            if (event.detail === 2) {
                this.drawingTools.path.finishPath();
            } else {
                // Single click to add path point (only if we didn't drag)
                const pathTool = this.drawingTools.path;
                if (!pathTool.isDragging) {
                    const pos = this.getMousePosition(event);
                    pathTool.addPathPoint(pos);
                }
            }
        }
    }

    handleKeyDown(event) {
        if (event.key === 'Delete' || event.key === 'Backspace') {
            this.deleteSelectedElement();
        } else if (event.key === 'Escape') {
            this.cancelCurrentOperation();
        } else if (event.key === 'Enter' && this.currentTool === 'path') {
            this.drawingTools.path.finishPath();
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
        
        // Emit event instead of direct method calls
        this.eventBus.emit('elementSelected', element);
        console.log('Element selected:', element.tagName, element);
    }

    clearSelection() {
        if (this.selectedElement) {
            this.selectedElement.style.outline = '';
            this.selectedElement = null;
        }
        
        // Emit event instead of direct method calls
        this.eventBus.emit('selectionCleared');
        
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
        let shape;
        
        switch (tagName) {
            case 'line':
                shape = new LineShape(element);
                break;
            case 'rect':
                shape = new RectangleShape(element);
                break;
            case 'circle':
                shape = new CircleShape(element);
                break;
            case 'path':
                shape = new PathShape(element);
                break;
            default:
                return;
        }
        
        const refPoint = shape.getReferencePoint();
        if (refPoint) {
            const dx = x - refPoint.x;
            const dy = y - refPoint.y;
            shape.move(dx, dy);
        }
        
        // Update selection handles and anchor points
        this.updateSelectionVisuals();
        if (this.selectedElement === element && element.__repeatMeta && element.__repeatMeta.count > 0) {
            this.createOrUpdateRepeatPoints(element, element.__repeatMeta.count);
            this.renderRepeatPoints(element);
        }
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
        this.eventBus.emit('statusUpdate', `Created ${count} repeat points`);
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
            this.eventBus.emit('statusUpdate', 'No repeat point active');
        } else {
            meta.activeIndex = index;
            this.renderRepeatPoints(element);
            this.eventBus.emit('statusUpdate', `Active repeat point: ${index + 1}/${meta.points.length}`);
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
        if (clones.length > 0) this.eventBus.emit('layersChanged');
    }

    getElementReferencePoint(element) {
        const tag = element.tagName.toLowerCase();
        let shape;
        
        switch (tag) {
            case 'line':
                shape = new LineShape(element);
                break;
            case 'rect':
                shape = new RectangleShape(element);
                break;
            case 'circle':
                shape = new CircleShape(element);
                break;
            case 'path':
                shape = new PathShape(element);
                break;
            default:
                return null;
        }
        
        return shape.getReferencePoint();
    }

    cloneElementWithTranslation(element, dx, dy) {
        const tag = element.tagName.toLowerCase();
        let shape;
        
        switch (tag) {
            case 'line':
                shape = new LineShape(element);
                break;
            case 'rect':
                shape = new RectangleShape(element);
                break;
            case 'circle':
                shape = new CircleShape(element);
                break;
            case 'path':
                shape = new PathShape(element);
                break;
            default:
                return null;
        }
        
        const clone = shape.clone();
        
        // Create a shape object for the clone so we can move it
        let cloneShape;
        switch (tag) {
            case 'line':
                cloneShape = new LineShape(clone);
                break;
            case 'rect':
                cloneShape = new RectangleShape(clone);
                break;
            case 'circle':
                cloneShape = new CircleShape(clone);
                break;
            case 'path':
                cloneShape = new PathShape(clone);
                break;
        }
        
        cloneShape.move(dx, dy);
        return clone;
    }

    // Enhanced Path Tool Methods for Curved Paths










    removeControlPointPreview() {
        if (this.controlPreviewLines) {
            this.controlPreviewLines.forEach(line => line.remove());
            this.controlPreviewLines = [];
        }
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
            
            // Emit event instead of direct method call
            this.eventBus.emit('layersChanged');
            
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
        if (this.drawingTools.path.currentPath) {
            // Auto-finalize the path instead of just removing it
            console.log('Auto-finalizing path due to cancel operation');
            this.drawingTools.path.finishPath();
        }
        // Remove any preview lines
        this.drawingTools.path.removeControlPointPreview();
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
        if (this.drawingTools.path.currentPath) {
            this.drawingTools.path.currentPath.remove();
            this.drawingTools.path.currentPath = null;
            this.drawingTools.path.pathPoints = [];
        }
        
        this.clearSelection();
        // Clear any active repeat point when canvas is cleared
        this.selectedRepeatPoint = null;
        
        // Emit events instead of direct method calls
        this.eventBus.emit('layersChanged');
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
