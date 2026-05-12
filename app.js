// State Management
let currentMeal = [];
let inventory = JSON.parse(localStorage.getItem('macro_inventory')) || [];
let activeProduct = null;

// DOM Elements
const inventoryList = document.getElementById('inventory-list');
const mealList = document.getElementById('meal-list');
const totalCaloriesEl = document.getElementById('totalCalories');
const totalProteinEl = document.getElementById('totalProtein');
const productModal = document.getElementById('product-modal');
const toast = document.getElementById('toast');

// Initialize
updateInventoryUI();
updateMealUI();

// --- Core Actions ---

async function handleBarcodeAdd() {
    const barcode = document.getElementById('barcode-input').value;
    if (!barcode) return;
    
    showToast("Searching barcode...");
    try {
        const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
        const data = await res.json();
        
        if (data.status === 1) {
            openProductModal(data.product);
        } else {
            showToast("Not found. Enter details manually.");
            openProductModal({ product_name: "New Product", code: barcode });
        }
    } catch (e) {
        showToast("Network error.");
    }
}

async function handleNameSearch() {
    const query = document.getElementById('name-input').value;
    if (!query) return;
    
    showToast("Searching by name...");
    try {
        const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1`);
        const data = await res.json();
        
        if (data.products && data.products.length > 0) {
            openProductModal(data.products[0]);
        } else {
            showToast("No products found.");
        }
    } catch (e) {
        showToast("Search failed.");
    }
}

function openProductModal(p) {
    activeProduct = {
        name: p.product_name || p.name || "Unknown Product",
        calories: p.nutriments?.['energy-kcal_100g'] || 0,
        protein: p.nutriments?.proteins_100g || 0,
        carbs: p.nutriments?.carbohydrates_100g || 0,
        fat: p.nutriments?.fat_100g || 0,
        barcode: p.code || p.barcode || 'manual'
    };

    document.getElementById('modalProductName').textContent = activeProduct.name;
    document.getElementById('prodCal').value = activeProduct.calories;
    document.getElementById('prodProtein').value = activeProduct.protein;
    document.getElementById('prodCarbs').value = activeProduct.carbs;
    document.getElementById('prodFat').value = activeProduct.fat;
    document.getElementById('prodWeight').value = 100;

    productModal.classList.remove('hidden');
}

function confirmAddToMeal() {
    // Update activeProduct with any manual edits in modal
    activeProduct.calories = parseFloat(document.getElementById('prodCal').value) || 0;
    activeProduct.protein = parseFloat(document.getElementById('prodProtein').value) || 0;
    activeProduct.carbs = parseFloat(document.getElementById('prodCarbs').value) || 0;
    activeProduct.fat = parseFloat(document.getElementById('prodFat').value) || 0;
    
    const weight = parseFloat(document.getElementById('prodWeight').value) || 100;
    const ratio = weight / 100;

    const mealItem = {
        ...activeProduct,
        id: Date.now(),
        weight: weight,
        calcCalories: Math.round(activeProduct.calories * ratio),
        calcProtein: (activeProduct.protein * ratio).toFixed(1)
    };

    currentMeal.push(mealItem);
    saveToInventory(activeProduct);
    
    updateMealUI();
    closeModal();
    showToast("Added to meal & inventory!");
}

function saveToInventory(p) {
    // Prevent duplicates in inventory (by barcode or name)
    const exists = inventory.findIndex(item => (item.barcode !== 'manual' && item.barcode === p.barcode) || item.name === p.name);
    
    if (exists !== -1) {
        inventory[exists] = p; // Update existing
    } else {
        inventory.unshift(p); // Add new to top
    }
    
    // Keep only last 50 items
    if (inventory.length > 50) inventory.pop();
    
    localStorage.setItem('macro_inventory', JSON.stringify(inventory));
    updateInventoryUI();
}

function updateInventoryUI() {
    if (inventory.length === 0) {
        inventoryList.innerHTML = `<p class="empty-state">No saved products yet.</p>`;
        return;
    }

    inventoryList.innerHTML = '';
    inventory.forEach(p => {
        const div = document.createElement('div');
        div.className = 'inventory-item';
        div.innerHTML = `
            <span class="icon">🛒</span>
            <span class="name">${p.name}</span>
        `;
        div.onclick = () => openProductModal(p);
        inventoryList.appendChild(div);
    });
}

function updateMealUI() {
    if (currentMeal.length === 0) {
        mealList.innerHTML = `<div class="empty-state">Add items from inventory or search above.</div>`;
        totalCaloriesEl.textContent = '0';
        totalProteinEl.textContent = '0g';
        return;
    }

    mealList.innerHTML = '';
    let tc = 0, tp = 0;
    
    currentMeal.forEach((item, index) => {
        tc += item.calcCalories;
        tp += parseFloat(item.calcProtein);
        
        const div = document.createElement('div');
        div.className = 'meal-item';
        div.innerHTML = `
            <div>
                <h4>${item.name}</h4>
                <p>${item.weight}g • ${item.calcCalories} kcal • ${item.calcProtein}g Protein</p>
            </div>
            <button class="text-btn" onclick="removeFromMeal(${index})">Remove</button>
        `;
        mealList.appendChild(div);
    });

    totalCaloriesEl.textContent = tc;
    totalProteinEl.textContent = tp.toFixed(1) + 'g';
}

function removeFromMeal(index) {
    currentMeal.splice(index, 1);
    updateMealUI();
}

function clearMeal() {
    if (confirm("Clear current meal?")) {
        currentMeal = [];
        updateMealUI();
    }
}

function closeModal() {
    productModal.classList.add('hidden');
    activeProduct = null;
}

function showToast(m) {
    toast.textContent = m;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// --- Event Listeners ---

document.getElementById('add-barcode-btn').addEventListener('click', handleBarcodeAdd);
document.getElementById('search-name-btn').addEventListener('click', handleNameSearch);
document.getElementById('confirm-add').addEventListener('click', confirmAddToMeal);
document.getElementById('close-modal').addEventListener('click', closeModal);
document.getElementById('clear-meal').addEventListener('click', clearMeal);

// Enter key support
document.getElementById('barcode-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleBarcodeAdd();
});
document.getElementById('name-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleNameSearch();
});
