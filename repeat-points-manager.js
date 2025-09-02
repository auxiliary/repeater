import { LineShape, RectangleShape, CircleShape, PathShape } from './shapes.js';

class RepeatPointsManager {
    constructor(editor, overlay, eventBus) {
        this.editor = editor;
        this.overlay = overlay;
        this.eventBus = eventBus;
        this.repeatPoints = [];
        this.selectedRepeatPoint = null;
    }

    // Core repeat point methods
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

    getRepeatMeta(element) {
        if (!element.__repeatMeta) {
            element.__repeatMeta = { count: 0, points: [], activeIndex: null };
        }
        return element.__repeatMeta;
    }

    // Visual rendering
    renderRepeatPoints(element) {
        this.clearRepeatPoints();
        if (!element || !element.__repeatMeta || element.__repeatMeta.points.length === 0) return;
        
        const meta = element.__repeatMeta;
        const elementId = this.editor.elements.indexOf(element);
        
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

    // Cloning operations
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
        
        clones.forEach(node => this.editor.svg.appendChild(node));
        clones.forEach(node => this.editor.elements.push(node));
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

    // UI handling
    handleCreateRepeatPoints() {
        if (!this.editor.selectionManager.getSelectedElement()) {
            this.editor.showMessage('Select a line or path to create repeat points', 'error');
            return;
        }
        
        const tag = this.editor.selectionManager.getSelectedElement().tagName.toLowerCase();
        if (!(tag === 'line' || tag === 'path')) {
            this.editor.showMessage('Repeat points currently supported for line and path', 'error');
            return;
        }
        
        const count = Math.max(1, Math.min(500, parseInt(document.getElementById('repeatCount').value, 10) || 10));
        this.createOrUpdateRepeatPoints(this.editor.selectionManager.getSelectedElement(), count);
        this.renderRepeatPoints(this.editor.selectionManager.getSelectedElement());
        this.eventBus.emit('statusUpdate', `Created ${count} repeat points`);
    }

    // Utility methods
    getSelectedRepeatPoint() {
        return this.selectedRepeatPoint;
    }

    clearSelectedRepeatPoint() {
        this.selectedRepeatPoint = null;
    }

    // Method to clear repeat points when element is deleted
    clearRepeatPointsForElement(element) {
        if (this.selectedRepeatPoint && this.selectedRepeatPoint.element === element) {
            this.selectedRepeatPoint = null;
        }
    }
}

export { RepeatPointsManager };
