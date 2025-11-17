//map.js - script del mapa de la pagina web que dibujara los overlays, estaciones y trazos y manejara los inputs y outputs

// Variables globales

let inicio = null;
let fin = null;
let estaciones = {};

const capaEstaciones = document.getElementById("estaciones");
const divResultado = document.getElementById("resultado");
const divPasos = document.getElementById("lista-pasos");

const ANCHO_MAPA = 396;
const ALTO_MAPA = 443;

// Cargar estaciones con sus respectivos datos (coordenadas, color, linea y nombre)

fetch("/static/lines.json")
  .then(r => r.json())
  .then(data => dibujarEstaciones(data));

function dibujarEstaciones(data) {

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

      punto.addEventListener("click", () => seleccionar(nombre));

      capaEstaciones.appendChild(punto);
    }
  }
}

// Selección de estaciones

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
    calcularRuta();
  }
  else {
    reiniciar();
    seleccionar(nombre);
  }
}

function resaltar(nombre, color) {
  document.querySelectorAll(".estacion").forEach(e => {
    if (e.title === nombre) {
      e.style.borderColor = color;
      e.style.boxShadow = `0 0 10px ${color}`;
    }
  });
}

function reiniciar() {
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

// Llamar al backend

function calcularRuta() {
  fetch("/ruta", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inicio, fin })
  })
    .then(r => r.json())
    .then(data => {
      dibujarRuta(data.pasos);
      mostrarPasos(data.pasos);
      divResultado.textContent += ` — Tiempo total: ${data.tiempo_total} min`;
    });
}

// Dibujar ruta

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

// Mostrar lista de pasos

function mostrarPasos(pasos) {
  divPasos.innerHTML = "";
  pasos.forEach(p => {
    const d = document.createElement("div");
    d.textContent = `${p.desde} → ${p.hasta} : ${p.tiempo} min (${p.tipo})`;
    divPasos.appendChild(d);
  });
}
