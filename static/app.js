/* ===========================================
   VARIABLES GLOBALES
=========================================== */
let selectedImages = [];
let classificationResults = [];
let totalPoints = parseInt(localStorage.getItem('totalPoints') || '0');
let processedImages = parseInt(localStorage.getItem('processedImages') || '0');

// Categorías de residuos y sus puntos
const categories = {
    'Carton': { name: 'Cartón', points: 10, color: 'Carton' },
    'Vidrio': { name: 'Vidrio', points: 10, color: 'Vidrio' },
    'Metal': { name: 'Metal', points: 10, color: 'Metal' },
    'Papel': { name: 'Papel', points: 10, color: 'Papel' },
    'Plastico': { name: 'Plástico', points: 10, color: 'Plastico' },
    'No Reciclable': { name: 'No Reciclable', points: 1, color: 'No Reciclable' }
};

/* ===========================================
   FUNCIONES DE INICIALIZACIÓN
=========================================== */

/**
 * Inicializa la aplicación al cargar la página
 */
function initializeApp() {
    console.log('🚀 Inicializando EcoRewards...');
    loadStats();
    generateCoupons();
    setupEventListeners();
    initializeModal();
    console.log('✅ Aplicación inicializada correctamente');
}

/**
 * Configura los event listeners
 */
function setupEventListeners() {
    const imageInput = document.getElementById('imageInput');
    if (imageInput) {
        imageInput.addEventListener('change', handleImageSelection);
    }
}

/**
 * Carga las estadísticas guardadas desde localStorage
 */
function loadStats() {
    document.getElementById('totalImages').textContent = processedImages;
    document.getElementById('totalPoints').textContent = totalPoints;
    updateDiscountInfo();
    console.log(`📊 Estadísticas cargadas: ${processedImages} imágenes, ${totalPoints} puntos`);
}

/* ===========================================
   FUNCIONES DE MANEJO DE IMÁGENES
=========================================== */

function handleImageSelection(e) {
    // No reiniciar selectedImages aquí
    const files = Array.from(e.target.files);
    
    if (files.length === 0) {
        document.getElementById('processBtn').disabled = true;
        return;
    }
    
    console.log(`📸 Seleccionadas ${files.length} imágenes`);

    let loadedCount = 0;
    
    files.forEach((file, index) => {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                selectedImages.push({
                    file: file,
                    url: e.target.result,
                    name: file.name,
                    // index ya no es tan importante, se puede actualizar luego
                });
                
                loadedCount++;
                if (loadedCount === files.filter(f => f.type.startsWith('image/')).length) {
                    displayImagePreview();
                    document.getElementById('processBtn').disabled = false;
                    console.log('✅ Todas las imágenes cargadas correctamente');
                }
            };
            reader.readAsDataURL(file);
        } else {
            console.warn(`⚠️ Archivo no válido: ${file.name}`);
        }
    });
}


/**
 * Muestra el preview de las imágenes seleccionadas
 */
function displayImagePreview() {
    const container = document.getElementById('imagesPreview');
    container.innerHTML = '';
    
    selectedImages.forEach((img, index) => {
        const imageItem = createImagePreviewElement(img, index);
        container.appendChild(imageItem);
    });
}

/**
 * Crea un elemento de preview de imagen
 * @param {Object} img - Objeto de imagen
 * @param {number} index - Índice de la imagen
 * @returns {HTMLElement} - Elemento DOM
 */
function createImagePreviewElement(img, index) {
    const imageItem = document.createElement('div');
    imageItem.className = 'image-item';
    imageItem.innerHTML = `
        <img src="${img.url}" alt="${img.name}" loading="lazy">
        <p><strong>${truncateFileName(img.name, 20)}</strong></p>
        <div id="result-${index}" class="classification-result" style="display: none;">
            Esperando clasificación...
        </div>
    `;
    return imageItem;
}

/**
 * Trunca el nombre del archivo si es muy largo
 * @param {string} fileName - Nombre del archivo
 * @param {number} maxLength - Longitud máxima
 * @returns {string} - Nombre truncado
 */
function truncateFileName(fileName, maxLength) {
    if (fileName.length <= maxLength) return fileName;
    const extension = fileName.split('.').pop();
    const name = fileName.substring(0, fileName.lastIndexOf('.'));
    const truncatedName = name.substring(0, maxLength - extension.length - 4) + '...';
    return `${truncatedName}.${extension}`;
}


