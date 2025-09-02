import { DrawingTool, LineTool, RectangleTool, CircleTool, PathTool } from './drawing-tools.js';
import {Shape, LineShape, RectangleShape, CircleShape, PathShape} from './shapes.js';
import {ZoomPanManager} from './zoom-pan-manager.js';
import {EventBus} from './event-bus.js';
import {PropertiesManager} from './properties-manager.js';
import {SelectionManager} from './selection-manager.js';
import {RepeatPointsManager} from './repeat-points-manager.js';
import {AnchorPointsManager} from './anchor-points-manager.js';

class SVGVectorEditor {
    constructor() {
        this.svg = document.getElementById('svgCanvas');
        this.overlay = document.getElementById('canvasOverlay');
        this.currentTool = 'select';
        this.isDrawing = false;
        this.elements = [];
        this.currentPath = null;
        this.pathPoints = [];
        this.pathSegments = []; // New: stores path segments with anchor and control points
        this.drawingStartPoint = null;

        
        // Initialize event bus
        this.eventBus = new EventBus();
        
        // Initialize zoom and pan manager
        this.zoomPanManager = new ZoomPanManager(this.svg);
        
        // Initialize properties manager
        this.propertiesManager = new PropertiesManager(this.eventBus);
        
        // Initialize selection manager
        this.selectionManager = new SelectionManager(this, this.overlay, this.eventBus);
        
        // Initialize repeat points manager
        this.repeatPointsManager = new RepeatPointsManager(this, this.overlay, this.eventBus);
        
        // Initialize anchor points manager
        this.anchorPointsManager = new AnchorPointsManager(this, this.overlay, this.eventBus);
        
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
        this.setupLayers();
        this.eventBus.emit('statusUpdate', 'Ready');
    }

