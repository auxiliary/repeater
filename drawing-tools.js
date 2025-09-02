// Abstract base class for all drawing tools
class DrawingTool {
    constructor(editor) {
        this.editor = editor;
        this.isDrawing = false;
        this.currentElement = null;
        this.drawingStartPoint = null;
    }

    startDrawing(pos) {
        this.isDrawing = true;
        this.drawingStartPoint = pos;
        this.createElement(pos);
    }

    updateDrawing(pos) {
        if (this.isDrawing && this.currentElement) {
            this.updateElement(pos);
        }
    }

    finishDrawing(pos) {
        if (this.isDrawing && this.currentElement) {
            this.finalizeElement(pos);
            this.isDrawing = false;
            this.currentElement = null;
            this.drawingStartPoint = null;
        }
    }

    // Abstract methods to be implemented by subclasses
    createElement(pos) {
        throw new Error('createElement must be implemented by subclass');
    }

    updateElement(pos) {
        throw new Error('updateElement must be implemented by subclass');
    }

    finalizeElement(pos) {
        throw new Error('finalizeElement must be implemented by subclass');
    }

    cancelDrawing() {
        if (this.currentElement) {
            this.currentElement.remove();
            this.currentElement = null;
        }
        this.isDrawing = false;
        this.drawingStartPoint = null;
    }
}

// Concrete Line Tool
class LineTool extends DrawingTool {
    createElement(pos) {
        this.currentElement = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        this.currentElement.setAttribute('x1', pos.x);
        this.currentElement.setAttribute('y1', pos.y);
        this.currentElement.setAttribute('x2', pos.x);
        this.currentElement.setAttribute('y2', pos.y);
        this.editor.applyCurrentProperties(this.currentElement);
        this.editor.svg.appendChild(this.currentElement);
    }

    updateElement(pos) {
        if (this.currentElement) {
            this.currentElement.setAttribute('x2', pos.x);
            this.currentElement.setAttribute('y2', pos.y);
        }
    }

    finalizeElement(pos) {
        if (this.currentElement) {
            this.editor.elements.push(this.currentElement);
            const newElement = this.currentElement;
            
            this.editor.eventBus.emit('layersChanged');
            this.editor.repeatPointsManager.handleDrawRepeatForNewElement(newElement);
        }
    }
}

// Concrete Rectangle Tool
class RectangleTool extends DrawingTool {
    createElement(pos) {
        this.currentElement = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        this.currentElement.setAttribute('x', pos.x);
        this.currentElement.setAttribute('y', pos.y);
        this.currentElement.setAttribute('width', 0);
        this.currentElement.setAttribute('height', 0);
        this.editor.applyCurrentProperties(this.currentElement);
        this.editor.svg.appendChild(this.currentElement);
    }

    updateElement(pos) {
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

    finalizeElement(pos) {
        if (this.currentElement) {
            this.editor.elements.push(this.currentElement);
            const newElement = this.currentElement;
            
            this.editor.eventBus.emit('layersChanged');
            this.editor.repeatPointsManager.handleDrawRepeatForNewElement(newElement);
        }
    }
}

// Concrete Circle Tool
class CircleTool extends DrawingTool {
    createElement(pos) {
        this.currentElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        this.currentElement.setAttribute('cx', pos.x);
        this.currentElement.setAttribute('cy', pos.y);
        this.currentElement.setAttribute('r', 0);
        this.editor.applyCurrentProperties(this.currentElement);
        this.editor.svg.appendChild(this.currentElement);
    }

    updateElement(pos) {
        if (this.currentElement && this.drawingStartPoint) {
            const start = this.drawingStartPoint;
            const radius = Math.sqrt(
                Math.pow(pos.x - start.x, 2) + Math.pow(pos.y - start.y, 2)
            );
            this.currentElement.setAttribute('r', radius);
        }
    }

    finalizeElement(pos) {
        if (this.currentElement) {
            this.editor.elements.push(this.currentElement);
            const newElement = this.currentElement;
            
            this.editor.eventBus.emit('layersChanged');
            this.editor.repeatPointsManager.handleDrawRepeatForNewElement(newElement);
        }
    }
}

// Concrete Path Tool
class PathTool extends DrawingTool {
    constructor(editor) {
        super(editor);
        this.currentPath = null;
        this.pathPoints = [];
        this.pathSegments = [];
        this.curveStartPoint = null;
        this.isCreatingCurve = false;
        this.controlPreviewLines = [];
        this.controlHandles = [];
    }

