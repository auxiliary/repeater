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
        this.drawingStartPoint = null;
        this.selectionBox = null;
        this.selectionHandles = [];
        this.anchorPoints = [];
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.selectedAnchorPoint = null;
        this.isDraggingAnchor = false;
        this.anchorDragOffset = { x: 0, y: 0 };
        
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
        
        // Prevent context menu
        this.svg.addEventListener('contextmenu', e => e.preventDefault());
        
        // Keyboard events
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        
        // Header buttons
        document.getElementById('clearCanvas').addEventListener('click', this.clearCanvas.bind(this));
        document.getElementById('downloadSVG').addEventListener('click', this.downloadSVG.bind(this));
        
        // Coordinate display
        this.svg.addEventListener('mousemove', (e) => {
            const rect = this.svg.getBoundingClientRect();
            const x = Math.round(e.clientX - rect.left);
            const y = Math.round(e.clientY - rect.top);
            document.getElementById('coordinates').textContent = `X: ${x}, Y: ${y}`;
        });
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
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
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
                console.log('Path tool triggered, adding point at:', pos);
                this.addPathPoint(pos);
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
                this.updatePathPreview(pos);
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
        
        // Clear anchor point selection
        if (this.selectedAnchorPoint) {
            this.selectedAnchorPoint = null;
        }
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
        const commands = d.match(/[ML]\s*([^ML]+)/g) || [];
        
        commands.forEach((cmd, index) => {
            const match = cmd.match(/[ML]\s*([-\d.]+)\s+([-\d.]+)/);
            if (match) {
                const x = parseFloat(match[1]);
                const y = parseFloat(match[2]);
                this.createAnchorPoint(x, y, index, 'path');
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
        const commands = d.match(/[ML]\s*([^ML]+)/g) || [];
        console.log('Path commands:', commands);
        
        commands.forEach((cmd, index) => {
            const match = cmd.match(/[ML]\s*([-\d.]+)\s+([-\d.]+)/);
            if (match) {
                const x = parseFloat(match[1]);
                const y = parseFloat(match[2]);
                console.log('Creating path anchor point:', { x, y, index });
                this.createSelectableAnchorPoint(x, y, index, 'path', path);
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

    selectAnchorPoint(point, x, y, index, type, element) {
        // Clear previous selection
        this.anchorPoints.forEach(p => p.classList.remove('selected'));
        
        // Get the current position of the anchor point element
        const currentX = parseFloat(point.style.left);
        const currentY = parseFloat(point.style.top);
        
        // Select this point
        point.classList.add('selected');
        this.selectedAnchorPoint = { point, x: currentX, y: currentY, index, type, element };
        
        console.log('Anchor point selected:', { index, type, element: element.tagName, currentX, currentY });
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
        const commands = d.match(/[ML]\s*([^ML]+)/g) || [];
        
        if (commands[pointIndex]) {
            const newCommand = commands[pointIndex].replace(/[ML]\s*[-\d.]+[,\s]+[-\d.]+/, `${commands[pointIndex][0]} ${newX} ${newY}`);
            commands[pointIndex] = newCommand;
            path.setAttribute('d', commands.join(' '));
        }
    }

    handleAnchorToolClick(event) {
        // Handle clicking on anchor points (already handled in mousedown)
        // This method can be used for additional anchor tool functionality
    }

    addAnchorDragListeners() {
        // Add global mouse event listeners for anchor dragging
        this.anchorMouseMoveHandler = (e) => {
            if (this.isDraggingAnchor && this.selectedAnchorPoint) {
                const pos = this.getMousePosition(e);
                console.log('Global anchor mousemove:', pos);
                this.updateAnchorPointDragging(pos);
            }
        };

        this.anchorMouseUpHandler = (e) => {
            if (this.isDraggingAnchor) {
                const pos = this.getMousePosition(e);
                console.log('Global anchor mouseup:', pos);
                this.finishAnchorPointDragging(pos);
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
                        const commands = d.match(/[ML]\s*([^ML]+)/g) || [];
                        if (commands[index]) {
                            const match = commands[index].match(/[ML]\s*([-\d.]+)\s+([-\d.]+)/);
                            if (match) {
                                newX = parseFloat(match[1]);
                                newY = parseFloat(match[2]);
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
    }

    movePath(path, newX, newY) {
        const d = path.getAttribute('d');
        const commands = d.match(/[ML]\s*([^ML]+)/g) || [];
        
        if (commands.length === 0) return;
        
        // Get the first point to calculate offset
        const firstPoint = commands[0].match(/[ML]\s*([-\d.]+)\s+([-\d.]+)/);
        if (!firstPoint) return;
        
        const offsetX = newX - parseFloat(firstPoint[1]);
        const offsetY = newY - parseFloat(firstPoint[2]);
        
        // Move all points by the offset
        const newCommands = commands.map(cmd => {
            const match = cmd.match(/[ML]\s*([-\d.]+)\s+([-\d.]+)/);
            if (match) {
                const x = parseFloat(match[1]) + offsetX;
                const y = parseFloat(match[2]) + offsetY;
                return cmd.replace(/[ML]\s*[-\d.]+[,\s]+[-\d.]+/, `${cmd[0]} ${x} ${y}`);
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
        this.currentPath.setAttribute('d', `M ${pos.x} ${pos.y}`);
        this.applyCurrentProperties(this.currentPath);
        this.svg.appendChild(this.currentPath);
        console.log('New path started:', this.currentPath);
    }

    addPointToPath(pos) {
        this.pathPoints.push(pos);
        const pathData = this.pathPoints.map((point, index) => 
            index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
        ).join(' ');
        this.currentPath.setAttribute('d', pathData);
    }

    updatePathPreview(pos) {
        if (this.currentPath && this.pathPoints.length > 0) {
            const pathData = this.pathPoints.map((point, index) => 
                index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
            ).join(' ') + ` L ${pos.x} ${pos.y}`;
            this.currentPath.setAttribute('d', pathData);
        }
    }

    finishPath() {
        console.log('finishPath called, currentPath:', this.currentPath);
        if (this.currentPath) {
            // Ensure the path is properly added to elements array
            this.elements.push(this.currentPath);
            console.log('Path added to elements. Total elements:', this.elements.length);
            console.log('Path element:', this.currentPath);
            console.log('Path data:', this.currentPath.getAttribute('d'));
            this.currentPath = null;
            this.pathPoints = [];
            this.updateLayersList();
            this.updateStatus('Path completed');
        } else {
            console.log('No currentPath to finish!');
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