    setupEventBusListeners() {
        // Listen for element selection events
        this.eventBus.on('elementSelected', (element) => {
            this.propertiesManager.updatePropertiesPanel(element);
            this.selectionManager.showSelectionHandles(element);
            this.anchorPointsManager.showAnchorPoints(element);
            this.repeatPointsManager.renderRepeatPoints(element);
        });

        // Listen for selection cleared events
        this.eventBus.on('selectionCleared', () => {
            this.selectionManager.clearSelectionHandles();
            this.repeatPointsManager.clearRepeatPoints();
        });

        // Listen for selection cleared events (for anchor points)
        this.eventBus.on('selectionClearedForAnchorPoints', () => {
            this.anchorPointsManager.clearAnchorPoints();
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
            createRepeatBtn.addEventListener('click', () => this.repeatPointsManager.handleCreateRepeatPoints());
            repeatCountInput.addEventListener('change', () => {
                if (this.selectionManager.getSelectedElement() && this.repeatPointsManager.getRepeatMeta(this.selectionManager.getSelectedElement())) {
                    this.repeatPointsManager.createOrUpdateRepeatPoints(this.selectionManager.getSelectedElement(), parseInt(repeatCountInput.value, 10));
                    this.repeatPointsManager.renderRepeatPoints(this.selectionManager.getSelectedElement());
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
            this.anchorPointsManager.showAllAnchorPoints();
            this.overlay.style.pointerEvents = 'auto';
            // Add global mouse event listeners for anchor dragging
            this.anchorPointsManager.addAnchorDragListeners();
        } else {
            this.anchorPointsManager.hideAllAnchorPoints();
            this.overlay.style.pointerEvents = 'none';
            // Remove global mouse event listeners
            this.anchorPointsManager.removeAnchorDragListeners();
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
        if (this.currentTool === 'select' && this.selectionManager.getSelectedElement() && 
            (event.target === this.selectionManager.getSelectedElement() || event.target.classList.contains('selection-handle') || event.target.classList.contains('path-point'))) {
            this.selectionManager.startDragging(pos);
            return;
        }

        // Handle anchor point dragging
        if (this.currentTool === 'anchor' && this.anchorPointsManager.getSelectedAnchorPoint() && 
            (event.target.classList.contains('path-point') || this.anchorPointsManager.getDraggingAnchorState())) {
            if (!this.anchorPointsManager.getDraggingAnchorState()) {
                this.anchorPointsManager.startAnchorPointDragging(pos);
            }
            return;
        }

        // Handle control point dragging
        if (this.currentTool === 'anchor' && this.anchorPointsManager.getSelectedControlPoint() && 
            (event.target.classList.contains('control-point') || this.anchorPointsManager.getDraggingControlState())) {
            if (!this.anchorPointsManager.getDraggingControlState()) {
                this.anchorPointsManager.startControlPointDragging(pos);
            }
            return;
        }

        switch (this.currentTool) {
            case 'select':
                // Don't start selection if we clicked on an element
                if (event.target === this.svg) {
                    this.selectionManager.startSelection(pos);
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
        if (this.anchorPointsManager.getDraggingAnchorState()) {
            console.log('Mouse move during anchor drag:', { pos, selectedAnchor: this.anchorPointsManager.getSelectedAnchorPoint() });
        }
        
        // Handle dragging
        if (this.selectionManager.isDraggingElement() && this.selectionManager.getSelectedElement()) {
            this.selectionManager.updateDragging(pos);
            return;
        }

        // Handle anchor point dragging
        if (this.anchorPointsManager.getDraggingAnchorState() && this.anchorPointsManager.getSelectedAnchorPoint()) {
            console.log('Calling updateAnchorPointDragging');
            this.anchorPointsManager.updateAnchorPointDragging(pos);
            return;
        }

        // Handle control point dragging
        if (this.anchorPointsManager.getDraggingControlState() && this.anchorPointsManager.getSelectedControlPoint()) {
            this.anchorPointsManager.updateControlPointDragging(pos);
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
                this.selectionManager.updateSelection(pos, this.drawingStartPoint);
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
        if (this.selectionManager.isDraggingElement()) {
            this.selectionManager.finishDragging();
            return;
        }

        // Handle anchor point dragging
        if (this.anchorPointsManager.getDraggingAnchorState()) {
            this.anchorPointsManager.finishAnchorPointDragging(pos);
            return;
        }

        // Handle control point dragging
        if (this.anchorPointsManager.getDraggingControlState()) {
            this.anchorPointsManager.finishControlPointDragging(pos);
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
                this.selectionManager.finishSelection();
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

    handleSelectClick(event) {
        const target = event.target;
        // Ignore clicks on repeat point markers in SVG
        if (target && target.classList && target.classList.contains('repeat-point')) {
            // Selection handled via mousedown listener on the marker
            return;
        }
        if (target === this.svg) {
            this.selectionManager.clearSelection();
            return;
        }
        
        // Only select if it's a valid SVG element
        if (target.tagName && ['line', 'rect', 'circle', 'path'].includes(target.tagName.toLowerCase())) {
            this.selectionManager.selectElement(target);
        }
    }

    // Utility Methods
    applyCurrentProperties(element) {
        this.propertiesManager.applyCurrentProperties(element);
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
            
            layerItem.addEventListener('click', () => this.selectionManager.selectElement(element));
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
        if (this.selectionManager.getSelectedElement()) {
            this.deleteElement(this.selectionManager.getSelectedElement());
        }
    }

    deleteElement(element) {
        const index = this.elements.indexOf(element);
        if (index > -1) {
            this.elements.splice(index, 1);
            element.remove();
            this.selectionManager.clearSelection();
            
            // Emit event instead of direct method call
            this.eventBus.emit('layersChanged');
            
                    if (this.repeatPointsManager.getSelectedRepeatPoint() && this.repeatPointsManager.getSelectedRepeatPoint().element === element) {
            this.repeatPointsManager.clearRepeatPointsForElement(element);
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
        this.selectionManager.clearSelection();
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
        
        this.selectionManager.clearSelection();
        // Clear any active repeat point when canvas is cleared
        this.repeatPointsManager.clearSelectedRepeatPoint();
        
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
