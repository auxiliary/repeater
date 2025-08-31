# SVG Vector Editor

A modern, feature-rich SVG vector editor built with vanilla JavaScript, HTML, and CSS. This application provides a comprehensive set of tools for creating and editing vector graphics directly in your browser.

## Features

### 🎨 Drawing Tools
- **Select Tool**: Click to select and edit existing elements
- **Line Tool**: Draw straight lines by clicking and dragging
- **Rectangle Tool**: Create rectangles by clicking and dragging
- **Circle Tool**: Draw circles by clicking and dragging from center
- **Path Tool**: Create custom paths with multiple anchor points

### 🎛️ Properties Panel
- **Stroke Color**: Change the outline color of selected elements
- **Fill Color**: Change the fill color of selected elements
- **Stroke Width**: Adjust the thickness of element outlines (1-20px)
- **Opacity**: Control element transparency (0-100%)

### 📋 Layers Management
- **Layer List**: View all created elements in a hierarchical list
- **Layer Selection**: Click on layers to select corresponding elements
- **Layer Deletion**: Remove elements directly from the layers panel
- **Layer Visibility**: Toggle element visibility (coming soon)

### 💾 File Operations
- **Download SVG**: Export your artwork as an SVG file
- **Clear Canvas**: Remove all elements from the canvas
- **Real-time Preview**: See changes as you draw

### ⌨️ Keyboard Shortcuts
- **Delete/Backspace**: Remove selected element
- **Escape**: Cancel current drawing operation

## Getting Started

1. **Open the Application**: Simply open `index.html` in your web browser
2. **Choose a Tool**: Select from the tools in the left sidebar
3. **Set Properties**: Configure colors, stroke width, and opacity
4. **Start Drawing**: Click and drag on the canvas to create shapes
5. **Edit Elements**: Use the select tool to modify existing elements
6. **Export**: Download your artwork as an SVG file

## How to Use Each Tool

### Select Tool
- Click on any element to select it
- Selected elements show a blue dashed outline
- Use the properties panel to modify selected elements
- Press Delete to remove selected elements

### Line Tool
- Click and drag to draw straight lines
- Release to finish drawing
- Lines are drawn from start point to end point

### Rectangle Tool
- Click and drag to create rectangles
- Drag from any corner to define size
- Rectangles are drawn from the clicked point

### Circle Tool
- Click to set the center point
- Drag to define the radius
- Circles are drawn from the center outward

### Path Tool
- Click to add anchor points
- Each click adds a new point to the path
- Paths are automatically connected with straight lines
- Double-click or press Escape to finish the path

## Technical Details

### Browser Compatibility
- Modern browsers with SVG support
- Chrome, Firefox, Safari, Edge (latest versions)
- No external dependencies required

### File Structure
```
├── index.html          # Main HTML file
├── styles.css          # CSS styles and layout
├── script.js           # JavaScript functionality
└── README.md           # This documentation
```

### SVG Elements Supported
- `<line>` - Straight lines
- `<rect>` - Rectangles
- `<circle>` - Circles
- `<path>` - Custom paths with anchor points

## Customization

### Adding New Tools
To add new drawing tools, extend the `SVGVectorEditor` class:

1. Add a new tool button in the HTML
2. Implement drawing methods in the JavaScript
3. Add the tool to the event handlers

### Styling
The application uses CSS custom properties and modern design patterns. You can customize:
- Color schemes in `styles.css`
- Layout dimensions and spacing
- Animation effects and transitions
- Responsive breakpoints

## Future Enhancements

- **More Shapes**: Ellipses, polygons, stars
- **Text Tool**: Add and edit text elements
- **Transform Tools**: Rotate, scale, and skew elements
- **Gradients**: Apply gradient fills and strokes
- **Undo/Redo**: History management
- **Grouping**: Group multiple elements
- **Export Options**: PNG, JPG, PDF formats
- **Templates**: Pre-made design templates

## Contributing

This is a learning project that demonstrates modern web development techniques. Feel free to:
- Fork the repository
- Add new features
- Improve the UI/UX
- Fix bugs
- Add documentation

## License

This project is open source and available under the MIT License.

---

**Happy Vector Editing! 🎨**
