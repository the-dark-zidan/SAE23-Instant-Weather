// Configuration de l'API
const API_CONFIG = {
    TOKEN: '40cb912aff2f7792bb9ecd409d50ed4e2dca5e462e8e7ae2643237298e6198be',
    GEO_API: 'https://geo.api.gouv.fr/communes',
    METEO_API: 'https://api.meteo-concept.com/api/forecast/daily'
};

// Sélection d'éléments dans le DOM
const elements = {
    form: document.getElementById('weather-form'),
    codePostalInput: document.getElementById('code-postal'),
    communeSelect: document.getElementById('commune-select'),
    daysSlider: document.getElementById('days-slider'),
    daysValue: document.getElementById('days-value'),
    submitBtn: document.getElementById('submit-btn'),
    checkboxes: document.querySelectorAll('input[name="options"]'),
    resultsSection: document.getElementById('results-section'),
    cityName: document.getElementById('city-name'),
    locationInfo: document.getElementById('location-info'),
    weatherGrid: document.getElementById('weather-grid'),
    loading: document.getElementById('loading'),
    errorMessage: document.getElementById('error-message'),
    errorText: document.getElementById('error-text'),
};

// Variables globales pour stocker les données
let currentCommunes = [];
let currentCityData = null;

/**
 * Lancement de l'application
 */
function initApp() {
    setupEventListeners();
}

/**
 * Ajout des écouteurs d'événements
 */
function setupEventListeners() {
    elements.form.addEventListener('submit', handleFormSubmit);
    elements.codePostalInput.addEventListener('input', handleCodePostalInput);
    elements.communeSelect.addEventListener('change', handleCommuneChange);
    elements.daysSlider.addEventListener('input', updateDaysValue);
}

/**
 * Gestion de l'entrée du code postal
 */
async function handleCodePostalInput() {
    const codePostal = elements.codePostalInput.value.trim();
    
    // Réinitialisation des éléments
    elements.communeSelect.innerHTML = '<option value="">-- Sélectionnez une commune --</option>';
    elements.communeSelect.disabled = true;
    elements.submitBtn.disabled = true;
    hideError();

    // Vérification du format du code postal
    if (!/^\d{5}$/.test(codePostal)) {
        if (codePostal.length > 0) {
            showError('Veuillez entrer un code postal valide (5 chiffres)');
        }
        return;
    }

    try {
        showLoading(true);
        const communes = await fetchCommunesByCodePostal(codePostal);
        displayCommunes(communes);
    } catch (error) {
        showError('Erreur lors de la recherche des communes');
    } finally {
        showLoading(false);
    }
}

/**
 * Récupération des communes liées à un code postal
 */
async function fetchCommunesByCodePostal(codePostal) {
    // Récupération des coordonnées géographiques
    const response = await fetch(`${API_CONFIG.GEO_API}?codePostal=${codePostal}&format=geojson&geometry=centre`);
    if (!response.ok) throw new Error("Erreur réseau");
    
    const geoJsonData = await response.json();
    console.log('Données GeoJSON reçues:', geoJsonData);
    
    // Transformation des données GeoJSON
    const communes = geoJsonData.features?.map(feature => ({
        code: feature.properties.code,
        nom: feature.properties.nom,
        codesPostaux: feature.properties.codesPostaux,
        centre: feature.geometry // Coordonnées géographiques
    })) || [];
    
    console.log('Communes converties:', communes);
    return communes;
}

/**
 * Affichage des communes dans la liste déroulante
 */
function displayCommunes(communes) {
    currentCommunes = communes;
    
    if (communes.length === 0) {
        showError("Aucune commune trouvée pour ce code postal");
        return;
    }

    communes.forEach(commune => {
        const option = document.createElement("option");
        option.value = commune.code;
        option.textContent = commune.nom;
        elements.communeSelect.appendChild(option);
    });

    elements.communeSelect.disabled = false;
}

/**
 * Réaction au changement de sélection de commune
 */
