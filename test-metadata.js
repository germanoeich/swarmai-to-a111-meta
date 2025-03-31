const fs = require('fs');
const path = require('path');

// Test data with newlines and whitespace
const testData = `{  "sui_image_params": {    "prompt": "1girl, fire elemental, pale skin, fire tattoo, long fiery hair, fiery aura, exposed belly, revealing clothes, sexy, large breasts, smirk, adult,\nmulticolored hair, gradient hair, two-tone hair, hair ornament, too many hair ornaments, hairpins, (mismatched legwear, asymmetrical legwear), dynamic pose, action pose, thick fiery tail, covered nipples, navel, crawling towards viewer, movement, feline ears,\nmasterpiece,best quality, absurdres, amazing quality,  intricate, highly detailed, majestic, shallow depth of field, movie still, circular polarizer, light particles, particles, volumetric light, 748cmstyle",    "negativeprompt": "sketch, monochrome, greyscale, lowres, (bad), bad anatomy, text, error, fewer, extra, missing, cropped, worst quality, jpeg artifacts, low quality, signature, watermark, username, artist name, blurry, extra limb, missing limb, (mutation, mutated), disconnected, unfinished, ugly, disgusting, displeasing, amputation, extra digits, artistic error, backpack",    "model": "Prefect_illustrious_XL_-_v1-0",    "seed": 1173334047,    "steps": 26,    "cfgscale": 5.5,    "aspectratio": "2:3",    "width": 832,    "height": 1216,    "sampler": "dpmpp_2m",    "scheduler": "karras",    "initimagecreativity": 0.0,    "maskblur": 4,    "refinercontrolpercentage": 0.2,    "refinersteps": 40,    "refinermethod": "PostApply",    "refinerupscale": 2.0,    "refinerupscalemethod": "pixel-lanczos",    "automaticvae": true,    "loras": [      "748cmSDXL",      "Enchanting_Eyes_-Detailed_Eyes-_-_Illustrious",      "NoobAI-XL_Detailer_-_EPS1-1_v1-0"    ],    "loraweights": [      "0.7",      "1",      "1.5"    ],    "swarm_version": "0.9.5.2"  },  "sui_extra_data": {    "date": "2025-03-26",    "original_prompt": "1girl, fire elemental, pale skin, fire tattoo, long fiery hair, fiery aura, exposed belly, revealing clothes, sexy, large breasts, smirk, adult,\nmulticolored hair, gradient hair, two-tone hair, hair ornament, too many hair ornaments, hairpins, (mismatched legwear, asymmetrical legwear), dynamic pose, action pose, thick fiery tail, covered nipples, navel, crawling towards viewer, movement, feline ears,\nmasterpiece,best quality, absurdres, amazing quality,  intricate, highly detailed, majestic, shallow depth of field, movie still, circular polarizer, light particles, particles, volumetric light, <trigger>",    "prep_time": "0.00 sec",    "generation_time": "64.56 sec"  },  "sui_models": [    {      "name": "Prefect_illustrious_XL_-_v1-0.safetensors",      "param": "model",      "hash": null    },    {      "name": "748cmSDXL.safetensors",      "param": "loras",      "hash": "0xa4f81ec6c80bead5b00e819896c0ef9c017490e89cfdce572b893423ee40e88c"    }  ]}`;

function cleanUserComment(rawData) {
    // Remove UNICODE and extra whitespace
    let cleaned = rawData.replace('UNICODE', '')
        .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
        .replace(/\n/g, ' ')   // Replace newlines with space
        .trim();              // Remove leading/trailing whitespace
    
    // Ensure the string starts with { and ends with }
    if (!cleaned.startsWith('{')) {
        cleaned = cleaned.substring(cleaned.indexOf('{'));
    }
    if (!cleaned.endsWith('}')) {
        cleaned = cleaned.substring(0, cleaned.lastIndexOf('}') + 1);
    }
    
    return cleaned;
}

function testMetadataParsing() {
    try {
        const cleanedData = cleanUserComment(testData);
        const parsed = JSON.parse(cleanedData);
        
        // Validate the parsed data
        if (parsed.sui_image_params && 
            parsed.sui_image_params.prompt && 
            parsed.sui_image_params.model) {
            console.log('✅ Test passed! Successfully parsed metadata');
            console.log('Model:', parsed.sui_image_params.model);
            console.log('Prompt:', parsed.sui_image_params.prompt);
        } else {
            console.log('❌ Test failed! Missing required fields');
        }
    } catch (error) {
        console.log('❌ Test failed! Error parsing JSON:', error.message);
    }
}

testMetadataParsing(); 