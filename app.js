let currentMeal = [];
let currentProduct = null;
let html5QrCode = null;
let cameraDevices = [];
let currentDeviceIndex = 0;
let isTorchOn = false;

// DOM Elements
const scannerSection = document.getElementById('scanner-section');
const productDetails = document.getElementById('product-details');
const mealList = document.getElementById('meal-list');
const totalCaloriesEl = document.getElementById('totalCalories');
const totalProteinEl = document.getElementById('totalProtein');
const toast = document.getElementById('toast');

// Initialize Scanner
async function startScanner() {
    try {
        if (!window.Html5Qrcode) throw new Error("Library missing.");
        if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");
        
        const config = { 
            fps: 30,
            qrbox: (viewWidth, viewHeight) => {
                const minEdge = Math.min(viewWidth, viewHeight);
                return { width: Math.floor(minEdge * 0.9), height: Math.floor(minEdge * 0.5) };
            },
            experimentalFeatures: { useBarCodeDetectorIfSupported: true }
        };

        const formats = [
            Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.QR_CODE
        ];

        showToast("Powering up AI...");
        
        await html5QrCode.start({ facingMode: "environment" }, { ...config, formatsToSupport: formats }, onScanSuccess, onScanFailure);
        
        document.getElementById('camera-overlay').classList.add('hidden');
        showToast("AI Scanner Ready!");

    } catch (err) {
        document.getElementById('debug-log').textContent = "Error: " + err.message;
        document.getElementById('debug-log').style.display = "block";
        showToast("Use Manual Search!");
    }
}

function onScanSuccess(decodedText) {
    playBeep();
    if (html5QrCode && html5QrCode.getState() === 2) html5QrCode.pause();
    fetchProductData(decodedText);
}

function onScanFailure(error) {}

function playBeep() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    } catch (e) {}
}

// AI Cloud Scan
async function scanNumbersOCR() {
    if (!html5QrCode || html5QrCode.getState() !== 2) {
        showToast("Start camera first!");
        return;
    }

    showToast("AI Scanning... hold still!");
    
    try {
        const video = document.querySelector('#reader video');
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.filter = 'contrast(1.5) grayscale(1)';
        ctx.drawImage(video, 0, 0);
        
        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.9));
        const fd = new FormData();
        fd.append('file', blob);
        fd.append('apikey', 'K81156828588957'); 
        fd.append('ocrEngine', '2'); // AI ENGINE
        fd.append('scale', 'true');

        const res = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: fd });
        const data = await res.json();
        
        if (data?.ParsedResults?.[0]?.ParsedText) {
            const matches = data.ParsedResults[0].ParsedText.match(/\d{8,14}/g);
            if (matches) {
                onScanSuccess(matches[0]);
                return;
            }
        }
        showToast("AI missed. Try Zooming in!");
    } catch (err) {
        showToast("AI Busy.");
    }
}

// API and Logic
async function fetchProductData(barcode) {
    const saved = localStorage.getItem(`prod_${barcode}`);
    if (saved) { displayProductDetails(JSON.parse(saved), true); return; }

    showToast("Searching...");
    try {
        const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
        const data = await res.json();
        if (data.status === 1) displayProductDetails(data.product);
        else promptManual(barcode);
    } catch (e) {
        showToast("Network Error.");
        if (html5QrCode?.getState() === 3) html5QrCode.resume();
    }
}