/* ===========================================
   FUNCIONES DE CLASIFICACIÓN
=========================================== */

/*
 * Función principal para procesar las imágenes con el modelo real (BATCH)
 */
async function processImages() {
    if (selectedImages.length === 0) {
        console.warn('⚠️ No hay imágenes para procesar');
        return;
    }
    
    console.log(`🤖 Iniciando procesamiento de ${selectedImages.length} imágenes en batch`);
    
    // Deshabilitar UI durante procesamiento
    setProcessingState(true);
    
    // Mostrar estado de "procesando" en cada imagen
    selectedImages.forEach((_, index) => {
        const resultDiv = document.getElementById(`result-${index}`);
        if (resultDiv) {
            resultDiv.style.display = 'block';
            resultDiv.className = 'classification-result';
            resultDiv.innerHTML = 'Procesando...';
        }
    });
    
    classificationResults = [];
    
    try {
        // Procesar todas las imágenes en un solo request
        await processBatchImages();
        
        showResults();
        console.log('✅ Procesamiento batch completado exitosamente');
        
    } catch (error) {
        console.error('❌ Error durante el procesamiento batch:', error);
        alert('Ocurrió un error durante la clasificación. Por favor, intenta nuevamente.');
        
        // En caso de error, intentar procesamiento individual como respaldo
        console.log('🔄 Intentando procesamiento individual como respaldo...');
        await processFallbackIndividual();
    } finally {
        setProcessingState(false);
    }
}


/**
 * Procesa todas las imágenes en un solo request (método principal)
 */
async function processBatchImages() {
    try {
        const formData = new FormData();
        
        // Agregar todas las imágenes al FormData
        selectedImages.forEach((imgData) => {
            formData.append('files', imgData.file);
        });
        
        console.log(`📤 Enviando ${selectedImages.length} imágenes al servidor...`);
        
        const response = await fetch('/predict_batch', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Error desconocido en el servidor');
        }
        
        console.log(`📥 Respuesta recibida: ${data.total_images} imágenes procesadas`);
        
        // Procesar los resultados
        data.results.forEach((result) => {
            const category = mapModelResultToCategory(result.class_name);
            const confidence = result.confidence * 100;
            
            const processedResult = {
                category: category,
                confidence: confidence,
                points: categories[category].points,
                imageIndex: result.image_index,
                originalPrediction: result.class_name,
                imageName: result.image_name
            };
            
            classificationResults.push(processedResult);
            displayIndividualResult(result.image_index, processedResult);
            
            console.log(`📋 ${result.image_name} clasificada como: ${categories[category].name} (${confidence.toFixed(1)}%)`);
        });
        
    } catch (error) {
        console.error('❌ Error en procesamiento batch:', error);
        throw error;
    }
}


/**
 * Procesamiento individual como respaldo en caso de error del batch
 */
async function processFallbackIndividual() {
    console.log('🔄 Ejecutando procesamiento individual de respaldo...');
    
    classificationResults = [];
    
    for (let i = 0; i < selectedImages.length; i++) {
        try {
            await processRealImageIndividual(i);
        } catch (error) {
            console.error(`❌ Error procesando imagen ${i + 1}:`, error);
            // Usar clasificación de respaldo en caso de error
            const fallbackResult = {
                category: 'general',
                confidence: 0,
                points: categories['general'].points,
                imageIndex: i,
                error: true
            };
            
            classificationResults.push(fallbackResult);
            displayIndividualResult(i, fallbackResult);
        }
    }
}

/**
 * Procesa una imagen individual (método de respaldo)
 * @param {number} index - Índice de la imagen
 */
