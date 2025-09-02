import { LineShape, RectangleShape, CircleShape, PathShape } from './shapes.js';

class SelectionManager {
    constructor(editor, overlay, eventBus) {
        this.editor = editor;
        this.overlay = overlay;
        this.eventBus = eventBus;
        this.selectedElement = null;
        this.selectionBox = null;
        this.selectionHandles = [];
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
    }

    // Core selection methods
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
        
        // Also emit an event for the main class to clear anchor points
        this.eventBus.emit('selectionClearedForAnchorPoints');
    }

    startSelection(pos) {
        this.selectionBox = document.createElement('div');
        this.selectionBox.className = 'selection-box';
        this.selectionBox.style.left = pos.x + 'px';
        this.selectionBox.style.top = pos.y + 'px';
        this.overlay.appendChild(this.selectionBox);
    }

    updateSelection(pos, drawingStartPoint) {
        if (!this.selectionBox || !drawingStartPoint) return;
        
        const start = drawingStartPoint;
        const left = Math.min(start.x, pos.x);
        const top = Math.min(start.y, pos.y);
        const width = Math.abs(pos.x - start.x);
        const height = Math.abs(pos.y - start.y);
        
        this.selectionBox.style.left = left + 'px';
        this.selectionBox.style.top = top + 'px';
        this.selectionBox.style.width = width + 'px';
        this.selectionBox.style.height = height + 'px';
    }

    finishSelection() {
        if (this.selectionBox) {
            this.selectionBox.remove();
            this.selectionBox = null;
        }
    }

    // Visual feedback
    showSelectionHandles(element) {
        const rect = element.getBoundingClientRect();
        const svgRect = this.editor.svg.getBoundingClientRect();
        
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

    updateSelectionVisuals() {
        if (this.selectedElement) {
            this.clearSelectionHandles();
            this.showSelectionHandles(this.selectedElement);
        }
    }

    // Drag operations
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
            this.editor.repeatPointsManager.createOrUpdateRepeatPoints(this.selectedElement, this.selectedElement.__repeatMeta.count);
            this.editor.repeatPointsManager.renderRepeatPoints(this.selectedElement);
        }
    }

    finishDragging() {
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
        
        // Update selection handles
        this.updateSelectionVisuals();
        
        // Update repeat points if this element has them
        if (this.selectedElement === element && element.__repeatMeta && element.__repeatMeta.count > 0) {
            this.editor.repeatPointsManager.createOrUpdateRepeatPoints(element, element.__repeatMeta.count);
            this.editor.repeatPointsManager.renderRepeatPoints(element);
        }
    }

    // Resize operations
    startResize(handleIndex, event) {
        event.stopPropagation();
        // Resize functionality would go here
    }

    // Utility methods
    isElementSelected(element) {
        return this.selectedElement === element;
    }

    getSelectedElement() {
        return this.selectedElement;
    }

    isDraggingElement() {
        return this.isDragging;
    }


}

export { SelectionManager };
