#!/bin/bash
echo "Installing Node modules..."
npm install
if [ $? -eq 0 ]; then
    echo ""
    echo "Installation completed successfully!"
else
    echo ""
    echo "Installation failed. Please check the errors above."
    exit 1
fi