async function processRealImageIndividual(index) {
    try {
        const formData = new FormData();
        formData.append('file', selectedImages[index].file);
        
        const response = await fetch('/predict', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Mapear resultado del modelo a nuestras categorías
        const category = mapModelResultToCategory(data.class_name);
        const confidence = data.confidence * 100;
        
        const result = {
            category: category,
            confidence: confidence,
            points: categories[category].points,
            imageIndex: index,
            originalPrediction: data.class_name
        };
        
        classificationResults.push(result);
        displayIndividualResult(index, result);
        
        console.log(`📋 Imagen ${index + 1} clasificada como: ${categories[category].name} (${confidence.toFixed(1)}%)`);
        
    } catch (error) {
        console.error(`❌ Error procesando imagen ${index + 1}:`, error);
        throw error;
    }
}

/**
 * Mapea el resultado del modelo a nuestras categorías
 * @param {string} modelResult - Resultado del modelo
 * @returns {string} - Categoría mapeada
 */
function mapModelResultToCategory(modelResult) {
    // Si el resultado del modelo coincide directamente con nuestras categorías
    if (categories[modelResult]) {
        return modelResult;
    }
    
    // Mapeo de nombres del modelo a categorías
    const mapping = {
        'Carton': 'Carton',
        'Vidrio': 'Vidrio',
        'Metal': 'Metal',
        'Papel': 'Papel',
        'Plastico': 'Plastico',
        'No Reciclable': 'No Reciclable'
    };
    
    return mapping[modelResult] || null;
}

/**
 * Muestra el resultado individual de una imagen
 * @param {number} index - Índice de la imagen
 * @param {Object} result - Resultado de la clasificación
 */
function displayIndividualResult(index, result) {
    const resultDiv = document.getElementById(`result-${index}`);
    if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.className = `classification-result ${categories[result.category].color}`;
        
        if (result.error) {
            resultDiv.innerHTML = `
                <strong>Error en clasificación</strong><br>
                Clasificado como: ${categories[result.category].name}<br>
                +${categories[result.category].points} puntos
            `;
        } else {
            resultDiv.innerHTML = `
                <strong>${categories[result.category].name}</strong><br>
                ${result.originalPrediction ? `(${result.originalPrediction})` : ''}<br>
                Confianza: ${result.confidence.toFixed(1)}%<br>
                +${categories[result.category].points} puntos
            `;
        }
    }
}

/**
 * Controla el estado de procesamiento de la UI
 * @param {boolean} isProcessing - Si está procesando
 */
function setProcessingState(isProcessing) {
    const processBtn = document.getElementById('processBtn');
    const loading = document.getElementById('loading');
    const resultsSection = document.getElementById('resultsSection');
    
    processBtn.disabled = isProcessing;
    loading.style.display = isProcessing ? 'block' : 'none';
    
    if (isProcessing) {
        resultsSection.classList.add('hidden');
        processBtn.textContent = '🤖 Procesando...';
    } else {
        processBtn.textContent = '🤖 Clasificar Residuos';
    }
}

/* ===========================================
   FUNCIONES DE RESULTADOS Y ESTADÍSTICAS
=========================================== */

/**
 * Muestra los resultados finales y actualiza estadísticas
 */
function showResults() {
    const counts = calculateCategoryCounts();
    const newPoints = calculateTotalPoints();
    
    updateCategoryDisplays(counts);
    updateProgressBars(counts);
    updateGlobalStats(newPoints);
    saveStatsToStorage();
    
    document.getElementById('resultsSection').classList.remove('hidden');
    generateCoupons();
}

/**
 * Calcula el conteo por categorías
 * @returns {Object} - Conteo de categorías
 */
function calculateCategoryCounts() {
    const counts = {
        Carton: 0,
        Vidrio: 0,
        Metal: 0,
        Papel: 0,
        Plastico: 0,
        NoReciclable: 0,
    };

    classificationResults.forEach(result => {
        // Mapear categorías del modelo a las categorías de conteo
        if (result.category === 'Carton') {
            counts.Carton++;
        } else if (result.category === 'Vidrio') {
            counts.Vidrio++;
        } else if (result.category === 'Metal') {
            counts.Metal++;
        } else if (result.category === 'Papel') {
            counts.Papel++;
        } else if (result.category === 'Plastico') {
            counts.Plastico++;
        } else {
            counts.NoReciclable++;
        }
    });

    return counts;
}

/**
 * Calcula el total de puntos nuevos
 * @returns {number} - Total de puntos
 */
function calculateTotalPoints() {
    return classificationResults.reduce((total, result) => total + result.points, 0);
}

/**
 * Actualiza los displays de conteo por categoría
 * @param {Object} counts - Conteo de categorías
 */
function updateCategoryDisplays(counts) {
    document.getElementById('cartonCount').textContent = `${counts.Carton} items`;
    document.getElementById('vidrioCount').textContent = `${counts.Vidrio} items`;
    document.getElementById('metalCount').textContent = `${counts.Metal} items`;
    document.getElementById('papelCount').textContent = `${counts.Papel} items`;
    document.getElementById('plasticoCount').textContent = `${counts.Plastico} items`;
    document.getElementById('noRecCount').textContent = `${counts.NoReciclable} items`;
}

