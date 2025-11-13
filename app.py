from flask import Flask, render_template, jsonify, request
import json, os
import networkx as nx
from collections import defaultdict

app = Flask(__name__)

BASE_DIR = os.path.dirname(__file__)
with open(os.path.join(BASE_DIR, "static", "lines.json"), "r", encoding="utf-8") as f:
    LINES = json.load(f)

TIME_BETWEEN_STATIONS = 2
TIME_TRANSFER = 5

# Crear grafo
G = nx.Graph()
for line_name, info in LINES.items():
    stations = list(info["stations"].keys())
    for i, st in enumerate(stations):
        node = (st, line_name)
        G.add_node(node, station=st, line=line_name, pos=info["stations"][st])
        if i > 0:
            prev = (stations[i - 1], line_name)
            G.add_edge(prev, node, weight=TIME_BETWEEN_STATIONS, type="rail", line=line_name)

# Crear transbordos
station_to_nodes = defaultdict(list)
for node in G.nodes():
    station_to_nodes[node[0]].append(node)

for st, nodes in station_to_nodes.items():
    if len(nodes) > 1:
        for i in range(len(nodes)):
            for j in range(i + 1, len(nodes)):
                G.add_edge(nodes[i], nodes[j], weight=TIME_TRANSFER, type="transfer")

# Algoritmo A* sin heurística
def find_best_path(origin, destination):
    if origin not in station_to_nodes or destination not in station_to_nodes:
        return None, None

    SRC, TGT = ("SRC", "SRC"), ("TGT", "TGT")
    Gtmp = G.copy()
    Gtmp.add_node(SRC)
    Gtmp.add_node(TGT)
    for n in station_to_nodes[origin]:
        Gtmp.add_edge(SRC, n, weight=0)
    for n in station_to_nodes[destination]:
        Gtmp.add_edge(n, TGT, weight=0)

    def h(a, b): return 0

    try:
        path_nodes = nx.astar_path(Gtmp, SRC, TGT, heuristic=h, weight="weight")
    except nx.NetworkXNoPath:
        return None, None

    total = sum(Gtmp[a][b]["weight"] for a, b in zip(path_nodes[:-1], path_nodes[1:]))
    readable = []
    for node in path_nodes:
        if node in (SRC, TGT): continue
        st, line = node
        readable.append(st)
    return readable, total

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/data")
def data():
    return jsonify(LINES)

@app.route("/route", methods=["POST"])
def route():
    data = request.get_json()
    origin = data.get("start")        # 👈 CAMBIADO
    dest = data.get("end")            # 👈 CAMBIADO
    path, total = find_best_path(origin, dest)
    if not path:
        return jsonify({"error": "No se encontró una ruta"}), 404
    return jsonify({"path": path, "distance": total})  # 👈 'distance' para que JS la lea igual

if __name__ == "__main__":
    app.run(debug=True)