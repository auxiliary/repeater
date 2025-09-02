// Abstract base class for all geometric shapes
class Shape {
    constructor(svgElement, attributes = {}) {
        this.svgElement = svgElement;
        this.applyAttributes(attributes);
    }

    applyAttributes(attributes) {
        Object.entries(attributes).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                this.svgElement.setAttribute(key, value);
            }
        });
    }

    getElement() {
        return this.svgElement;
    }

    // Abstract methods to be implemented by subclasses
    updateGeometry(pos) {
        throw new Error('updateGeometry must be implemented by subclass');
    }

    getReferencePoint() {
        throw new Error('getReferencePoint must be implemented by subclass');
    }

    move(dx, dy) {
        throw new Error('move must be implemented by subclass');
    }

    clone() {
        throw new Error('clone must be implemented by subclass');
    }
}

// Concrete Shape Classes
class LineShape extends Shape {
    constructor(svgElement, attributes = {}) {
        super(svgElement, attributes);
    }

    updateGeometry(pos) {
        // This would be used for dynamic updates
    }

    getReferencePoint() {
        return {
            x: parseFloat(this.svgElement.getAttribute('x1')),
            y: parseFloat(this.svgElement.getAttribute('y1'))
        };
    }

    move(dx, dy) {
        const x1 = parseFloat(this.svgElement.getAttribute('x1')) + dx;
        const y1 = parseFloat(this.svgElement.getAttribute('y1')) + dy;
        const x2 = parseFloat(this.svgElement.getAttribute('x2')) + dx;
        const y2 = parseFloat(this.svgElement.getAttribute('y2')) + dy;
        
        this.svgElement.setAttribute('x1', x1);
        this.svgElement.setAttribute('y1', y1);
        this.svgElement.setAttribute('x2', x2);
        this.svgElement.setAttribute('y2', y2);
    }

    clone() {
        const clone = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        ['stroke', 'fill', 'stroke-width', 'opacity'].forEach(attr => {
            const value = this.svgElement.getAttribute(attr);
            if (value !== null) clone.setAttribute(attr, value);
        });
        
        clone.setAttribute('x1', this.svgElement.getAttribute('x1'));
        clone.setAttribute('y1', this.svgElement.getAttribute('y1'));
        clone.setAttribute('x2', this.svgElement.getAttribute('x2'));
        clone.setAttribute('y2', this.svgElement.getAttribute('y2'));
        
        return clone;
    }
}

class RectangleShape extends Shape {
    constructor(svgElement, attributes = {}) {
        super(svgElement, attributes);
    }

    updateGeometry(pos) {
        // This would be used for dynamic updates
    }

    getReferencePoint() {
        return {
            x: parseFloat(this.svgElement.getAttribute('x')),
            y: parseFloat(this.svgElement.getAttribute('y'))
        };
    }

    move(dx, dy) {
        const x = parseFloat(this.svgElement.getAttribute('x')) + dx;
        const y = parseFloat(this.svgElement.getAttribute('y')) + dy;
        
        this.svgElement.setAttribute('x', x);
        this.svgElement.setAttribute('y', y);
    }

    clone() {
        const clone = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        ['stroke', 'fill', 'stroke-width', 'opacity', 'width', 'height'].forEach(attr => {
            const value = this.svgElement.getAttribute(attr);
            if (value !== null) clone.setAttribute(attr, value);
        });
        
        clone.setAttribute('x', this.svgElement.getAttribute('x'));
        clone.setAttribute('y', this.svgElement.getAttribute('y'));
        
        return clone;
    }
}

class CircleShape extends Shape {
    constructor(svgElement, attributes = {}) {
        super(svgElement, attributes);
    }

    updateGeometry(pos) {
        // This would be used for dynamic updates
    }

    getReferencePoint() {
        return {
            x: parseFloat(this.svgElement.getAttribute('cx')),
            y: parseFloat(this.svgElement.getAttribute('cy'))
        };
    }

    move(dx, dy) {
        const cx = parseFloat(this.svgElement.getAttribute('cx')) + dx;
        const cy = parseFloat(this.svgElement.getAttribute('cy')) + dy;
        
        this.svgElement.setAttribute('cx', cx);
        this.svgElement.setAttribute('cy', cy);
    }

    clone() {
        const clone = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ['stroke', 'fill', 'stroke-width', 'opacity', 'r'].forEach(attr => {
            const value = this.svgElement.getAttribute(attr);
            if (value !== null) clone.setAttribute(attr, value);
        });
        
        clone.setAttribute('cx', this.svgElement.getAttribute('cx'));
        clone.setAttribute('cy', this.svgElement.getAttribute('cy'));
        
        return clone;
    }
}

class PathShape extends Shape {
    constructor(svgElement, attributes = {}) {
        super(svgElement, attributes);
    }

    updateGeometry(pos) {
        // This would be used for dynamic updates
    }

    getReferencePoint() {
        const d = this.svgElement.getAttribute('d');
        const m = d && d.match(/M\s*([-\d.]+)\s+([-\d.]+)/);
        if (m) return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
        return null;
    }

    move(dx, dy) {
        const d = this.svgElement.getAttribute('d');
        const commands = d.match(/[MLC]\s*([^MLC]+)/g) || [];
        
        if (commands.length === 0) return;
        
        let firstPoint = null;
        if (commands[0].startsWith('M')) {
            firstPoint = commands[0].match(/M\s*([-\d.]+)\s+([-\d.]+)/);
        }
        if (!firstPoint) return;
        
        const offsetX = dx;
        const offsetY = dy;
        
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
        
        this.svgElement.setAttribute('d', newCommands.join(' '));
    }

    clone() {
        const clone = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        ['stroke', 'fill', 'stroke-width', 'opacity'].forEach(attr => {
            const value = this.svgElement.getAttribute(attr);
            if (value !== null) clone.setAttribute(attr, value);
        });
        
        clone.setAttribute('d', this.svgElement.getAttribute('d'));
        
        return clone;
    }
}

export { Shape, LineShape, RectangleShape, CircleShape, PathShape };