# app.py — Back-end del sistema de rutas Metro CDMX

from flask import Flask, render_template, request, jsonify
import json, os
import networkx as nx
import math
from collections import defaultdict

app = Flask(__name__)

# CONFIGURACIÓN

ANCHO_IMG = 396
ALTO_IMG = 443

VELOCIDAD_CAMINAR = 5           # pixeles por minuto
TIEMPO_ABORDAR = 2              # minutos por subir al metro
TIEMPO_ENTRE_ESTACIONES = 2     # minutos
TIEMPO_TRANSBORDO = 5           # minutos para cambiar de metro

# CARGAR ARCHIVO JSON

BASE = os.path.dirname(__file__)
with open(os.path.join(BASE, "static", "lines.json"), "r", encoding="utf-8") as f:
    LINEAS = json.load(f)

# CONSTRUIR GRAFO

G = nx.Graph()

estaciones_globales = {}

for nombre_linea, info in LINEAS.items():
    estaciones = list(info["stations"].keys())

    for i, est in enumerate(estaciones):
        xr, yr = info["stations"][est]
        px = xr * ANCHO_IMG
        py = yr * ALTO_IMG

        # Guardar posición única global
        estaciones_globales[est] = (px, py)

        nodo = (est, nombre_linea)
        G.add_node(nodo, estacion=est, linea=nombre_linea, pos=(px, py))

        if i > 0:
            nodo_prev = (estaciones[i - 1], nombre_linea)
            G.add_edge(
                nodo_prev, nodo,
                peso=TIEMPO_ENTRE_ESTACIONES,
                tipo="metro"
            )

# Crear mapa estación → nodos (para transbordos)
estacion_a_nodos = defaultdict(list)
for nodo in G.nodes():
    est = nodo[0]
    estacion_a_nodos[est].append(nodo)

# Transbordos
for est, nodos in estacion_a_nodos.items():
    if len(nodos) > 1:
        for i in range(len(nodos)):
            for j in range(i + 1, len(nodos)):
                G.add_edge(
                    nodos[i], nodos[j],
                    peso=TIEMPO_TRANSBORDO,
                    tipo="transbordo"
                )

# FUNCIONES DE DISTANCIA

def distancia_pixeles(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])

def tiempo_caminando(a, b):
    return distancia_pixeles(a, b) / VELOCIDAD_CAMINAR

# A* EN MINUTOS

def calcular_mejor_ruta(origen, destino):

    pos_origen = estaciones_globales[origen]
    pos_destino = estaciones_globales[destino]

    # Caminata directa
    tiempo_caminata = tiempo_caminando(pos_origen, pos_destino)

    # Construcción del grafo temporal
    ORI, FIN = ("ORI", "ORI"), ("FIN", "FIN")
    GT = G.copy()
    GT.add_node(ORI)
    GT.add_node(FIN)

    # Entra al metro solo desde el origen
    for nodo in estacion_a_nodos[origen]:
        GT.add_edge(
            ORI, nodo,
            peso=TIEMPO_ABORDAR,
            tipo="abordar"
        )

    # Conecta destino
    for nodo in estacion_a_nodos[destino]:
        GT.add_edge(
            nodo, FIN,
            peso=0
        )

    # Heurística (en minutos)
    def heuristica(actual, objetivo):
        if actual in (ORI, FIN):
            return 0
        px = GT.nodes[actual]["pos"]
        return tiempo_caminando(px, pos_destino)

    # Intentar A*
    try:
        ruta_raw = nx.astar_path(GT, ORI, FIN, heuristic=heuristica, weight="peso")
    except:
        return None

    # Convertir ruta a pasos legibles
    pasos = []
    for a, b in zip(ruta_raw[:-1], ruta_raw[1:]):
        if a in (ORI, FIN) or b in (ORI, FIN):
            continue

        est1, _ = a
        est2, _ = b

        t = GT[a][b]["peso"]
        tipo = GT[a][b].get("tipo", "metro")

        pasos.append({
            "desde": est1,
            "hasta": est2,
            "tiempo": round(t, 2),
            "tipo": tipo
        })

    tiempo_metro = sum(p["tiempo"] for p in pasos)

    return {
        "pasos": pasos,
        "tiempo_total": round(tiempo_metro, 2),
        "tiempo_caminando": round(tiempo_caminata, 2)
    }

# ROUTES DEL FLASK

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/ruta", methods=["POST"])
def ruta():

    datos = request.get_json() or {}

    origen = datos.get("inicio")
    destino = datos.get("fin")

    if not origen or not destino:
        return jsonify({"error": "Debes enviar 'inicio' y 'fin'"}), 400

    resultado = calcular_mejor_ruta(origen, destino)
    if resultado is None:
        return jsonify({"error": "No existe ruta válida"}), 404

    # CAMINAR DIRECTO SI ES MÁS RÁPIDO
    if resultado["tiempo_caminando"] < resultado["tiempo_total"]:
        t = resultado["tiempo_caminando"]
        return jsonify({
            "pasos": [{
                "desde": origen,
                "hasta": destino,
                "tiempo": round(t, 2),
                "tipo": "caminar"
            }],
            "tiempo_total": round(t, 2)
        })

    return jsonify(resultado)


if __name__ == "__main__":
    app.run(debug=True)
