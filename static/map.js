// map.js - control de la UI del mapa y comunicación con el backend

// Estado global mínimo
let inicio = null;    // nombre de estación inicio seleccionado
let fin = null;       // nombre de estación fin seleccionado
let estaciones = {};  // mapa nombre -> {x,y,linea,color}

const capaEstaciones = document.getElementById("estaciones");
const divResultado = document.getElementById("resultado");
const divPasos = document.getElementById("lista-pasos");

const ANCHO_MAPA = 1096;       // debe coincidir con dimensiones en backend
const ALTO_MAPA = 1269;

// Cargar estaciones (archivo JSON) y dibujarlas como puntos interactivos
fetch("/static/lines.json")
  .then(r => r.json())
  .then(data => dibujarEstaciones(data));

function dibujarEstaciones(data) {
  // cada estación se representa como un div posicionado sobre el mapa
  for (const [linea, info] of Object.entries(data)) {
    const color = info.color;
    for (const [nombre, pos] of Object.entries(info.stations)) {
      const [xr, yr] = pos;
      const x = xr * ANCHO_MAPA;
      const y = yr * ALTO_MAPA;

      estaciones[nombre] = { x, y, linea, color };

      const punto = document.createElement("div");
      punto.className = "estacion";
      punto.style.left = x + "px";
      punto.style.top = y + "px";
      punto.style.backgroundColor = color;
      punto.title = nombre;

      // click selecciona inicio/fin
      punto.addEventListener("click", () => seleccionar(nombre));

      capaEstaciones.appendChild(punto);
    }
  }
}

// Primer click = inicio, segundo = fin
function seleccionar(nombre) {
  if (!inicio) {
    inicio = nombre;
    resaltar(nombre, "#00ff00");
    divResultado.textContent = `Inicio: ${nombre}`;
  }
  else if (!fin) {
    fin = nombre;
    resaltar(nombre, "#ff0000");
    divResultado.textContent += ` → Fin: ${nombre}`;
    calcularRuta(); // pedir ruta al backend cuando ya tenemos origen y destino
  }
  else {
    reiniciar();
    seleccionar(nombre);
  }
}

function resaltar(nombre, color) {
  // efecto visual para la estación seleccionada
  document.querySelectorAll(".estacion").forEach(e => {
    if (e.title === nombre) {
      e.style.borderColor = color;
      e.style.boxShadow = `0 0 10px ${color}`;
    }
  });
}

function reiniciar() {
  // limpiar UI y estado
  inicio = null;
  fin = null;
  divResultado.textContent = "";
  divPasos.innerHTML = "";
  document.getElementById("ruta").innerHTML = "";

  document.querySelectorAll(".estacion").forEach(e => {
    e.style.borderColor = "white";
    e.style.boxShadow = "none";
  });
}

// Envío al backend: POST /ruta con inicio/fin -> recibe {pasos, tiempo_total}
function calcularRuta() {
  fetch("/ruta", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inicio, fin })
  })
    .then(r => r.json())
    .then(data => {
      // dibujar y mostrar pasos recibidos
      dibujarRuta(data.pasos);
      mostrarPasos(data.pasos);
      divResultado.textContent += ` — Tiempo total: ${data.tiempo_total} min`;
    });
}

// Dibuja líneas SVG entre estaciones según pasos
function dibujarRuta(pasos) {
  const svg = document.getElementById("ruta");
  svg.innerHTML = "";

  pasos.forEach(p => {
    const a = estaciones[p.desde];
    const b = estaciones[p.hasta];

    const linea = document.createElementNS("http://www.w3.org/2000/svg", "line");
    linea.setAttribute("x1", a.x);
    linea.setAttribute("y1", a.y);
    linea.setAttribute("x2", b.x);
    linea.setAttribute("y2", b.y);

    // color por tipo de paso para distinguir visualmente
    if (p.tipo === "metro")
      linea.setAttribute("stroke", "#ff3333");
    else if (p.tipo === "transbordo")
      linea.setAttribute("stroke", "yellow");
    else if (p.tipo === "caminar")
      linea.setAttribute("stroke", "#33aaff");
    else if (p.tipo === "abordar")
      linea.setAttribute("stroke", "white");

    linea.setAttribute("stroke-width", "3");
    svg.appendChild(linea);
  });
}

// Pinta la lista textual de pasos en la UI
function mostrarPasos(pasos) {
  divPasos.innerHTML = "";
  pasos.forEach(p => {
    const d = document.createElement("div");
    d.textContent = `${p.desde} → ${p.hasta} : ${p.tiempo} min (${p.tipo})`;
    divPasos.appendChild(d);
  });
}
