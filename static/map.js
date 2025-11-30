// map.js - se encarga de controlar la ui del mapa y de la comunicación con el backend

let inicio = null;
let fin = null;
let estaciones = {};
let map = null;       // mapa Leaflet
let routeLayer = null; // capa extra para dibujar la ruta
let coloresLineas = {}; // mapa de colores por línea 

const divResultado = document.getElementById("resultado");
const divPasos = document.getElementById("lista-pasos");

// Inicializar mapa Leaflet
function initMap() {
  // Coordenadas centrales de CDMX
  map = L.map('mapa').setView([19.4326, -99.1332], 12);
  //con esto copio el mapa 
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
  for (const [linea, info] of Object.entries(data)) {
    const color = info.color;
    coloresLineas[linea] = color; // Guardamos el color de la línea
    const points = [];
    // El orden en el JSON debe ser secuencial para que la línea se dibuje bien.
    // Si no lo es, habría que ordenar, pero asumimos que el JSON está ordenado.
    for (const [nombre, coords] of Object.entries(info.stations)) {
      const [lat, lon] = coords;
      estaciones[nombre] = { lat, lon, linea, color };
      points.push([lat, lon]);

      // Marcador visual 
      L.circleMarker([lat, lon], {
        radius: 5,
        fillColor: color,
        color: "#fff",
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8,
        interactive: false // Importante: no bloquea el hitMarker, que si no no podemos seleccionar la estación
      }).addTo(map);

      // hitbox para poder seleccionar la estación
      const hitMarker = L.circleMarker([lat, lon], {
        radius: 15,
        fillColor: color,
        color: "transparent",
        weight: 0,
        opacity: 0,
        fillOpacity: 0
      }).addTo(map);

      hitMarker.bindTooltip(nombre);
      hitMarker.on('click', () => seleccionar(nombre));
    }

    //Con esto dibujamos la línea del metro
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
      mostrarPasos(data.instrucciones, data.pasos);
      divResultado.textContent += ` — Tiempo total: ${formatearTiempo(data.tiempo_total)}`;
    });
}

function formatearTiempo(minutos) {
  const m = Math.round(minutos);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return `${h} h ${rest} min`;
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

// Sirve para poner por que estaciones se pasa en cada línea
function mostrarPasos(instrucciones, pasos) {
  divPasos.innerHTML = "";

  if (!pasos || pasos.length === 0) return;

  // primero lo agrupamos en segmentos, como caminar, línea de metro o transbordo.
  const segmentos = [];
  let segmentoActual = null;

  pasos.forEach((paso, index) => {
    if (paso.tipo === "caminar" || paso.tipo === "transbordo" || paso.tipo === "llegada") {
      if (segmentoActual) {
        segmentos.push(segmentoActual);
        segmentoActual = null;
      }
      // añadimos el paso de transición
      segmentos.push({
        tipo: paso.tipo,
        desde: paso.desde,
        hasta: paso.hasta,
        tiempo: paso.tiempo
      });
    } else if (paso.tipo === "metro") {
      // Si nos cambiamos de línea, cerramos el segmento actual y creamos uno nuevo
      if (!segmentoActual || segmentoActual.linea !== paso.linea) {
        if (segmentoActual) {
          segmentos.push(segmentoActual);
        }
        segmentoActual = {
          tipo: "metro",
          linea: paso.linea,
          estaciones: [paso.desde],
          tiempoTotal: 0
        };
      }
      segmentoActual.estaciones.push(paso.hasta);
      segmentoActual.tiempoTotal += paso.tiempo;
    }
  });

  // peude quedar un segmento abierto, así que lo añadimos también
  if (segmentoActual) {
    segmentos.push(segmentoActual);
  }

  // Ahora renderizamos los segmentos
  segmentos.forEach((seg, index) => {
    const div = document.createElement("div");
    div.className = "route-segment";

    if (seg.tipo === "metro") {
      const header = document.createElement("div");
      header.className = "segment-header";

      // color que le ponemos al símbolo que hay encima de la línea, primero le damos un generico y luego con el mapa
      //le damos el que le corresponde.
      let colorLinea = "#999";
      // Usamos el mapa de colores de líneas para dar el color de la línea
      if (coloresLineas[seg.linea]) {
        colorLinea = coloresLineas[seg.linea];
      } else if (estaciones[seg.estaciones[0]]) {
        colorLinea = estaciones[seg.estaciones[0]].color;
      }

      header.innerHTML = `
        <div class="line-indicator" style="background-color: ${colorLinea};"></div>
        <div class="segment-info">
          <strong>${seg.estaciones[0]}</strong>
          <span class="line-name" style="color: ${colorLinea}">Línea ${seg.linea}</span>
        </div>
        <div class="segment-time">${Math.round(seg.tiempoTotal)} min</div>
      `;
      div.appendChild(header);

      // ESto es solo la línea vertical que se dibuja a la izquierda de cada apartado
      const body = document.createElement("div");
      body.className = "segment-body";
      body.style.borderLeftColor = colorLinea;

      // Estaciones intermedias de cada apartado
      const intermedias = seg.estaciones.slice(1, -1); // Excluir inicio y fin
      if (intermedias.length > 0) {
        const toggleBtn = document.createElement("button");
        toggleBtn.className = "toggle-stops-btn";
        toggleBtn.textContent = `${intermedias.length} paradas`;

        const stopsList = document.createElement("div");
        stopsList.className = "stops-list";
        stopsList.style.display = "none";

        intermedias.forEach(est => {
          const stop = document.createElement("div");
          stop.className = "stop-item";
          stop.textContent = est;
          stopsList.appendChild(stop);
        });

        toggleBtn.addEventListener("click", () => {
          if (stopsList.style.display === "none") {
            stopsList.style.display = "block";
            toggleBtn.textContent = "Ocultar paradas";
          } else {
            stopsList.style.display = "none";
            toggleBtn.textContent = `${intermedias.length} paradas`;
          }
        });

        body.appendChild(toggleBtn);
        body.appendChild(stopsList);
      } else {
        // Si no hay estaciones intermedias, ponemos 1 parada
        const directo = document.createElement("div");
        directo.className = "direct-route";
        directo.textContent = "1 parada";
        body.appendChild(directo);
      }

      div.appendChild(body);

      // Final del apartado
      const footer = document.createElement("div");
      footer.className = "segment-footer";
      footer.innerHTML = `
        <div class="line-indicator" style="background-color: ${colorLinea};"></div>
        <div class="segment-info">
          <strong>${seg.estaciones[seg.estaciones.length - 1]}</strong>
        </div>
      `;
      div.appendChild(footer);

    } else {
      // Renderizar Caminar / Transbordo
      div.classList.add("transition-segment");
      let icon = "🚶";
      let text = `Caminar a ${seg.hasta}`;
      if (seg.tipo === "transbordo") {
        icon = "🔄";
        text = `Transbordo a ${seg.hasta}`;
      }

      div.innerHTML = `
        <div class="transition-icon">${icon}</div>
        <div class="transition-info">
          <span>${text}</span>
          <span class="transition-time">${Math.round(seg.tiempo)} min</span>
        </div>
      `;
    }

    divPasos.appendChild(div);
  });
}

initMap();
 