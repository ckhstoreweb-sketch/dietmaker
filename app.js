let currentMeal = [];
let currentProduct = null;
let html5QrCode = null;

// DOM Elements
const scannerSection = document.getElementById('scanner-section');
const productDetails = document.getElementById('product-details');
const mealList = document.getElementById('meal-list');
const totalCaloriesEl = document.getElementById('totalCalories');
const totalProteinEl = document.getElementById('totalProtein');
const toast = document.getElementById('toast');

// Guaranteed Success: Snap-to-Scan
document.getElementById('snap-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    showToast("Reading your photo... 📸");
    
    try {
        // Create a temporary scanner to read the file
        if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");
        
        // Use the library's scanFile method
        const decodedText = await html5QrCode.scanFile(file, true);
        onScanSuccess(decodedText);
        
    } catch (err) {
        console.error("Scan Error:", err);
        showToast("Couldn't see barcode. Try again closer or use Search.");
    }
});

// Live Scanner (Secondary)
async function startLiveScanner() {
    try {
        if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");
        const config = { fps: 30, qrbox: { width: 250, height: 150 } };
        await html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess);
        document.querySelector('.scanner-wrapper').classList.remove('mini');
        document.getElementById('start-live-btn').style.display = 'none';
    } catch (e) {
        showToast("Live camera blocked.");
    }
}

function onScanSuccess(decodedText) {
    playBeep();
    if (html5QrCode && html5QrCode.getState() === 2) html5QrCode.pause();
    fetchProductData(decodedText);
}

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

// API Integration
async function fetchProductData(barcode) {
    showToast("Searching database... 🔍");
    try {
        const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
        const data = await res.json();
        if (data.status === 1) {
            displayProductDetails(data.product);
        } else {
            showToast("Product not found. Try Search by Name.");
        }
    } catch (e) {
        showToast("Network Error.");
    }
}

async function searchProductByName(q) {
    if (!q) { q = prompt("Enter product name:"); if(!q) return; }
    showToast("Searching... 🔍");
    try {
        const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&json=1`);
        const data = await res.json();
        if (data.products?.length) {
            displayProductDetails(data.products[0]);
        } else showToast("No products found.");
    } catch (e) { showToast("Search failed."); }
}

function displayProductDetails(p) {
    currentProduct = {
        name: p.product_name || p.name || "Unknown",
        calories: p.nutriments['energy-kcal_100g'] || 0,
        protein: p.nutriments.proteins_100g || 0,
        carbs: p.nutriments.carbohydrates_100g || 0,
        fat: p.nutriments.fat_100g || 0,
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
document.getElementById('manual-search-btn').addEventListener('click', () => searchProductByName());
document.getElementById('manual-barcode-btn').addEventListener('click', () => {
    const code = prompt("Enter Barcode Number:");
    if (code) fetchProductData(code);
});
document.getElementById('start-live-btn').addEventListener('click', startLiveScanner);
document.getElementById('top-search-btn').addEventListener('click', () => searchProductByName(document.getElementById('top-search').value));
document.getElementById('add-to-meal').addEventListener('click', addToMeal);
document.getElementById('close-details').addEventListener('click', closeDetails);
document.getElementById('clear-meal').addEventListener('click', () => { currentMeal = []; updateMealUI(); });

function showToast(m) { toast.textContent = m; toast.classList.remove('hidden'); setTimeout(() => toast.classList.add('hidden'), 3000); }