function handleCommuneChange() {
    const selectedCode = elements.communeSelect.value;
    elements.submitBtn.disabled = !selectedCode;
    
    if (selectedCode) {
        currentCityData = currentCommunes.find(c => c.code === selectedCode);
        console.log('Commune sélectionnée:', currentCityData); // Débogage
    }
}

/**
 * Gestion de l'envoi du formulaire
 */
async function handleFormSubmit(event) {
    event.preventDefault();
    
    const selectedCommune = elements.communeSelect.value;
    const daysCount = parseInt(elements.daysSlider.value);
    const selectedOptions = getSelectedOptions();
    
    if (!selectedCommune) {
        showError('Veuillez sélectionner une commune');
        return;
    }

    try {
        showLoading(true);
        hideError();
        
        console.log('Début de la recherche météo...');
        const meteoData = await fetchMeteoByCommune(selectedCommune, daysCount);
        console.log('Données météo reçues:', meteoData);
        
        displayResults(currentCityData, meteoData.forecasts, selectedOptions);
        
    } catch (error) {
        console.error('Erreur complète:', error);
        const errorMessage = error.message || 'Erreur lors de la récupération des données météo';
        showError(errorMessage);
    } finally {
        showLoading(false);
    }
}

/**
 * Récupération des données météorologiques pour une commune
 */
async function fetchMeteoByCommune(selectedCommune, numberOfDays = 1) {
    try {
        console.log('Récupération météo pour INSEE:', selectedCommune, 'Jours:', numberOfDays);
        
        const response = await fetch(
            `${API_CONFIG.METEO_API}?token=${API_CONFIG.TOKEN}&insee=${selectedCommune}`
        );
        
        console.log('Statut de la réponse météo:', response.status);
        
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                throw new Error('Token API invalide ou expiré. Vérifiez votre token Météo Concept.');
            }
            throw new Error(`Erreur API météo: ${response.status}`);
        }

        const data = await response.json();
        console.log('Données météo complètes reçues:', data);
        
        // Extraction des données de prévisions
        let forecasts = null;
        
        if (data.forecast && Array.isArray(data.forecast)) {
            forecasts = data.forecast;
        } else if (data.forecasts && Array.isArray(data.forecasts)) {
            forecasts = data.forecasts;
        } else if (Array.isArray(data)) {
            forecasts = data;
        } else if (data.city && data.city.forecast && Array.isArray(data.city.forecast)) {
            forecasts = data.city.forecast;
        }
        
        console.log('Forecasts extraits:', forecasts);
        
        if (!forecasts || forecasts.length === 0) {
            throw new Error("Aucune donnée météorologique disponible pour cette commune");
        }

        return {
            city: data.city || { name: 'Commune sélectionnée' },
            forecasts: forecasts.slice(0, numberOfDays)
        };
        
    } catch (error) {
        console.error('Erreur détaillée lors de la récupération météo:', error);
        throw error;
    }
}

/**
 * Affichage des résultats de la météo
 */
