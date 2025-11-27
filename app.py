# app.py — Servidor Flask que calcula la ruta óptima (A* en dos fases)

from flask import Flask, render_template, request, jsonify
import json, os
import networkx as nx
import math
from collections import defaultdict

app = Flask(__name__)

# ----- Configuración y constantes -----
# Parámetros temporales (minutos)
VELOCIDAD_CAMINAR = 67         # m/min (aprox 4 km/h)
TIEMPO_SALIR = 1               # tiempo para salir de estación (min)
TIEMPO_ENTRE_EST = 2           # tiempo entre estaciones por metro (min)
TIEMPO_TRANSBORDO = 5          # tiempo por transbordo entre líneas (min)

# Cargar datos estáticos de estaciones/lineas
BASE = os.path.dirname(__file__)
with open(os.path.join(BASE, "static", "lines.json"), "r", encoding="utf-8") as f:
    LINEAS = json.load(f)

# ----- Construir grafo puro de metro -----
G = nx.Graph()                          # grafo que representa únicamente conexiones de metro
pos_nodo = {}                           # mapa nodo -> (lat, lon)
estacion_a_nodos = defaultdict(list)    # mapa estacion_nombre -> lista de nodos (estación, linea)

for linea, info in LINEAS.items():
    ests = list(info["stations"].keys())
    for i, est in enumerate(ests):
        lat, lon = info["stations"][est]
        nodo = (est, linea)

        pos_nodo[nodo] = (lat, lon)
        estacion_a_nodos[est].append(nodo)

        # cada nodo identifica estación + línea para permitir transbordos
        G.add_node(nodo, estacion=est, linea=linea)

        # arista entre estaciones consecutivas en la misma línea
        if i > 0:
            prev = (ests[i-1], linea)
            G.add_edge(prev, nodo, peso=TIEMPO_ENTRE_EST, tipo="metro")

# transbordos
for est, nodos in estacion_a_nodos.items():
    # si una estación aparece en varias líneas, añadir aristas de transbordo
    if len(nodos) > 1:
        for i in range(len(nodos)):
            for j in range(i+1, len(nodos)):
                G.add_edge(nodos[i], nodos[j], peso=TIEMPO_TRANSBORDO, tipo="transbordo")


# ----- Utilidades -----
def dist(a, b):
    # Fórmula de Haversine para distancia en metros entre (lat, lon)
    R = 6371000  # radio de la Tierra en metros
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a_val = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a_val), math.sqrt(1-a_val))
    
    return R * c

def tiempo_caminando(a_pos, b_pos):
    # convierte distancia metros -> tiempo (min) usando VELOCIDAD_CAMINAR
    return dist(a_pos, b_pos) / VELOCIDAD_CAMINAR


