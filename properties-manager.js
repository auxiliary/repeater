export class PropertiesManager {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.selectedElement = null;
        this.currentProperties = {
            stroke: '#000000',
            fill: '#ffffff',
            strokeWidth: '2',
            opacity: 1
        };
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupProperties();
    }

    setupEventListeners() {
        // Listen for property changes
        this.eventBus.on('propertyChanged', ({ property, value }) => {
            this.handlePropertyChange(property, value);
        });

        // Listen for element selection to track the selected element
        this.eventBus.on('elementSelected', (element) => {
            this.selectedElement = element;
        });

        // Listen for selection cleared
        this.eventBus.on('selectionCleared', () => {
            this.selectedElement = null;
        });
    }

    setupProperties() {
        // Stroke width
        const strokeWidthInput = document.getElementById('strokeWidth');
        const strokeWidthValue = document.getElementById('strokeWidthValue');
        if (strokeWidthInput && strokeWidthValue) {
            strokeWidthInput.addEventListener('input', (e) => {
                strokeWidthValue.textContent = e.target.value;
                this.eventBus.emit('propertyChanged', { property: 'stroke-width', value: e.target.value });
            });
        }

        // Opacity
        const opacityInput = document.getElementById('opacity');
        const opacityValue = document.getElementById('opacityValue');
        if (opacityInput && opacityValue) {
            opacityInput.addEventListener('input', (e) => {
                opacityValue.textContent = e.target.value + '%';
                this.eventBus.emit('propertyChanged', { property: 'opacity', value: e.target.value / 100 });
            });
        }

        // Colors
        const strokeColorInput = document.getElementById('strokeColor');
        if (strokeColorInput) {
            strokeColorInput.addEventListener('change', (e) => {
                this.eventBus.emit('propertyChanged', { property: 'stroke', value: e.target.value });
            });
        }

        const fillColorInput = document.getElementById('fillColor');
        if (fillColorInput) {
            fillColorInput.addEventListener('change', (e) => {
                this.eventBus.emit('propertyChanged', { property: 'fill', value: e.target.value });
            });
        }

        // No color buttons
        const noStrokeColorBtn = document.getElementById('noStrokeColor');
        if (noStrokeColorBtn) {
            noStrokeColorBtn.addEventListener('click', () => {
                if (strokeColorInput) {
                    strokeColorInput.value = '#ffffff';
                    this.eventBus.emit('propertyChanged', { property: 'stroke', value: '#ffffff' });
                }
            });
        }

        const noFillColorBtn = document.getElementById('noFillColor');
        if (noFillColorBtn) {
            noFillColorBtn.addEventListener('click', () => {
                if (fillColorInput) {
                    fillColorInput.value = '#ffffff';
                    this.eventBus.emit('propertyChanged', { property: 'fill', value: '#ffffff' });
                }
            });
        }
    }

    handlePropertyChange(property, value) {
        // Update current properties
        if (property === 'stroke-width') {
            this.currentProperties.strokeWidth = value;
        } else if (property === 'opacity') {
            this.currentProperties.opacity = value;
        } else if (property === 'stroke') {
            this.currentProperties.stroke = value;
        } else if (property === 'fill') {
            this.currentProperties.fill = value;
        }

        // Update the selected element if one exists
        if (this.selectedElement) {
            this.updateSelectedElement(this.selectedElement);
        }

        // Emit the property change event for the main editor to handle
        this.eventBus.emit('propertyChanged', { property, value });
    }

    // Method to update a selected element with current properties
    updateSelectedElement(selectedElement) {
        if (!selectedElement) return;
        
        // Handle "none" color values
        if (this.currentProperties.stroke === '#ffffff') {
            selectedElement.setAttribute('stroke', 'none');
        } else {
            selectedElement.setAttribute('stroke', this.currentProperties.stroke);
        }
        
        if (this.currentProperties.fill === '#ffffff') {
            selectedElement.setAttribute('fill', 'none');
        } else {
            selectedElement.setAttribute('fill', this.currentProperties.fill);
        }
        
        selectedElement.setAttribute('stroke-width', this.currentProperties.strokeWidth);
        selectedElement.setAttribute('opacity', this.currentProperties.opacity);
    }

    updatePropertiesPanel(element) {
        if (!element) return;
        
        // Handle "none" color values when displaying in color pickers
        const strokeColor = element.getAttribute('stroke');
        const fillColor = element.getAttribute('fill');
        
        const strokeColorInput = document.getElementById('strokeColor');
        const fillColorInput = document.getElementById('fillColor');
        const strokeWidthInput = document.getElementById('strokeWidth');
        const opacityInput = document.getElementById('opacity');
        const strokeWidthValue = document.getElementById('strokeWidthValue');
        const opacityValue = document.getElementById('opacityValue');
        
        if (strokeColorInput) {
            strokeColorInput.value = strokeColor === 'none' ? '#ffffff' : (strokeColor || '#000000');
        }
        if (fillColorInput) {
            fillColorInput.value = fillColor === 'none' ? '#ffffff' : (fillColor || '#ffffff');
        }
        if (strokeWidthInput) {
            strokeWidthInput.value = element.getAttribute('stroke-width') || '2';
        }
        if (opacityInput) {
            opacityInput.value = (element.getAttribute('opacity') || 1) * 100;
        }
        if (strokeWidthValue) {
            strokeWidthValue.textContent = element.getAttribute('stroke-width') || '2';
        }
        if (opacityValue) {
            opacityValue.textContent = Math.round((element.getAttribute('opacity') || 1) * 100) + '%';
        }

        // Update current properties
        this.currentProperties = {
            stroke: strokeColor === 'none' ? '#ffffff' : (strokeColor || '#000000'),
            fill: fillColor === 'none' ? '#ffffff' : (fillColor || '#ffffff'),
            strokeWidth: element.getAttribute('stroke-width') || '2',
            opacity: element.getAttribute('opacity') || 1
        };
    }

    applyCurrentProperties(element) {
        if (!element) return;

        const strokeColor = this.currentProperties.stroke;
        const fillColor = this.currentProperties.fill;
        const strokeWidth = this.currentProperties.strokeWidth;
        const opacity = this.currentProperties.opacity;

        // Handle "none" color values
        element.setAttribute('stroke', strokeColor === '#ffffff' ? 'none' : strokeColor);
        element.setAttribute('fill', fillColor === '#ffffff' ? 'none' : fillColor);
        element.setAttribute('stroke-width', strokeWidth);
        element.setAttribute('opacity', opacity);
    }

    updateSelectedElementProperty(property, value) {
        // Handle "none" color values
        if (property === 'stroke' || property === 'fill') {
            const colorValue = value === '#ffffff' ? 'none' : value;
            this.eventBus.emit('propertyChanged', { property, value: colorValue });
        } else {
            this.eventBus.emit('propertyChanged', { property, value });
        }
    }

    getCurrentProperties() {
        return { ...this.currentProperties };
    }

    setCurrentProperties(properties) {
        this.currentProperties = { ...this.currentProperties, ...properties };
        
        // Update UI controls to reflect new properties
        const strokeColorInput = document.getElementById('strokeColor');
        const fillColorInput = document.getElementById('fillColor');
        const strokeWidthInput = document.getElementById('strokeWidth');
        const opacityInput = document.getElementById('opacity');
        const strokeWidthValue = document.getElementById('strokeWidthValue');
        const opacityValue = document.getElementById('opacityValue');
        
        if (strokeColorInput) strokeColorInput.value = this.currentProperties.stroke;
        if (fillColorInput) fillColorInput.value = this.currentProperties.fill;
        if (strokeWidthInput) strokeWidthInput.value = this.currentProperties.strokeWidth;
        if (opacityInput) opacityInput.value = this.currentProperties.opacity * 100;
        if (strokeWidthValue) strokeWidthValue.textContent = this.currentProperties.strokeWidth;
        if (opacityValue) opacityValue.textContent = Math.round(this.currentProperties.opacity * 100) + '%';
    }

    resetToDefaults() {
        this.currentProperties = {
            stroke: '#000000',
            fill: '#ffffff',
            strokeWidth: '2',
            opacity: 1
        };
        this.setCurrentProperties(this.currentProperties);
    }
}
