#!/bin/bash
# Create simple placeholder icons using ImageMagick (if available) or copy from ClawdGotchi

# Try to use ImageMagick to create simple icons
if command -v convert &> /dev/null; then
    # Create a simple moon icon using ImageMagick
    convert -size 16x16 xc:transparent -fill black -draw "circle 8,8 8,3" menubar-iconTemplate.png
    convert -size 32x32 xc:transparent -fill black -draw "circle 16,16 16,6" menubar-iconTemplate@2x.png
    echo "Created icons with ImageMagick"
else
    # Fallback: copy from ClawdGotchi if available

        echo "Warning: Could not create icons. ImageMagick not found and ClawdGotchi icons not available."
        echo "Please manually create menubar-iconTemplate.png (16x16) and menubar-iconTemplate@2x.png (32x32)"
    fi
fi
