let currentMeal = [];
let currentProduct = null;
let html5QrCode = null;
let currentFacingMode = "environment"; 
let isTorchOn = false;
let cameraDevices = [];
let currentDeviceIndex = 0;

// DOM Elements
const reader = document.getElementById('reader');
const scannerSection = document.getElementById('scanner-section');
const productDetails = document.getElementById('product-details');
const mealList = document.getElementById('meal-list');
const totalCaloriesEl = document.getElementById('totalCalories');
const totalProteinEl = document.getElementById('totalProtein');
const toast = document.getElementById('toast');

// Initialize Scanner
async function startScanner() {
    try {
        if (!window.Html5Qrcode) {
            throw new Error("Scanner library not loaded. Check connection.");
        }

        if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");
        
        const config = { 
            fps: 30,
            qrbox: (viewWidth, viewHeight) => {
                const minEdge = Math.min(viewWidth, viewHeight);
                return { width: Math.floor(minEdge * 0.9), height: Math.floor(minEdge * 0.5) };
            },
            aspectRatio: 1.0,
            experimentalFeatures: {
                useBarCodeDetectorIfSupported: true
            }
        };

        const formatsToSupport = [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.QR_CODE
        ];

        showToast("Accessing High-Res Camera...");
        
        // Correct configuration with supported formats
        const fullConfig = {
            ...config,
            formatsToSupport: formatsToSupport
        };

        await html5QrCode.start(
            { facingMode: "environment" },
            fullConfig,
            onScanSuccess,
            onScanFailure
        );
        
        document.getElementById('camera-overlay').classList.add('hidden');
        showToast("Camera Active!");

    } catch (err) {
        console.error("Scanner Error:", err);
        const log = document.getElementById('debug-log');
        log.textContent = "Error: " + err.message;
        log.style.display = "block";
        showToast("Camera failed. Use search bar!");
    }
}

function onScanSuccess(decodedText, decodedResult) {
    console.log(`Scan Result: ${decodedText}`);
    playBeep();
    if (html5QrCode && html5QrCode.getState() === 2) { // 2 is SCANNING
        html5QrCode.pause();
    }
    fetchProductData(decodedText);
}

function playBeep() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {}
}

function onScanFailure(error) {}

// API Integration
async function fetchProductData(barcode) {
    const savedData = localStorage.getItem(`prod_${barcode}`);
    if (savedData) {
        showToast("Loading saved data...");
        displayProductDetails(JSON.parse(savedData), true);
        return;
    }

    showToast("Searching product...");
    try {
        const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
        const data = await response.json();

        if (data.status === 1) {
            displayProductDetails(data.product);
        } else {
            showToast("Not found. Enter manually.");
            promptManualNutrition(barcode);
        }
    } catch (error) {
        showToast("API Error. Use search bar.");
        if (html5QrCode && html5QrCode.getState() === 3) { // 3 is PAUSED
            html5QrCode.resume();
        }
    }
}

// Search Logic
document.getElementById('top-search-btn').addEventListener('click', () => {
    const query = document.getElementById('top-search').value;
    if (query) searchProductByName(query);
});

document.getElementById('top-search').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const query = document.getElementById('top-search').value;
        if (query) searchProductByName(query);
    }
});