/**
 * Actualiza las barras de progreso
 * @param {Object} counts - Conteo de categorías
 */
function updateProgressBars(counts) {
    const maxCount = Math.max(...Object.values(counts), 1);
    
    document.getElementById('cartonProgress').style.width = `${(counts.Carton / maxCount) * 100}%`;
    document.getElementById('vidrioProgress').style.width = `${(counts.Vidrio / maxCount) * 100}%`;
    document.getElementById('metalProgress').style.width = `${(counts.Metal / maxCount) * 100}%`;
    document.getElementById('papelProgress').style.width = `${(counts.Papel / maxCount) * 100}%`;
    document.getElementById('plasticoProgress').style.width = `${(counts.Plastico / maxCount) * 100}%`;
    document.getElementById('noRecProgress').style.width = `${(counts.NoReciclable / maxCount) * 100}%`;
}

/**
 * Actualiza las estadísticas globales
 * @param {number} newPoints - Puntos nuevos obtenidos
 */
function updateGlobalStats(newPoints) {
    totalPoints += newPoints;
    processedImages += selectedImages.length;
    
    document.getElementById('totalImages').textContent = processedImages;
    document.getElementById('totalPoints').textContent = totalPoints;
    updateDiscountInfo();
    
    console.log(`📈 Estadísticas actualizadas: +${newPoints} puntos, ${selectedImages.length} imágenes procesadas`);
}

/**
 * Guarda las estadísticas en localStorage
 */
function saveStatsToStorage() {
    localStorage.setItem('totalPoints', totalPoints.toString());
    localStorage.setItem('processedImages', processedImages.toString());
}

/**
 * Actualiza la información de descuentos
 */
function updateDiscountInfo() {
    const discountPercent = Math.min(Math.floor(totalPoints / 10), 50); // Máximo 50% descuento
    document.getElementById('discountPercent').textContent = `${discountPercent}%`;
}

/* ===========================================
   FUNCIONES DE CUPONES Y RECOMPENSAS
=========================================== */

/**
 * Genera cupones de descuento basados en los puntos
 */
function generateCoupons() {
    const discountPercent = Math.min(Math.floor(totalPoints / 10), 50);
    const container = document.getElementById('couponsContainer');
    
    if (!container) return;
    
    container.innerHTML = '';
    
    if (discountPercent >= 5) {
        const coupons = createAvailableCoupons(discountPercent);
        
        coupons.forEach(coupon => {
            if (coupon.percent >= 5) {
                const couponElement = createCouponElement(coupon);
                container.appendChild(couponElement);
            }
        });
        
        document.getElementById('rewardsSection').classList.remove('hidden');
        console.log(`🎫 ${coupons.filter(c => c.percent >= 5).length} cupones generados`);
    } else {
        document.getElementById('rewardsSection').classList.add('hidden');
    }
}

/**
 * Crea cupones disponibles
 * @param {number} maxDiscount - Descuento máximo disponible
 * @returns {Array} - Array de cupones
 */
function createAvailableCoupons(maxDiscount) {
    const coupons = [
        { 
            percent: Math.min(maxDiscount, 10), 
            type: 'Supermercado',
            description: 'Descuento en compras de supermercado',
            code: 'ECO10'
        },
        { 
            percent: Math.min(maxDiscount, 15), 
            type: 'Impuestos Municipales',
            description: 'Descuento en impuestos municipales',
            code: 'MUNI15'
        },
        { 
            percent: Math.min(maxDiscount, 20), 
            type: 'Productos Ecológicos',
            description: 'Descuento en productos ecológicos',
            code: 'GREEN20'
        }
    ];
    
    return coupons.filter(coupon => coupon.percent >= 5);
}

/**
 * Crea elemento de cupón
 * @param {Object} coupon - Datos del cupón
 * @returns {HTMLElement} - Elemento DOM del cupón
 */
function createCouponElement(coupon) {
    const couponDiv = document.createElement('div');
    couponDiv.className = 'coupon-card';
    couponDiv.innerHTML = `
        <div class="coupon-header">
            <span class="coupon-percent">${coupon.percent}%</span>
            <span class="coupon-type">${coupon.type}</span>
        </div>
        <div class="coupon-description">${coupon.description}</div>
        <div class="coupon-code">Código: <strong>${coupon.code}</strong></div>
        <button class="coupon-btn" onclick="useCoupon('${coupon.code}')">Usar Cupón</button>
    `;
    
    return couponDiv;
}

