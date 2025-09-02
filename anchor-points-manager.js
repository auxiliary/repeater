class AnchorPointsManager {
    constructor(editor, overlay, eventBus) {
        this.editor = editor;
        this.overlay = overlay;
        this.eventBus = eventBus;
        this.anchorPoints = [];
        this.selectedAnchorPoint = null;
        this.isDraggingAnchor = false;
        this.anchorDragOffset = { x: 0, y: 0 };
        this.controlPoints = [];
        this.selectedControlPoint = null;
        this.isDraggingControl = false;
        this.controlDragOffset = { x: 0, y: 0 };
        this.controlPreviewLines = [];
        this.controlHandles = [];
    }

    // Anchor point methods
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

    // Anchor Tool Methods
    showAllAnchorPoints() {
        console.log('Showing anchor points for', this.editor.elements.length, 'elements');
        this.editor.elements.forEach((element, index) => {
            console.log(`Element ${index}:`, element.tagName, element);
            this.showAnchorPointsForElement(element);
        });
        console.log('Total anchor points created:', this.anchorPoints.length);
    }

    hideAllAnchorPoints() {
        this.clearAnchorPoints();
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
        point.dataset.elementId = this.editor.elements.indexOf(element);
        
        point.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            console.log('Anchor point clicked:', { x, y, index, type });
            this.selectAnchorPoint(point, x, y, index, type, element);
            // Start dragging immediately when anchor point is clicked
            if (this.editor.currentTool === 'anchor') {
                this.startAnchorPointDragging(this.editor.getMousePosition(e));
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
        point.dataset.elementId = this.editor.elements.indexOf(element);
        
        point.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            console.log('Control point clicked:', { x, y, segmentIndex, controlIndex });
            this.selectControlPoint(point, x, y, segmentIndex, controlIndex, element);
            // Start dragging immediately when control point is clicked
            if (this.editor.currentTool === 'anchor') {
                this.startControlPointDragging(this.editor.getMousePosition(e));
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

    // Anchor point dragging
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

    startAnchorPointDrag(point, x, y, index, type) {
        // This method is called when a non-selectable anchor point is clicked
        // It's used for the basic anchor point display (not editing)
        console.log('Basic anchor point clicked:', { x, y, index, type });
    }

    // Control point dragging
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

    // Geometry updates
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
        if (this.editor.selectionManager.getSelectedElement() === path && path.__repeatMeta && path.__repeatMeta.count > 0) {
            this.editor.repeatPointsManager.createOrUpdateRepeatPoints(path, path.__repeatMeta.count);
            this.editor.repeatPointsManager.renderRepeatPoints(path);
        }
    }

    // Control point updates
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

    updateControlPointsForPath(path) {
        // Update the positions of control points for this path based on current geometry
        const elementId = this.editor.elements.indexOf(path);
        
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

    updateAnchorPointsForElement(element) {
        // Update the positions of anchor points for this element based on current geometry
        const elementId = this.editor.elements.indexOf(element);
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

    // Control point handles
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
                    this.editor.svg.appendChild(handle1);
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
                    this.editor.svg.appendChild(handle2);
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

    // Event listeners
    addAnchorDragListeners() {
        // Add global mouse event listeners for anchor and control point dragging
        this.anchorMouseMoveHandler = (e) => {
            if (this.isDraggingAnchor && this.selectedAnchorPoint) {
                const pos = this.editor.getMousePosition(e);
                console.log('Global anchor mousemove:', pos);
                this.updateAnchorPointDragging(pos);
            }
            if (this.isDraggingControl && this.selectedControlPoint) {
                const pos = this.editor.getMousePosition(e);
                console.log('Global control mousemove:', pos);
                this.updateControlPointDragging(pos);
            }
        };

        this.anchorMouseUpHandler = (e) => {
            if (this.isDraggingAnchor) {
                const pos = this.editor.getMousePosition(e);
                console.log('Global anchor mouseup:', pos);
                this.finishAnchorPointDragging(pos);
            }
            if (this.isDraggingControl) {
                const pos = this.editor.getMousePosition(e);
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

    // Utility methods
    getSelectedAnchorPoint() {
        return this.selectedAnchorPoint;
    }

    getSelectedControlPoint() {
        return this.selectedControlPoint;
    }

    getDraggingAnchorState() {
        return this.isDraggingAnchor;
    }

    getDraggingControlState() {
        return this.isDraggingControl;
    }

    // Method to clear anchor point selection when element is deleted
    clearAnchorPointsForElement(element) {
        if (this.selectedAnchorPoint && this.selectedAnchorPoint.element === element) {
            this.selectedAnchorPoint = null;
        }
        if (this.selectedControlPoint && this.selectedControlPoint.element === element) {
            this.selectedControlPoint = null;
        }
    }
}

export { AnchorPointsManager };