async function searchProductByName(passedQuery) {
    const query = passedQuery || prompt("Enter Product Name:");
    if (!query) return;

    showToast("Searching...");
    try {
        const response = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1`);
        const data = await response.json();

        if (data.products && data.products.length > 0) {
            // Check if scanning was active and pause it
            if (html5QrCode && html5QrCode.getState() === 2) { // 2 is SCANNING
                html5QrCode.pause();
            }
            displayProductDetails(data.products[0]);
        } else {
            showToast("No products found.");
            if (html5QrCode && html5QrCode.getState() === 3) { // 3 is PAUSED
                html5QrCode.resume();
            }
        }
    } catch (error) {
        showToast("Search failed.");
        if (html5QrCode && html5QrCode.getState() === 3) { // 3 is PAUSED
            html5QrCode.resume();
        }
    }
}

function promptManualNutrition(barcode) {
    const name = prompt("Product Name:", "Unknown Product");
    if (!name) {
        if(html5QrCode && html5QrCode.getState() === 3) html5QrCode.resume();
        return;
    }
    displayProductDetails({
        product_name: name,
        nutriments: { 'energy-kcal_100g': 0, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 0 },
        code: barcode || 'manual'
    });
}

function displayProductDetails(product, isManual = false) {
    currentProduct = {
        name: product.product_name || product.name || "Unknown Product",
        calories: isManual ? product.calories : (product.nutriments['energy-kcal_100g'] || 0),
        protein: isManual ? product.protein : (product.nutriments.proteins_100g || 0),
        carbs: isManual ? product.carbs : (product.nutriments.carbohydrates_100g || 0),
        fat: isManual ? product.fat : (product.nutriments.fat_100g || 0),
        barcode: product.code || product.barcode
    };

    document.getElementById('productName').textContent = currentProduct.name;
    document.getElementById('prodCal').value = currentProduct.calories;
    document.getElementById('prodProtein').value = currentProduct.protein;
    document.getElementById('prodCarbs').value = currentProduct.carbs;
    document.getElementById('prodFat').value = currentProduct.fat;
    document.getElementById('prodWeight').value = 100;

    scannerSection.classList.remove('active');
    scannerSection.classList.add('hidden');
    productDetails.classList.remove('hidden');
}

// Meal Logic
function addToMeal() {
    const weight = parseFloat(document.getElementById('prodWeight').value) || 100;
    const ratio = weight / 100;

    const editedProduct = {
        ...currentProduct,
        calories: parseFloat(document.getElementById('prodCal').value),
        protein: parseFloat(document.getElementById('prodProtein').value),
        carbs: parseFloat(document.getElementById('prodCarbs').value),
        fat: parseFloat(document.getElementById('prodFat').value)
    };

    if (editedProduct.barcode) {
        localStorage.setItem(`prod_${editedProduct.barcode}`, JSON.stringify(editedProduct));
    }

    const mealItem = {
        ...editedProduct,
        id: Date.now(),
        weight: weight,
        calcCalories: Math.round(editedProduct.calories * ratio),
        calcProtein: (editedProduct.protein * ratio).toFixed(1),
        calcCarbs: (editedProduct.carbs * ratio).toFixed(1),
        calcFat: (editedProduct.fat * ratio).toFixed(1)
    };

    currentMeal.push(mealItem);
    updateMealUI();
    closeProductDetails();
    showToast("Added to meal!");
}

function updateMealUI() {
    mealList.innerHTML = '';
    
    if (currentMeal.length === 0) {
        mealList.innerHTML = `<div class="empty-state"><p>No items added yet. Scan a product to start!</p></div>`;
        totalCaloriesEl.textContent = '0';
        totalProteinEl.textContent = '0g';
        return;
    }

    let totalCal = 0;
    let totalProt = 0;

    currentMeal.forEach(item => {
        totalCal += parseFloat(item.calcCalories);
        totalProt += parseFloat(item.calcProtein);

        const div = document.createElement('div');
        div.className = 'meal-item';
        div.innerHTML = `
            <div class="item-info">
                <h4>${item.name}</h4>
                <p>${item.calcProtein}g P • ${item.calcCarbs}g C • ${item.calcFat}g F</p>
            </div>
            <div class="item-stats">
                <span class="cal">${item.calcCalories} kcal</span>
                <span class="weight">${item.weight}g</span>
            </div>
        `;
        mealList.appendChild(div);
    });

    totalCaloriesEl.textContent = Math.round(totalCal);
    totalProteinEl.textContent = totalProt.toFixed(1) + 'g';
}

function closeProductDetails() {
    productDetails.classList.add('hidden');
    scannerSection.classList.remove('hidden');
    scannerSection.classList.add('active');
    if (html5QrCode && html5QrCode.getState() === 3) { // 3 is PAUSED
        html5QrCode.resume();
    }
}

function clearMeal() {
    if (confirm("Clear your current meal?")) {
        currentMeal = [];
        updateMealUI();
        // Update totals immediately
        totalCaloriesEl.textContent = '0';
        totalProteinEl.textContent = '0g';
    }
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// Navigation and Camera Controls
document.getElementById('navScan').addEventListener('click', () => {
    document.getElementById('navScan').classList.add('active');
    document.getElementById('navMeal').classList.remove('active');
    scannerSection.scrollIntoView({ behavior: 'smooth' });
});

document.getElementById('navMeal').addEventListener('click', () => {
    document.getElementById('navMeal').classList.add('active');
    document.getElementById('navScan').classList.remove('active');
    document.getElementById('meal-builder').scrollIntoView({ behavior: 'smooth' });
});

document.getElementById('add-to-meal').addEventListener('click', addToMeal);
document.getElementById('close-details').addEventListener('click', closeProductDetails);
document.getElementById('clear-meal').addEventListener('click', clearMeal);

document.getElementById('manual-btn').addEventListener('click', () => {
    const code = prompt("Enter Barcode:");
    if (code) fetchProductData(code);
});

document.getElementById('torch-btn').addEventListener('click', async () => {
    if (!html5QrCode) return;
    try {
        isTorchOn = !isTorchOn;
        await html5QrCode.applyVideoConstraints({ advanced: [{ torch: isTorchOn }] });
        showToast(isTorchOn ? "Flash On" : "Flash Off");
    } catch (e) {
        showToast("Flash not supported.");
    }
});

document.getElementById('file-input').addEventListener('change', async (e) => {
    if (e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    showToast("Processing high-res photo...");
    try {
        if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");
        
        // Scan the file
        const decodedText = await html5QrCode.scanFile(file, true);
        onScanSuccess(decodedText);
    } catch (err) {
        console.error("File Scan Error:", err);
        showToast("No barcode found. Try taking a closer photo.");
    }
});

document.getElementById('camera-btn').addEventListener('click', async () => {
    try {
        if (!cameraDevices.length) cameraDevices = await Html5Qrcode.getCameras();
        if (cameraDevices.length <= 1) { showToast("No other cameras."); return; }
        currentDeviceIndex = (currentDeviceIndex + 1) % cameraDevices.length;
        if (html5QrCode) await html5QrCode.stop();
        startScanner();
    } catch (e) { showToast("Camera switch failed."); }
});

document.getElementById('start-camera-btn').addEventListener('click', startScanner);

async function scanNumbersOCR() {
    if (!html5QrCode || html5QrCode.getState() !== 2) {
        showToast("Start camera first!");
        return;
    }

    showToast("Uploading to Cloud OCR...");
    
    try {
        const video = document.querySelector('#reader video');
        const canvas = document.createElement('canvas');
        
        // Resize for faster upload (max 1000px)
        const scale = Math.min(1000 / video.videoWidth, 1000 / video.videoHeight, 1);
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert to Blob
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        
        // Send to OCR.space API (Free Tier Key)
        const formData = new FormData();
        formData.append('file', blob, 'barcode.jpg');
        formData.append('apikey', 'K81156828588957'); // Free API Key
        formData.append('isOverlayRequired', 'false');
        formData.append('language', 'eng');
        formData.append('isTable', 'false');

        const response = await fetch('https://api.ocr.space/parse/image', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data && data.ParsedResults && data.ParsedResults.length > 0) {
            const text = data.ParsedResults[0].ParsedText;
            // Extract the longest string of digits (the barcode)
            const matches = text.match(/\d{8,14}/g);
            
            if (matches && matches.length > 0) {
                const barcode = matches[0];
                showToast(`Cloud found: ${barcode}`);
                fetchProductData(barcode);
            } else {
                showToast("Cloud couldn't see numbers. Try closer.");
            }
        } else {
            showToast("Cloud OCR busy. Try again.");
        }
    } catch (err) {
        console.error("Cloud OCR Error:", err);
        showToast("Cloud connection error.");
    }
}

document.getElementById('ocr-btn').addEventListener('click', scanNumbersOCR);
