// map.js - control de la UI del mapa y comunicación con el backend

// Estado global mínimo
let inicio = null;    // nombre de estación inicio seleccionado
let fin = null;       // nombre de estación fin seleccionado
let estaciones = {};  // mapa nombre -> {lat, lon, linea, color}
let map = null;       // instancia del mapa Leaflet
let routeLayer = null; // capa para dibujar la ruta

const divResultado = document.getElementById("resultado");
const divPasos = document.getElementById("lista-pasos");

// Inicializar mapa Leaflet
function initMap() {
  // Coordenadas centrales de CDMX
  map = L.map('mapa').setView([19.4326, -99.1332], 12);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  // Cargar estaciones
  fetch("/static/lines.json")
    .then(r => r.json())
    .then(data => dibujarRed(data));
}

function dibujarRed(data) {
  // Dibujar líneas y estaciones
  for (const [linea, info] of Object.entries(data)) {
    const color = info.color;
    const points = [];

    // Recopilar puntos para la polilínea de la línea
    // Nota: El orden en el JSON debe ser secuencial para que la línea se dibuje bien.
    // Si no lo es, habría que ordenar, pero asumimos que el JSON está ordenado.
    for (const [nombre, coords] of Object.entries(info.stations)) {
      const [lat, lon] = coords;
      estaciones[nombre] = { lat, lon, linea, color };
      points.push([lat, lon]);

      // Marcador visual (no interactivo)
      L.circleMarker([lat, lon], {
        radius: 5,
        fillColor: color,
        color: "#fff",
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8,
        interactive: false // Importante: no bloquea el hitMarker
      }).addTo(map);

      // Marcador de interacción (invisible pero más grande)
      const hitMarker = L.circleMarker([lat, lon], {
        radius: 15, // Área de click más grande
        fillColor: color,
        color: "transparent",
        weight: 0,
        opacity: 0,
        fillOpacity: 0
      }).addTo(map);

      hitMarker.bindTooltip(nombre);
      hitMarker.on('click', () => seleccionar(nombre));
    }

    // Dibujar la línea del metro
    L.polyline(points, {
      color: color,
      weight: 3,
      opacity: 0.7
    }).addTo(map);
  }
}

// Primer click = inicio, segundo = fin
function seleccionar(nombre) {
  if (!inicio) {
    inicio = nombre;
    divResultado.textContent = `Inicio: ${nombre}`;
  }
  else if (!fin) {
    fin = nombre;
    divResultado.textContent += ` → Fin: ${nombre}`;
    calcularRuta();
  }
  else {
    reiniciar();
    seleccionar(nombre);
  }
}

function reiniciar() {
  inicio = null;
  fin = null;
  divResultado.textContent = "Selecciona dos estaciones en el mapa.";
  divPasos.innerHTML = "";
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
}

// Envío al backend
function calcularRuta() {
  fetch("/ruta", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inicio, fin })
  })
    .then(r => r.json())
    .then(data => {
      dibujarRuta(data.pasos);
      mostrarPasos(data.instrucciones);
      divResultado.textContent += ` — Tiempo total: ${data.tiempo_total} min`;
    });
}

// Dibuja la ruta calculada en el mapa
function dibujarRuta(pasos) {
  if (routeLayer) {
    map.removeLayer(routeLayer);
  }

  const latlngs = [];

  // Añadir punto de origen
  if (pasos.length > 0) {
    const origen = estaciones[pasos[0].desde];
    if (origen) latlngs.push([origen.lat, origen.lon]);
  }

  pasos.forEach(p => {
    const dest = estaciones[p.hasta];
    if (dest) latlngs.push([dest.lat, dest.lon]);
  });

  routeLayer = L.polyline(latlngs, {
    color: 'white',
    weight: 5,
    opacity: 0.9,
    dashArray: '10, 10'
  }).addTo(map);

  map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
}

// Pinta la lista textual de pasos en la UI
function mostrarPasos(instrucciones) {
  divPasos.innerHTML = "";
  instrucciones.forEach(texto => {
    const d = document.createElement("div");
    d.textContent = texto;
    divPasos.appendChild(d);
  });
}

// Iniciar
initMap();
