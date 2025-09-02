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

export { ZoomPanManager };