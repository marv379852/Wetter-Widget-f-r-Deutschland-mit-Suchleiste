document.addEventListener('DOMContentLoaded', function() {
  const API_BASE = 'https://api.open-meteo.com/v1/forecast';
  const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
  
  const searchInput = document.getElementById('townSearch');
  const btn = document.getElementById('searchBtn');
  const loading = document.getElementById('loading');
  const errorDiv = document.getElementById('error');
  const sections = document.querySelectorAll('.weather-section');
  
async function geocodeTown(town) {
    console.log('Suche Koordinaten für: ' + town);
    const url = NOMINATIM_BASE + '?q=' + encodeURIComponent(town + ', Germany') + '&format=json&limit=5&countrycodes=DE';
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'WetterWidget-Deutschland/1.0 (marv379852@gmail.com)'
      }
    });
    const data = await response.json();
    console.log('Geocode response:', data);
      const seenCities = new Map();
    for (let loc of data) {
      const parts = loc.display_name.split(',');
      let city = parts[0].trim().toLowerCase().replace(/^kreis /i, '');
      if (!seenCities.has(city)) {
        const state = parts[1] ? parts[1].trim() : '';
        const country = parts[2] ? parts[2].trim() : '';
        seenCities.set(city, {
          lat: parseFloat(loc.lat),
          lon: parseFloat(loc.lon),
          name: parts[0].trim() + (state ? ', ' + state : '') + (country ? ', ' + country : '')
        });
      }
    }
    const locations = Array.from(seenCities.values());
    if (locations.length === 0) {
      throw new Error('Stadt "' + town + '" nicht gefunden. Probiere z.B. "Berlin", "München"');
    }
    return locations;
  }
  
  async function fetchWeather(lat, lon) {
    const params = new URLSearchParams({
      latitude: lat,
      longitude: lon,
      daily: 'temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,daylight_duration,sunshine_duration,rain_sum,wind_speed_10m_max',
      hourly: 'temperature_2m,rain,precipitation_probability,wind_speed_10m,temperature_80m',
      current: 'temperature_2m,precipitation,rain,is_day,wind_speed_10m',
      timezone: 'Europe/Berlin'
    });
    const url = API_BASE + '?' + params;
    console.log('Fetch weather:', url);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Wetter-API Fehler: ' + response.status);
    }
    return response.json();
  }
  
  function updateCurrent(weather) {
    const current = weather.current;
    const stats = document.getElementById('currentStats');
    stats.innerHTML = `
      <div class="stat">
        <div class="stat-label">Temperatur</div>
        <div class="stat-value">${current.temperature_2m}°C</div>
      </div>
      <div class="stat">
        <div class="stat-label">Gefühlte Temp</div>
        <div class="stat-value">${Math.round(current.temperature_2m - 0.5 * Math.max(0, current.wind_speed_10m - 10)) || '--'}°C</div>
      </div>
      <div class="stat">
        <div class="stat-label">Niederschlag</div>
        <div class="stat-value">${current.rain || 0} mm</div>
      </div>
      <div class="stat">
        <div class="stat-label">Wind</div>
        <div class="stat-value">${current.wind_speed_10m} km/h</div>
      </div>
    `;
  }
  
  function updateDaily(weather) {
    const daily = weather.daily;
    const stats = document.getElementById('dailyStats');
    let html = '';
    const days = Math.min(7, daily.time.length);
    for (let i = 0; i < days; i++) {
      const date = new Date(daily.time[i]).toLocaleDateString('de-DE', {weekday: 'short', day: 'numeric'});
      html += `
        <div class="stat">
          <div class="stat-label">${date}</div>
          <div class="stat-value">${Math.round(daily.temperature_2m_max[i])}° / ${Math.round(daily.temperature_2m_min[i])}°</div>
          <div>Regen: ${daily.rain_sum[i] || 0} mm</div>
          <div>Wind: ${Math.round(daily.wind_speed_10m_max[i])} km/h</div>
        </div>
      `;
    }
    stats.innerHTML = html;
  }
  
  function updateHourly(weather) {
    const hourly = weather.hourly;
    const stats = document.getElementById('hourlyStats');
    let html = '';
    const hours = Math.min(24, hourly.time.length);
    for (let i = 0; i < hours; i++) {
      const timeStr = new Date(hourly.time[i]).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'});
      html += `
        <div class="stat">
          <div class="stat-label">${timeStr}</div>
          <div class="stat-value">${Math.round(hourly.temperature_2m[i])}°C</div>
          <div>P: ${hourly.precipitation_probability[i]}%</div>
          <div>Wind: ${Math.round(hourly.wind_speed_10m[i])} km/h</div>
        </div>
      `;
    }
    stats.innerHTML = html;
  }
  
  btn.addEventListener('click', async function(e) {
    e.preventDefault();
    const town = searchInput.value.trim();
    if (!town) {
      errorDiv.textContent = 'Bitte eine deutsche Stadt eingeben (z.B. Berlin)';
      errorDiv.classList.remove('hidden');
      return;
    }
    searchInput.disabled = true;
    btn.disabled = true;
    errorDiv.classList.add('hidden');
    
    try {
      const locations = await geocodeTown(town);
      if (locations.length === 1) {
        // Single match, proceed directly
        const location = locations[0];
        loading.classList.remove('hidden');
        sections.forEach(s => s.classList.add('hidden'));
        const weatherData = await fetchWeather(location.lat, location.lon);
        console.log('Wetterdaten geladen:', weatherData);
        document.querySelector('h1').textContent = `Wetter für ${location.name}`;
        updateCurrent(weatherData);
        updateDaily(weatherData);
        updateHourly(weatherData);
        sections.forEach(s => s.classList.remove('hidden'));
        resetSearch();
      } else {
        // Multiple matches, show dropdown
        showCitySelect(locations, town);
      }
    } catch (error) {
      console.error('Fehler:', error);
      errorDiv.textContent = error.message;
      errorDiv.classList.remove('hidden');
      resetSearch();
    }
  });
  
  document.getElementById('confirmCity').addEventListener('click', async function() {
    const select = document.getElementById('citySelect');
    const selectedOption = select.options[select.selectedIndex];
    const location = JSON.parse(selectedOption.value);
    loading.classList.remove('hidden');
    sections.forEach(s => s.classList.add('hidden'));
    
    try {
      const weatherData = await fetchWeather(location.lat, location.lon);
      console.log('Wetterdaten geladen:', weatherData);
      document.querySelector('h1').textContent = `Wetter für ${location.name}`;
      updateCurrent(weatherData);
      updateDaily(weatherData);
      updateHourly(weatherData);
      sections.forEach(s => s.classList.remove('hidden'));
    } catch (error) {
      console.error('Fehler:', error);
      errorDiv.textContent = error.message;
      errorDiv.classList.remove('hidden');
    } finally {
      loading.classList.add('hidden');
      resetSearch();
    }
  });
  
  function showCitySelect(locations, originalTown) {
    const select = document.getElementById('citySelect');
    const confirmBtn = document.getElementById('confirmCity');
    select.innerHTML = '';
    locations.forEach((loc, index) => {
      const option = document.createElement('option');
      option.value = JSON.stringify(loc);
      option.textContent = loc.name;
      select.appendChild(option);
    });
    select.selectedIndex = 0;
    select.classList.remove('hidden');
    confirmBtn.classList.remove('hidden');
    document.querySelector('h1').textContent = `Mehrere "${originalTown}" gefunden. Bitte auswählen:`;
  }
  
  function resetSearch() {
    searchInput.disabled = false;
    document.getElementById('searchBtn').disabled = false;
    document.getElementById('citySelect').classList.add('hidden');
    document.getElementById('confirmCity').classList.add('hidden');
    searchInput.value = '';
    loading.classList.add('hidden');
  }
  
  searchInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') btn.click();
  });
});
