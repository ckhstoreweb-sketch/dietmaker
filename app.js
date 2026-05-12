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
    if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");
    
    // Get all cameras
    try {
        cameraDevices = await Html5Qrcode.getCameras();
        if (cameraDevices.length === 0) {
            showToast("No cameras found.");
            return;
        }
    } catch (err) {
        showToast("Camera permission needed.");
        return;
    }

    const config = { 
        fps: 30,
        qrbox: (viewWidth, viewHeight) => {
            const minEdge = Math.min(viewWidth, viewHeight);
            return { width: Math.floor(minEdge * 0.8), height: Math.floor(minEdge * 0.5) };
        }
    };

    const deviceId = cameraDevices[currentDeviceIndex].id;
    
    html5QrCode.start(
        deviceId,
        config,
        onScanSuccess,
        onScanFailure
    ).then(() => {
        document.getElementById('camera-overlay').classList.add('hidden');
    }).catch((err) => {
        console.error("Scanner Start Error:", err);
        // Fallback to basic start
        html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, onScanFailure)
            .then(() => document.getElementById('camera-overlay').classList.add('hidden'));
    });
}

function onScanSuccess(decodedText, decodedResult) {
    console.log(`Scan Result: ${decodedText}`);
    playBeep();
    // Pause scanner to process product
    html5QrCode.pause();
    fetchProductData(decodedText);
}

function playBeep() {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
}

function onScanFailure(error) {
    // Silently ignore failures during scanning
}

// API Integration
async function fetchProductData(barcode) {
    // Check Local Storage first for manual corrections
    const savedData = localStorage.getItem(`prod_${barcode}`);
    if (savedData) {
        showToast("Loading saved custom data...");
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
            showToast("Product not found. Enter details manually.");
            promptManualNutrition(barcode);
        }
    } catch (error) {
        console.error("API Error:", error);
        showToast("Error fetching product data");
        html5QrCode.resume();
    }
}

// Navigation and Event Listeners
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
            displayProductDetails(data.products[0]);
        } else {
            showToast("No products found.");
        }
    } catch (error) {
        showToast("Search failed.");
    }
}

function promptManualNutrition(barcode) {
    const name = prompt("Product Name:", "Unknown Product");
    if (!name) {
        html5QrCode.resume();
        return;
    }
    const cals = prompt("Calories per 100g:", "0");
    const prot = prompt("Protein per 100g:", "0");
    const carbs = prompt("Carbs per 100g:", "0");
    const fat = prompt("Fat per 100g:", "0");

    const manualProduct = {
        product_name: name,
        nutriments: {
            'energy-kcal_100g': parseFloat(cals) || 0,
            proteins_100g: parseFloat(prot) || 0,
            carbohydrates_100g: parseFloat(carbs) || 0,
            fat_100g: parseFloat(fat) || 0
        },
        code: barcode || 'manual'
    };
    displayProductDetails(manualProduct);
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

    // Capture potentially edited values
    const editedProduct = {
        ...currentProduct,
        calories: parseFloat(document.getElementById('prodCal').value),
        protein: parseFloat(document.getElementById('prodProtein').value),
        carbs: parseFloat(document.getElementById('prodCarbs').value),
        fat: parseFloat(document.getElementById('prodFat').value)
    };

    // Save corrections to local storage
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
    if (html5QrCode) html5QrCode.resume();
}

function clearMeal() {
    if (confirm("Clear your current meal?")) {
        currentMeal = [];
        updateMealUI();
    }
}

// UI Helpers
function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// Navigation
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

// Event Listeners
document.getElementById('add-to-meal').addEventListener('click', addToMeal);
document.getElementById('close-details').addEventListener('click', closeProductDetails);
document.getElementById('clear-meal').addEventListener('click', clearMeal);
document.getElementById('manual-btn').addEventListener('click', () => {
    const code = prompt("Enter Barcode Number:");
    if (code) fetchProductData(code);
});
document.getElementById('search-btn').addEventListener('click', searchProductByName);
document.getElementById('flip-btn').addEventListener('click', () => {
    const video = document.querySelector('#reader video');
    if (video) {
        video.classList.toggle('mirrored');
        showToast(video.classList.contains('mirrored') ? "Mirror View On" : "Natural View On");
    }
});

document.getElementById('camera-btn').addEventListener('click', async () => {
    if (cameraDevices.length <= 1) {
        showToast("Only one camera detected.");
        return;
    }
    
    currentDeviceIndex = (currentDeviceIndex + 1) % cameraDevices.length;
    showToast(`Switching to lens ${currentDeviceIndex + 1}...`);
    
    if (html5QrCode) {
        await html5QrCode.stop();
        startScanner();
    }
});

document.getElementById('file-input').addEventListener('change', (e) => {
    if (e.target.files.length === 0) return;
    const imageFile = e.target.files[0];
    
    showToast("Scanning photo...");
    html5QrCode.scanFile(imageFile, true)
        .then(decodedText => {
            onScanSuccess(decodedText);
        })
        .catch(err => {
            showToast("No barcode found in photo. Try another shot.");
        });
});

document.getElementById('torch-btn').addEventListener('click', async () => {
    if (!html5QrCode || currentFacingMode === "user") {
        showToast("Flash only works on back camera");
        return;
    }

    try {
        isTorchOn = !isTorchOn;
        await html5QrCode.applyVideoConstraints({
            advanced: [{ torch: isTorchOn }]
        });
        showToast(isTorchOn ? "Flash On" : "Flash Off");
    } catch (err) {
        console.error("Torch Error:", err);
        showToast("Flash not supported on this device");
        isTorchOn = false;
    }
});

document.getElementById('start-camera-btn').addEventListener('click', startScanner);

// Start the app
// Removing auto-start for mobile browsers to prevent permission blocking
// startScanner();