# --------- ALGORITMO DE DOS FASES ---------
def calcular_mejor_ruta(origen, destino):
    """
    Calcula la mejor ruta entre `origen` y `destino` en dos fases:
    1) Buscar la mejor ruta usando solo el grafo metro (heurística 0) para obtener
       la secuencia de nodos esperada en metro (ruta_metro).
    2) Construir un grafo extendido que agrega un nodo ORI (calle de inicio) y
       un nodo FIN (calle destino). Conectar cada nodo a FIN con coste salir+caminar.
       Ejecutar A* usando una heurística basada en distancias por metro (Dijkstra)
       hacia las estaciones destino, añadiendo TIEMPO_SALIR como estimación.
    Devuelve dict con lista de pasos y tiempo total en minutos.
    """

    nodos_origen = estacion_a_nodos[origen]
    nodos_destino = estacion_a_nodos[destino]

    # posiciones px para cálculo de caminata
    pos_origen = pos_nodo[nodos_origen[0]]
    pos_destino = pos_nodo[nodos_destino[0]]

    # ----- Fase 1: ruta óptima en el grafo metro puro -----
    def h0(a, b):  # heurística nula => Dijkstra equivalente
        return 0

    rutas_metro = []
    for o in nodos_origen:
        for d in nodos_destino:
            try:
                ruta = nx.astar_path(G, o, d, heuristic=h0, weight="peso")
                rutas_metro.append((ruta, nx.path_weight(G, ruta, "peso")))
            except:
                # ignorar pares desconectados
                pass

    if not rutas_metro:
        return None

    ruta_metro, tiempo_metro = min(rutas_metro, key=lambda x: x[1])
    ruta_metro_set = set(ruta_metro)

    # ----- Fase 2: construir grafo extendido con ORI/FIN y opciones de caminar -----
    GT = G.copy()

    FIN = ("FIN","FIN")
    GT.add_node(FIN)

    # conectar cada nodo del grafo a FIN: si nodo es estación destino -> coste 0,
    # si no -> coste = tiempo para salir + tiempo de caminar desde esa estación hasta destino
    for nodo in GT.nodes():
        if nodo == FIN: continue
        p = pos_nodo.get(nodo)
        if not p: continue

        if nodo in nodos_destino:
            GT.add_edge(nodo, FIN, peso=0, tipo="llegada")
        else:
            caminar = tiempo_caminando(p, pos_destino)
            GT.add_edge(nodo, FIN, peso=TIEMPO_SALIR + caminar, tipo="caminar")

    # nodo virtual de origen (usuario en la calle)
    ORI = ("ORI","ORI")
    GT.add_node(ORI)

    for nodo in nodos_origen:
        # coste caminar desde la posición de inicio hasta la estación elegida
        p = pos_nodo[nodo]
        t = tiempo_caminando(pos_origen, p)
        GT.add_edge(ORI, nodo, peso=t, tipo="caminar")

    # ----- Construir heurística informada usando Dijkstra sobre el grafo metro -----
    # metro_dist_to_dest[n] = coste mínimo por metro desde n hasta cualquier estación destino
    try:
        metro_dist_to_dest = nx.multi_source_dijkstra_path_length(G, nodos_destino, weight="peso")
    except Exception:
        metro_dist_to_dest = {}

    def h(n, goal):
        # si existe camino por metro: coste metro restante + TIEMPO_SALIR
        if n == ORI or n == FIN:
            return 0

        if n in metro_dist_to_dest:
            return metro_dist_to_dest[n] + TIEMPO_SALIR

        # fallback conservador: salir + caminar desde la posición del nodo
        p = pos_nodo.get(n)
        if not p:
            return 0
        return TIEMPO_SALIR + tiempo_caminando(p, pos_destino)

    # ejecutar A* sobre el grafo extendido
    ruta_final = nx.astar_path(GT, ORI, FIN, heuristic=h, weight="peso")

    # reconstrucción de pasos legibles para la UI
    pasos = []
    total = 0

    for a, b in zip(ruta_final[:-1], ruta_final[1:]):
        if a == ORI and b != FIN:
            # primer paso: caminar desde la calle hasta estación de origen
            est = b[0]
            t = GT[a][b]["peso"]
            pasos.append({"desde": origen, "hasta": est, "tiempo": round(t,2), "tipo": "caminar"})
            total += t
            continue

        if b == FIN:
            # última transición: bajar y/o caminar hasta destino
            est = a[0]
            t = GT[a][b]["peso"]
            tipo = GT[a][b]["tipo"]
            pasos.append({"desde": est, "hasta": destino, "tiempo": round(t,2), "tipo": tipo})
            total += t
            continue

        # pasos regulares entre estaciones (metro/transbordo)
        t = GT[a][b]["peso"]
        tipo = GT[a][b].get("tipo","metro")
        pasos.append({
            "desde": a[0],
            "hasta": b[0],
            "tiempo": round(t,2),
            "tipo": tipo
        })
        total += t

    # ----- Generar instrucciones simplificadas -----
    instrucciones = []
    
    # Filtrar solo los nodos reales (excluyendo ORI y FIN)
    nodos_reales = [n for n in ruta_final if n != ORI and n != FIN]
    
    if nodos_reales:
        # 1. Subida
        primero = nodos_reales[0]
        instrucciones.append(f"Subir en {primero[0]} (Línea {primero[1]})")
        
        # 2. Transbordos
        # Recorremos para detectar cambios de línea en la misma estación
        for i in range(len(nodos_reales) - 1):
            actual = nodos_reales[i]
            siguiente = nodos_reales[i+1]
            
            # Si es la misma estación pero diferente línea => Transbordo
            if actual[0] == siguiente[0] and actual[1] != siguiente[1]:
                instrucciones.append(f"Transbordar en {actual[0]} a Línea {siguiente[1]}")
                
        # 3. Bajada
        ultimo = nodos_reales[-1]
        instrucciones.append(f"Bajar en {ultimo[0]}")

    return {"pasos": pasos, "tiempo_total": round(total,2), "instrucciones": instrucciones}


# ----- FLASK -----
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/ruta", methods=["POST"])
def ruta():
    data = request.get_json()
    orig = data.get("inicio")
    dest = data.get("fin")
    r = calcular_mejor_ruta(orig, dest)
    return jsonify(r)

if __name__ == "__main__":
    app.run(debug=True)