/**
 * Función para usar un cupón
 * @param {string} code - Código del cupón
 */
function useCoupon(code) {
    alert(`¡Cupón ${code} copiado al portapapeles! Úsalo en tu próxima compra.`);
    // Aquí podrías implementar la lógica para copiar al portapapeles
    navigator.clipboard?.writeText(code);
}

//EJt
function initializeModal() {
    let selectedOption = null;

    const modal = document.getElementById('redeemModal');
    const openBtn = document.getElementById('canjeBtn');
    const closeBtn = document.getElementById('closeRedeemModal');
    const cancelBtn = document.getElementById('cancelBtn');
    const confirmBtn = document.getElementById('confirmBtn');
    const optionCards = document.querySelectorAll('.option-card');
    const notification = document.getElementById('notification');

    // Verificar que todos los elementos existen
    if (!modal || !openBtn || !closeBtn || !cancelBtn || !confirmBtn) {
        console.warn('⚠️ Algunos elementos del modal no fueron encontrados');
        return;
    }

    // Función para cerrar modal
    function closeModal() {
        modal.classList.remove('show');
        document.body.style.overflow = 'auto';
        selectedOption = null;
        optionCards.forEach(card => card.classList.remove('selected'));
        confirmBtn.disabled = true;
    }

    // Función para mostrar notificación
    function showNotification(message = '¡Canje realizado exitosamente! 🎉') {
        if (notification) {
            notification.textContent = message;
            notification.classList.add('show');
            setTimeout(() => {
                notification.classList.remove('show');
            }, 3000);
        }
    }

    // Abrir modal
    openBtn.addEventListener('click', () => {
        // Verificar si tiene suficientes puntos
        if (totalPoints < 75) {
            showNotification('❌ Necesitas al menos 75 puntos para canjear');
            return;
        }
        
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
        modal.setAttribute('aria-hidden', 'false');
    });

    // Cerrar modal desde botones
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    // Cerrar modal al hacer clic en el overlay
    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.classList.contains('modal-overlay')) {
            closeModal();
        }
    });

    // Selección de opción de canje
    optionCards.forEach(card => {
        // Eventos de clic
        card.addEventListener('click', () => {
            selectOption(card);
        });

        // Soporte para teclado (accesibilidad)
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectOption(card);
            }
        });
    });

    // Función para seleccionar opción
    function selectOption(card) {
        const requiredPoints = getRequiredPoints(card.dataset.option);
        
        // Verificar si tiene suficientes puntos para esta opción
        if (totalPoints < requiredPoints) {
            showNotification(`❌ Necesitas ${requiredPoints} puntos para esta opción`);
            return;
        }

        optionCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedOption = card.dataset.option;
        confirmBtn.disabled = false;
    }

    // Confirmar opción seleccionada
    confirmBtn.addEventListener('click', () => {
        if (selectedOption) {
            const requiredPoints = getRequiredPoints(selectedOption);
            const optionName = getOptionName(selectedOption);
            
            // Descontar puntos
            totalPoints -= requiredPoints;
            updateGlobalStatsDisplay();
            saveStatsToStorage();
            
            closeModal();
            showNotification(`🎉 ¡${optionName} canjeado exitosamente! (-${requiredPoints} puntos)`);
            
            console.log(`✅ Canje realizado: ${optionName}, puntos restantes: ${totalPoints}`);
        }
    });

    // Cerrar con tecla ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('show')) {
            closeModal();
        }
    });

    // Funciones auxiliares
    function getRequiredPoints(option) {
        const pointsMap = {
            'auto': 100,
            'inmueble': 150,
            'supermercado': 75
        };
        return pointsMap[option] || 0;
    }

    function getOptionName(option) {
        const nameMap = {
            'auto': 'Descuento en Impuesto de Auto',
            'inmueble': 'Descuento en Bien Inmueble',
            'supermercado': 'Descuento en Supermercado'
        };
        return nameMap[option] || 'Opción desconocida';
    }
}

function updateGlobalStatsDisplay() {
    document.getElementById('totalImages').textContent = processedImages;
    document.getElementById('totalPoints').textContent = totalPoints;
    updateDiscountInfo();
}

// Inicializar la aplicación cuando se carga la página
document.addEventListener('DOMContentLoaded', initializeApp);