    startDrawing(pos) {
        // For path tool, we handle drawing differently - via clicks and drags
        // Store the start point but don't immediately create on mouse down
        this.isDrawing = true;
        this.drawingStartPoint = pos;
    }

    createElement(pos) {
        this.startNewPath(pos);
        this.editor.eventBus.emit('statusUpdate', 'Path started. Click to add points, drag to create curves. Double-click or press Enter to finish.');
    }

    startPathInteraction(pos) {
        console.log('Starting path interaction at:', pos);
        
        // Call the base startDrawing method to maintain proper state
        this.startDrawing(pos);
        
        // Store the mouse down position to detect if this becomes a drag
        this.mouseDownPos = pos;
        this.isDragging = false;
        
        // Always prepare for potential curve creation when mouse down
        // (we'll determine later whether to create curve or point based on drag)
        this.startPotentialCurve(pos);
    }

    startPotentialCurve(pos) {
        // Store the position where we started dragging
        this.curveStartPoint = pos;
        this.isCreatingCurve = true;
        this.editor.eventBus.emit('statusUpdate', 'Drag to create curve, release to finish');
        console.log('Starting potential curve at:', pos);
    }

    addPathPoint(pos) {
        if (!this.currentPath) {
            this.startNewPath(pos);
            this.editor.eventBus.emit('statusUpdate', 'Path started. Click to add points, double-click or press Enter to finish.');
        } else {
            this.addPointToPath(pos);
            this.editor.eventBus.emit('statusUpdate', `Path: ${this.pathPoints.length} points. Double-click or press Enter to finish.`);
        }
    }

