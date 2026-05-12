// State Management
let currentMeal = [];
let inventory = JSON.parse(localStorage.getItem('macro_inventory')) || [];
let activeProduct = null;
let dbResults = [];

// DOM Elements
const inventoryList = document.getElementById('inventory-list');
const mealList = document.getElementById('meal-list');
const totalCaloriesEl = document.getElementById('totalCalories');
const totalProteinEl = document.getElementById('totalProtein');
const productModal = document.getElementById('product-modal');
const toast = document.getElementById('toast');
const dbSearchInput = document.getElementById('db-search-input');

// Initialize
updateInventoryUI();
updateMealUI();

// --- Core Database Search ---

async function searchEgyptianDB(query) {
    if (!query) {
        updateInventoryUI(); // Show local history if empty
        return;
    }

    showToast("Searching Egyptian Market...");
    try {
        // Broadened search: Removed strict countries filter for better reliability
        const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=24`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.products && data.products.length > 0) {
            dbResults = data.products.map(p => ({
                name: p.product_name || p.product_name_en || "Unknown Product",
                calories: p.nutriments?.['energy-kcal_100g'] || 0,
                protein: p.nutriments?.proteins_100g || 0,
                carbs: p.nutriments?.carbohydrates_100g || 0,
                fat: p.nutriments?.fat_100g || 0,
                barcode: p.code || 'manual',
                brand: p.brands || ""
            }));
            renderSearchGrid(dbResults);
        } else {
            inventoryList.innerHTML = `
                <div class="empty-state">
                    <p>No products found for "${query}".</p>
                    <button class="primary-btn" onclick="promptManual('${query}')" style="margin-top:10px">Create "${query}" Manually</button>
                </div>`;
        }
    } catch (e) {
        showToast("Search failed. Check your internet.");
    }
}

function promptManual(name) {
    openProductModal({ product_name: name, code: 'manual' });
}

function renderSearchGrid(results) {
    inventoryList.innerHTML = '';
    
    // Combine results with local inventory matches
    const combined = [...results];
    
    combined.forEach(p => {
        const div = document.createElement('div');
        div.className = 'inventory-item';
        div.innerHTML = `
            <span class="icon">🍱</span>
            <span class="name">${p.name}</span>
            <span class="hint" style="font-size: 0.6rem; color: #94a3b8;">${p.brand}</span>
        `;
        div.onclick = () => openProductModal(p);
        inventoryList.appendChild(div);
    });
}

function updateInventoryUI() {
    if (inventory.length === 0) {
        inventoryList.innerHTML = `<p class="empty-state">Your history is empty. Search above for Egyptian products!</p>`;
        return;
    }

    inventoryList.innerHTML = '';
    // Show "Frequent Items" header
    const header = document.createElement('div');
    header.style.gridColumn = '1 / -1';
    header.style.color = 'var(--primary)';
    header.style.fontSize = '0.8rem';
    header.style.marginBottom = '5px';
    header.textContent = 'Frequent Items';
    inventoryList.appendChild(header);

    inventory.forEach(p => {
        const div = document.createElement('div');
        div.className = 'inventory-item';
        div.style.border = '1px solid var(--primary)';
        div.innerHTML = `
            <span class="icon">⭐</span>
            <span class="name">${p.name}</span>
        `;
        div.onclick = () => openProductModal(p);
        inventoryList.appendChild(div);
    });
}

// --- UI Actions ---

function openProductModal(p) {
    activeProduct = { ...p };

    document.getElementById('modalProductName').textContent = activeProduct.name;
    document.getElementById('prodCal').value = activeProduct.calories;
    document.getElementById('prodProtein').value = activeProduct.protein;
    document.getElementById('prodCarbs').value = activeProduct.carbs;
    document.getElementById('prodFat').value = activeProduct.fat;
    document.getElementById('prodWeight').value = 100;

    productModal.classList.remove('hidden');
}

function confirmAddToMeal() {
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
    showToast("Added to meal!");
}

function saveToInventory(p) {
    const exists = inventory.findIndex(item => (item.barcode !== 'manual' && item.barcode === p.barcode) || item.name === p.name);
    if (exists !== -1) inventory.splice(exists, 1);
    inventory.unshift(p);
    if (inventory.length > 20) inventory.pop();
    localStorage.setItem('macro_inventory', JSON.stringify(inventory));
}

function updateMealUI() {
    if (currentMeal.length === 0) {
        mealList.innerHTML = `<div class="empty-state">Meal is empty.</div>`;
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
        div.innerHTML = `<div><h4>${item.name}</h4><p>${item.weight}g • ${item.calcCalories} kcal</p></div><button class="text-btn" onclick="removeFromMeal(${index})">✕</button>`;
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
    if (confirm("Clear meal?")) { currentMeal = []; updateMealUI(); }
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

// --- Listeners ---
dbSearchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchEgyptianDB(dbSearchInput.value);
});

document.getElementById('db-search-btn').addEventListener('click', () => {
    searchEgyptianDB(dbSearchInput.value);
});

document.getElementById('confirm-add').addEventListener('click', confirmAddToMeal);
document.getElementById('close-modal').addEventListener('click', closeModal);
document.getElementById('clear-meal').addEventListener('click', clearMeal);
