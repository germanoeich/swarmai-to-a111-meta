# SwarmUI to CivitAI Metadata Converter

This Node.js script converts image metadata from SwarmUI format to CivitAI-compatible format.

## Features

- Extracts metadata embedded in images by SwarmUI
- Converts the metadata format to be compatible with CivitAI
- Preserves all important generation parameters
- Properly formats the UserComment EXIF field
- Handles both single images and folders of images

## Requirements

- Node.js 14 or higher
- sharp library (installed automatically with dependencies)

## Installation

1. Clone this repository
2. Run `npm install` to install dependencies

## Usage

```bash
node convert-metadata.js <folder-or-file-path>
```

### Arguments

- `folder-or-file-path`: Path to a JPEG image or folder containing JPEG images

### Examples

Process a single image:
```bash
node convert-metadata.js myimage.jpg
```

Process all images in a folder:
```bash
node convert-metadata.js myfolder
```

### Output

- When processing a single file, the output is saved with "-civitmeta" suffix
- When processing a folder, output images are saved to a "civitmeta" subfolder

## Technical Details

This script uses the Sharp image processing library to:
1. Extract EXIF metadata from the input image
2. Parse and transform the SwarmUI metadata format 
3. Format it according to CivitAI's expected format
4. Write the new metadata back to the image

A debug log is created in `debug.log` during processing. 