    addPointToPath(pos) {
        this.pathPoints.push(pos);
        
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

    updateDrawing(pos) {
        // Override base class method to handle path-specific behavior
        if (this.isDrawing) {
            this.updateElement(pos);
        }
    }

    finishDrawing(pos) {
        // Override base class method to handle path-specific behavior
        if (this.isDrawing) {
            this.finalizeElement(pos);
            this.isDrawing = false;
            this.drawingStartPoint = null;
        }
    }

    updateElement(pos) {
        // Check if we're actually dragging (mouse moved significant distance)
        if (this.mouseDownPos && !this.isDragging) {
            const distance = Math.sqrt(
                Math.pow(pos.x - this.mouseDownPos.x, 2) + 
                Math.pow(pos.y - this.mouseDownPos.y, 2)
            );
            if (distance > 5) { // Threshold for considering it a drag
                this.isDragging = true;
            }
        }
        
        // Only show curve preview if we're actually dragging
        if (this.isDragging && this.isCreatingCurve && this.curveStartPoint) {
            this.updateCurvePreview(pos);
        } else if (this.currentPath && this.pathSegments.length > 0) {
            this.updatePathPreview(pos);
        }
        
        if (this.isCreatingCurve && this.isDragging) {
            this.editor.svg.style.cursor = 'crosshair';
        }
    }

    finalizeElement(pos) {
        this.removeControlPointPreview();
        
        // Only create segments if we actually dragged to create a curve
        if (this.isDragging && this.isCreatingCurve && this.curveStartPoint) {
            // If we don't have a path yet, create it first
            if (!this.currentPath) {
                this.startNewPath(this.curveStartPoint);
            }
            this.createCurvedSegment(pos);
            this.editor.eventBus.emit('statusUpdate', `Path: ${this.pathSegments.length} segments. Double-click or press Enter to finish.`);
        }
        // Note: If we didn't drag, no segment should be created here - 
        // point addition is handled by click events
        
        // Reset state
        this.isCreatingCurve = false;
        this.curveStartPoint = null;
        this.isDragging = false;
        this.mouseDownPos = null;
    }

    startNewPath(pos) {
        this.currentPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.pathPoints = [pos];
        this.pathSegments = [];
        
        const initialSegment = {
            type: 'line',
            startPoint: pos,
            endPoint: pos,
            control1: null,
            control2: null
        };
        this.pathSegments.push(initialSegment);
        
        this.currentPath.setAttribute('d', `M ${pos.x} ${pos.y}`);
        this.editor.applyCurrentProperties(this.currentPath);
        this.editor.svg.appendChild(this.currentPath);
    }



    updateCurvePreview(pos) {
        if (!this.curveStartPoint) return;
        
        // If we don't have a path yet, create it
        if (!this.currentPath) {
            this.startNewPath(this.curveStartPoint);
        }
        
        const startPoint = this.pathSegments.length > 0 ? 
            this.pathSegments[this.pathSegments.length - 1].endPoint : 
            this.pathSegments[0].startPoint;
        
        const control1 = {
            x: startPoint.x + (this.curveStartPoint.x - startPoint.x) * 0.3,
            y: startPoint.y + (this.curveStartPoint.y - startPoint.y) * 0.3
        };
        const control2 = {
            x: this.curveStartPoint.x + (pos.x - this.curveStartPoint.x) * 0.7,
            y: this.curveStartPoint.y + (pos.y - this.curveStartPoint.y) * 0.7
        };
        
        let pathData = this.buildPathDataFromSegments();
        pathData += ` C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${pos.x} ${pos.y}`;
        
        this.currentPath.setAttribute('d', pathData);
        this.showControlPointPreview(startPoint, control1, control2, pos);
    }

    updatePathPreview(pos) {
        if (this.currentPath && this.pathSegments.length > 0) {
            let pathData = this.buildPathDataFromSegments();
            pathData += ` L ${pos.x} ${pos.y}`;
            this.currentPath.setAttribute('d', pathData);
        }
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
    }

    buildPathDataFromSegments() {
        if (this.pathSegments.length === 0) return '';
        
        let pathData = '';
        
        this.pathSegments.forEach((segment, index) => {
            if (index === 0) {
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

    showControlPointPreview(startPoint, control1, control2, endPoint) {
        this.removeControlPointPreview();
        
        this.controlPreviewLines = [];
        
        const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line1.setAttribute('x1', startPoint.x);
        line1.setAttribute('y1', startPoint.y);
        line1.setAttribute('x2', control1.x);
        line1.setAttribute('y2', control1.y);
        line1.setAttribute('stroke', '#f39c12');
        line1.setAttribute('stroke-width', '1');
        line1.setAttribute('stroke-dasharray', '5,5');
        line1.setAttribute('opacity', '0.6');
        this.editor.svg.appendChild(line1);
        this.controlPreviewLines.push(line1);
        
        const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line2.setAttribute('x1', control2.x);
        line2.setAttribute('y1', control2.y);
        line2.setAttribute('x2', endPoint.x);
        line2.setAttribute('y2', endPoint.y);
        line2.setAttribute('stroke', '#f39c12');
        line2.setAttribute('stroke-width', '1');
        line2.setAttribute('stroke-dasharray', '5,5');
        line2.setAttribute('opacity', '0.6');
        this.editor.svg.appendChild(line2);
        this.controlPreviewLines.push(line2);
    }

    removeControlPointPreview() {
        if (this.controlPreviewLines) {
            this.controlPreviewLines.forEach(line => line.remove());
            this.controlPreviewLines = [];
        }
    }

    finishPath() {
        if (this.currentPath) {
            this.removeControlPointPreview();
            
            this.editor.elements.push(this.currentPath);
            const finalized = this.currentPath;
            this.currentPath = null;
            this.pathPoints = [];
            this.pathSegments = [];
            
            this.editor.eventBus.emit('layersChanged');
            this.editor.eventBus.emit('statusUpdate', 'Path completed');
            this.editor.repeatPointsManager.handleDrawRepeatForNewElement(finalized);
        }
    }

    cancelDrawing() {
        super.cancelDrawing();
        if (this.currentPath) {
            this.currentPath.remove();
            this.currentPath = null;
            this.pathPoints = [];
            this.pathSegments = [];
        }
        this.removeControlPointPreview();
        this.isCreatingCurve = false;
        this.curveStartPoint = null;
    }
}

export { DrawingTool, LineTool, RectangleTool, CircleTool, PathTool };