async function searchProductByName(q) {
    if (!q) return;
    showToast("Searching...");
    try {
        const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&json=1`);
        const data = await res.json();
        if (data.products?.length) {
            if (html5QrCode?.getState() === 2) html5QrCode.pause();
            displayProductDetails(data.products[0]);
        } else showToast("No results.");
    } catch (e) { showToast("Search failed."); }
}

function displayProductDetails(p, manual = false) {
    currentProduct = {
        name: p.product_name || p.name || "Unknown",
        calories: manual ? p.calories : (p.nutriments['energy-kcal_100g'] || 0),
        protein: manual ? p.protein : (p.nutriments.proteins_100g || 0),
        carbs: manual ? p.carbs : (p.nutriments.carbohydrates_100g || 0),
        fat: manual ? p.fat : (p.nutriments.fat_100g || 0),
        barcode: p.code || p.barcode
    };

    document.getElementById('productName').textContent = currentProduct.name;
    document.getElementById('prodCal').value = currentProduct.calories;
    document.getElementById('prodProtein').value = currentProduct.protein;
    document.getElementById('prodCarbs').value = currentProduct.carbs;
    document.getElementById('prodFat').value = currentProduct.fat;
    
    scannerSection.classList.add('hidden');
    productDetails.classList.remove('hidden');
}

function addToMeal() {
    const weight = parseFloat(document.getElementById('prodWeight').value) || 100;
    const ratio = weight / 100;
    const item = {
        ...currentProduct,
        weight,
        calcCalories: Math.round(document.getElementById('prodCal').value * ratio),
        calcProtein: (document.getElementById('prodProtein').value * ratio).toFixed(1),
        calcCarbs: (document.getElementById('prodCarbs').value * ratio).toFixed(1),
        calcFat: (document.getElementById('prodFat').value * ratio).toFixed(1)
    };
    currentMeal.push(item);
    updateMealUI();
    closeDetails();
}

function updateMealUI() {
    mealList.innerHTML = '';
    let tc = 0, tp = 0;
    currentMeal.forEach(item => {
        tc += item.calcCalories; tp += parseFloat(item.calcProtein);
        const div = document.createElement('div');
        div.className = 'meal-item';
        div.innerHTML = `<h4>${item.name}</h4><p>${item.calcCalories} kcal | ${item.calcProtein}g P</p>`;
        mealList.appendChild(div);
    });
    totalCaloriesEl.textContent = tc;
    totalProteinEl.textContent = tp.toFixed(1) + 'g';
}

function closeDetails() {
    productDetails.classList.add('hidden');
    scannerSection.classList.remove('hidden');
    if (html5QrCode?.getState() === 3) html5QrCode.resume();
}

// Event Listeners
document.getElementById('start-camera-btn').addEventListener('click', startScanner);
document.getElementById('ocr-btn').addEventListener('click', scanNumbersOCR);
document.getElementById('add-to-meal').addEventListener('click', addToMeal);
document.getElementById('close-details').addEventListener('click', closeDetails);
document.getElementById('top-search-btn').addEventListener('click', () => searchProductByName(document.getElementById('top-search').value));
document.getElementById('clear-meal').addEventListener('click', () => { currentMeal = []; updateMealUI(); });

document.getElementById('zoom-range').addEventListener('input', async (e) => {
    const zoom = e.target.value;
    if (html5QrCode?.getState() === 2) {
        try {
            const track = html5QrCode.getRunningTrackCapabilities();
            if (track.zoom) {
                await html5QrCode.applyVideoConstraints({ advanced: [{ zoom: zoom }] });
            }
        } catch (e) {}
    }
});

document.getElementById('torch-btn').addEventListener('click', async () => {
    isTorchOn = !isTorchOn;
    try { await html5QrCode.applyVideoConstraints({ advanced: [{ torch: isTorchOn }] }); } catch (e) {}
});

document.getElementById('camera-btn').addEventListener('click', async () => {
    if (!cameraDevices.length) cameraDevices = await Html5Qrcode.getCameras();
    currentDeviceIndex = (currentDeviceIndex + 1) % cameraDevices.length;
    if (html5QrCode) await html5QrCode.stop();
    startScanner();
});

document.getElementById('file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    showToast("AI Scanning photo...");
    try {
        const code = await (new Html5Qrcode("reader")).scanFile(file, true);
        onScanSuccess(code);
    } catch (e) { showToast("No barcode found."); }
});

function showToast(m) { toast.textContent = m; toast.classList.remove('hidden'); setTimeout(() => toast.classList.add('hidden'), 3000); }
