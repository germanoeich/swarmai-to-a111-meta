const fs = require('fs');
const path = require('path');
const { ExifIFD } = require('piexifjs');
const piexif = require('piexifjs');

// Cache file path and in-memory cache object
const CACHE_FILE = 'hash_cache.json';
let hashCache = {};

// Create a debug log file
const debugLog = fs.createWriteStream('debug.log', { flags: 'w' });
function log(message) {
  debugLog.write(message + '\n');
  console.log(message);
}

// Load cache from file
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf8');
      hashCache = JSON.parse(data);
      log(`Loaded ${Object.keys(hashCache).length} entries from ${CACHE_FILE}`);
    } else {
      log('Cache file not found, starting with empty cache.');
      hashCache = {};
    }
  } catch (error) {
    log(`Error loading cache: ${error.message}. Starting with empty cache.`);
    hashCache = {};
  }
}

// Save cache to file
function saveCache() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(hashCache, null, 2));
    //log(`Saved ${Object.keys(hashCache).length} entries to ${CACHE_FILE}`); // Reduce log noise
  } catch (error) {
    log(`Error saving cache: ${error.message}`);
  }
}

// Print help message
function printHelp() {
  const helpMessage = `
SwarmUI to CivitAI Metadata Converter

Usage: node convert-metadata.js <folder-or-file-path>

Arguments:
  folder-or-file-path    Path to a JPEG image or folder containing JPEG images

Description:
  This script converts SwarmUI metadata format to CivitAI-compatible metadata format.
  If a folder is provided, all JPEG images in the folder will be processed.
  Output images will be saved to a 'civitmeta' subfolder or with '-civitmeta' suffix.
  `;
  console.log(helpMessage);
}

// Sampler name mapping
const samplerMap = {
  "dpmpp_2m": "DPM++ 2M",
  "euler_a": "Euler a",
  "ddim": "DDIM",
  "k_dpm_2_a": "DPM2 a",
  "k_dpm_2": "DPM2",
  "k_dpmpp_2_a": "DPM++ 2M a",
  "k_dpmpp_2": "DPM++ 2M",
  undefined: "Euler",
  // Add more mappings if needed based on your use cases
};

// --- Civitai API Lookup Function ---
async function getCivitaiModelInfoByHash(blake3Hash, context = 'model') {
  if (!blake3Hash || typeof blake3Hash !== 'string') {
    log(`[API] Invalid hash provided for ${context}: ${blake3Hash}`);
    return shortenHash(blake3Hash); // Return fallback
  }

  const upperBlake3Hash = blake3Hash.toUpperCase(); // Ensure consistent casing for cache keys

  // 1. Check cache first
  if (hashCache[upperBlake3Hash]) {
    //log(`[Cache] Found AutoV2 hash for ${context} (${upperBlake3Hash.substring(0,10)}...)`);
    return hashCache[upperBlake3Hash];
  }

  log(`[API] Cache miss for ${context} hash: ${upperBlake3Hash}. Querying Civitai...`);
  const apiUrl = `https://civitai.com/api/v1/model-versions/by-hash/${upperBlake3Hash.substring(0, 12)}`;
  let autoV2Hash = 'unknown'; // Default if not found

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000 // 15 second timeout
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.files && data.files.length > 0 && data.files[0].hashes && data.files[0].hashes.AutoV2) {
        autoV2Hash = data.files[0].hashes.AutoV2.toUpperCase(); // Standardize case
        log(`[API] Success: Found AutoV2 hash ${autoV2Hash} for ${context} (${upperBlake3Hash.substring(0, 12)}...)`);
        hashCache[upperBlake3Hash] = autoV2Hash; // Store successful lookup in cache
      } else {
        log(`[API] Warning: Hash ${upperBlake3Hash.substring(0, 12)}... found for ${context}, but no AutoV2 hash in response files.`);
        hashCache[upperBlake3Hash] = 'not_found'; // Cache that it wasn't found on Civitai with AutoV2
        autoV2Hash = 'not_found'; // Indicate not found vs error
      }
    } else if (response.status === 404) {
      log(`[API] Info: Hash ${upperBlake3Hash.substring(0, 12)}... not found on Civitai for ${context} (404).`);
      hashCache[upperBlake3Hash] = 'not_found'; // Cache not found
      autoV2Hash = 'not_found';
    }
    else {
      log(`[API] Error: Failed to fetch model info for hash ${upperBlake3Hash.substring(0, 12)}... (${context}). Status: ${response.status} ${response.statusText}`);
      // Don't cache errors, allow retry later. Return shortened Blake3 as fallback.
      autoV2Hash = shortenHash(upperBlake3Hash);
    }
  } catch (error) {
    log(`[API] Network/Fetch Error for hash ${upperBlake3Hash.substring(0, 12)}... (${context}): ${error.message}`);
    // Don't cache errors, allow retry later. Return shortened Blake3 as fallback.
    autoV2Hash = shortenHash(upperBlake3Hash);
  }

  // Optional: Add a small delay to avoid hitting rate limits if processing many new hashes
  // await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay

  return autoV2Hash;
}

