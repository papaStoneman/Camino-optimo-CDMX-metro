let startStation = null;
let endStation = null;
let stations = {};
let mapContainer = document.getElementById("overlay");
let resultDiv = document.getElementById("result");

// Dimensiones fijas del mapa (396x443)
const MAP_WIDTH = 396;
const MAP_HEIGHT = 443;

// Cargar líneas y estaciones desde lines.json
fetch("/static/lines.json")
  .then(response => response.json())
  .then(data => {
    drawStations(data);
  })
  .catch(err => console.error("Error cargando lines.json:", err));

function drawStations(data) {
  for (const [line, info] of Object.entries(data)) {
    const color = info.color;
    for (const [name, pos] of Object.entries(info.stations)) {
      const [xRel, yRel] = pos;
      const x = xRel * MAP_WIDTH;
      const y = yRel * MAP_HEIGHT;

      const btn = document.createElement("div");
      btn.className = "station-btn";
      btn.style.backgroundColor = color;
      btn.style.left = `${x}px`;
      btn.style.top = `${y}px`;
      btn.title = name;

      stations[name] = { x, y, line, color };

      btn.addEventListener("click", () => selectStation(name, color));
      mapContainer.appendChild(btn);
    }
  }
}

// Selección de estaciones
function selectStation(name, color) {
  if (!startStation) {
    startStation = name;
    highlightStation(name, "#0f0");
    resultDiv.textContent = `Origen: ${name}`;
  } else if (!endStation) {
    endStation = name;
    highlightStation(name, "#f00");
    resultDiv.textContent += ` → Destino: ${name}`;
    calculateRoute();
  } else {
    resetSelection();
    selectStation(name, color);
  }
}

function highlightStation(name, color) {
  document.querySelectorAll(".station-btn").forEach(btn => {
    if (btn.title === name) {
      btn.style.borderColor = color;
      btn.style.boxShadow = `0 0 10px ${color}`;
    }
  });
}

function resetSelection() {
  startStation = null;
  endStation = null;
  document.querySelectorAll(".station-btn").forEach(btn => {
    btn.style.borderColor = "white";
    btn.style.boxShadow = "none";
  });
  document.getElementById("route-line").innerHTML = "";
  resultDiv.textContent = "";
}

// Calcular ruta mediante Flask
function calculateRoute() {
  fetch("/route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start: startStation, end: endStation })
  })
    .then(response => response.json())
    .then(data => {
      if (!data.path || data.path.length === 0) {
        resultDiv.textContent = "No se encontró ruta entre las estaciones.";
        return;
      }
      drawRoute(data.path);
      resultDiv.textContent += ` — Tiempo total: ${data.distance} min`;
    })
    .catch(err => {
      console.error("Error en cálculo de ruta:", err);
      resultDiv.textContent = "Error al calcular la ruta.";
    });
}

// Dibujar ruta con SVG
function drawRoute(path) {
  const svg = document.getElementById("route-line");
  svg.innerHTML = "";

  for (let i = 0; i < path.length - 1; i++) {
    const s1 = stations[path[i]];
    const s2 = stations[path[i + 1]];

    if (!s1 || !s2) continue;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", s1.x);
    line.setAttribute("y1", s1.y);
    line.setAttribute("x2", s2.x);
    line.setAttribute("y2", s2.y);
    line.setAttribute("stroke", "#00ffff");
    line.setAttribute("stroke-width", "3");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("opacity", "0.9");

    svg.appendChild(line);
  }
}