function displayResults(cityData, forecast, selectedOptions) {
    elements.cityName.textContent = `Prévisions pour ${cityData.nom}`;
    displayLocationInfo(cityData, selectedOptions);
    
    // Création des cartes météo et localisation
    displaySummaryCards(cityData, forecast[0]);
    generateWeatherCards(forecast, selectedOptions);
    
    elements.resultsSection.style.display = 'block';
    elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Affichage des cartes de résumé météo et localisation
 */
function displaySummaryCards(cityData, todayWeather) {
    // Suppression des anciennes cartes
    const existingSummary = document.getElementById('summary-container');
    if (existingSummary) {
        existingSummary.remove();
    }
    
    // Création du conteneur des cartes
    const summaryContainer = document.createElement('div');
    summaryContainer.id = 'summary-container';
    summaryContainer.className = 'summary-container';
    
    // Carte météo
    const weatherCard = createWeatherSummaryCard(todayWeather);
    
    // Carte de localisation
    const locationCard = createLocationCard(cityData);
    
    summaryContainer.appendChild(weatherCard);
    summaryContainer.appendChild(locationCard);
    
    // Insertion du conteneur après les informations de localisation
    elements.locationInfo.parentNode.insertBefore(summaryContainer, elements.locationInfo.nextSibling);
}

/**
 * Création d'une carte de résumé météo
 */
function createWeatherSummaryCard(todayWeather) {
    const weatherCard = document.createElement('div');
    weatherCard.className = 'weather-summary-card';
    
    const weatherIcon = getWeatherIcon(todayWeather.weather);
    const weatherDescription = getWeatherDescription(todayWeather.weather);
    
    weatherCard.innerHTML = `
        <div class="summary-content">
            <div class="summary-icon">
                <i class="${weatherIcon}"></i>
            </div>
            <div class="summary-info">
                <div class="summary-temp">${Math.round(todayWeather.tmax)}°C</div>
                <div class="summary-description">${weatherDescription}</div>
                <div class="summary-details">
                    Min: ${Math.round(todayWeather.tmin)}°C • Pluie: ${todayWeather.probarain || 0}%
                </div>
            </div>
        </div>
    `;
    
    return weatherCard;
}

/**
 * Création d'une carte de localisation avec mini-carte intégrée
 */
function createLocationCard(cityData) {
    const locationCard = document.createElement('div');
    locationCard.className = 'location-summary-card';
    
    let latitude = null;
    let longitude = null;
    
    if (cityData.centre && cityData.centre.coordinates && cityData.centre.coordinates.length >= 2) {
        longitude = cityData.centre.coordinates[0]; // Longitude
        latitude = cityData.centre.coordinates[1];  // Latitude
    }
    
    console.log('Coordonnées extraites:', { latitude, longitude, cityData: cityData.centre });
    
    // Création d'un identifiant unique pour la carte
    const mapId = `map-${cityData.code}-${Date.now()}`;
    
    locationCard.innerHTML = `
        <div class="location-content">
            <div class="location-info-side">
                <div class="location-icon">
                    <i class="fas fa-map-marker-alt"></i>
                </div>
            </div>
            ${latitude !== null && longitude !== null ? 
                `<div class="mini-map-container">
                    <div id="${mapId}" class="mini-map-leaflet"></div>
                </div>` : 
                '<div class="mini-map-disabled">Carte non disponible</div>'
            }
        </div>
    `;
    
    // Initialisation de la carte après son insertion dans le DOM
    setTimeout(() => {
        if (latitude !== null && longitude !== null) {
            initMiniMap(mapId, latitude, longitude, cityData.nom);
        }
    }, 100);
    
    return locationCard;
}

/**
 * Initialisation de la mini-carte avec Leaflet
 */
function initMiniMap(mapId, latitude, longitude, cityName) {
    try {
        // Vérification de l'existence de l'élément
        const mapElement = document.getElementById(mapId);
        if (!mapElement) {
            console.error('Élément de carte non trouvé:', mapId);
            return;
        }

        console.log('Initialisation de la carte:', mapId, 'Coordonnées:', latitude, longitude);

        // Création de la carte Leaflet
        const map = L.map(mapId, {
            center: [latitude, longitude],
            zoom: 13,
            zoomControl: true,
            attributionControl: true,
            scrollWheelZoom: true,
            doubleClickZoom: true,
            boxZoom: true,
            keyboard: true,
            dragging: true
        });

        // Ajout des tuiles OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: '© OpenStreetMap'
        }).addTo(map);

        // Ajout d'un marqueur avec popup pour afficher les coordonnées
        const marker = L.marker([latitude, longitude]).addTo(map);
        const coordsText = `${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°E`;
        marker.bindPopup(`
            <div style="text-align: center; font-family: Arial, sans-serif;">
                <strong style="color: #2563eb; font-size: 14px;">${cityName}</strong><br>
                <span style="color: #64748b; font-size: 12px; font-family: monospace;">${coordsText}</span><br>
                <small style="color: #94a3b8; font-size: 10px;">Naviguez sur la carte avec la souris</small>
            </div>
        `).openPopup();

        console.log('Mini-carte initialisée avec succès:', mapId);
        
    } catch (error) {
        console.error('Erreur lors de l\'initialisation de la carte:', error);
    }
}