// Shorten hash to first 10 characters for consistency with target format
function shortenHash(hash) {
  if (!hash || hash === null) return "unknown";
  return hash.startsWith("0x") ? hash.slice(2, 14) : hash.slice(0, 12);
}

// Clean and parse UserComment data
function cleanUserComment(rawData) {
  if (!rawData) {
    log('Raw data is null or undefined');
    return null;
  }

  try {
    // Convert the raw data to a string, handling potential encodings
    let cleaned = '';

    // Remove UNICODE prefix if present (common in piexifjs UserComment)
    if (typeof rawData === 'string') {
      cleaned = rawData;
      if (cleaned.startsWith('UNICODE')) {
        cleaned = cleaned.substring(8); // Remove 'UNICODE' + 2 null bytes
      }
    } else {
      // Handle Buffer or array data
      cleaned = rawData.toString();
    }

    // Find valid JSON in the string
    let jsonStart = cleaned.indexOf('{');
    let jsonEnd = cleaned.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd === -1) {
      log('No valid JSON structure found');
      return null;
    }

    // Extract the JSON portion
    let jsonStr = cleaned.substring(jsonStart, jsonEnd + 1);
    log('Extracted JSON length: ' + jsonStr.length);

    // Remove any invalid characters that might break JSON parsing
    jsonStr = jsonStr.replace(/[\x00-\x1F\x7F-\x9F]/g, '')
      .replace(/\\n/g, ' ')  // Replace escaped newlines with space
      .replace(/\s+/g, ' ');  // Normalize whitespace

    // Test if it's valid JSON
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid JSON structure');
    }

    return jsonStr;
  } catch (error) {
    log('Error processing UserComment: ' + error.message);
    return null;
  }
}

// Process a single image
async function processImage(inputPath, outputPath) {
  log(`Processing ${inputPath} -> ${outputPath}`);

  try {
    // Read image as buffer first, then convert to binary string for piexif
    const jpegBuffer = fs.readFileSync(inputPath);
    const jpegData = jpegBuffer.toString('binary');

    // Extract EXIF data
    let exifData;
    try {
      exifData = piexif.load(jpegData);
      log('Successfully loaded EXIF data');
    } catch (err) {
      log(`Error loading EXIF data: ${err.message}`);
      return false;
    }

    // Extract UserComment from EXIF
    const userCommentTag = piexif.ExifIFD.UserComment;
    const rawUserComment = exifData["Exif"][userCommentTag];

    if (!rawUserComment) {
      log('No UserComment found in EXIF data');
      return false;
    }

    log(`Raw UserComment found: ${rawUserComment.length} bytes`);

    // Clean and parse the UserComment data
    const userComment = cleanUserComment(rawUserComment);

    if (!userComment) {
      log('Failed to parse UserComment');
      return false;
    }

    // Parse the JSON metadata
    const parsedMetadata = JSON.parse(userComment);
    log('Successfully parsed metadata JSON');

    // Extract required fields
    const params = parsedMetadata.sui_image_params;
    const models = parsedMetadata.sui_models;

    if (!params || !models) {
      log('Missing required metadata fields');
      return false;
    }

    // Extract required fields
    const prompt = params.prompt; // Using positive prompt only
    const steps = params.steps;
    const sampler = samplerMap[params.sampler] || params.sampler;
    const scheduler = params.scheduler || "Normal";
    const cfgscale = params.cfgscale;
    const seed = params.seed;
    const size = `${params.width}x${params.height}`;
    const modelName = params.model;
    const swarmVersion = params.swarm_version;
    const negativePrompt = params.negativeprompt;

    // Get main model hash
    const mainModel = models.find(m => m.param === "model");
    const modelHash = mainModel ? shortenHash(mainModel.hash) : "unknown";

    const mainModelBlake3Hash = mainModel ? mainModel.hash : null;
    let modelAutoV2Hash = 'unknown'; // Default CivitAI (AutoV2) hash
    if (mainModelBlake3Hash) {
      modelAutoV2Hash = await getCivitaiModelInfoByHash(mainModelBlake3Hash.replace('0x', '').substring(0, 12), `model: ${modelName}`);
    } else {
      log(`Could not find main model hash in metadata for ${path.basename(inputPath)}.`);
    }

    // Handle LoRAs if present
    const loras = params.loras || [];
    const loraWeights = params.loraweights || [];
    const loraModels = models.filter(m => m.param === "loras");
    const lorasStr = loras.length > 0
      ? loras.map((lora, i) => `${lora}:${loraWeights[i] || 1.0}`).join(',')
      : '';

    // Construct Hashes object
    const hashes = { "model": modelHash };
    loraModels.forEach(m => {
      const loraName = m.name.split('.')[0]; // Remove extension
      hashes[loraName] = shortenHash(m.hash);
    });
    const hashesStr = JSON.stringify(hashes);

    // Build target UserComment string with simpler formatting
    let targetUserComment = prompt.replace(/\n/g, ' ').trim() + '\x0A';
    targetUserComment += `Negative prompt: ${negativePrompt.replace(/\n/g, ' ').trim().replace(/\,$/mg, '')}\x0A`;
    targetUserComment += `Steps: ${steps}, `;
    targetUserComment += `Sampler: ${sampler}, `;
    targetUserComment += `Schedule type: ${scheduler}, `;
    targetUserComment += `CFG scale: ${cfgscale}, `;
    targetUserComment += `Seed: ${seed}, `;
    targetUserComment += `Size: ${size}, `;
    targetUserComment += `Model hash: ${modelHash}, `;
    targetUserComment += `Model: ${modelName}, `;
    targetUserComment += `Version: ${swarmVersion}`;
    // targetUserComment += `Version: f1.7.0-v1.10.1RC-latest-2161-ge97d9881`;

    if (lorasStr) {
      targetUserComment += `, Loras: ${lorasStr}`;
    }
    targetUserComment += `, Hashes: ${hashesStr}`;

    // Format UserComment according to EXIF standard (UNICODE + UTF-16LE)
    const code = Buffer.from([0x55, 0x4E, 0x49, 0x43, 0x4F, 0x44, 0x45, 0x00, 0x00]);
    const commentBuffer = Buffer.from(targetUserComment, 'utf16le');
    const userCommentValue = Buffer.concat([code, commentBuffer]);
    log(`Constructed UserComment buffer: ${userCommentValue.length} bytes`);
    log(`Constructed UserComment buffer starts with: ${userCommentValue.slice(0, 16).toString('hex')}`); // Log first few bytes

    // Convert the buffer to a binary string for piexifjs
    const userCommentBinaryString = userCommentValue.toString('binary');
    log(`Converted UserComment to binary string (length ${userCommentBinaryString.length})`);

    // Update EXIF data with new UserComment buffer
    exifData["Exif"][userCommentTag] = userCommentBinaryString;

    piexif.TAGS.Exif[ExifIFD.UserComment] = {
      'name': 'UserComment',
      'type': 'Undefined'
    }
    // Convert EXIF data back to binary string
    const exifBinary = piexif.dump(exifData);

    // Insert EXIF data into JPEG binary string
    const newJpegBinary = piexif.insert(exifBinary, jpegData);

    // Write new JPEG file from the binary string
    fs.writeFileSync(outputPath, Buffer.from(newJpegBinary, 'binary'));

    log(`Successfully processed image: ${outputPath}`);
    return true;
  } catch (error) {
    log(`Error processing image: ${error.message}`);
    return false;
  }
}

// Main function to handle input
function main() {
  const inputPath = process.argv[2];

  // Check for help flags
  if (!inputPath || inputPath === '--help' || inputPath === '-h') {
    printHelp();
    return;
  }

  loadCache();

  try {
    const stats = fs.statSync(inputPath);

    if (stats.isDirectory()) {
      // Process all JPEG files in the folder
      const outputDir = path.join(inputPath, 'civitmeta');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
        log(`Created output directory: ${outputDir}`);
      }

      const files = fs.readdirSync(inputPath)
        .filter(f => f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.jpeg'));

      if (files.length === 0) {
        log(`No JPEG files found in ${inputPath}`);
        return;
      }

      log(`Found ${files.length} JPEG files to process`);
      let processedCount = 0;

      for (const file of files) {
        const inputFile = path.join(inputPath, file);
        const outputFile = path.join(outputDir, file);
        const success = processImage(inputFile, outputFile);
        if (success) {
          processedCount++;
          saveCache();
        }
      }

      log(`Processed ${processedCount} of ${files.length} files successfully`);

    } else if (stats.isFile() && (inputPath.toLowerCase().endsWith('.jpg') || inputPath.toLowerCase().endsWith('.jpeg'))) {
      // Process a single file
      const ext = path.extname(inputPath);
      const base = path.basename(inputPath, ext);
      const outputFile = path.join(path.dirname(inputPath), `${base}-civitmeta${ext}`);
      const success = processImage(inputPath, outputFile);

      if (success) {
        log(`Successfully processed ${inputPath} to ${outputFile}`);
        saveCache();
      } else {
        log(`Failed to process ${inputPath}`);
      }
    } else {
      log("Please provide a valid JPEG file or a folder containing JPEG files.");
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      log(`File or directory not found: ${inputPath}`);
    } else {
      throw error;
    }
  } finally {
    saveCache();
    log("Cache saved. Closing debug log.");
    debugLog.end();
  }
}

main();