/**
 * Ouvrir la carte en plein écran dans un nouvel onglet
 */
function openFullMap(latitude, longitude, cityName) {
    const url = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}&zoom=15&layers=M`;
    window.open(url, '_blank');
}

/**
 * Obtenir le nom du département à partir du code postal
 */
function getDepartementFromCodePostal(codePostal) {
    if (!codePostal) return 'France';
    
    const departements = {
        '01': 'Ain', '02': 'Aisne', '03': 'Allier', '04': 'Alpes-de-Haute-Provence',
        '05': 'Hautes-Alpes', '06': 'Alpes-Maritimes', '07': 'Ardèche', '08': 'Ardennes',
        '09': 'Ariège', '10': 'Aube', '11': 'Aude', '12': 'Aveyron',
        '13': 'Bouches-du-Rhône', '14': 'Calvados', '15': 'Cantal', '16': 'Charente',
        '17': 'Charente-Maritime', '18': 'Cher', '19': 'Corrèze', '21': 'Côte-d\'Or',
        '22': 'Côtes-d\'Armor', '23': 'Creuse', '24': 'Dordogne', '25': 'Doubs',
        '26': 'Drôme', '27': 'Eure', '28': 'Eure-et-Loir', '29': 'Finistère',
        '30': 'Gard', '31': 'Haute-Garonne', '32': 'Gers', '33': 'Gironde',
        '34': 'Hérault', '35': 'Ille-et-Vilaine', '36': 'Indre', '37': 'Indre-et-Loire',
        '38': 'Isère', '39': 'Jura', '40': 'Landes', '41': 'Loir-et-Cher',
        '42': 'Loire', '43': 'Haute-Loire', '44': 'Loire-Atlantique', '45': 'Loiret',
        '46': 'Lot', '47': 'Lot-et-Garonne', '48': 'Lozère', '49': 'Maine-et-Loire',
        '50': 'Manche', '51': 'Marne', '52': 'Haute-Marne', '53': 'Mayenne',
        '54': 'Meurthe-et-Moselle', '55': 'Meuse', '56': 'Morbihan', '57': 'Moselle',
        '58': 'Nièvre', '59': 'Nord', '60': 'Oise', '61': 'Orne',
        '62': 'Pas-de-Calais', '63': 'Puy-de-Dôme', '64': 'Pyrénées-Atlantiques', '65': 'Hautes-Pyrénées',
        '66': 'Pyrénées-Orientales', '67': 'Bas-Rhin', '68': 'Haut-Rhin', '69': 'Rhône',
        '70': 'Haute-Saône', '71': 'Saône-et-Loire', '72': 'Sarthe', '73': 'Savoie',
        '74': 'Haute-Savoie', '75': 'Paris', '76': 'Seine-Maritime', '77': 'Seine-et-Marne',
        '78': 'Yvelines', '79': 'Deux-Sèvres', '80': 'Somme', '81': 'Tarn',
        '82': 'Tarn-et-Garonne', '83': 'Var', '84': 'Vaucluse', '85': 'Vendée',
        '86': 'Vienne', '87': 'Haute-Vienne', '88': 'Vosges', '89': 'Yonne',
        '90': 'Territoire de Belfort', '91': 'Essonne', '92': 'Hauts-de-Seine', '93': 'Seine-Saint-Denis',
        '94': 'Val-de-Marne', '95': 'Val-d\'Oise'
    };
    
    const deptCode = codePostal.substring(0, 2);
    return departements[deptCode] || 'France';
}

/**
 * Affichage des informations de localisation
 */
function displayLocationInfo(cityData, selectedOptions) {
    let locationHTML = `<strong>${cityData.nom}</strong>`;
    
    // Afficher le code postal si disponible
    if (cityData.codesPostaux && cityData.codesPostaux.length > 0) {
        locationHTML += ` (${cityData.codesPostaux[0]})`;
    }
    
    // log des données de localisation pour débogage
    console.log('Données de la commune pour coordonnées:', cityData);
    
    // Extraction des coordonnées
    let latitude = null;
    let longitude = null;
    
    if (cityData.centre && cityData.centre.coordinates) {
        longitude = cityData.centre.coordinates[0];
        latitude = cityData.centre.coordinates[1];
    }
    
    // Afficher la latitude si sélectionnée
    if (selectedOptions.includes('latitude')) {
        const latitudeText = latitude !== null ? latitude.toFixed(4) + '°' : 'Non disponible';
        locationHTML += ` • Latitude: ${latitudeText}`;
    }
    
    // Afficher la longitude si sélectionnée
    if (selectedOptions.includes('longitude')) {
        const longitudeText = longitude !== null ? longitude.toFixed(4) + '°' : 'Non disponible';
        locationHTML += ` • Longitude: ${longitudeText}`;
    }
    
    elements.locationInfo.innerHTML = locationHTML;
}

/**
 * Génération des cartes météo pour chaque jour
 */
function generateWeatherCards(forecast, selectedOptions) {
    elements.weatherGrid.innerHTML = '';
    
    if (!Array.isArray(forecast)) {
        showError('Erreur dans le format des données météorologiques.');
        return;
    }
    
    forecast.forEach((day, index) => {
        const card = createWeatherCard(day, selectedOptions, index);
        if (card) {
            elements.weatherGrid.appendChild(card);
        }
    });
}

/**
 * Création d'une carte pour une journée spécifique
 */
function createWeatherCard(dayData, selectedOptions, index) {
    const card = document.createElement('div');
    card.className = 'weather-card';
    card.style.animationDelay = `${index * 0.1}s`;
    
    // Formatage de la date
    const date = new Date(dayData.datetime);
    const dateStr = formatDate(date, index);
    
    // Obtention de l'icône météo
    const weatherIcon = getWeatherIcon(dayData.weather);
    const weatherDescription = getWeatherDescription(dayData.weather);
    
    // Construction de la carte
    card.innerHTML = `
        <div class="weather-card-header">
            <div class="weather-card-date">${dateStr}</div>
            <div class="weather-icon">
                <i class="${weatherIcon}"></i>
            </div>
        </div>
        
        <div class="weather-temp">
            ${Math.round(dayData.tmax)}°C
        </div>
        
        <div class="weather-description">
            ${weatherDescription}
        </div>
        
        <div class="weather-details">
            <div class="weather-detail">
                <i class="fas fa-thermometer-half"></i>
                Min: ${Math.round(dayData.tmin)}°C
            </div>
            <div class="weather-detail">
                <i class="fas fa-eye"></i>
                Ensoleillement: ${dayData.sun_hours || 0}h
            </div>
            <div class="weather-detail">
                <i class="fas fa-cloud-rain"></i>
                Pluie: ${dayData.probarain || 0}%
            </div>
            ${generateAdditionalDetails(dayData, selectedOptions)}
        </div>
    `;
    
    return card;
}

/**
 * Génération des détails supplémentaires selon les choix
 */
function generateAdditionalDetails(dayData, selectedOptions) {
    let detailsHTML = '';
    
    if (selectedOptions.includes('rain')) {
        detailsHTML += `
            <div class="weather-detail">
                <i class="fas fa-tint"></i>
                Cumul: ${dayData.rr10 || 0} mm
            </div>
        `;
    }
    
    if (selectedOptions.includes('wind')) {
        detailsHTML += `
            <div class="weather-detail">
                <i class="fas fa-wind"></i>
                Vent: ${Math.round(dayData.wind10m || 0)} km/h
            </div>
        `;
    }
    
    if (selectedOptions.includes('wind-direction')) {
        const windDirection = getWindDirection(dayData.dirwind10m || 0);
        detailsHTML += `
            <div class="weather-detail">
                <i class="fas fa-compass"></i>
                Direction: ${windDirection} (${dayData.dirwind10m || 0}°)
            </div>
        `;
    }
    
    return detailsHTML;
}

/**
 * Récupération de l'icône météo en fonction du code
 */
function getWeatherIcon(weatherCode) {
    const iconMap = {
        0: 'fas fa-sun',           // Soleil
        1: 'fas fa-cloud-sun',     // Peu nuageux
        2: 'fas fa-cloud-sun',     // Ciel voilé
        3: 'fas fa-cloud',         // Nuageux
        4: 'fas fa-cloud',         // Très nuageux
        5: 'fas fa-cloud',         // Couvert
        6: 'fas fa-cloud-rain',    // Bruine
        7: 'fas fa-cloud-rain',    // Bruine verglaçante
        10: 'fas fa-cloud-rain',   // Pluie faible
        11: 'fas fa-cloud-rain',   // Pluie modérée
        12: 'fas fa-cloud-rain',   // Pluie forte
        13: 'fas fa-cloud-rain',   // Pluie verglaçante
        16: 'fas fa-snowflake',    // Neige faible
        20: 'fas fa-cloud-bolt',   // Averses légères
        30: 'fas fa-cloud-bolt',   // Orage
        40: 'fas fa-smog',         // Brouillard
        100: 'fas fa-moon',        // Clair (nuit)
        101: 'fas fa-cloud-moon'   // Peu nuageux (nuit)
    };
    
    return iconMap[weatherCode] || 'fas fa-question';
}

/**
 * Obtention de la description météo associée
 */
function getWeatherDescription(weatherCode) {
    const descriptionMap = {
        0: 'Ensoleillé',
        1: 'Peu nuageux',
        2: 'Ciel voilé',
        3: 'Nuageux',
        4: 'Très nuageux',
        5: 'Couvert',
        6: 'Bruine',
        7: 'Bruine verglaçante',
        10: 'Pluie faible',
        11: 'Pluie modérée',
        12: 'Pluie forte',
        13: 'Pluie verglaçante',
        16: 'Neige faible',
        20: 'Averses',
        30: 'Orage',
        40: 'Brouillard',
        100: 'Clair',
        101: 'Peu nuageux'
    };
    
    return descriptionMap[weatherCode] || 'Conditions inconnues';
}

/**
 * Conversion de la direction du vent en une valeur textuelle
 */
function getWindDirection(degrees) {
    const directions = [
        'N', 'NNE', 'NE', 'ENE',
        'E', 'ESE', 'SE', 'SSE',
        'S', 'SSO', 'SO', 'OSO',
        'O', 'ONO', 'NO', 'NNO'
    ];
    
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

/**
 * Formatage de la date pour l'affichage
 */
function formatDate(date, index) {
    if (index === 0) {
        return "Aujourd'hui";
    }
    
    const options = {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
    };
    
    return date.toLocaleDateString('fr-FR', options);
}

/**
 * Récupération des options sélectionnées
 */
function getSelectedOptions() {
    return Array.from(elements.checkboxes)
        .filter(checkbox => checkbox.checked)
        .map(checkbox => checkbox.value);
}

/**
 * Mise à jour de la valeur du curseur
 */
function updateDaysValue() {
    elements.daysValue.textContent = elements.daysSlider.value;
}

/**
 * Affichage ou masquage de l'indicateur de chargement
 */
function showLoading(show) {
    elements.loading.style.display = show ? 'block' : 'none';
    if (show) {
        elements.resultsSection.style.display = 'none';
    }
}

/**
 * Affichage d'un message d'erreur
 */
function showError(message) {
    elements.errorText.textContent = message;
    elements.errorMessage.style.display = 'block';
    elements.resultsSection.style.display = 'none';
    
    // Masquer l'erreur après un délai
    setTimeout(hideError, 5000);
}

/**
 * Masquage du message d'erreur
 */
function hideError() {
    elements.errorMessage.style.display = 'none';
}

/**
 * Initialisation lorsque le document est chargé
 */
document.addEventListener('DOMContentLoaded', initApp);
